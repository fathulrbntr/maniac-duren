-- Update 015. Jalankan setelah 013 (014 hanya UI). Tidak mereset data.
begin;
alter table public.md_pos_employees alter column role set default 'staff';
alter table public.md_pos_employees drop constraint if exists md_pos_employees_role_check;
alter table public.md_pos_employees add constraint md_pos_employees_role_check check(role in ('staff','owner','manager','cashier','kitchen','warehouse'));
alter table public.md_pos_employees add column if not exists birth_date date;
create table if not exists public.md_pos_employee_documents(employee_id uuid primary key references public.md_pos_employees(id),ktp_photo text not null,updated_at timestamptz not null default now());
create table if not exists public.md_pos_work_hours(store_id uuid primary key references public.md_pos_stores(id),start_time time not null,end_time time not null,updated_by uuid references auth.users,updated_at timestamptz not null default now(),check(end_time>start_time));
create table if not exists public.md_pos_attendance_legacy(id uuid primary key,original_row jsonb not null,archived_at timestamptz not null default now());
-- Simpan salinan lengkap baris lama sebelum menggabungkan duplikat satu hari.
insert into public.md_pos_attendance_legacy(id,original_row)
select a.id,to_jsonb(a) from public.md_pos_attendance a join (
 select employee_id,(clock_in at time zone 'Asia/Jakarta')::date d from public.md_pos_attendance group by 1,2 having count(*)>1
) g on a.employee_id=g.employee_id and (a.clock_in at time zone 'Asia/Jakarta')::date=g.d on conflict(id) do nothing;
drop index if exists public.md_pos_one_open_shift;
alter table public.md_pos_attendance add column if not exists work_date date;
alter table public.md_pos_attendance add column if not exists scheduled_start time;
alter table public.md_pos_attendance add column if not exists scheduled_end time;
update public.md_pos_attendance set work_date=(clock_in at time zone 'Asia/Jakarta')::date where work_date is null;
with groups as (
 select employee_id,work_date,(array_agg(id order by clock_in,id))[1] keep_id,min(clock_in) first_in,max(clock_out) last_out
 from public.md_pos_attendance group by 1,2
) update public.md_pos_attendance a set clock_in=g.first_in,clock_out=g.last_out from groups g where a.id=g.keep_id;
with ranked as (select id,row_number() over(partition by employee_id,work_date order by clock_in,id) rn from public.md_pos_attendance)
delete from public.md_pos_attendance a using ranked r where a.id=r.id and r.rn>1;
alter table public.md_pos_attendance alter column work_date set not null;
create unique index if not exists md_pos_attendance_one_day on public.md_pos_attendance(employee_id,work_date);
do $$declare t text;begin foreach t in array array['employee_documents','work_hours','attendance_legacy'] loop execute format('alter table public.md_pos_%I enable row level security',t);execute format('revoke all on public.md_pos_%I from public,anon,authenticated',t);end loop;end$$;
create or replace function public.pos_allowed(permission text,store uuid default null) returns boolean language plpgsql stable security definer set search_path='' as $$
declare e public.md_pos_employees%rowtype;defaults text[];begin
 select * into e from public.md_pos_employees where user_id=auth.uid() and active;
 if not found then return false;end if;if e.role='owner' then return true;end if;if permission='employees' then return false;end if;
 if store is not null and not(store=any(e.store_ids)) then return false;end if;
 defaults:=case e.role when 'staff' then array['attendance'] when 'manager' then array['stock','produce','waste','sell','kitchen','reports','finance','trace','master','attendance','cancel'] when 'cashier' then array['sell','attendance'] when 'kitchen' then array['produce','waste','kitchen','attendance','trace'] when 'warehouse' then array['stock','waste','trace','attendance'] else '{}'::text[] end;
 return permission=any(defaults||e.permissions);end $$;
do $$begin
 if to_regprocedure('public.pos_mutate_v14(text,jsonb)') is null then
 alter function public.pos_mutate(text,jsonb) rename to pos_mutate_v14;
 alter function public.pos_read() rename to pos_read_v14;
 end if;end$$;
revoke all on function public.pos_mutate_v14(text,jsonb),public.pos_read_v14() from public,anon,authenticated;
create or replace function public.pos_employee_document(employee_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.pos_require('employees');
 return jsonb_build_object('ktpPhoto',(select ktp_photo from public.md_pos_employee_documents d where d.employee_id=pos_employee_document.employee_id));
end $$;
create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;begin
 s:=public.pos_read_v14();
 s:=s||jsonb_build_object('employeeVersion',15,'workHours',coalesce((select jsonb_agg(to_jsonb(w)) from public.md_pos_work_hours w where public.pos_allowed('attendance',w.store_id)),'[]'));
 s:=jsonb_set(s,'{employees}',coalesce((select jsonb_agg(x||jsonb_build_object('has_ktp',exists(select 1 from public.md_pos_employee_documents d where d.employee_id=(x->>'id')::uuid))) from jsonb_array_elements(s->'employees') x),'[]'));
 s:=jsonb_set(s,'{events}',coalesce(s->'events','[]')||coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'action',ev.action)) from public.md_pos_events ev where ev.actor=auth.uid() and ev.action in ('attendance_in','attendance_out') and not exists(select 1 from jsonb_array_elements(coalesce(s->'events','[]')) x where x->>'id'=ev.id::text)),'[]'));
 return s;end $$;
create or replace function public.pos_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.md_pos_employees%rowtype;rec public.md_pos_attendance%rowtype;hours public.md_pos_work_hours%rowtype;
 eid uuid:=(payload->>'id')::uuid;st uuid;target uuid;tm timestamptz:=clock_timestamp();day date:=(tm at time zone 'Asia/Jakarta')::date;
 safe jsonb;result jsonb;photo text;dob date;replayed boolean;begin
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 select * into me from public.md_pos_employees where user_id=auth.uid() and active;if not found then raise exception 'Akun tidak memiliki akses POS';end if;
 if action='employee_save' then
 perform public.pos_require('employees');target:=(payload->>'employeeId')::uuid;
 dob:=nullif(payload->>'birthDate','')::date;if dob>day then raise exception 'Tanggal lahir tidak boleh di masa depan';end if;
 if payload ? 'ktpPhoto' then
 photo:=payload->>'ktpPhoto';
 if photo is not null and photo<>'' and (length(photo)>2000000 or photo !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$') then raise exception 'Foto KTP harus JPEG/PNG/WebP, maksimal 1,5 MB';end if;
 end if;
 safe:=(payload-'ktpPhoto')||jsonb_build_object('role',coalesce(nullif(payload->>'role',''),(select role from public.md_pos_employees where id=target),'staff'));
 if payload ? 'ktpPhoto' then safe:=safe||jsonb_build_object('ktpDigest',md5(coalesce(photo,'')));end if;
 replayed:=exists(select 1 from public.md_pos_events where id=eid);
 result:=public.pos_mutate_v14(action,safe);
 if replayed then return public.pos_read();end if;
 if payload ? 'birthDate' then update public.md_pos_employees set birth_date=dob where id=target;end if;
 if payload ? 'ktpPhoto' then
 if photo is null or photo='' then delete from public.md_pos_employee_documents where employee_id=target;
 else insert into public.md_pos_employee_documents(employee_id,ktp_photo) values(target,photo) on conflict(employee_id) do update set ktp_photo=excluded.ktp_photo,updated_at=now();end if;
 end if;
 return public.pos_read();
 elsif action in ('attendance_in','attendance_out','work_hours_save') then
 if eid is null then raise exception 'ID wajib';end if;
 st:=nullif(payload->>'storeId','')::uuid;
 if st is null then raise exception 'Pilih toko';end if;
 if action='work_hours_save' then perform public.pos_require('employees');else perform public.pos_require('attendance',st);end if;
 if exists(select 1 from public.md_pos_events where id=eid) then
 if not exists(select 1 from public.md_pos_events ev where ev.id=eid and ev.action=pos_mutate.action and ev.payload=pos_mutate.payload and actor=auth.uid()) then raise exception 'ID sudah digunakan untuk data lain';end if;
 return public.pos_read();end if;
 if action='work_hours_save' then
 if nullif(payload->>'startTime','') is null or nullif(payload->>'endTime','') is null or (payload->>'endTime')::time<=(payload->>'startTime')::time then raise exception 'Jam pulang harus setelah jam masuk pada hari yang sama';end if;
 insert into public.md_pos_work_hours(store_id,start_time,end_time,updated_by) values(st,(payload->>'startTime')::time,(payload->>'endTime')::time,auth.uid()) on conflict(store_id) do update set start_time=excluded.start_time,end_time=excluded.end_time,updated_by=excluded.updated_by,updated_at=now();
 else
 select * into rec from public.md_pos_attendance where employee_id=me.id and work_date=day for update;
 if found and rec.store_id<>st then raise exception 'Absensi hari ini tercatat di toko lain. Pilih toko yang sama';end if;
 if action='attendance_in' then
 if rec.id is null then
 select * into hours from public.md_pos_work_hours where store_id=st;
 insert into public.md_pos_attendance(id,employee_id,store_id,clock_in,work_date,scheduled_start,scheduled_end) values(eid,me.id,st,tm,day,hours.start_time,hours.end_time);
 end if;
 else
 if rec.id is null then raise exception 'Belum check-in hari ini';end if;
 update public.md_pos_attendance set clock_out=greatest(coalesce(clock_out,tm),tm) where id=rec.id;
 end if;
 end if;
 insert into public.md_pos_events(id,action,store_id,actor,employee_id,business_date,payload) values(eid,action,st,auth.uid(),me.id,day,payload);
 return public.pos_read();
 end if;
 return public.pos_mutate_v14(action,payload);
end $$;
revoke all on function public.pos_read(),public.pos_mutate(text,jsonb),public.pos_employee_document(uuid) from public,anon,authenticated;
grant execute on function public.pos_read(),public.pos_mutate(text,jsonb),public.pos_employee_document(uuid) to authenticated;
notify pgrst,'reload schema';
commit;

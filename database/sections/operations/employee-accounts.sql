-- Perbaikan 016. Aman dijalankan ulang setelah 015 atau 016 lama. Tidak mereset data.
begin;
alter table public.md_pos_employees add column if not exists username text;
alter table public.md_pos_employees add column if not exists profile_photo text;
create unique index if not exists md_pos_employees_username_lower on public.md_pos_employees(lower(username)) where username is not null and username<>'';
do $$begin
 if not exists(select 1 from pg_constraint where conname='md_pos_employees_username_format' and conrelid='public.md_pos_employees'::regclass) then
 alter table public.md_pos_employees add constraint md_pos_employees_username_format check(username is null or username ~ '^[A-Za-z0-9._-]{3,40}$');end if;
 if to_regprocedure('public.pos_mutate_v16(text,jsonb)') is null then alter function public.pos_mutate(text,jsonb) rename to pos_mutate_v16;end if;
 if to_regprocedure('public.pos_read_v16()') is null then alter function public.pos_read() rename to pos_read_v16;end if;
end$$;
-- Fungsi versi lama hanya boleh dipanggil wrapper, bukan client.
revoke all on function public.pos_mutate_v16(text,jsonb),public.pos_read_v16() from public,anon,authenticated;
create or replace function public.pos_phone_key(phone text) returns text language sql immutable set search_path='' as $$
 select case when n like '0%' then '62'||substr(n,2) else n end from (select regexp_replace(coalesce(phone,''),'[^0-9]','','g') n) q
$$;
revoke all on function public.pos_phone_key(text) from public,anon,authenticated;
create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;begin s:=public.pos_read_v16();return s||jsonb_build_object('employeeVersion',16,'employeeAccountVersion',2);end$$;
-- Lookup akun khusus server; tidak mengungkap email melalui endpoint publik.
create or replace function public.pos_login_identity(identifier text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v text:=lower(btrim(identifier));v_phone text;ids uuid[];target uuid;begin
 if v is null or length(v)<3 or length(v)>150 then return null;end if;
 if v ~ '^[+0-9 ().-]+$' then v_phone:=public.pos_phone_key(v);end if;
 select array_agg(e.id) into ids from public.md_pos_employees e where e.active and e.user_id is not null and (
 lower(e.username)=v or lower(e.email)=v or (length(v_phone)>=8 and public.pos_phone_key(e.phone)=v_phone));
 if coalesce(array_length(ids,1),0)<>1 then return null;end if;
 target:=ids[1];
 return (select jsonb_build_object('email',u.email,'userId',u.id) from public.md_pos_employees e join auth.users u on u.id=e.user_id where e.id=target and coalesce(u.email,'')<>'');
end$$;
create table if not exists public.md_pos_login_attempts(bucket text primary key,started_at timestamptz not null,attempts integer not null);
alter table public.md_pos_login_attempts enable row level security;
revoke all on public.md_pos_login_attempts from public,anon,authenticated;
create or replace function public.pos_login_throttle(bucket text) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;begin
 if length(bucket)>80 or bucket !~ '^(ip|login):[a-f0-9]{64}$' then return false;end if;
 delete from public.md_pos_login_attempts where started_at<now()-interval '1 day';
 insert into public.md_pos_login_attempts values(bucket,now(),1) on conflict on constraint md_pos_login_attempts_pkey do update set
 attempts=case when md_pos_login_attempts.started_at<now()-interval '15 minutes' then 1 else least(md_pos_login_attempts.attempts+1,1000) end,
 started_at=case when md_pos_login_attempts.started_at<now()-interval '15 minutes' then now() else md_pos_login_attempts.started_at end returning attempts into n;
 return n<=case when bucket like 'ip:%' then 60 else 10 end;
end$$;
create or replace function public.pos_account_target(employee_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.md_pos_employees%rowtype;u uuid;owned boolean;begin
 perform public.pos_require('employees');select * into e from public.md_pos_employees where id=employee_id;
 if not found then raise exception 'Karyawan tidak ditemukan';end if;
 if e.user_id is not null then return jsonb_build_object('email',e.email,'userId',e.user_id,'linked',true,'active',e.active);end if;
 if e.email='' or e.email is null then raise exception 'Isi email karyawan dahulu';end if;
 select a.id,(to_jsonb(a)->'raw_user_meta_data'->>'employee_id')=e.id::text into u,owned from auth.users a where lower(a.email)=lower(e.email);
 return jsonb_build_object('email',e.email,'userId',case when owned then u end,'linked',false,'active',e.active,'existingUnrelated',u is not null and not coalesce(owned,false));
end$$;
create or replace function public.pos_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid;safe jsonb;result jsonb;u text;photo text;v_phone text;replayed boolean;begin
 if action='employee_save' then
 perform public.pos_require('employees');perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 target:=(payload->>'employeeId')::uuid;
 if payload ? 'username' then u:=nullif(lower(btrim(payload->>'username')),'');else select username into u from public.md_pos_employees where id=target;end if;
 if u is not null and u !~ '^[a-z0-9._-]{3,40}$' then raise exception 'Username 3–40 karakter: huruf, angka, titik, garis bawah, atau strip';end if;
 v_phone:=public.pos_phone_key(payload->>'phone');
 if v_phone<>'' and (length(v_phone)<8 or length(v_phone)>15) then raise exception 'Nomor telepon harus 8–15 digit';end if;
 if exists(select 1 from public.md_pos_employees e where e.id<>target and (
 (u is not null and lower(e.username)=u) or (v_phone<>'' and public.pos_phone_key(e.phone)=v_phone) or
 (u ~ '^[+0-9 ().-]+$' and public.pos_phone_key(u)<>'' and public.pos_phone_key(e.phone)=public.pos_phone_key(u)) or
 (v_phone<>'' and e.username ~ '^[+0-9 ().-]+$' and public.pos_phone_key(e.username)=v_phone))) then raise exception 'Username atau nomor telepon sudah digunakan karyawan lain';end if;
 photo:=payload->>'profilePhoto';
 if photo is not null and photo<>'' and (length(photo)>2000000 or photo !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$') then raise exception 'Foto profil harus JPEG/PNG/WebP maksimal 1,5 MB';end if;
 safe:=(payload-'profilePhoto')||jsonb_build_object('username',u);
 if payload ? 'profilePhoto' then safe:=safe||jsonb_build_object('profileDigest',md5(coalesce(photo,'')));end if;
 replayed:=exists(select 1 from public.md_pos_events where id=($2->>'id')::uuid);
 result:=public.pos_mutate_v16(action,safe);
 if replayed then return public.pos_read();end if;
 update public.md_pos_employees set username=u,profile_photo=case when payload ? 'profilePhoto' then nullif(photo,'') else profile_photo end where id=target;
 return public.pos_read();end if;
 return public.pos_mutate_v16(action,payload);
end$$;
revoke all on function public.pos_read(),public.pos_mutate(text,jsonb),public.pos_account_target(uuid),public.pos_login_identity(text),public.pos_login_throttle(text) from public,anon,authenticated;
grant execute on function public.pos_read(),public.pos_mutate(text,jsonb),public.pos_account_target(uuid) to authenticated;
grant execute on function public.pos_login_identity(text),public.pos_login_throttle(text) to service_role;
notify pgrst,'reload schema';
commit;

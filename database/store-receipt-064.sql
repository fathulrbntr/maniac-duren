-- PATCH 064: profil toko dan logo header struk. Jalankan seluruh file setelah patch 063.
-- Nama/lokasi lama dipertahankan. Logo tidak dikirim dalam pembacaan login.
begin;
set local lock_timeout='5s';
do $$begin
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 if not exists(select 1 from public.md_pos_schema_versions where version=63) then
  raise exception 'Pasang patch Reject & Waste 063 terlebih dahulu';
 end if;
end$$;
alter table public.md_pos_stores add column if not exists phone text not null default '';
alter table public.md_pos_stores add column if not exists receipt_logo text not null default '';
alter table public.md_pos_stores add column if not exists logo_version uuid;
alter table public.md_pos_stores add column if not exists profile_version uuid;
do $$begin
 if to_regprocedure('public.pos_read_before_064()') is null then alter function public.pos_read() rename to pos_read_before_064;end if;
 if to_regprocedure('public.pos_mutate_before_064(text,jsonb)') is null then alter function public.pos_mutate(text,jsonb) rename to pos_mutate_before_064;end if;
 if to_regprocedure('public.pos_mutate_027_before_064(text,jsonb)') is null then alter function public.pos_mutate_027(text,jsonb) rename to pos_mutate_027_before_064;end if;
end$$;
revoke all on function public.pos_read_before_064(),public.pos_mutate_before_064(text,jsonb),public.pos_mutate_027_before_064(text,jsonb) from public,anon,authenticated;

create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;
begin
 s:=public.pos_read_before_064();
 -- Enrich only the already-authorized outlet list; never reload all stores into it.
 s:=jsonb_set(s,'{stores}',coalesce((select jsonb_agg(x.doc||jsonb_build_object(
  'address',t.location,'phone',t.phone,'hasLogo',t.receipt_logo<>'',
  'logoVersion',t.logo_version,'profileVersion',t.profile_version) order by x.ordinality)
  from jsonb_array_elements(s->'stores') with ordinality as x(doc,ordinality)
  join public.md_pos_stores t on t.id=(x.doc->>'id')::uuid),'[]'::jsonb));
 return s||jsonb_build_object('storeProfileVersion',64);
end$$;

create or replace function public.pos_store_logo(store_id uuid,expected_version uuid default null)
returns text language plpgsql security definer set search_path='' as $$
declare employee public.md_pos_employees%rowtype;outlet public.md_pos_stores%rowtype;
begin
 select * into employee from public.md_pos_employees where user_id=auth.uid() and active;
 if not found or (employee.role<>'owner' and not(store_id=any(employee.store_ids))) then raise exception 'Toko tidak tersedia untuk akun ini';end if;
 select * into outlet from public.md_pos_stores where id=store_id;
 if not found then raise exception 'Toko tidak ditemukan';end if;
 if expected_version is not null and expected_version is distinct from outlet.logo_version then
  raise exception 'Logo toko berubah. Perbarui data POS lalu buka ulang struk';
 end if;
 return outlet.receipt_logo;
end$$;

create or replace function public.pos_store_save(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 eid uuid:=(payload->>'id')::uuid;target uuid:=(payload->>'storeId')::uuid;
 creating boolean:=coalesce((payload->>'creating')::boolean,false);
 employee public.md_pos_employees%rowtype;outlet public.md_pos_stores%rowtype;prior public.md_pos_events%rowtype;
 title text:=btrim(coalesce(payload->>'name',''));address text:=btrim(coalesce(payload->>'address',''));v_phone text:=btrim(coalesce(payload->>'phone',''));
 logo text;bytes bytea;encoded text;stamp text:=md5(payload::text);
begin
 select * into employee from public.md_pos_employees where user_id=auth.uid() and active;
 if not found then raise exception 'Akun tidak memiliki akses POS';end if;
 if eid is null or target is null then raise exception 'ID pengiriman dan toko wajib';end if;
 perform public.pos_require('master',case when creating then null else target end);
 if creating and employee.role<>'owner' then raise exception 'Hanya owner yang dapat menambah toko';end if;
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 select * into prior from public.md_pos_events where id=eid;
 if found then
  if prior.action<>'store_save' or prior.actor is distinct from auth.uid() or prior.details->>'requestHash' is distinct from stamp then raise exception 'ID pengiriman sudah digunakan untuk data lain';end if;
  return public.pos_read();
 end if;
 select * into outlet from public.md_pos_stores where id=target for update;
 if creating and found then raise exception 'ID toko sudah digunakan';end if;
 if not creating and not found then raise exception 'Toko tidak ditemukan';end if;
 if not creating and payload ? 'baseVersion' and nullif(payload->>'baseVersion','')::uuid is distinct from outlet.profile_version then
  raise exception 'Data toko berubah. Perbarui data dan buka ulang form';
 end if;
 if length(title) not between 1 and 100 then raise exception 'Nama toko wajib, maksimal 100 karakter';end if;
 if length(address) not between 1 and 300 then raise exception 'Alamat toko wajib, maksimal 300 karakter';end if;
 if length(v_phone) not between 1 and 40 then raise exception 'Nomor telepon wajib, maksimal 40 karakter';end if;
 logo:=case when payload ? 'logo' then coalesce(payload->>'logo','') else coalesce(outlet.receipt_logo,'') end;
 if payload ? 'logo' and logo<>'' then
  if length(logo)>95608 or logo!~'^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$' then raise exception 'Logo harus PNG, JPG, atau WebP, maksimal 70 KB';end if;
  encoded:=split_part(logo,',',2);
  if length(encoded)%4<>0 then raise exception 'Data logo tidak valid';end if;
  bytes:=decode(encoded,'base64');
  if octet_length(bytes)>71680 then raise exception 'Logo maksimal 70 KB setelah kompresi';end if;
  if not ((logo like 'data:image/png;%' and substring(bytes from 1 for 8)=decode('89504e470d0a1a0a','hex'))
   or (logo like 'data:image/jpeg;%' and substring(bytes from 1 for 3)=decode('ffd8ff','hex'))
   or (logo like 'data:image/webp;%' and substring(bytes from 1 for 4)=decode('52494646','hex') and substring(bytes from 9 for 4)=decode('57454250','hex'))) then raise exception 'Isi logo tidak sesuai format gambar';end if;
 end if;
 if creating then
  insert into public.md_pos_stores(id,name,location,phone,receipt_logo,logo_version,profile_version)
   values(target,title,address,v_phone,logo,case when logo<>'' then eid end,eid);
 else
  update public.md_pos_stores set name=title,location=address,phone=v_phone,receipt_logo=logo,
   logo_version=case when receipt_logo is distinct from logo then eid else logo_version end,profile_version=eid where id=target;
 end if;
 -- Keep one compact audit event, never another copy of the logo.
 insert into public.md_pos_events(id,action,store_id,actor,employee_id,business_date,payload,details)
 values(eid,'store_save',target,auth.uid(),employee.id,(now() at time zone 'Asia/Jakarta')::date,
  payload-'logo',jsonb_build_object('requestHash',stamp,'logoChanged',payload ? 'logo'));
 return public.pos_read();
end$$;

create or replace function public.pos_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if action='store_save' then return public.pos_store_save(payload);end if;
 return public.pos_mutate_before_064(action,payload);
end$$;
create or replace function public.pos_mutate_027(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if action='store_save' then return public.pos_store_save(payload);end if;
 return public.pos_mutate_027_before_064(action,payload);
end$$;
revoke all on function public.pos_store_save(jsonb),public.pos_store_logo(uuid,uuid),public.pos_read(),public.pos_mutate(text,jsonb),public.pos_mutate_027(text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_store_logo(uuid,uuid),public.pos_read(),public.pos_mutate(text,jsonb),public.pos_mutate_027(text,jsonb) to authenticated;
insert into public.md_pos_schema_versions(version) values(64) on conflict do nothing;
notify pgrst,'reload schema';
commit;
select 64 as version,'Profil toko dan header struk siap' as status;

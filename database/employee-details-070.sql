-- PATCH 070: kontak darurat dan rekening karyawan. Jalankan seluruh file.
-- Aman dijalankan ulang; tidak menghapus data karyawan atau transaksi.
begin;
set local lock_timeout='5s';
do $$begin
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 if to_regprocedure('public.pos_mutate_v16(text,jsonb)') is null
    or to_regprocedure('public.pos_mutate_027(text,jsonb)') is null then
  raise exception 'Database POS dengan akun karyawan dan endpoint 027 diperlukan';
 end if;
end$$;

alter table public.md_pos_employees
 add column if not exists emergency_contact_name text not null default '',
 add column if not exists emergency_contact_phone text not null default '',
 add column if not exists bank_name text not null default '',
 add column if not exists bank_account_name text not null default '',
 add column if not exists bank_account_number text not null default '';

do $$begin
 if to_regprocedure('public.pos_read_before_070()') is null then alter function public.pos_read() rename to pos_read_before_070;end if;
 if to_regprocedure('public.pos_mutate_before_070(text,jsonb)') is null then alter function public.pos_mutate(text,jsonb) rename to pos_mutate_before_070;end if;
 if to_regprocedure('public.pos_mutate_027_before_070(text,jsonb)') is null then alter function public.pos_mutate_027(text,jsonb) rename to pos_mutate_027_before_070;end if;
end$$;
revoke all on function public.pos_read_before_070(),public.pos_mutate_before_070(text,jsonb),public.pos_mutate_027_before_070(text,jsonb) from public,anon,authenticated;

create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;
begin
 s:=public.pos_read_before_070();
 -- Enrich only the employee rows already authorized by the existing reader.
 s:=jsonb_set(s,'{employees}',coalesce((select jsonb_agg(x.doc||jsonb_build_object(
  'emergency_contact_name',e.emergency_contact_name,'emergency_contact_phone',e.emergency_contact_phone,
  'bank_name',e.bank_name,'bank_account_name',e.bank_account_name,'bank_account_number',e.bank_account_number) order by x.ordinality)
  from jsonb_array_elements(s->'employees') with ordinality as x(doc,ordinality)
  join public.md_pos_employees e on e.id=(x.doc->>'id')::uuid),'[]'::jsonb));
 return s||jsonb_build_object('employeeDetailsVersion',70);
end$$;

create or replace function public.pos_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 target uuid;eid uuid;safe jsonb;details jsonb;result jsonb;replayed boolean;k text;v text;
 keys text[]:=array['emergencyContactName','emergencyContactPhone','bankName','bankAccountName','bankAccountNumber'];
begin
 if action<>'employee_save' then return public.pos_mutate_before_070(action,payload);end if;
 perform public.pos_require('employees');
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 target:=(payload->>'employeeId')::uuid;eid:=(payload->>'id')::uuid;
 if target is null or eid is null then raise exception 'ID karyawan dan pengiriman wajib diisi';end if;
 foreach k in array keys loop
  if not (payload ? k) then continue;end if;
  if jsonb_typeof(payload->k) not in ('string','null') then raise exception 'Detail karyawan harus berupa teks';end if;
  v:=btrim(coalesce(payload->>k,''));
  if k='emergencyContactPhone' then
   if length(v)>40 or (v<>'' and (v !~ '^[+0-9 ().-]+$' or length(regexp_replace(v,'[^0-9]','','g')) not between 8 and 15)) then
    raise exception 'Nomor darurat harus 8–15 digit';
   end if;
  elsif k='bankAccountNumber' then
   if v<>'' and v !~ '^[0-9]{1,34}$' then raise exception 'Nomor rekening harus berisi angka saja, maksimal 34 digit';end if;
  elsif length(v)>100 then raise exception 'Nama kontak darurat, bank, dan pemilik rekening maksimal 100 karakter';
  end if;
 end loop;
 -- Keep private contact/bank values out of the shared activity log.
 -- A digest still lets the existing event logic detect conflicting retries.
 safe:=payload-keys-'employeeDetailsDigest';
 if payload ?| keys then
  select jsonb_object_agg(key,value) into details from jsonb_each(payload) where key=any(keys);
  safe:=safe||jsonb_build_object('employeeDetailsDigest',md5(details::text));
 end if;
 replayed:=exists(select 1 from public.md_pos_events where id=eid);
 result:=public.pos_mutate_before_070(action,safe);
 if replayed then return public.pos_read();end if;
 update public.md_pos_employees set
  emergency_contact_name=case when payload ? 'emergencyContactName' then btrim(coalesce(payload->>'emergencyContactName','')) else emergency_contact_name end,
  emergency_contact_phone=case when payload ? 'emergencyContactPhone' then btrim(coalesce(payload->>'emergencyContactPhone','')) else emergency_contact_phone end,
  bank_name=case when payload ? 'bankName' then btrim(coalesce(payload->>'bankName','')) else bank_name end,
  bank_account_name=case when payload ? 'bankAccountName' then btrim(coalesce(payload->>'bankAccountName','')) else bank_account_name end,
  bank_account_number=case when payload ? 'bankAccountNumber' then btrim(coalesce(payload->>'bankAccountNumber','')) else bank_account_number end
 where id=target;
 return public.pos_read();
end$$;

create or replace function public.pos_mutate_027(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if action='employee_save' then return public.pos_mutate(action,payload);end if;
 return public.pos_mutate_027_before_070(action,payload);
end$$;
revoke all on function public.pos_read(),public.pos_mutate(text,jsonb),public.pos_mutate_027(text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_read(),public.pos_mutate(text,jsonb),public.pos_mutate_027(text,jsonb) to authenticated;
insert into public.md_pos_schema_versions(version) values(70) on conflict do nothing;
notify pgrst,'reload schema';
commit;
select 70 as version,'Kontak darurat dan rekening karyawan siap' as status;

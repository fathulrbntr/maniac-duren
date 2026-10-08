-- Install once in Supabase SQL Editor. Does NOT compress or delete any photo by itself.
-- Only an active POS owner can read/replace one photo. No pos_read dependency.
begin;
create or replace function public.pos_photo_maintain(action text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 kind text:=payload->>'kind'; target uuid; slot text:=coalesce(payload->>'slot','');
 result jsonb; old_photo text; new_photo text; raw bytea; changed integer; cap integer;
begin
 if auth.uid() is null or not exists(select 1 from public.md_pos_employees where user_id=auth.uid() and active and role='owner') then
  raise exception 'Hanya akun owner aktif yang dapat mengompres foto';
 end if;
 if action='check' then return jsonb_build_object('ready',true);end if;
 if kind is null or kind not in ('product','profile','ktp','evidence') then raise exception 'Jenis foto tidak valid';end if;
 if action='list' then
  -- Return IDs only: no full POS state, photos, or expensive photo aggregation.
  if kind='product' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) into result from
    (select id from public.md_pos_products where id>coalesce(nullif(payload->>'after','')::uuid,'00000000-0000-0000-0000-000000000000'::uuid) order by id limit 20) x;
  elsif kind='profile' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) into result from
    (select id from public.md_pos_employees where id>coalesce(nullif(payload->>'after','')::uuid,'00000000-0000-0000-0000-000000000000'::uuid) order by id limit 20) x;
  elsif kind='ktp' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) into result from
    (select employee_id id from public.md_pos_employee_documents where employee_id>coalesce(nullif(payload->>'after','')::uuid,'00000000-0000-0000-0000-000000000000'::uuid) order by employee_id limit 20) x;
  else
   select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) into result from
    (select id from public.md_pos_waste_runs where id>coalesce(nullif(payload->>'after','')::uuid,'00000000-0000-0000-0000-000000000000'::uuid) order by id limit 20) x;
  end if;
  return result;
 end if;
 target:=(payload->>'id')::uuid;
 if target is null then raise exception 'ID foto wajib';end if;
 if kind='evidence' and slot not in ('reject','processed','durpas500','durpas1000','coral') then raise exception 'Jenis bukti tidak valid';end if;
 if kind='product' then select photo into old_photo from public.md_pos_products where id=target;
 elsif kind='profile' then select profile_photo into old_photo from public.md_pos_employees where id=target;
 elsif kind='ktp' then select ktp_photo into old_photo from public.md_pos_employee_documents where employee_id=target;
 else select snapshot->'evidence'->>slot into old_photo from public.md_pos_waste_runs where id=target;end if;
 if action='get' then return jsonb_build_object('photo',coalesce(old_photo,''),'digest',md5(coalesce(old_photo,'')));end if;
 if action<>'replace' or action is null then raise exception 'Aksi tidak valid';end if;
 new_photo:=payload->>'photo';
 if coalesce(old_photo,'')='' or md5(old_photo) is distinct from payload->>'expected' then return jsonb_build_object('status','conflict');end if;
 cap:=case kind when 'profile' then 70*1024 when 'product' then 160*1024 when 'ktp' then 450*1024 else 250*1024 end;
 if new_photo is null or length(new_photo)>4*((cap+2)/3)+40 or new_photo !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$' then raise exception 'Format atau ukuran foto hasil kompresi tidak valid';end if;
 raw:=decode(split_part(new_photo,',',2),'base64');
 if octet_length(raw)>cap or octet_length(raw)<12 or not (
  (new_photo like 'data:image/jpeg;%' and encode(substring(raw from 1 for 3),'hex')='ffd8ff') or
  (new_photo like 'data:image/png;%' and encode(substring(raw from 1 for 8),'hex')='89504e470d0a1a0a') or
  (new_photo like 'data:image/webp;%' and encode(substring(raw from 1 for 4),'hex')='52494646' and encode(substring(raw from 9 for 4),'hex')='57454250')) then raise exception 'Isi foto tidak valid';end if;
 if octet_length(new_photo)>=octet_length(old_photo) then return jsonb_build_object('status','unchanged');end if;
 -- Compare the original again inside UPDATE, so concurrent edits always win.
 if kind='product' then update public.md_pos_products set photo=new_photo where id=target and md5(photo)=payload->>'expected';
 elsif kind='profile' then update public.md_pos_employees set profile_photo=new_photo where id=target and md5(profile_photo)=payload->>'expected';
 elsif kind='ktp' then update public.md_pos_employee_documents set ktp_photo=new_photo where employee_id=target and md5(ktp_photo)=payload->>'expected';
 else update public.md_pos_waste_runs set snapshot=jsonb_set(snapshot,array['evidence',slot],to_jsonb(new_photo),false) where id=target and md5(snapshot->'evidence'->>slot)=payload->>'expected';end if;
 get diagnostics changed=row_count;
 return jsonb_build_object('status',case when changed=1 then 'updated' else 'conflict' end,'savedBytes',case when changed=1 then octet_length(old_photo)-octet_length(new_photo) else 0 end);
end $$;
revoke all on function public.pos_photo_maintain(text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_photo_maintain(text,jsonb) to authenticated;

-- Audit payloads contain original photos and are compared exactly on retry.
-- Keep stored payloads intact; omit only image fields from the POS read result.
-- Use a column projection before aggregation so audit photo bytes never enter
-- the growing POS JSON. This also keeps finance/stock/retry rules untouched.
do $$
declare definition text; old_expression text; new_expression text;
begin
 if to_regprocedure('public.pos_read_v10()') is null then raise exception 'Fungsi pembacaan POS 027 tidak ditemukan';end if;
 definition:=pg_get_functiondef('public.pos_read_v10()'::regprocedure);
 if to_regprocedure('public.pos_read_v10_before_photo_audit_041()') is null then
  execute replace(definition,'FUNCTION public.pos_read_v10()', 'FUNCTION public.pos_read_v10_before_photo_audit_041()');
 end if;
 old_expression:='jsonb_agg(to_jsonb(x) order by at desc) from public.md_pos_events x';
 new_expression:='jsonb_agg(to_jsonb(x) order by at desc) from (select id,action,store_id,actor,employee_id,business_date,payload-''photo''-''profilePhoto''-''ktpPhoto''-''evidence'' as payload,at,details from public.md_pos_events) x';
 if strpos(definition,old_expression)>0 then execute replace(definition,old_expression,new_expression);
 elsif strpos(definition,new_expression)=0 then raise exception 'Struktur pembacaan audit berbeda. Tidak ada perubahan diterapkan';end if;
end $$;
revoke all on function public.pos_read_v10_before_photo_audit_041() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;

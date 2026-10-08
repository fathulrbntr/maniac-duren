-- For the existing Maniac Duren database (SQL 019 or newer).
-- No data reset, no timeout increase, no client/UI change.
begin;
do $$
declare fn text;body text;backup_name text;
begin
 foreach fn in array array['pos_read','pos_read_v8','pos_read_v10'] loop
  if to_regprocedure('public.'||fn||'()') is null then
   raise exception 'Fungsi %() tidak ditemukan. Perbaikan dibatalkan tanpa perubahan.',fn;
  end if;
  backup_name:=fn||'_before_photo_fix';
  if to_regprocedure('public.'||backup_name||'()') is null then
   body:=pg_get_functiondef(to_regprocedure('public.'||fn||'()'));
   body:=replace(body,'FUNCTION public.'||fn||'()','FUNCTION public.'||backup_name||'()');
   execute body;
   execute format('revoke all on function public.%I() from public,anon,authenticated',backup_name);
  end if;
 end loop;

 -- Capture the existing public reader only when it is not already our wrapper.
 -- CREATE OR REPLACE keeps the public function OID and invalidates cached plans.
 body:=pg_get_functiondef('public.pos_read()'::regprocedure);
 if position('MD_POS_PHOTO_FIX_040' in body)=0 then
  execute replace(body,'FUNCTION public.pos_read()','FUNCTION public.pos_read_compact_040()');
 end if;
 if to_regprocedure('public.pos_read_compact_040()') is null then
  raise exception 'Pembaca data asal tidak tersedia';
 end if;
 revoke all on function public.pos_read_compact_040() from public,anon,authenticated;

 -- Build the light product metadata first. Actual photos are restored once,
 -- after permissions/store filtering and the legacy JSON wrappers have finished.
 body:=pg_get_functiondef('public.pos_read_v8()'::regprocedure);
 if position('''photo'',photo' in body)>0 then
  execute replace(body,'''photo'',photo','''photo'',null::text');
 elsif position('''photo'',null::text' in body)=0 then
  raise exception 'Bentuk pos_read_v8 berbeda. Perbaikan dibatalkan tanpa perubahan.';
 end if;

 body:=pg_get_functiondef('public.pos_read_v10()'::regprocedure);
 if position('jsonb_agg(to_jsonb(x)) from public.md_pos_employees x' in body)>0 then
  execute replace(body,
   'jsonb_agg(to_jsonb(x)) from public.md_pos_employees x',
   'jsonb_agg(to_jsonb(x)-''profile_photo'') from public.md_pos_employees x');
 elsif position('jsonb_agg(to_jsonb(x)-''profile_photo'') from public.md_pos_employees x' in body)=0 then
  raise exception 'Bentuk pos_read_v10 berbeda. Perbaikan dibatalkan tanpa perubahan.';
 end if;
end$$;

create or replace function public.pos_read() returns jsonb
language plpgsql security definer set search_path='' as $$
-- MD_POS_PHOTO_FIX_040: delay image hydration until the permission-filtered result.
declare s jsonb;
begin
 s:=public.pos_read_compact_040();
 -- Only reattach photos for IDs already present in the authorized response.
 -- Preserve every existing metadata field and array order.
 s:=jsonb_set(s,'{products}',coalesce((
  select jsonb_agg(x.item||jsonb_build_object('photo',p.photo) order by x.n)
  from jsonb_array_elements(coalesce(s->'products','[]'::jsonb)) with ordinality x(item,n)
  left join public.md_pos_products p on p.id=(x.item->>'id')::uuid
 ),'[]'::jsonb));
 s:=jsonb_set(s,'{employees}',coalesce((
  select jsonb_agg(x.item||jsonb_build_object('profile_photo',e.profile_photo) order by x.n)
  from jsonb_array_elements(coalesce(s->'employees','[]'::jsonb)) with ordinality x(item,n)
  left join public.md_pos_employees e on e.id=(x.item->>'id')::uuid
 ),'[]'::jsonb));
 return s;
end$$;
revoke all on function public.pos_read() from public,anon,authenticated;
grant execute on function public.pos_read() to authenticated;
notify pgrst,'reload schema';
commit;

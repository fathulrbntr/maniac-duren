-- 024: small authenticated bootstrap; does not call the full pos_read chain.
begin;
create or replace function public.pos_bootstrap() returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.md_pos_employees%rowtype;
begin
 select * into e from public.md_pos_employees where user_id=auth.uid() and active;
 if not found then raise exception 'Akun tidak memiliki akses POS';end if;
 return jsonb_build_object(
 'bootstrapVersion',24,
 'me',jsonb_build_object('id',e.id,'userId',e.user_id,'name',e.name,'role',e.role,'permissions',e.permissions,'storeIds',e.store_ids),
 'employees',jsonb_build_array(jsonb_build_object('id',e.id,'name',e.name,'profile_photo',e.profile_photo)),
 'access',(select jsonb_object_agg(p,public.pos_allowed(p)) from unnest(array['stock','produce','waste','sell','kitchen','reports','finance','trace','master','attendance','cancel','employees']) p),
 'stores',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'location',s.location) order by s.name,s.id) from public.md_pos_stores s where e.role in ('owner','admin') or s.id=any(e.store_ids)),'[]'::jsonb));
end$$;
revoke all on function public.pos_bootstrap() from public,anon,authenticated;
grant execute on function public.pos_bootstrap() to authenticated;
notify pgrst,'reload schema';
commit;

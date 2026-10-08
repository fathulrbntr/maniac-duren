-- Optional undo for fix-pos-read-photos.sql. Does not reset any data.
begin;
do $$
declare fn text;backup_name text;body text;
begin
 foreach fn in array array['pos_read_v8','pos_read_v10','pos_read'] loop
  backup_name:=fn||'_before_photo_fix';
  if to_regprocedure('public.'||backup_name||'()') is null then
   raise exception 'Cadangan % tidak ditemukan; tidak ada perubahan diterapkan',backup_name;
  end if;
  body:=pg_get_functiondef(to_regprocedure('public.'||backup_name||'()'));
  execute replace(body,'FUNCTION public.'||backup_name||'()','FUNCTION public.'||fn||'()');
 end loop;
end$$;
revoke all on function public.pos_read_v8(),public.pos_read_v10() from public,anon,authenticated;
revoke all on function public.pos_read() from public,anon,authenticated;
grant execute on function public.pos_read() to authenticated;
notify pgrst,'reload schema';
commit;

-- 019: barang masuk langsung siap jual; sortir tidak lagi digunakan.
begin;
do $$begin
 if to_regprocedure('public.pos_mutate_v18(text,jsonb)') is null then raise exception 'Jalankan migration 018 terlebih dahulu';end if;
 if to_regprocedure('public.pos_mutate_v19(text,jsonb)') is null then alter function public.pos_mutate(text,jsonb) rename to pos_mutate_v19;end if;
 if to_regprocedure('public.pos_read_v19()') is null then alter function public.pos_read() rename to pos_read_v19;end if;
end$$;
revoke all on function public.pos_mutate_v19(text,jsonb),public.pos_read_v19() from public,anon,authenticated;
-- Penerimaan sebelumnya yang tertahan karena belum disortir juga dibuka.
-- Kondisi reject / belum matang dari riwayat lama tetap dipertahankan.
update public.md_pos_lots set quality='ready' where quality='unsorted';
-- Pengolahan buah tidak lagi memerlukan tahap sortir untuk menandai reject.
do $$declare fn record;body text;begin
 for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pos_mutate%' loop
  body:=pg_get_functiondef(fn.oid);
  if position('and quality=''reject''' in body)>0 then
   execute replace(replace(body,'and quality=''reject''','and quality in (''ready'',''reject'')'),'Sortir buah menjadi reject sebelum diolah','Pilih stok buah yang tersedia untuk diolah');
  end if;
 end loop;
end$$;
create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;begin s:=public.pos_read_v19();return s||jsonb_build_object('incomingReadyVersion',19);end$$;
create or replace function public.pos_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;existing boolean;begin
 if action='sort' then raise exception 'Fitur sortir sudah dinonaktifkan. Barang masuk langsung siap jual';end if;
 if action='receipt' then
  perform pg_catalog.pg_advisory_xact_lock(71031,1102);
  select exists(select 1 from public.md_pos_lots where id=(payload->>'id')::uuid) into existing;
  result:=public.pos_mutate_v19(action,payload);
  if not existing then update public.md_pos_lots set quality='ready' where id=(payload->>'id')::uuid;end if;
  return public.pos_read();
 end if;
 return public.pos_mutate_v19(action,payload);
end$$;
revoke all on function public.pos_read(),public.pos_mutate(text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_read(),public.pos_mutate(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

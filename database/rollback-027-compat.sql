-- Compatibility endpoint for the patch 027 web client.
-- Adds one RPC; does not reset data or replace the current public.pos_mutate.
begin;
do $$begin
 if to_regprocedure('public.pos_mutate(text,jsonb)') is null
    or to_regprocedure('public.pos_mutate_v19(text,jsonb)') is null then
  raise exception 'Database POS 019 atau lebih baru diperlukan';
 end if;
end$$;

create or replace function public.pos_mutate_027(action text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Login diperlukan';end if;
 -- Unreconciled receipts from later versions must not be consumed by the old UI.
 -- to_jsonb supports installations where cost_finalized does not exist yet.
 if exists (
  select 1 from public.md_pos_lots l
  where to_jsonb(l)->>'cost_finalized'='false'
   and (l.id::text=payload->>'lotId' or l.id::text=payload->>'sourceLotId'
    or exists(select 1 from jsonb_array_elements(
      case when jsonb_typeof(payload->'lines')='array' then payload->'lines' else '[]'::jsonb end
    ) line where line->>'lotId'=l.id::text))
 ) then raise exception 'Selesaikan modal nota di versi sebelumnya sebelum menggunakan batch ini';end if;

 if to_regprocedure('public.pos_mutate_v20(text,jsonb)') is not null then
  -- Migration 020 retained the patch 027/SQL 019 mutation function under this name.
  -- Its own permission, stock, audit and retry checks remain in effect.
  execute 'select public.pos_mutate_v20($1,$2)' into result using action,payload;
 else
  -- The original SQL 019 installation already has the matching public endpoint.
  result:=public.pos_mutate(action,payload);
 end if;
 return result;
end$$;
revoke all on function public.pos_mutate_027(text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_mutate_027(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

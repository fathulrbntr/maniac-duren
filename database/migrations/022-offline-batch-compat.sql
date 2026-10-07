-- 022: offline API layered after batch tracking; safe to rerun.
begin;
do $$begin
 if to_regprocedure('public.pos_mutate_v20(text,jsonb)') is null then raise exception 'Jalankan migration 020 terlebih dahulu';end if;
 if to_regprocedure('public.pos_hide_batch_costs(jsonb)') is null then raise exception 'Jalankan 021-batch-tracking terlebih dahulu';end if;
 if to_regprocedure('public.pos_read_offline_base()') is null then alter function public.pos_read() rename to pos_read_offline_base;end if;
end$$;
revoke all on function public.pos_read_offline_base() from public,anon,authenticated;
create table if not exists public.md_pos_sync_receipts (
 id uuid primary key references public.md_pos_order_runs(id),
 actor uuid not null references auth.users(id),
 store_id uuid not null references public.md_pos_stores(id),
 device_id uuid not null,
 client_created_at timestamptz not null,
 received_at timestamptz not null default now(),
 envelope jsonb not null
);
alter table public.md_pos_sync_receipts enable row level security;
revoke all on public.md_pos_sync_receipts from public,anon,authenticated;
create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;begin
 s:=public.pos_read_offline_base();
 s:=jsonb_set(s,'{orders}',coalesce((select jsonb_agg(o||case when r.id is null then '{}'::jsonb else jsonb_build_object('deviceId',r.device_id,'clientCreatedAt',r.client_created_at,'syncedAt',r.received_at) end order by n) from jsonb_array_elements(s->'orders') with ordinality as x(o,n) left join public.md_pos_sync_receipts r on r.id=(o->>'id')::uuid),'[]'::jsonb));
 return s||jsonb_build_object('offlineSyncVersion',21);
end$$;
create or replace function public.pos_sync_order(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare sale jsonb:=payload->'sale';eid uuid;branch uuid;device uuid;client_at timestamptz;old public.md_pos_sync_receipts%rowtype;
 item jsonb;p public.md_pos_products%rowtype;recipe public.md_pos_recipes%rowtype;result jsonb;expected jsonb;
begin
 if auth.uid() is null then raise exception 'Login diperlukan';end if;
 if jsonb_typeof(sale) is distinct from 'object' then raise exception 'Data penjualan tidak valid';end if;
 eid:=(sale->>'id')::uuid;branch:=(sale->>'storeId')::uuid;device:=(payload->>'deviceId')::uuid;client_at:=(payload->>'clientCreatedAt')::timestamptz;
 if eid is null or branch is null or device is null or client_at is null then raise exception 'Identitas transaksi tidak lengkap';end if;
 perform public.pos_require('sell',branch);
 -- Same lock as pos_mutate: ACK, stock, money and kitchen commit as one transaction.
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 select * into old from public.md_pos_sync_receipts where id=eid;
 if found then
  if old.actor<>auth.uid() or old.envelope is distinct from payload then raise exception 'ID transaksi sudah digunakan untuk data berbeda';end if;
  return public.pos_read();
 end if;
 if exists(select 1 from public.md_pos_events where id=eid) or exists(select 1 from public.md_pos_order_runs where id=eid) then raise exception 'ID transaksi sudah digunakan';end if;
 if jsonb_typeof(sale->'lines') is distinct from 'array' or jsonb_array_length(sale->'lines') not between 1 and 100 then raise exception 'Isi 1–100 item';end if;
 for item in select value from jsonb_array_elements(sale->'lines') loop
  select * into p from public.md_pos_products where id=(item->>'productId')::uuid;
  if not found then raise exception 'Produk sudah tidak tersedia';end if;
  if p.item_type='recipe' then
   expected:=payload->'recipeVersions'->(p.id::text);
   select * into recipe from public.md_pos_recipes where output_id=p.id;
   if not found or expected is null or recipe.id::text is distinct from expected->>'id' or recipe.version is distinct from (expected->>'version')::integer then
    raise exception 'Resep berubah sejak transaksi dicatat. Periksa transaksi offline sebelum diproses';
   end if;
  end if;
 end loop;
 result:=public.pos_mutate('order_create',sale);
 insert into public.md_pos_sync_receipts(id,actor,store_id,device_id,client_created_at,envelope) values(eid,auth.uid(),branch,device,client_at,payload);
 return public.pos_read();
end$$;
revoke all on function public.pos_read(),public.pos_sync_order(jsonb) from public,anon,authenticated;
grant execute on function public.pos_read(),public.pos_sync_order(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

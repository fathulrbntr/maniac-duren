-- Only receipt registration can introduce a fruit label. Stock operations consume
-- existing labels from the selected lot; they never infer or change ownership.
begin;
do $$begin
 if to_regprocedure('public.pos_tracking_mutate_before_105(text,text,jsonb)') is null
 or to_regprocedure('public.pos_read_before_105()') is null then
  raise exception 'Pasang tracking buah 101 dan stok barcode 105 terlebih dahulu';
 end if;
end$$;
create or replace function public.pos_tracking_mutate(entry text,act text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare lot public.md_pos_lots%rowtype;req public.md_pos_fruit_requests%rowtype;
begin
 if act not in ('movement','reject_mark','reject_process','reject_loss') then
  return public.pos_tracking_mutate_before_105(entry,act,p);
 end if;
 if auth.uid() is null then raise exception 'Login diperlukan';end if;
 -- Same lock order as receipt/sale/void. Validation and stock mutation are atomic.
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 select * into req from public.md_pos_fruit_requests where id=(p->>'id')::uuid;
 if found then
  -- Original engine verifies actor, action, exact request hash and permission.
  -- Already committed old requests remain retryable without recreating labels.
  return public.pos_tracking_mutate_before_105(entry,act,p);
 end if;
 if p ? 'barcodes' or p ? 'linkBarcodes' or p->>'fruitStockMode'='barcode' then
  select * into lot from public.md_pos_lots where id=coalesce(nullif(p->>'sourceLotId',''),nullif(p->>'lotId',''))::uuid for update;
  if not found then raise exception 'Batch buah tidak ditemukan';end if;
  perform public.pos_require(case when act='movement' then 'stock' else 'waste' end,lot.store_id);
  if (p->>'storeId')::uuid is distinct from lot.store_id then raise exception 'Outlet asal tidak cocok dengan batch';end if;
  if p ? 'linkBarcodes' then
   if jsonb_typeof(p->'linkBarcodes') is distinct from 'array' then raise exception 'Daftar barcode tidak valid';end if;
   if jsonb_array_length(p->'linkBarcodes')>0 then raise exception 'Barcode tidak dapat ditautkan lewat transfer atau reject. Gunakan label yang sudah tercatat pada batch penerimaan';end if;
  end if;
  if act='movement' and p->>'kind' is distinct from 'Transfer' then raise exception 'Gunakan Reject & Waste untuk pengolahan buah';end if;
  perform public.pos_tracking_selection(p->'barcodes',lot.id,lot.store_id,
   case when act='reject_mark' then array['available'] when act='reject_process' then array['reject'] else array['available','reject'] end,
   coalesce((p->>'kg')::numeric,(p->>'qty')::numeric),(p->>'pieces')::numeric);
 end if;
 -- 101 also rejects barcode-free operations on tracked batches. Legacy manual
 -- non-barcode stock remains supported; no path here inserts a fruit identity.
 return public.pos_tracking_mutate_before_105(entry,act,p);
end$$;
create or replace function public.pos_read() returns jsonb language sql security definer set search_path='' as $$
 select public.pos_read_before_105()||jsonb_build_object('fruitStockVersion',106)
$$;
revoke all on function public.pos_tracking_mutate_before_105(text,text,jsonb),public.pos_read_before_105(),public.pos_tracking_mutate(text,text,jsonb) from public,anon,authenticated;
revoke all on function public.pos_read() from public,anon;
grant execute on function public.pos_read() to authenticated;
notify pgrst,'reload schema';
commit;

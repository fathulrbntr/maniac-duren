-- 126: one explicit source batch per outbound rate. Install after 123.
begin;
set local lock_timeout = '10s';
select pg_catalog.pg_advisory_xact_lock(71031,1102);

-- Called by the existing RPC after authorization, replay and revision checks.
create or replace function md_supply.outbound_batch_rates(warehouse uuid, doc uuid, requested jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
  line jsonb;
  lot public.md_pos_lots%rowtype;
  selected uuid[] := '{}';
  rates jsonb := '[]';
begin
  if jsonb_typeof(requested) is distinct from 'array' or jsonb_array_length(requested) not between 1 and 50 then
    raise exception 'Isi 1–50 baris produk dan batch';
  end if;
  for line in select value from jsonb_array_elements(requested) loop
    if nullif(line->>'sourceLotId','') is null then raise exception 'Pilih batch untuk setiap produk'; end if;
    select * into lot from public.md_pos_lots where id=(line->>'sourceLotId')::uuid;
    if not found or lot.product_id is distinct from (line->>'productId')::uuid or lot.store_id<>warehouse
       or lot.quality<>'ready' or lot.kg<=0 or lot.pieces<=0 then
      raise exception 'Batch tidak tersedia untuk produk dan gudang asal';
    end if;
    if lot.id=any(selected) then raise exception 'Batch yang sama sudah dipilih'; end if;
    if coalesce(line->>'unit','') not in ('kg','butir') then raise exception 'Satuan harga tidak sesuai'; end if;
    if not exists (
      select 1 from public.md_pos_fruit_units u
      where u.lot_id=lot.id and u.product_id=lot.product_id and u.store_id=warehouse and u.status='available'
        and not exists (select 1 from md_supply.outbound_items i where i.barcode=u.barcode and not i.released and i.order_id<>doc)
        and not exists (select 1 from md_supply.receipt_line_ids l join md_supply.receipt_sessions r on r.plan_id=l.plan_id
                        where l.lot_id=u.receipt_lot_id and r.status<>'completed')
    ) then raise exception 'Batch tidak memiliki barcode yang siap dikirim'; end if;
    selected := array_append(selected,lot.id);
    rates := rates || jsonb_build_array(jsonb_build_object(
      'productId',lot.product_id,'sourceLotId',lot.id,'unit',line->>'unit','price',md_supply.note_amount(line->>'price')
    ));
  end loop;
  if exists(select 1 from md_supply.outbound_items where order_id=doc and not released and not (source_lot_id=any(selected))) then
    raise exception 'Batch yang sudah dipindai tidak boleh dihapus. Hapus scan terkait terlebih dahulu.';
  end if;
  return rates;
end$$;
revoke all on function md_supply.outbound_batch_rates(uuid,uuid,jsonb) from public, anon, authenticated;

-- Apply narrowly to the live functions, retaining subsequent patches and grants.
create or replace function pg_temp.edit_outbound_batch(fn regprocedure, old_text text, new_text text)
returns void language plpgsql as $$
declare definition text := pg_get_functiondef(fn);
begin
  if strpos(definition,new_text)>0 then return; end if;
  if cardinality(string_to_array(definition,old_text))<>2 then
    raise exception 'Definisi % tidak sesuai untuk patch 126',fn;
  end if;
  execute replace(definition,old_text,new_text);
end$$;

select pg_temp.edit_outbound_batch('public.pos_warehouse_mutate(text,jsonb)',
$old$   if jsonb_typeof(payload->'rates') is distinct from 'array' or jsonb_array_length(payload->'rates') not between 1 and 50 or (select count(distinct x->>'productId') from jsonb_array_elements(payload->'rates') x)<>jsonb_array_length(payload->'rates') then raise exception 'Isi 1–50 produk tanpa duplikasi';end if;
   for ln in select value from jsonb_array_elements(payload->'rates') loop
    if not exists(select 1 from public.md_pos_products where id=(ln->>'productId')::uuid and stock_unit='kg_butir') or coalesce(ln->>'unit','') not in ('kg','butir') then raise exception 'Produk atau satuan harga tidak sesuai';end if;
    amount:=md_supply.note_amount(ln->>'price');rates:=rates||jsonb_build_array(jsonb_build_object('productId',ln->>'productId','unit',ln->>'unit','price',amount));
   end loop;
   if exists(select 1 from md_supply.outbound_items i join public.md_pos_fruit_units f on f.barcode=i.barcode where i.order_id=oid and not exists(select 1 from jsonb_array_elements(rates) x where x->>'productId'=f.product_id::text)) then raise exception 'Produk yang sudah dipindai tidak boleh dihapus';end if;$old$,
$new$   rates:=md_supply.outbound_batch_rates((payload->>'storeId')::uuid,oid,payload->'rates');$new$);

-- Existing documents without a batch keep their product rate until edited.
select pg_temp.edit_outbound_batch('public.pos_warehouse_mutate(text,jsonb)',
$old$where x->>'productId'=u.product_id::text) then raise exception 'Produk barcode tidak tercantum pada dokumen'$old$,
$new$where x->>'productId'=u.product_id::text and (not (x ? 'sourceLotId') or x->>'sourceLotId'=u.lot_id::text)) then raise exception 'Produk atau batch barcode tidak sesuai dengan dokumen'$new$);
select pg_temp.edit_outbound_batch('md_supply.outbound_lines(md_supply.outbound_orders)',
$old$where value->>'productId'=l.product_id::text;$old$,
$new$where value->>'productId'=l.product_id::text and (not (value ? 'sourceLotId') or value->>'sourceLotId'=l.id::text);$new$);
select pg_temp.edit_outbound_batch('public.pos_read()',
$old$ if not bo then$old$,
$new$ s:=s||jsonb_build_object('outboundBatchVersion',126);
 if not bo then$new$);
commit;

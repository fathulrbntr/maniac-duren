-- Apply after 130. Fruit keeps its label-based packing workflow.
begin;
set local lock_timeout='10s';
select pg_catalog.pg_advisory_xact_lock(71031,1102);

create index if not exists md_outbound_active_rates on md_supply.outbound_orders
 using gin(rates jsonb_path_ops) where status in ('packing','ready','approved');

create or replace function md_supply.reserved_unit_qty(lot uuid, except_doc uuid)
returns numeric language sql stable set search_path='' as $$
 select coalesce(sum((r->>'qty')::numeric),0)
 from md_supply.outbound_orders o cross join lateral jsonb_array_elements(o.rates) r
 where o.status in ('packing','ready','approved') and o.id is distinct from except_doc
   and o.rates @> jsonb_build_array(jsonb_build_object('kind','unit','sourceLotId',lot))
   and r->>'kind'='unit' and r->>'sourceLotId'=lot::text;
$$;

-- All quantity-consuming routes must leave other documents' reservations intact.
create or replace function md_supply.protect_unit_reservations() returns trigger
language plpgsql set search_path='' as $$
declare reserved numeric;
begin
 if tg_op='UPDATE' and new.qty>=old.qty then return new;end if;
 reserved:=md_supply.reserved_unit_qty(old.id,nullif(current_setting('md_supply.dispatch_order',true),'')::uuid);
 if reserved>0 and (tg_op='DELETE' or reserved>new.qty) then raise exception 'Stok batch telah dipesan untuk pengiriman';end if;
 if tg_op='DELETE' then return old;end if;
 return new;
end$$;
drop trigger if exists md_outbound_unit_stock on public.md_pos_unit_lots;
create trigger md_outbound_unit_stock before update of qty or delete on public.md_pos_unit_lots
 for each row execute function md_supply.protect_unit_reservations();

create or replace function md_supply.checked_outbound_unit(warehouse uuid,doc uuid,r jsonb)
returns public.md_pos_unit_lots language plpgsql set search_path='' as $$
declare lot public.md_pos_unit_lots%rowtype;quantity numeric;
begin
 select * into lot from public.md_pos_unit_lots where id=(r->>'sourceLotId')::uuid for update;
 if not found or lot.store_id<>warehouse or lot.product_id is distinct from (r->>'productId')::uuid
   or lot.unit is distinct from r->>'unit' or lot.expiry < (now() at time zone 'Asia/Jakarta')::date
   or exists(select 1 from md_supply.receipt_sessions where plan_id=lot.receipt_plan_id and status<>'completed') then
   raise exception 'Batch nonbuah, satuan, atau lokasi tidak sesuai, kedaluwarsa, atau penerimaan belum selesai';
 end if;
 quantity:=public.pos_unit_qty(r->>'qty',lot.unit);
 if quantity>lot.qty-md_supply.reserved_unit_qty(lot.id,doc) then raise exception 'Jumlah kirim melebihi stok batch yang tersedia';end if;
 return lot;
end$$;

create or replace function md_supply.unit_manifest(rates jsonb)
returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(r->>'sourceLotId',r->'qty'),'{}'::jsonb)
 from jsonb_array_elements(rates) r where r->>'kind'='unit';
$$;

create or replace function md_supply.transfer_batch_rates(warehouse uuid,doc uuid,kind text,requested jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare fruits jsonb;result jsonb:='[]';r jsonb;lot public.md_pos_unit_lots%rowtype;
begin
 if jsonb_typeof(requested) is distinct from 'array' or jsonb_array_length(requested) not between 1 and 50 then raise exception 'Isi 1–50 baris produk dan batch';end if;
 if exists(select 1 from jsonb_array_elements(requested) x where nullif(x->>'sourceLotId','') is null) then raise exception 'Pilih batch untuk setiap produk';end if;
 if (select count(distinct x->>'sourceLotId') from jsonb_array_elements(requested) x)<>jsonb_array_length(requested) then raise exception 'Batch yang sama sudah dipilih';end if;
 select jsonb_agg(x order by n) into fruits from jsonb_array_elements(requested) with ordinality t(x,n) where x->>'kind' is distinct from 'unit';
 if fruits is not null then result:=md_supply.outbound_batch_rates(warehouse,doc,fruits);
 elsif exists(select 1 from md_supply.outbound_items where order_id=doc and not released) then raise exception 'Hapus scan buah yang sudah disiapkan terlebih dahulu';end if;
 for r in select value from jsonb_array_elements(requested) where value->>'kind'='unit' loop
  if kind<>'transfer' then raise exception 'Barang nonbuah tersedia untuk transfer toko';end if;
  lot:=md_supply.checked_outbound_unit(warehouse,doc,r);
  result:=result||jsonb_build_array(jsonb_build_object('kind','unit','productId',lot.product_id,'sourceLotId',lot.id,
   'unit',lot.unit,'qty',public.pos_unit_qty(r->>'qty',lot.unit),'price',md_supply.note_amount(r->>'price')));
 end loop;
 if exists(select 1 from md_supply.outbound_orders o where o.id=doc and o.status='ready'
   and md_supply.unit_manifest(o.rates)<>md_supply.unit_manifest(result)) then
  raise exception 'Buka ulang penyiapan sebelum mengubah batch atau jumlah nonbuah';end if;
 return result;
end$$;

create or replace function md_supply.confirm_packed_units(rates jsonb,counts jsonb) returns void
language plpgsql set search_path='' as $$
declare expected jsonb:=md_supply.unit_manifest(rates);entry record;actual jsonb:='{}';
begin
 if expected='{}' and counts is null then return;end if;
 if jsonb_typeof(counts) is distinct from 'object' then raise exception 'Isi jumlah fisik setiap batch nonbuah';end if;
 for entry in select * from jsonb_each_text(counts) loop
  if not (expected ? entry.key) or entry.value is null then raise exception 'Batch penyiapan tidak sesuai dokumen';end if;
  actual:=actual||jsonb_build_object(entry.key,public.pos_positive(entry.value));
 end loop;
 if actual<>expected then raise exception 'Jumlah fisik per batch wajib sesuai dokumen';end if;
end$$;

create or replace function md_supply.outbound_unit_lines(o md_supply.outbound_orders)
returns jsonb language plpgsql set search_path='' as $$
declare r jsonb;lot public.md_pos_unit_lots%rowtype;result jsonb:='[]';
begin
 for r in select value from jsonb_array_elements(o.rates) where value->>'kind'='unit' loop
  lot:=md_supply.checked_outbound_unit(o.source_id,o.id,r);
  result:=result||jsonb_build_array(r||jsonb_build_object('targetLotId',gen_random_uuid(),
   'supplierId',lot.supplier_id,'supplierName',(select name from public.md_pos_suppliers where id=lot.supplier_id),
   'productName',(select name from public.md_pos_products where id=lot.product_id),'expiry',lot.expiry,
   'unitCost',lot.unit_cost,'supplierUnitCost',coalesce(lot.supplier_unit_cost,lot.unit_cost),
   'total',round((r->>'price')::numeric*(r->>'qty')::numeric,2)));
 end loop;
 return result;
end$$;

create or replace function pg_temp.edit131(fn regprocedure,old_text text,new_text text)
returns void language plpgsql as $$
declare d text:=pg_get_functiondef(fn);
begin
 if strpos(d,new_text)>0 then return;end if;
 if cardinality(string_to_array(d,old_text))<>2 then raise exception 'Definisi % tidak sesuai patch 131',fn;end if;
 execute replace(d,old_text,new_text);
end$$;

select pg_temp.edit131('public.pos_warehouse_mutate(text,jsonb)',
 $a$rates:=md_supply.outbound_batch_rates((payload->>'storeId')::uuid,oid,payload->'rates');$a$,
 $b$rates:=md_supply.transfer_batch_rates((payload->>'storeId')::uuid,oid,payload->>'kind',payload->'rates');$b$);
select pg_temp.edit131('public.pos_warehouse_mutate(text,jsonb)',
 $a$if o.status<>'packing' then raise exception 'Dokumen tidak sedang disiapkan';end if;$a$,
 $b$if o.status<>'packing' then raise exception 'Dokumen tidak sedang disiapkan';end if;
   perform md_supply.confirm_packed_units(o.rates,payload->'unitCounts');$b$);
select pg_temp.edit131('public.pos_warehouse_mutate(text,jsonb)',
 $a$update md_supply.receipt_sessions set status='reopened',reopen_reason=reason$a$,
 $b$if exists(select 1 from public.md_pos_unit_lots b where b.receipt_plan_id=pid and md_supply.reserved_unit_qty(b.id,null)>0)
   then raise exception 'Batalkan penyiapan pengiriman batch ini sebelum membuka penerimaan';end if;
   update md_supply.receipt_sessions set status='reopened',reopen_reason=reason$b$);
select pg_temp.edit131('md_supply.outbound_lines(md_supply.outbound_orders)',
 $a$if not exists(select 1 from md_supply.outbound_items where order_id=o.id and not released) then$a$,
 $b$result:=md_supply.outbound_unit_lines(o);
 if exists(select 1 from jsonb_array_elements(o.rates) as ent(val) where ent.val->>'kind' is distinct from 'unit')
    and not exists(select 1 from md_supply.outbound_items where order_id=o.id and not released) then$b$);
select pg_temp.edit131('md_supply.dispatch_outbound(md_supply.outbound_orders,uuid)',
 $a$for ln in select value from jsonb_array_elements(o.lines) loop$a$,
 $b$for ln in select value from jsonb_array_elements(o.lines) loop
  if ln->>'kind'='unit' then
   update public.md_pos_unit_lots set qty=qty-(ln->>'qty')::numeric where id=(ln->>'sourceLotId')::uuid
     returning unit_cost*(ln->>'qty')::numeric into strict cost;
   insert into public.md_pos_stock_journal(event_id,lot_id,product_id,store_id,supplier_id,qty,unit,cost,quality)
     values(eid,(ln->>'sourceLotId')::uuid,(ln->>'productId')::uuid,o.source_id,(ln->>'supplierId')::uuid,-(ln->>'qty')::numeric,ln->>'unit',-cost,'ready');
   continue;
  end if;$b$);
select pg_temp.edit131('public.pos_read()', $a$'outboundBatchVersion',126$a$,$b$'outboundBatchVersion',131$b$);

revoke all on function md_supply.reserved_unit_qty(uuid,uuid),md_supply.protect_unit_reservations(),md_supply.checked_outbound_unit(uuid,uuid,jsonb),
 md_supply.unit_manifest(jsonb),md_supply.transfer_batch_rates(uuid,uuid,text,jsonb),md_supply.confirm_packed_units(jsonb,jsonb),
 md_supply.outbound_unit_lines(md_supply.outbound_orders) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;

-- Patch 132. Direct supplier receipt at a branch and stock-only branch transfers.
begin;
set local lock_timeout='10s';
select pg_catalog.pg_advisory_xact_lock(71031,1102);
do $$begin
 if to_regprocedure('md_supply.transfer_batch_rates(uuid,uuid,text,jsonb)') is null then
  raise exception 'Pasang patch 131 sebelum patch 132';
 end if;
end$$;
alter table md_supply.transfers alter column invoice_no drop not null;
alter table md_supply.transfers drop constraint if exists transfers_total_check;
alter table md_supply.transfers drop constraint if exists branch_transfer_amount;
alter table md_supply.transfers add constraint branch_transfer_amount check (
 (invoice_no is null and total=0 and paid=0) or (invoice_no is not null and total>0)
);

-- Match the installed function once. Abort the entire migration on a different schema.
create or replace function pg_temp.edit132(fn regprocedure, old_text text, new_text text)
returns void language plpgsql as $$
declare definition text:=pg_get_functiondef(fn);
begin
 if strpos(definition,new_text)>0 then return;end if;
 if cardinality(string_to_array(definition,old_text))<>2 then
  raise exception 'Definisi % tidak sesuai patch 132',fn;
 end if;
 execute replace(definition,old_text,new_text);
end$$;

select pg_temp.edit132('public.pos_warehouse_mutate_before_112(text,jsonb)',
 $old$perform md_supply.require_location(st,'stock','warehouse');$old$,
 $new$perform md_supply.require_location(st,'stock','store');$new$);

select pg_temp.edit132('public.pos_warehouse_mutate(text,jsonb)',
 $old$perform md_supply.require_location(p.warehouse_id,'stock','warehouse');$old$,
 $new$perform md_supply.require_location(p.warehouse_id,'stock'); -- includes previously opened notes$new$);

select pg_temp.edit132('public.pos_tracking_mutate_before_114(text,text,jsonb)',
 $old$perform md_supply.require_location(st,'stock','warehouse');$old$,
 $new$perform md_supply.require_location(st,'stock'); -- receipt_commit and note matching guard the origin$new$);

select pg_temp.edit132('public.pos_warehouse_mutate(text,jsonb)',
 $old$if action='transfer_dispatch' then raise exception 'Buat pengiriman melalui Back Office, lalu scan dan kirim dari dokumen tersebut';end if;$old$,
 $new$if action='transfer_dispatch' then
  perform md_supply.require_location((payload->>'storeId')::uuid,'stock');
  return public.pos_warehouse_mutate_before_112(action,payload);
 end if;
 if action='outbound_save' and not exists(select 1 from md_supply.outbound_orders
   where id=coalesce((payload->>'orderId')::uuid,(payload->>'id')::uuid)) then
  raise exception 'Distribusi dinonaktifkan. Gunakan Transfer antarcabang dari stok toko.';
 end if;$new$);

select pg_temp.edit132('public.pos_warehouse_mutate_before_112(text,jsonb)',
 $old$perform md_supply.require_location(st,'dispatch','warehouse');$old$,
 $new$perform md_supply.require_location(st,'stock'); -- dispatch from an assigned stock location
  if exists(select 1 from md_supply.outbound_items i where not i.released
       and i.barcode in (select jsonb_array_elements_text(payload->'barcodes'))) then
   raise exception 'Barcode sudah dipesan pada dokumen pengiriman lama';
  end if;$new$);

select pg_temp.edit132('public.pos_warehouse_mutate_before_112(text,jsonb)',
 $old$   select * into rate from md_supply.prices where product_id=lot.product_id;
   if not found then raise exception 'Admin belum mengatur harga transfer untuk produk %',(select name from public.md_pos_products where id=lot.product_id);end if;
   if rate.unit not in ('kg','butir') then raise exception 'Satuan harga transfer perlu diperbarui admin';end if;
   newlot:=gen_random_uuid();line_total:=round(rate.price*case when rate.unit='kg' then kg else pieces end,2);price_total:=price_total+line_total;
$old$,
 $new$   if lot.unit_cost is null then raise exception 'Modal batch buah belum tersedia';end if;
   rate.unit:='kg';rate.price:=lot.unit_cost;
   newlot:=gen_random_uuid();line_total:=lot.unit_cost*kg;
$new$);

select pg_temp.edit132('public.pos_warehouse_mutate_before_112(text,jsonb)',
 $old$   select * into rate from md_supply.prices where product_id=ul.product_id;
   if not found or rate.unit<>ul.unit then raise exception 'Atur harga transfer bahan terlebih dahulu';end if;
   newlot:=gen_random_uuid();line_total:=round(rate.price*quantity,2);price_total:=price_total+line_total;
$old$,
 $new$   if ul.unit_cost is null then raise exception 'Modal batch barang belum tersedia';end if;
   rate.unit:=ul.unit;rate.price:=ul.unit_cost;
   newlot:=gen_random_uuid();line_total:=ul.unit_cost*quantity;
$new$);

select pg_temp.edit132('public.pos_warehouse_mutate_before_112(text,jsonb)',
 $old$quantity:=public.pos_positive(row->>'qty');$old$,
 $new$quantity:=public.pos_unit_qty(row->>'qty',ul.unit);$new$);

select pg_temp.edit132('public.pos_warehouse_mutate_before_112(text,jsonb)',
 $old$values(tid,'INV-ARN-'||to_char(day,'YYYYMM')||'-'||lpad(seq::text,6,'0'),'SJ-ARN-'$old$,
 $new$values(tid,null,'SJ-CBG-'$new$);

select pg_temp.edit132('public.pos_warehouse_mutate_before_112(text,jsonb)',
 $old$,'phone',to_jsonb(s)->>'phone') from public.md_pos_stores s where id=dst),price_total,$old$,
 $new$,'phone',to_jsonb(s)->>'phone') from public.md_pos_stores s where id=dst),0,$new$);

select pg_temp.edit132('public.pos_warehouse_mutate_before_112(text,jsonb)',
 $old$if exists(select 1 from md_supply.items where transfer_id=tid and scanned_at is null) then$old$,
 $new$if t.invoice_no is null and (payload->'fruitCounts') is distinct from
     (select coalesce(jsonb_object_agg(x->>'sourceLotId',(x->>'pieces')::int),'{}'::jsonb)
      from jsonb_array_elements(t.lines) x where x->>'kind'='fruit') then
    raise exception 'Jumlah fisik buah per batch belum sesuai surat jalan';
   end if;
   if t.invoice_no is not null and exists(select 1 from md_supply.items where transfer_id=tid and scanned_at is null) then$new$);

select pg_temp.edit132('public.pos_warehouse_mutate_before_112(text,jsonb)',
 $old$if t.status='cancelled' then raise exception 'Invoice dibatalkan';end if;$old$,
 $new$if t.invoice_no is null then raise exception 'Mutasi antarcabang tidak memiliki tagihan';end if;
   if t.status='cancelled' then raise exception 'Invoice dibatalkan';end if;$new$);

select pg_temp.edit132('public.pos_warehouse_mutate_before_112(text,jsonb)',
 $old$(ln->>'total')::numeric/(ln->>'kg')::numeric,coalesce(lot.supplier_unit_cost,lot.unit_cost)$old$,
 $new$case when t.invoice_no is null then lot.unit_cost else (ln->>'total')::numeric/(ln->>'kg')::numeric end,coalesce(lot.supplier_unit_cost,lot.unit_cost)$new$);

select pg_temp.edit132('public.pos_warehouse_mutate_before_112(text,jsonb)',
 $old$(ln->>'total')::numeric/(ln->>'qty')::numeric,coalesce(ul.supplier_unit_cost,ul.unit_cost)$old$,
 $new$case when t.invoice_no is null then ul.unit_cost else (ln->>'total')::numeric/(ln->>'qty')::numeric end,coalesce(ul.supplier_unit_cost,ul.unit_cost)$new$);

select pg_temp.edit132('public.pos_warehouse_mutate_before_112(text,jsonb)',
 $old$case when action='transfer_receive' then (ln->>'total')::numeric else quantity*(ln->>'unitCost')::numeric*case when action='transfer_dispatch' then -1 else 1 end end$old$,
 $new$case when t.invoice_no is null and action in ('transfer_receive','transfer_cancel') then
    quantity*case when ln->>'kind'='fruit' then (select fruit_batch.unit_cost from public.md_pos_lots as fruit_batch where fruit_batch.id=(ln->>'sourceLotId')::uuid)
                  else (select unit_batch.unit_cost from public.md_pos_unit_lots as unit_batch where unit_batch.id=(ln->>'sourceLotId')::uuid) end
   when action='transfer_receive' then (ln->>'total')::numeric else quantity*(ln->>'unitCost')::numeric*case when action='transfer_dispatch' then -1 else 1 end end$new$);

select pg_temp.edit132('public.pos_read_before_112()',
 $old$or st.id=any(emp.store_ids)$old$,
 $new$or (st.location_type='store' and public.pos_allowed('stock')) or st.id=any(emp.store_ids)$new$);

select pg_temp.edit132('public.pos_read_before_112()',
 $old$or public.pos_allowed('dispatch',t.source_id)$old$,
 $new$or (t.invoice_no is null and public.pos_allowed('stock',t.source_id)) or public.pos_allowed('dispatch',t.source_id)$new$);

select pg_temp.edit132('public.pos_read()',
 $old$'outboundBatchVersion',131$old$,
 $new$'branchStockVersion',132,'outboundBatchVersion',131$new$);

select pg_temp.edit132('md_supply.transfer_json(md_supply.transfers)',
 $old$then x else x-'unitCost'-'supplierUnitCost' end$old$,
 $new$then x when t.invoice_no is null then x-'price'-'total'-'unitCost'-'supplierUnitCost' else x-'unitCost'-'supplierUnitCost' end$new$);

select pg_temp.edit132('md_supply.note_reprice(md_supply.receipt_plans)',
 $old$exists(select 1 from md_supply.items i where i.target_lot_id=(x->>'id')::uuid) or exists(select 1 from public.md_pos_unit_lots u where u.id=(x->>'id')::uuid and u.transfer_source_id is not null)$old$,
 $new$exists(select 1 from md_supply.transfers t cross join lateral jsonb_array_elements(t.lines) as transfer_line(item) where t.invoice_no is not null and transfer_line.item->>'targetLotId'=x->>'id')$new$);

select pg_temp.edit132('public.pos_cash_flow_read(jsonb)',
 $old$from md_supply.transfers t where (outlet is null or t.target_id=outlet)$old$,
 $new$from md_supply.transfers t where t.invoice_no is not null and (outlet is null or t.target_id=outlet)$new$);

select pg_temp.edit132('public.pos_cash_flow_read(jsonb)',
 $old$select 'supplier_'||p.component,'',false,v.day,v.amount from md_supply.note_payments p$old$,
 $new$select (case when loc.location_type='store' then 'retail_supplier_' else 'supplier_' end)||p.component,'',false,v.day,v.amount from md_supply.note_payments p
      join md_supply.receipt_plans plan on plan.id=p.plan_id
      join public.md_pos_stores loc on loc.id=plan.warehouse_id$new$);

select pg_temp.edit132('public.pos_cash_flow_read(jsonb)',
 $old$where outlet is null and v.day is not null$old$,
 $new$where (outlet is null or loc.id=outlet) and v.day is not null$new$);

select pg_temp.edit132('public.pos_cash_flow_read(jsonb)',
 $old$'pettyCashVersion',130$old$,
 $new$'branchStockVersion',132,'pettyCashVersion',130$new$);

-- New operating expenses use the branch's Retail funds. Historical funding can still be reconciled.
select pg_temp.edit132('public.pos_admin_mutate_before_107(text,jsonb)',
 $old$if action='expense_save' and (payload->>'funding' is null or payload->>'funding' not in ('retail','distribution')) then raise exception 'Pilih saldo PT sesuai lokasi untuk biaya operasional';end if;$old$,
 $new$if action='expense_save' and payload->>'funding' is distinct from 'retail' then raise exception 'Pengeluaran operasional baru menggunakan saldo PT Retail';end if;$new$);

-- Include actual direct supplier payments and their reversals in the existing Retail balance.
do $view$
declare def text:=rtrim(pg_get_viewdef('md_supply.retail_movements'::regclass,true), E'; \n');
begin
 if strpos(def,'md_supply.note_payments')=0 then
  execute 'create or replace view md_supply.retail_movements as '||def||$extra$
    union all
    select v.day,v.amount from md_supply.note_payments n
    join md_supply.receipt_plans p on p.id=n.plan_id
    join public.md_pos_stores s on s.id=p.warehouse_id and s.location_type='store'
    left join md_supply.events ev on ev.id=n.void_event_id
    cross join lateral (values(n.paid_on,-n.amount),((ev.at at time zone 'Asia/Jakarta')::date,n.amount)) v(day,amount)
    where v.day is not null$extra$;
 end if;
end $view$;
create or replace function md_supply.check_branch_supplier_funds() returns trigger
language plpgsql set search_path='' as $$
begin
 if exists(select from md_supply.receipt_plans p join public.md_pos_stores s on s.id=p.warehouse_id
           where p.id=new.plan_id and s.location_type='store') then
  perform md_supply.require_retail_balance(new.paid_on,new.amount);
 end if;
 return new;
end$$;
revoke all on function md_supply.check_branch_supplier_funds() from public,anon,authenticated;
drop trigger if exists check_branch_funds on md_supply.note_payments;
create trigger check_branch_funds before insert on md_supply.note_payments
for each row execute function md_supply.check_branch_supplier_funds();
notify pgrst,'reload schema';
commit;

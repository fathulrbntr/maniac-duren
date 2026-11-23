-- Apply after 114 and 119. One receipt, one shipment, one lot per invoice line.
begin;
set local lock_timeout='10s';
select pg_catalog.pg_advisory_xact_lock(71031,1102);

alter table md_supply.receipt_line_ids add column if not exists actual_qty numeric;
alter table md_supply.receipt_line_ids add column if not exists expiry date;
alter table public.md_pos_unit_lots add column if not exists receipt_plan_id uuid references md_supply.receipt_plans;
alter table public.md_pos_unit_lots add column if not exists shipping_cost numeric;
create unique index if not exists md_unit_receipt_line on public.md_pos_unit_lots(receipt_plan_id, product_id) where receipt_plan_id is not null;

-- Preserve existing RPC grants and the installed barcode, audit and retry wrappers.
create or replace function pg_temp.edit122(fn regprocedure, before_text text, after_text text)
returns void language plpgsql as $$
declare d text:=pg_get_functiondef(fn);
begin
 if strpos(d,after_text)>0 then return; end if;
 if cardinality(string_to_array(d,before_text))<>2 then raise exception 'Definisi % tidak cocok dengan patch 122',fn; end if;
 execute replace(d,before_text,after_text);
end $$;

select pg_temp.edit122('public.pos_warehouse_mutate_before_112(text,jsonb)',
 $a$and stock_unit='kg_butir') then raise exception 'Nota ini untuk durian berbarcode'$a$,
 $a$and item_type<>'recipe' and stock_unit in ('kg_butir','kg','g','ml','pcs','porsi')) then raise exception 'Pilih barang fisik yang memiliki satuan stok'$a$);

select pg_temp.edit122('md_supply.expected_values(jsonb)',
 $a$  kg:=public.pos_positive$a$,
 $a$  declare unit text; begin
   select stock_unit into strict unit from public.md_pos_products where id=(x->>'productId')::uuid and item_type<>'recipe';
   if unit<>'kg_butir' then
    result:=result||jsonb_build_object(x->>'productId',jsonb_build_object('unit',unit,'qty',public.pos_unit_qty(x->>'expectedQty',unit)));
    continue;
   end if;
  end;
  kg:=public.pos_positive$a$);

select pg_temp.edit122('md_supply.receipt_json(uuid,boolean)',
 $a$'scans',case when include_scans$a$,
 $a$'quantities',coalesce((select jsonb_object_agg(product_id::text,jsonb_build_object('qty',actual_qty,'expiry',expiry))
   from md_supply.receipt_line_ids where plan_id=pid and actual_qty is not null),'{}'::jsonb),
 'scans',case when include_scans$a$);

select pg_temp.edit122('public.pos_warehouse_mutate(text,jsonb)',
 $a$if action not in ('receipt_expected_edit'$a$,
 $a$if action not in ('receipt_quantity','receipt_expected_edit'$a$);
select pg_temp.edit122('public.pos_warehouse_mutate(text,jsonb)',
 $a$   elsif action='receipt_scan_remove' then$a$,
 $a$   elsif action='receipt_quantity' then
    prod:=(payload->>'productId')::uuid;
    if p.expected->(prod::text)->>'unit' is null then raise exception 'Pilih barang satuan pada nota'; end if;
    amount:=public.pos_unit_qty(payload->>'qty', p.expected->(prod::text)->>'unit');
    dt:=nullif(payload->>'expiry','')::date;
    if dt<p.date then raise exception 'Kedaluwarsa mendahului tanggal penerimaan';end if;
    update md_supply.receipt_line_ids set actual_qty=amount,expiry=dt where plan_id=pid and product_id=prod;
    if not found then raise exception 'Baris nota tidak ditemukan';end if;
   elsif action='receipt_scan_remove' then$a$);

-- For mixed units use cumulative value shares. Rounding the boundaries conserves the invoice freight.
create or replace function md_supply.value_freight(p md_supply.receipt_plans, product text)
returns numeric language sql stable set search_path='' as $$
 with amounts as (
  select x->>'productId' pid, (x->>'purchaseCost')::numeric cost,n
  from jsonb_array_elements(p.lines) with ordinality as t(x,n)
 ), shares as (
  select *,sum(cost) over(order by n) running,sum(cost) over() total,max(n) over() last_n from amounts
 )
 select (case when n=last_n then p.shipping else least(p.shipping,round(p.shipping*running/total,2)) end)
       -least(p.shipping,round(p.shipping*(running-cost)/total,2)) from shares where pid=product
$$;
create or replace function md_supply.has_units(p md_supply.receipt_plans)
returns boolean language sql immutable set search_path='' as $$
 select exists(select from jsonb_each(p.expected) x where x.value ? 'unit')
$$;
select pg_temp.edit122('public.pos_tracking_mutate_before_114(text,text,jsonb)',
 $a$if jsonb_array_length(plan.lines)<>jsonb_array_length(p->'lines')$a$,
 $a$if (select count(*) from jsonb_array_elements(plan.lines) x where not coalesce(plan.expected->(x->>'productId') ? 'unit',false))<>jsonb_array_length(p->'lines')$a$);
select pg_temp.edit122('public.pos_receive_shipment_before_101(jsonb)',
 $a$  allocated:=allocated+share;$a$,
 $a$  if nullif(payload->>'planId','') is not null then
   select case when md_supply.has_units(rp) then md_supply.value_freight(rp,line->>'productId') else share end
   into strict share from md_supply.receipt_plans rp where rp.id=(payload->>'planId')::uuid;
  end if;
  allocated:=allocated+share;$a$);

create or replace function md_supply.post_receipt_units(p md_supply.receipt_plans,eid uuid)
returns void language plpgsql set search_path='' as $$
declare
 row_data record; old_lot public.md_pos_unit_lots%rowtype; share numeric; cost numeric; delta numeric; journal_id uuid;
begin
 for row_data in
  select li.*,p.expected->(li.product_id::text)->>'unit' unit,(ln->>'purchaseCost')::numeric price
  from md_supply.receipt_line_ids li join jsonb_array_elements(p.lines) ln on ln->>'productId'=li.product_id::text
  where li.plan_id=p.id and p.expected->(li.product_id::text) ? 'unit'
 loop
  if row_data.actual_qty is null then raise exception 'Catat jumlah aktual untuk setiap barang sebelum menyelesaikan nota';end if;
  share:=md_supply.value_freight(p,row_data.product_id::text);
  cost:=(row_data.price+share)/row_data.actual_qty;
  if p.received_id is null then
   journal_id:=row_data.lot_id;
   delta:=row_data.actual_qty;
   insert into public.md_pos_events(id,action,store_id,actor,employee_id,business_date,payload)
   values(journal_id,'unit_receipt',p.warehouse_id,auth.uid(),(select id from public.md_pos_employees where user_id=auth.uid()),p.date,
    jsonb_build_object('id',journal_id,'planId',p.id,'invoiceNo',p.invoice_no,'date',p.date,'productId',row_data.product_id,'supplierId',p.supplier_id,'storeId',p.warehouse_id,'qty',delta,'kind','purchase','totalCost',row_data.price+share));
   insert into public.md_pos_unit_lots(id,product_id,store_id,supplier_id,receipt_plan_id,received_date,expiry,received_qty,qty,unit,kind,unit_cost,supplier_unit_cost,shipping_cost,note,created_by)
   values(journal_id,row_data.product_id,p.warehouse_id,p.supplier_id,p.id,p.date,row_data.expiry,delta,delta,row_data.unit,'purchase',cost,cost,share,p.invoice_no,auth.uid());
  else
   select * into strict old_lot from public.md_pos_unit_lots where id=row_data.lot_id and receipt_plan_id=p.id for update;
   delta:=row_data.actual_qty-old_lot.received_qty;
   if old_lot.qty+delta<0 then raise exception 'Koreksi melebihi sisa batch';end if;
   journal_id:=eid;
   update public.md_pos_unit_lots set received_qty=row_data.actual_qty,qty=old_lot.qty+delta,expiry=row_data.expiry,unit_cost=cost,supplier_unit_cost=cost,shipping_cost=share where id=old_lot.id;
  end if;
  if delta<>0 then
   insert into public.md_pos_stock_journal(event_id,lot_id,product_id,store_id,supplier_id,qty,unit,cost,quality)
   values(journal_id,row_data.lot_id,row_data.product_id,p.warehouse_id,p.supplier_id,delta,row_data.unit,delta*cost,'ready');
  end if;
 end loop;
end $$;

select pg_temp.edit122('md_supply.finish_receipt(md_supply.receipt_plans,uuid)',
 $a$  select lot_id into strict root$a$,
 $a$  if p.expected->(ln->>'productId') ? 'unit' then continue;end if;
  select lot_id into strict root$a$);
select pg_temp.edit122('md_supply.finish_receipt(md_supply.receipt_plans,uuid)',
 $a$  perform public.pos_receive_shipment(jsonb_build_object('id',r.shipment_id,'planId',p.id,'storeId',p.warehouse_id,'supplierId',p.supplier_id,'invoiceNo',p.invoice_no,'date',p.date,'shippingCost',p.shipping,'unloadingComplete',true,'lines',lines));$a$,
 $a$  perform md_supply.post_receipt_units(p,eid);
  if jsonb_array_length(lines)=0 then
   insert into public.md_pos_receipt_shipments(id,store_id,payload) values(r.shipment_id,p.warehouse_id,jsonb_build_object('planId',p.id,'invoiceNo',p.invoice_no,'lines',p.lines));
   update md_supply.receipt_plans set received_id=r.shipment_id where id=p.id;
  else
  perform public.pos_receive_shipment(jsonb_build_object('id',r.shipment_id,'planId',p.id,'storeId',p.warehouse_id,'supplierId',p.supplier_id,'invoiceNo',p.invoice_no,'date',p.date,'shippingCost',p.shipping,'unloadingComplete',true,'lines',lines));
  end if;$a$);
select pg_temp.edit122('md_supply.finish_receipt(md_supply.receipt_plans,uuid)',
 $a$  perform md_supply.note_reprice(p);$a$,
 $a$  perform md_supply.post_receipt_units(p,eid);
  perform md_supply.note_reprice(p);$a$);

-- Corrections to source invoices reprice the same roots and their transfer/production descendants.
select pg_temp.edit122('md_supply.note_reprice(md_supply.receipt_plans)',
 $a$if kg is null or kg<=0 then$a$,
 $a$if not md_supply.has_units(plan) and (kg is null or kg<=0) then$a$);
select pg_temp.edit122('md_supply.note_reprice(md_supply.receipt_plans)',
 $a$if (select count(*) from public.md_pos_lots where shipment_id=plan.received_id and source_lot_id is null)<>jsonb_array_length(plan.lines)$a$,
 $a$if (select count(*) from public.md_pos_lots where shipment_id=plan.received_id and source_lot_id is null)+(select count(*) from public.md_pos_unit_lots where receipt_plan_id=plan.id)<>jsonb_array_length(plan.lines)$a$);
select pg_temp.edit122('md_supply.note_reprice(md_supply.receipt_plans)',
 $a$  select * into strict l from public.md_pos_lots$a$,
 $a$  if plan.expected->(ln->>'productId') ? 'unit' then
   share:=md_supply.value_freight(plan,ln->>'productId');
   update public.md_pos_unit_lots set shipping_cost=share,
    unit_cost=((ln->>'purchaseCost')::numeric+share)/received_qty,
    supplier_unit_cost=((ln->>'purchaseCost')::numeric+share)/received_qty
   where receipt_plan_id=plan.id and product_id=(ln->>'productId')::uuid returning id into strict l.id;
   roots:=array_append(roots,l.id);continue;
  end if;
  select * into strict l from public.md_pos_lots$a$);
select pg_temp.edit122('md_supply.note_reprice(md_supply.receipt_plans)',
 $a$share:=case when idx=jsonb_array_length(plan.lines)$a$,
 $a$share:=case when md_supply.has_units(plan) then md_supply.value_freight(plan,ln->>'productId') when idx=jsonb_array_length(plan.lines)$a$);

create or replace function md_supply.guard_fruit_origin() returns trigger language plpgsql set search_path='' as $$
begin
 if new.source_lot_id is null and not exists(
  select from md_supply.receipt_line_ids li join md_supply.receipt_plans p on p.id=li.plan_id
  where li.plan_id::text=current_setting('md_supply.receipt_commit',true) and li.lot_id=new.id
   and li.product_id=new.product_id and p.supplier_id=new.supplier_id and p.warehouse_id=new.store_id
 ) then raise exception 'Stok buah wajib melalui penerimaan nota supplier';end if;
 return new;
end $$;
drop trigger if exists md_guard_fruit_origin on public.md_pos_lots;
create trigger md_guard_fruit_origin before insert on public.md_pos_lots for each row execute function md_supply.guard_fruit_origin();

create or replace function md_supply.guard_unit_receipt() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' and new.kind in ('opening','purchase') then
  if new.receipt_plan_id is null or current_setting('md_supply.receipt_commit',true) is distinct from new.receipt_plan_id::text or
   not exists(select from md_supply.receipt_line_ids where plan_id=new.receipt_plan_id and lot_id=new.id and product_id=new.product_id)
  then raise exception 'Stok pembelian wajib melalui penerimaan nota supplier';end if;
 elsif tg_op='UPDATE' and old.receipt_plan_id is not null and new.qty<>old.qty and
   current_setting('md_supply.receipt_commit',true) is distinct from old.receipt_plan_id::text and
   exists(select from md_supply.receipt_sessions where plan_id=old.receipt_plan_id and status<>'completed')
 then raise exception 'Selesaikan koreksi penerimaan sebelum menggunakan batch';end if;
 return new;
end $$;
drop trigger if exists md_guard_unit_receipt on public.md_pos_unit_lots;
create trigger md_guard_unit_receipt before insert or update of qty on public.md_pos_unit_lots for each row execute function md_supply.guard_unit_receipt();

create or replace function public.pos_adjust_product_stock(payload jsonb) returns void language plpgsql set search_path='' as $$
begin
 if payload->'stock' is not null and payload->'stock'<>'null'::jsonb then raise exception 'Stok pembelian wajib melalui penerimaan nota supplier';end if;
end $$;

create or replace function md_supply.guard_product_cost() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if (new.stock_unit is distinct from old.stock_unit or (new.item_type = 'recipe' and old.item_type <> 'recipe')) and exists(select from md_supply.receipt_line_ids where product_id=old.id)
  then raise exception 'Produk pada nota harus mempertahankan jenis dan satuan stok';end if;
  new.buy_price:=old.buy_price;
  new.buy_price_piece:=old.buy_price_piece;
 else
  new.buy_price:=null;
  new.buy_price_piece:=null;
 end if;
 return new;
end $$;
drop trigger if exists md_guard_product_cost on public.md_pos_products;
create trigger md_guard_product_cost before insert or update of buy_price,buy_price_piece,item_type,stock_unit on public.md_pos_products for each row execute function md_supply.guard_product_cost();

select pg_temp.edit122('public.pos_read()',
 $a$ if not bo then$a$,
 $a$ s:=s||jsonb_build_object('supplierStockVersion',122);
 s:=jsonb_set(s,'{unitLots}',coalesce((select jsonb_agg(case when p.id is null then x else x||jsonb_build_object('planId',p.id,'shipmentId',p.received_id,'invoiceNo',p.invoice_no)||
   case when bo then jsonb_build_object('shippingCost',u.shipping_cost) else '{}'::jsonb end end order by n)
   from jsonb_array_elements(s->'unitLots') with ordinality t(x,n) join public.md_pos_unit_lots u on u.id=(x->>'id')::uuid left join md_supply.receipt_plans p on p.id=u.receipt_plan_id),'[]'));
 if not bo then$a$);
revoke all on all functions in schema md_supply from public,anon,authenticated;
commit;

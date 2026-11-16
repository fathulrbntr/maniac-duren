-- 114: supplier quantities, durable barcode receiving and priced outbound orders.
-- Apply AFTER 112. No reset. Historical documents and receipt requests are retained.
begin;
set local lock_timeout='5s';
select pg_catalog.pg_advisory_xact_lock(71031,1102);
do $$begin
 if to_regprocedure('md_supply.note_reprice(md_supply.receipt_plans)') is null then raise exception 'Pasang nota supplier 112 terlebih dahulu';end if;
end$$;
alter table md_supply.receipt_plans add column if not exists expected jsonb not null default '{}';
create table if not exists md_supply.receipt_sessions(
 plan_id uuid primary key references md_supply.receipt_plans,
 status text not null default 'open' check(status in ('open','paused','completed','reopened')),
 revision integer not null default 0,
 shipment_id uuid not null default gen_random_uuid(),
 reopen_reason text,completed_at timestamptz,updated_at timestamptz not null default now()
);
create table if not exists md_supply.receipt_line_ids(
 plan_id uuid not null references md_supply.receipt_plans,product_id uuid not null references public.md_pos_products,
 lot_id uuid not null unique default gen_random_uuid(),primary key(plan_id,product_id)
);
create table if not exists md_supply.receipt_scans(
 plan_id uuid not null references md_supply.receipt_plans,barcode text primary key,
 identity_key text generated always as (left(barcode,16)) stored unique,
 product_id uuid not null references public.md_pos_products,grams integer not null check(grams between 1 and 30000),
 actor uuid not null references auth.users,at timestamptz not null default now()
);
create index if not exists receipt_scans_plan on md_supply.receipt_scans(plan_id,product_id);
create table if not exists md_supply.outbound_orders(
 id uuid primary key,kind text not null check(kind in ('transfer','wholesale')),
 source_id uuid not null references public.md_pos_stores,target_id uuid references public.md_pos_stores,
 buyer jsonb not null default '{}',status text not null default 'packing' check(status in ('packing','ready','approved','dispatched','cancelled')),
 rates jsonb not null,lines jsonb not null default '[]',revision integer not null default 0,
 invoice_no text unique,delivery_no text unique,origin jsonb,destination jsonb,
 payment_mode text not null check(payment_mode in ('paid','pending')),total numeric(18,2),paid numeric(18,2) not null default 0,
 carrier text not null,note text not null default '',created_by uuid not null references auth.users,created_at timestamptz not null default now(),
 issued_at timestamptz,dispatched_at timestamptz,cancel_reason text,
 check((kind='transfer' and target_id is not null and target_id<>source_id) or (kind='wholesale' and target_id is null)),
 check(paid>=0 and (total is null or paid<=total))
);
create index if not exists outbound_source_status on md_supply.outbound_orders(source_id,status,created_at);
create table if not exists md_supply.outbound_items(
 order_id uuid not null references md_supply.outbound_orders,barcode text not null references public.md_pos_fruit_units,
 source_lot_id uuid not null references public.md_pos_lots,
 actor uuid not null references auth.users,at timestamptz not null default now(),released boolean not null default false,
 primary key(order_id,barcode)
);
create unique index if not exists outbound_reserved_barcode on md_supply.outbound_items(barcode) where not released;
create table if not exists md_supply.outbound_payments(
 id uuid primary key references md_supply.events,order_id uuid not null references md_supply.outbound_orders,
 amount numeric(18,2) not null check(amount>0),date date not null,method text not null check(method in ('cash','transfer','other')),reference text not null
);
create index if not exists outbound_payments_order on md_supply.outbound_payments(order_id);
alter table public.md_pos_sales add column if not exists wholesale_order_id uuid unique references md_supply.outbound_orders;
-- Wholesale invoices have their own payment ledger and never enter a cashier shift.
-- Ordinary POS sales retain all existing payment and shift guards.
drop trigger if exists md_pos_sale_payment_guard on public.md_pos_sales;
create trigger md_pos_sale_payment_guard before insert or update on public.md_pos_sales for each row when (new.wholesale_order_id is null) execute function public.pos_payment_guard();
drop trigger if exists md_pos_sale_shift_guard on public.md_pos_sales;
create trigger md_pos_sale_shift_guard before insert or update on public.md_pos_sales for each row when (new.wholesale_order_id is null) execute function public.pos_shift_guard();
drop trigger if exists md_pos_sale_shift_record on public.md_pos_sales;
create trigger md_pos_sale_shift_record after insert or update on public.md_pos_sales for each row when (new.wholesale_order_id is null) execute function public.pos_shift_record();
alter table public.md_pos_fruit_units drop constraint if exists md_pos_fruit_units_status_check;
alter table public.md_pos_fruit_units add constraint md_pos_fruit_units_status_check check(status in ('available','in_transit','sold','reject','processed','waste','void'));
-- Seed receiving state once; replaying this migration must not overwrite sessions.
insert into md_supply.receipt_sessions(plan_id,status,shipment_id)
 select id,case when received_id is null then 'open' else 'completed' end,coalesce(received_id,gen_random_uuid()) from md_supply.receipt_plans on conflict do nothing;
insert into md_supply.receipt_line_ids(plan_id,product_id,lot_id)
 select p.id,(x->>'productId')::uuid,coalesce(l.id,gen_random_uuid()) from md_supply.receipt_plans p cross join lateral jsonb_array_elements(p.lines) x
 left join public.md_pos_lots l on l.shipment_id=p.received_id and l.source_lot_id is null and l.product_id=(x->>'productId')::uuid on conflict do nothing;
-- Only completed sessions have committed scans. Avoid resurrecting removed draft scans on reinstall.
insert into md_supply.receipt_scans(plan_id,barcode,product_id,grams,actor,at)
 select p.id,u.barcode,u.product_id,u.grams,p.created_by,p.created_at from md_supply.receipt_plans p join md_supply.receipt_sessions r on r.plan_id=p.id and r.status='completed'
 join public.md_pos_lots l on l.shipment_id=p.received_id and l.source_lot_id is null join public.md_pos_fruit_units u on u.receipt_lot_id=l.id and u.status<>'void' on conflict do nothing;
do $$declare n text;begin
 foreach n in array array['receipt_sessions','receipt_line_ids','receipt_scans','outbound_orders','outbound_items','outbound_payments'] loop
  execute format('alter table md_supply.%I enable row level security',n);execute format('revoke all on md_supply.%I from public,anon,authenticated',n);
 end loop;
 if to_regprocedure('public.pos_read_before_114()') is null then alter function public.pos_read() rename to pos_read_before_114;end if;
 if to_regprocedure('public.pos_warehouse_mutate_before_114(text,jsonb)') is null then alter function public.pos_warehouse_mutate(text,jsonb) rename to pos_warehouse_mutate_before_114;end if;
 if to_regprocedure('public.pos_tracking_mutate_before_114(text,text,jsonb)') is null then alter function public.pos_tracking_mutate(text,text,jsonb) rename to pos_tracking_mutate_before_114;end if;
end$$;
revoke all on function public.pos_read_before_114(),public.pos_warehouse_mutate_before_114(text,jsonb),public.pos_tracking_mutate_before_114(text,text,jsonb) from public,anon,authenticated;

create or replace function md_supply.expected_values(lines jsonb) returns jsonb language plpgsql set search_path='' as $$
declare x jsonb;kg numeric;pc numeric;result jsonb:='{}';begin
 for x in select value from jsonb_array_elements(lines) loop
  kg:=public.pos_positive(x->>'expectedKg');pc:=public.pos_positive(x->>'expectedPieces');
  if kg>9000000 or kg<>trunc(kg,3) or pc<>trunc(pc) or pc>9000000 then raise exception 'Berat nota maksimal 3 desimal; butir wajib bilangan bulat positif';end if;
  result:=result||jsonb_build_object(x->>'productId',jsonb_build_object('kg',kg,'pieces',pc));
 end loop;return result;
end$$;
create or replace function md_supply.receipt_json(pid uuid,include_scans boolean default true) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('status',r.status,'revision',r.revision,'completedAt',r.completed_at,'reopenReason',r.reopen_reason,
 'scans',case when include_scans then coalesce((select jsonb_agg(jsonb_build_object('barcode',s.barcode,'productId',s.product_id,'grams',s.grams,'at',s.at) order by s.at,s.barcode) from md_supply.receipt_scans s where s.plan_id=pid),'[]') else '[]'::jsonb end) from md_supply.receipt_sessions r where r.plan_id=pid
$$;
create or replace function md_supply.receipt_result(pid uuid,eid uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('supplyDelta',true,'planId',pid,'receiving',(md_supply.receipt_json(pid,false)-'scans')||jsonb_build_object('scanChanges',coalesce((select jsonb_agg(jsonb_build_object('barcode',s.barcode,'productId',s.product_id,'grams',s.grams,'at',s.at)) from md_supply.receipt_scans s where s.plan_id=pid and s.barcode=e.request->>'barcode'),'[]'),'removedBarcode',case when e.action='receipt_scan_remove' then e.request->>'barcode' end),
 'event',jsonb_build_object('id',e.id,'action',e.action,'at',e.at)) from md_supply.events e where e.id=eid
$$;
create or replace function md_supply.outbound_json(o md_supply.outbound_orders,include_items boolean default true) returns jsonb language plpgsql stable set search_path='' as $$
declare bo boolean:=public.pos_allowed('backoffice');v jsonb;begin
 v:=jsonb_build_object('id',o.id,'kind',o.kind,'sourceId',o.source_id,'targetId',o.target_id,'buyer',o.buyer,'status',o.status,'revision',o.revision,'invoiceNo',o.invoice_no,'deliveryNo',o.delivery_no,'origin',o.origin,'destination',o.destination,'carrier',o.carrier,'note',o.note,'createdAt',o.created_at,'issuedAt',o.issued_at,'dispatchedAt',o.dispatched_at,'cancelReason',o.cancel_reason,
 'rates',case when bo then o.rates else (select jsonb_agg(x-'price') from jsonb_array_elements(o.rates) x) end,
 'lines',case when bo then o.lines else (select coalesce(jsonb_agg(x-'price'-'total'-'unitCost'-'supplierUnitCost'),'[]') from jsonb_array_elements(o.lines) x) end,
 'items',case when include_items then coalesce((select jsonb_agg(jsonb_build_object('barcode',i.barcode,'grams',u.grams,'productId',u.product_id,'sourceLotId',i.source_lot_id,'at',i.at) order by i.at,i.barcode) from md_supply.outbound_items i join public.md_pos_fruit_units u on u.barcode=i.barcode where i.order_id=o.id),'[]') else '[]'::jsonb end);
 if bo then v:=v||jsonb_build_object('total',o.total,'paid',o.paid,'paymentMode',o.payment_mode,'payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount,'date',p.date,'method',p.method,'reference',p.reference,'actor',(select name from public.md_pos_employees where user_id=e.actor)) order by e.at) from md_supply.outbound_payments p join md_supply.events e on e.id=p.id where p.order_id=o.id),'[]'));end if;return v;
end$$;
create or replace function md_supply.outbound_result(oid uuid,eid uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('supplyDelta',true,'outbound',case when e.action in ('outbound_scan','outbound_scan_remove') then md_supply.outbound_json(o,false)||jsonb_build_object('itemsDelta',true,'items',coalesce((select jsonb_agg(jsonb_build_object('barcode',i.barcode,'productId',u.product_id,'grams',u.grams,'sourceLotId',i.source_lot_id,'at',i.at)) from md_supply.outbound_items i join public.md_pos_fruit_units u on u.barcode=i.barcode where i.order_id=o.id and i.barcode=e.request->>'barcode'),'[]'),'removedBarcode',case when e.action='outbound_scan_remove' then e.request->>'barcode' end) else md_supply.outbound_json(o) end,'event',jsonb_build_object('id',e.id,'action',e.action,'at',e.at)) from md_supply.outbound_orders o join md_supply.events e on e.id=eid where o.id=oid
$$;

-- Active reservations and reopened receipts must also block legacy POS/reject routes.
create or replace function md_supply.guard_fruit() returns trigger language plpgsql set search_path='' as $$
declare oid uuid;pid uuid;begin
 if tg_op='INSERT' then
  select plan_id into pid from md_supply.receipt_scans where identity_key=left(new.barcode,16);
  if pid is not null and (nullif(current_setting('md_supply.receipt_commit',true),'')::uuid is distinct from pid or not exists(select 1 from md_supply.receipt_line_ids where plan_id=pid and lot_id=new.receipt_lot_id and product_id=new.product_id)) then raise exception 'Barcode sedang terikat sesi penerimaan nota supplier';end if;
  return new;
 end if;
 select i.order_id into oid from md_supply.outbound_items i where i.barcode=old.barcode and not i.released;
 if oid is not null and nullif(current_setting('md_supply.dispatch_order',true),'')::uuid is distinct from oid then raise exception 'Barcode sedang disiapkan untuk pengiriman lain';end if;
 select r.plan_id into pid from md_supply.receipt_line_ids l join md_supply.receipt_sessions r on r.plan_id=l.plan_id where l.lot_id=old.receipt_lot_id and r.status in ('reopened','paused') and exists(select 1 from md_supply.receipt_plans p where p.id=r.plan_id and p.received_id is not null);
 if pid is not null and nullif(current_setting('md_supply.receipt_commit',true),'')::uuid is distinct from pid then raise exception 'Penerimaan sedang dibuka ulang oleh Back Office';end if;
 return new;
end$$;
drop trigger if exists md_supply_guard_fruit on public.md_pos_fruit_units;
create trigger md_supply_guard_fruit before insert or update on public.md_pos_fruit_units for each row execute function md_supply.guard_fruit();
create or replace function public.pos_tracking_mutate(entry text,act text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if act in ('receipt','receipt_batch') and nullif(current_setting('md_supply.receipt_commit',true),'') is null and not exists(select 1 from public.md_pos_fruit_requests where id=(p->>'id')::uuid and completed and actor=auth.uid() and action=act and request_hash=md5(p::text)) then raise exception 'Gunakan sesi penerimaan nota supplier; simpan scan lalu Selesaikan penerimaan';end if;
 if act='void' and exists(select 1 from public.md_pos_sales where id=(p->>'saleId')::uuid and wholesale_order_id is not null) then raise exception 'Invoice wholesale tidak boleh dibatalkan melalui kasir';end if;
 return public.pos_tracking_mutate_before_114(entry,act,p);
end$$;
revoke all on function public.pos_tracking_mutate(text,text,jsonb) from public,anon,authenticated;

-- Internal costing snapshot: independent of the warehouse employee's redacted read.
create or replace function md_supply.cost_snapshot() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
 'lots',coalesce((select jsonb_agg(jsonb_build_object('id',id,'sourceLotId',source_lot_id,'receivedKg',received_kg,'unitCost',unit_cost,'supplierUnitCost',supplier_unit_cost)) from public.md_pos_lots),'[]'),
 'unitLots',coalesce((select jsonb_agg(jsonb_build_object('id',id,'sourceLotId',transfer_source_id,'receivedQty',received_qty,'unitCost',unit_cost,'supplierUnitCost',supplier_unit_cost)) from public.md_pos_unit_lots),'[]'),
 'origins',coalesce((select jsonb_agg(to_jsonb(z)) from (
 select r.id lot_id,r.snapshot->'used' inputs from public.md_pos_productions r join public.md_pos_unit_lots l on l.id=r.id where not r.voided
 union all select (o->>'lotId')::uuid,jsonb_build_array(jsonb_build_object('lotId',w.source_lot_id,'qty',(w.snapshot->>'kg')::numeric*((o->>'weightKg')::numeric/nullif((w.snapshot->>'outputKg')::numeric,0)))) from public.md_pos_waste_runs w cross join lateral jsonb_array_elements(w.snapshot->'outputs') o where not w.voided
 union all select (o->>'lotId')::uuid,jsonb_build_array(jsonb_build_object('lotId',r.source_lot_id,'qty',(r.doc->>'kg')::numeric)) from public.md_pos_reject_records r cross join lateral jsonb_array_elements(r.doc->'outputs') o where r.kind='coral' and not r.voided
 ) z),'[]'))
$$;
do $$declare d text;begin
 select pg_get_functiondef('md_supply.note_reprice(md_supply.receipt_plans)'::regprocedure) into d;
 if position('s:=public.pos_read_before_112();' in d)>0 then execute replace(d,'s:=public.pos_read_before_112();','s:=md_supply.cost_snapshot();');
 elsif position('s:=md_supply.cost_snapshot();' in d)=0 then raise exception 'Versi perhitungan modal tidak dikenal';end if;
end$$;

create or replace function md_supply.finish_receipt(p md_supply.receipt_plans,eid uuid) returns void language plpgsql set search_path='' as $$
#variable_conflict use_variable
declare r md_supply.receipt_sessions%rowtype;ln jsonb;lines jsonb:='[]';root uuid;kg numeric;pc int;delta_kg numeric;delta_pc int;lot public.md_pos_lots%rowtype;u public.md_pos_fruit_units%rowtype;sc md_supply.receipt_scans%rowtype;fresh jsonb;begin
 select * into strict r from md_supply.receipt_sessions where plan_id=p.id;
 for ln in select value from jsonb_array_elements(p.lines) loop
  select lot_id into strict root from md_supply.receipt_line_ids where plan_id=p.id and product_id=(ln->>'productId')::uuid;
  select sum(grams)::numeric/1000,count(*) into kg,pc from md_supply.receipt_scans where plan_id=p.id and product_id=(ln->>'productId')::uuid;
  if coalesce(pc,0)=0 then raise exception 'Setiap produk nota harus memiliki hasil scan sebelum selesai';end if;
  lines:=lines||jsonb_build_array(ln||jsonb_build_object('id',root,'weighings',(select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'barcode',barcode,'kg',grams::numeric/1000,'pieces',1,'createdAt',at) order by at,barcode) from md_supply.receipt_scans where plan_id=p.id and product_id=(ln->>'productId')::uuid)));
 end loop;
 perform set_config('md_supply.receipt_commit',p.id::text,true);
 if p.received_id is null then
  perform public.pos_receive_shipment(jsonb_build_object('id',r.shipment_id,'planId',p.id,'storeId',p.warehouse_id,'supplierId',p.supplier_id,'invoiceNo',p.invoice_no,'date',p.date,'shippingCost',p.shipping,'unloadingComplete',true,'lines',lines));
 else
  insert into public.md_pos_events(id,action,store_id,actor,employee_id,business_date,payload) values(eid,'receipt_correction',p.warehouse_id,auth.uid(),(select id from public.md_pos_employees where user_id=auth.uid()),(now() at time zone 'Asia/Jakarta')::date,jsonb_build_object('planId',p.id,'reason',r.reopen_reason));
  for ln in select value from jsonb_array_elements(lines) loop
   select * into strict lot from public.md_pos_lots where id=(ln->>'id')::uuid for update;
   select sum(grams)::numeric/1000,count(*) into kg,pc from md_supply.receipt_scans where plan_id=p.id and product_id=lot.product_id;
   delta_kg:=kg-lot.received_kg;delta_pc:=pc-lot.received_pieces;
   for u in select f.* from public.md_pos_fruit_units f where f.receipt_lot_id=lot.id and f.status<>'void' and not exists(select 1 from md_supply.receipt_scans s where s.plan_id=p.id and s.barcode=f.barcode) loop
    if u.status<>'available' or u.lot_id<>lot.id or u.store_id<>p.warehouse_id then raise exception 'Barcode sudah bergerak; tidak dapat dihapus dari penerimaan';end if;
    perform public.pos_tracking_change(u.barcode,eid,'receipt_remove',lot.id,'void');
   end loop;
   for sc in select s.* from md_supply.receipt_scans s where s.plan_id=p.id and s.product_id=lot.product_id and not exists(select 1 from public.md_pos_fruit_units f where f.barcode=s.barcode) loop
    insert into public.md_pos_fruit_units(barcode,product_id,receipt_lot_id,lot_id,store_id,grams,status,last_event) values(sc.barcode,sc.product_id,lot.id,lot.id,p.warehouse_id,sc.grams,'available',eid) returning to_jsonb(md_pos_fruit_units.*) into fresh;
    insert into public.md_pos_fruit_events(event_id,barcode,action,actor,after_state) values(eid,sc.barcode,'receipt_add',auth.uid(),fresh);
   end loop;
   if lot.kg+delta_kg<0 or lot.pieces+delta_pc<0 then raise exception 'Koreksi membuat stok negatif';end if;
   update public.md_pos_lots set received_kg=kg,received_pieces=pc,kg=lot.kg+delta_kg,pieces=lot.pieces+delta_pc where id=lot.id;
   if delta_kg<>0 or delta_pc<>0 then insert into public.md_pos_stock_journal(event_id,lot_id,product_id,store_id,supplier_id,qty,pieces,unit,cost,quality) values(eid,lot.id,lot.product_id,p.warehouse_id,p.supplier_id,delta_kg,delta_pc,'kg',delta_kg*lot.unit_cost,lot.quality);end if;
  end loop;
  perform md_supply.note_reprice(p);
 end if;
 update md_supply.receipt_sessions set status='completed',completed_at=now(),updated_at=now() where plan_id=p.id;
 perform set_config('md_supply.receipt_commit','',true);
end$$;

create or replace function md_supply.outbound_lines(o md_supply.outbound_orders) returns jsonb language plpgsql set search_path='' as $$
declare l public.md_pos_lots%rowtype;r jsonb;kg numeric;pc int;result jsonb:='[]';begin
 if not exists(select 1 from md_supply.outbound_items where order_id=o.id and not released) then raise exception 'Scan barang sebelum menyelesaikan penyiapan';end if;
 for l in select b.* from public.md_pos_lots b where b.id in(select u.lot_id from md_supply.outbound_items i join public.md_pos_fruit_units u on u.barcode=i.barcode where i.order_id=o.id and not i.released) order by b.id loop
  if l.quality<>'ready' or l.store_id<>o.source_id or exists(select 1 from md_supply.receipt_line_ids k join md_supply.receipt_sessions s on s.plan_id=k.plan_id where k.lot_id=l.id and s.status<>'completed') then raise exception 'Penerimaan batch belum selesai atau buah belum siap';end if;
  if exists(select 1 from md_supply.outbound_items i join public.md_pos_fruit_units u on u.barcode=i.barcode where i.order_id=o.id and (u.status<>'available' or u.store_id<>o.source_id or i.released)) then raise exception 'Status barcode berubah';end if;
  select value into r from jsonb_array_elements(o.rates) where value->>'productId'=l.product_id::text;
  if r is null then raise exception 'Produk belum memiliki harga pada dokumen ini';end if;
  select sum(u.grams)::numeric/1000,count(*) into kg,pc from md_supply.outbound_items i join public.md_pos_fruit_units u on u.barcode=i.barcode where i.order_id=o.id and u.lot_id=l.id;
  if l.kg<kg or l.pieces<pc then raise exception 'Stok batch tidak cukup';end if;
  result:=result||jsonb_build_array(jsonb_build_object('kind','fruit','sourceLotId',l.id,'targetLotId',gen_random_uuid(),'productId',l.product_id,'productName',(select name from public.md_pos_products where id=l.product_id),'supplierId',l.supplier_id,'supplierName',(select name from public.md_pos_suppliers where id=l.supplier_id),'kg',kg,'pieces',pc,'qty',case when r->>'unit'='kg' then kg else pc end,'unit',r->>'unit','price',(r->>'price')::numeric,'total',round((r->>'price')::numeric*case when r->>'unit'='kg' then kg else pc end,2),'unitCost',l.unit_cost,'supplierUnitCost',coalesce(l.supplier_unit_cost,l.unit_cost)));
 end loop;return result;
end$$;
create or replace function md_supply.dispatch_outbound(o md_supply.outbound_orders,eid uuid) returns void language plpgsql set search_path='' as $$
declare ln jsonb;code text;day date:=(now() at time zone 'Asia/Jakarta')::date;cost numeric;begin
 perform md_supply.outbound_lines(o); -- Revalidate reservations, location and balances at dispatch.
 perform set_config('md_supply.dispatch_order',o.id::text,true);
 if o.kind='transfer' then
  insert into md_supply.transfers(id,invoice_no,delivery_no,source_id,target_id,lines,origin,destination,total,paid,note,carrier,created_by) values(o.id,o.invoice_no,o.delivery_no,o.source_id,o.target_id,o.lines,o.origin,o.destination,o.total,o.paid,o.note,o.carrier,auth.uid());
 else
  insert into public.md_pos_sales(id,store_id,sale_date,payment,paid,total,change,created_by,wholesale_order_id) values(o.id,o.source_id,day,'Transfer',o.paid,o.total,0,auth.uid(),o.id);
 end if;
 insert into public.md_pos_events(id,action,store_id,actor,employee_id,business_date,payload) values(eid,case when o.kind='transfer' then 'transfer_dispatch' else 'wholesale_sale' end,o.source_id,auth.uid(),(select id from public.md_pos_employees where user_id=auth.uid()),day,jsonb_build_object('orderId',o.id,'invoiceNo',o.invoice_no));
 for ln in select value from jsonb_array_elements(o.lines) loop
  update public.md_pos_lots set kg=kg-(ln->>'kg')::numeric,pieces=pieces-(ln->>'pieces')::int where id=(ln->>'sourceLotId')::uuid;
  if o.kind='wholesale' then
   insert into public.md_pos_sale_items(sale_id,lot_id,product_id,supplier_id,kg,pieces,unit,price,total) values(o.id,(ln->>'sourceLotId')::uuid,(ln->>'productId')::uuid,(ln->>'supplierId')::uuid,(ln->>'kg')::numeric,(ln->>'pieces')::int,upper(ln->>'unit'),(ln->>'price')::numeric,(ln->>'total')::numeric);
  end if;
  for code in select u.barcode from public.md_pos_fruit_units u join md_supply.outbound_items i on i.barcode=u.barcode where i.order_id=o.id and u.lot_id=(ln->>'sourceLotId')::uuid loop
   if o.kind='transfer' then insert into md_supply.items(transfer_id,barcode,source_lot_id,target_lot_id) values(o.id,code,(ln->>'sourceLotId')::uuid,(ln->>'targetLotId')::uuid);end if;
   perform public.pos_tracking_change(code,eid,case when o.kind='transfer' then 'transfer_dispatch' else 'wholesale_sale' end,(ln->>'sourceLotId')::uuid,case when o.kind='transfer' then 'in_transit' else 'sold' end);
   update public.md_pos_fruit_units set transfer_id=case when o.kind='transfer' then o.id else null end where barcode=code;
   update public.md_pos_fruit_events set after_state=(select to_jsonb(u) from public.md_pos_fruit_units u where u.barcode=code) where event_id=eid and barcode=code;
  end loop;
  select unit_cost*(ln->>'kg')::numeric into cost from public.md_pos_lots where id=(ln->>'sourceLotId')::uuid;
  insert into public.md_pos_stock_journal(event_id,lot_id,product_id,store_id,supplier_id,qty,pieces,unit,cost,quality) values(eid,(ln->>'sourceLotId')::uuid,(ln->>'productId')::uuid,o.source_id,(ln->>'supplierId')::uuid,-(ln->>'kg')::numeric,-(ln->>'pieces')::int,'kg',-cost,'ready');
 end loop;
 if o.kind='wholesale' then
  insert into public.md_pos_money_journal(event_id,store_id,category,revenue,cost,note) select eid,o.source_id,'sale',o.total,-sum(j.cost),o.invoice_no from public.md_pos_stock_journal j where event_id=eid;
 end if;
 update md_supply.outbound_items set released=true where order_id=o.id;
 update md_supply.outbound_orders set status='dispatched',dispatched_at=now() where id=o.id;
 perform set_config('md_supply.dispatch_order','',true);
end$$;

create or replace function public.pos_warehouse_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare eid uuid;pid uuid;oid uuid;p md_supply.receipt_plans%rowtype;r md_supply.receipt_sessions%rowtype;o md_supply.outbound_orders%rowtype;ev md_supply.events%rowtype;u public.md_pos_fruit_units%rowtype;
 ln jsonb;v jsonb;lines jsonb;values_expected jsonb;rates jsonb:='[]';code text;prod uuid;cnt int;amount numeric;reason text;seq bigint;dt date;day date:=(now() at time zone 'Asia/Jakarta')::date;result jsonb;is_bo boolean;
begin
 if auth.uid() is null or not exists(select 1 from public.md_pos_employees where user_id=auth.uid() and active) then raise exception 'Login diperlukan';end if;
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 is_bo:=public.pos_allowed('backoffice');
 if action='transfer_dispatch' then raise exception 'Buat pengiriman melalui Back Office, lalu scan dan kirim dari dokumen tersebut';end if;
 if action='transfer_payment' and exists(select 1 from md_supply.outbound_orders where id=(payload->>'transferId')::uuid) then raise exception 'Catat pembayaran melalui invoice pengiriman di Back Office';end if;
 if action='transfer_cancel' and exists(select 1 from md_supply.outbound_orders where id=(payload->>'transferId')::uuid) then
  result:=public.pos_warehouse_mutate_before_114(action,payload);
  update md_supply.outbound_orders set status='cancelled',cancel_reason=payload->>'reason',revision=revision+1 where id=(payload->>'transferId')::uuid and status<>'cancelled';return public.pos_read();
 end if;
 if action='receipt_plan_save' then
  perform public.pos_require('backoffice');values_expected:=md_supply.expected_values(payload->'lines');
  result:=public.pos_warehouse_mutate_before_114(action,payload);pid:=(payload->>'id')::uuid;
  if not exists(select 1 from md_supply.receipt_sessions where plan_id=pid) then
   update md_supply.receipt_plans set expected=values_expected where id=pid;
   insert into md_supply.receipt_sessions(plan_id) values(pid);
   insert into md_supply.receipt_line_ids(plan_id,product_id) select pid,(x->>'productId')::uuid from jsonb_array_elements(payload->'lines') x;
  end if;return public.pos_read();
 end if;
 if action not in ('receipt_expected_edit','receipt_reopen','receipt_scan','receipt_scan_remove','receipt_pause','receipt_resume','receipt_finish','outbound_save','outbound_scan','outbound_scan_remove','outbound_ready','outbound_repack','outbound_issue','outbound_dispatch','outbound_payment','outbound_cancel') then return public.pos_warehouse_mutate_before_114(action,payload);end if;
 eid:=nullif(payload->>'id','')::uuid;pid:=nullif(payload->>'planId','')::uuid;oid:=coalesce(nullif(payload->>'orderId','')::uuid,eid);
 if eid is null then raise exception 'ID operasi wajib';end if;
 -- Check authorization before even returning a retry response.
 if left(action,8)='receipt_' then
  select * into p from md_supply.receipt_plans where id=pid for update;if not found then raise exception 'Nota supplier tidak ditemukan';end if;
  perform md_supply.require_location(p.warehouse_id,'stock','warehouse');
  if action in ('receipt_expected_edit','receipt_reopen') then perform public.pos_require('backoffice');end if;
  select * into strict r from md_supply.receipt_sessions where plan_id=pid for update;
 else
  select * into o from md_supply.outbound_orders where id=oid for update;
  if o.id is null and action<>'outbound_save' then raise exception 'Dokumen pengiriman tidak ditemukan';end if;
  perform md_supply.require_location(coalesce(o.source_id,(payload->>'storeId')::uuid),'dispatch','warehouse');
  if action in ('outbound_save','outbound_issue','outbound_payment','outbound_cancel','outbound_repack') then perform public.pos_require('backoffice');end if;
 end if;
 select * into ev from md_supply.events where id=eid;
 if found then
  if ev.actor<>auth.uid() or ev.action<>action or ev.request is distinct from payload then raise exception 'ID operasi telah dipakai untuk data berbeda';end if;
  if action in ('receipt_finish','receipt_reopen','receipt_expected_edit','outbound_dispatch') then return public.pos_read();end if;
  return public.pos_read(); -- A retry may follow other committed scans: refresh the complete session.
 end if;
 if pid is not null then
  if (payload->>'expectedSessionRevision')::int is distinct from r.revision then raise exception 'Sesi berubah. Perbarui halaman sebelum melanjutkan';end if;
  if action='receipt_expected_edit' then
   reason:=btrim(coalesce(payload->>'reason',''));if length(reason) not between 5 and 500 then raise exception 'Isi alasan koreksi 5–500 karakter';end if;
   if (payload->>'expectedRevision')::int is distinct from p.revision then raise exception 'Nota berubah. Perbarui halaman';end if;
   if jsonb_typeof(payload->'lines') is distinct from 'array' or jsonb_array_length(payload->'lines')<>jsonb_array_length(p.lines) or (select count(distinct x->>'productId') from jsonb_array_elements(payload->'lines') x)<>jsonb_array_length(p.lines) or exists(select 1 from jsonb_array_elements(payload->'lines') x where not exists(select 1 from jsonb_array_elements(p.lines) y where y->>'productId'=x->>'productId')) then raise exception 'Produk nota tidak boleh diganti';end if;
   values_expected:=md_supply.expected_values(payload->'lines');
   update md_supply.receipt_plans set expected=values_expected,revision=revision+1 where id=pid;
  elsif action='receipt_reopen' then
   if r.status<>'completed' then raise exception 'Hanya penerimaan selesai yang dapat dibuka kembali';end if;
   reason:=btrim(coalesce(payload->>'reason',''));if length(reason) not between 5 and 500 then raise exception 'Isi alasan pembukaan 5–500 karakter';end if;
   if exists(select 1 from md_supply.outbound_items i join public.md_pos_fruit_units f on f.barcode=i.barcode join md_supply.receipt_line_ids l on l.lot_id=f.receipt_lot_id where l.plan_id=pid and not i.released) then raise exception 'Batalkan penyiapan pengiriman batch ini sebelum membuka penerimaan';end if;
   update md_supply.receipt_sessions set status='reopened',reopen_reason=reason where plan_id=pid;
  elsif action='receipt_resume' then
   if r.status<>'paused' then raise exception 'Sesi tidak sedang dijeda';end if;
   update md_supply.receipt_sessions set status=case when p.received_id is null then 'open' else 'reopened' end where plan_id=pid;
  else
   if r.status not in ('open','reopened') then raise exception 'Penerimaan terkunci atau dijeda. Lanjutkan sesi atau minta Back Office membuka kembali';end if;
   if action='receipt_pause' then update md_supply.receipt_sessions set status='paused' where plan_id=pid;
   elsif action='receipt_finish' then
    if payload->'confirmed' is distinct from 'true'::jsonb then raise exception 'Konfirmasi seluruh buah telah dipindai';end if;
    perform md_supply.finish_receipt(p,eid);
   elsif action='receipt_scan_remove' then
    code:=payload->>'barcode';if not exists(select 1 from md_supply.receipt_scans where plan_id=pid and barcode=code) then raise exception 'Barcode tidak ada pada sesi ini';end if;
    select * into u from public.md_pos_fruit_units where barcode=code;
    if found and (u.status<>'available' or u.lot_id<>u.receipt_lot_id or u.store_id<>p.warehouse_id) then raise exception 'Barcode sudah bergerak; tidak dapat dihapus dari penerimaan';end if;
    delete from md_supply.receipt_scans where plan_id=pid and barcode=code;
   elsif action='receipt_scan' then
    code:=btrim(payload->>'barcode');v:=public.pos_tracking_parse(code);if v is null then raise exception 'Gunakan barcode tracking 26 digit';end if;
    select count(*),(array_agg(id))[1] into cnt,prod from public.md_pos_products where btrim(barcode)=v->>'itemCode' and stock_unit='kg_butir';
    if cnt<>1 or not exists(select 1 from jsonb_array_elements(p.lines) x where x->>'productId'=prod::text) then raise exception 'Produk barcode tidak cocok dengan nota atau kode barang ambigu';end if;
    if exists(select 1 from md_supply.receipt_scans where identity_key=left(code,16) and (plan_id<>pid or barcode<>code)) then raise exception 'Barcode atau nomor label sudah digunakan pada penerimaan lain';end if;
    select * into u from public.md_pos_fruit_units where identity_key=left(code,16);
    if found and (u.barcode<>code or u.status='void' or not exists(select 1 from md_supply.receipt_line_ids where plan_id=pid and lot_id=u.receipt_lot_id)) then raise exception 'Barcode sudah terdaftar pada batch lain atau dibatalkan';end if;
    insert into md_supply.receipt_scans(plan_id,barcode,product_id,grams,actor) values(pid,code,prod,(v->>'grams')::int,auth.uid()) on conflict(barcode) do nothing;
   end if;
  end if;
  update md_supply.receipt_sessions set revision=revision+1,updated_at=now() where plan_id=pid;
 else
  if o.id is not null and (payload->>'expectedRevision')::int is distinct from o.revision then raise exception 'Dokumen berubah. Perbarui halaman';end if;
  if action='outbound_save' then
   if o.id is not null and o.status not in ('packing','ready') then raise exception 'Harga dokumen yang sudah diterbitkan terkunci';end if;
   if payload->>'kind' is null or payload->>'kind' not in ('transfer','wholesale') or payload->>'paymentMode' is null or payload->>'paymentMode' not in ('paid','pending') then raise exception 'Pilih jenis transaksi dan pembayaran';end if;
   if payload->>'kind'='transfer' and not exists(select 1 from public.md_pos_stores where id=(payload->>'targetId')::uuid and location_type='store') then raise exception 'Pilih toko Maniac Duren tujuan';end if;
   if payload->>'kind'='wholesale' and length(btrim(coalesce(payload->'buyer'->>'name',''))) not between 1 and 150 then raise exception 'Nama pembeli wajib';end if;
   if length(btrim(coalesce(payload->>'carrier',''))) not between 1 and 150 then raise exception 'Isi pengantar / kendaraan';end if;
   if o.id is not null and o.source_id is distinct from (payload->>'storeId')::uuid then raise exception 'Gudang asal tidak boleh diganti';end if;
   if jsonb_typeof(payload->'rates') is distinct from 'array' or jsonb_array_length(payload->'rates') not between 1 and 50 or (select count(distinct x->>'productId') from jsonb_array_elements(payload->'rates') x)<>jsonb_array_length(payload->'rates') then raise exception 'Isi 1–50 produk tanpa duplikasi';end if;
   for ln in select value from jsonb_array_elements(payload->'rates') loop
    if not exists(select 1 from public.md_pos_products where id=(ln->>'productId')::uuid and stock_unit='kg_butir') or coalesce(ln->>'unit','') not in ('kg','butir') then raise exception 'Produk atau satuan harga tidak sesuai';end if;
    amount:=md_supply.note_amount(ln->>'price');rates:=rates||jsonb_build_array(jsonb_build_object('productId',ln->>'productId','unit',ln->>'unit','price',amount));
   end loop;
   if exists(select 1 from md_supply.outbound_items i join public.md_pos_fruit_units f on f.barcode=i.barcode where i.order_id=oid and not exists(select 1 from jsonb_array_elements(rates) x where x->>'productId'=f.product_id::text)) then raise exception 'Produk yang sudah dipindai tidak boleh dihapus';end if;
   insert into md_supply.outbound_orders(id,kind,source_id,target_id,buyer,rates,payment_mode,carrier,note,created_by) values(oid,payload->>'kind',(payload->>'storeId')::uuid,case when payload->>'kind'='transfer' then (payload->>'targetId')::uuid end,jsonb_build_object('name',left(payload->'buyer'->>'name',150),'phone',left(payload->'buyer'->>'phone',50),'address',left(payload->'buyer'->>'address',500)),rates,payload->>'paymentMode',btrim(payload->>'carrier'),left(coalesce(payload->>'note',''),500),auth.uid())
   on conflict(id) do update set kind=excluded.kind,target_id=excluded.target_id,buyer=excluded.buyer,rates=excluded.rates,payment_mode=excluded.payment_mode,carrier=excluded.carrier,note=excluded.note;
   if o.status='ready' then
    select * into o from md_supply.outbound_orders where id=oid;
    lines:=md_supply.outbound_lines(o);
    update md_supply.outbound_orders set lines=lines,total=(select sum((x->>'total')::numeric) from jsonb_array_elements(lines) x) where id=oid;
   end if;
  elsif action in ('outbound_scan','outbound_scan_remove') then
   if o.status<>'packing' then raise exception 'Daftar barcode pengiriman terkunci';end if;
   code:=btrim(payload->>'barcode');select * into u from public.md_pos_fruit_units where barcode=code for update;
   if not found or u.store_id<>o.source_id or u.status<>'available' then raise exception 'Barcode tidak tersedia di gudang asal';end if;
   if action='outbound_scan_remove' then delete from md_supply.outbound_items where order_id=oid and barcode=code;
   else
    if not exists(select 1 from jsonb_array_elements(o.rates) x where x->>'productId'=u.product_id::text) then raise exception 'Produk barcode tidak tercantum pada dokumen';end if;
    if exists(select 1 from md_supply.outbound_items where barcode=code and not released and order_id<>oid) then raise exception 'Barcode sudah disiapkan untuk pengiriman lain';end if;
    if exists(select 1 from md_supply.receipt_line_ids l join md_supply.receipt_sessions s on s.plan_id=l.plan_id where l.lot_id=u.receipt_lot_id and s.status<>'completed') then raise exception 'Selesaikan penerimaan batch dahulu';end if;
    if not exists(select 1 from public.md_pos_lots where id=u.lot_id and quality='ready') then raise exception 'Buah belum siap kirim';end if;
    insert into md_supply.outbound_items(order_id,barcode,source_lot_id,actor) values(oid,code,u.lot_id,auth.uid()) on conflict(order_id,barcode) do nothing;
   end if;
  elsif action='outbound_ready' then
   if o.status<>'packing' then raise exception 'Dokumen tidak sedang disiapkan';end if;
   lines:=md_supply.outbound_lines(o);update md_supply.outbound_orders set lines=lines,total=(select sum((x->>'total')::numeric) from jsonb_array_elements(lines) x),status='ready' where id=oid;
  elsif action='outbound_repack' then
   if o.status<>'ready' then raise exception 'Hanya dokumen belum terbit yang dapat disiapkan ulang';end if;
   update md_supply.outbound_orders set status='packing',lines='[]',total=null where id=oid;
  elsif action='outbound_issue' then
   if o.status<>'ready' then raise exception 'Gudang harus menyelesaikan scan sebelum dokumen diterbitkan';end if;
   lines:=md_supply.outbound_lines(o);amount:=md_supply.note_amount((select sum((x->>'total')::numeric)::text from jsonb_array_elements(lines) x));seq:=nextval('md_supply.document_number');
   update md_supply.outbound_orders set lines=lines,total=amount,invoice_no='INV-ARN-'||to_char(day,'YYYYMM')||'-'||lpad(seq::text,6,'0'),delivery_no='SJ-ARN-'||to_char(day,'YYYYMM')||'-'||lpad(seq::text,6,'0'),
   origin=(select jsonb_build_object('name',name,'address',coalesce(to_jsonb(s)->>'address',to_jsonb(s)->>'location'),'phone',to_jsonb(s)->>'phone') from public.md_pos_stores s where id=o.source_id),
   destination=case when o.kind='wholesale' then o.buyer else (select jsonb_build_object('name',name,'address',coalesce(to_jsonb(s)->>'address',to_jsonb(s)->>'location'),'phone',to_jsonb(s)->>'phone') from public.md_pos_stores s where id=o.target_id) end,status='approved',issued_at=now() where id=oid;
   if o.payment_mode='pending' then amount:=null;end if;
  elsif action='outbound_dispatch' then
   if o.status<>'approved' then raise exception 'Back Office harus menerbitkan dokumen sebelum barang dikirim';end if;
   if payload->'confirmed' is distinct from 'true'::jsonb then raise exception 'Konfirmasi barang sudah diperiksa dan siap dikirim';end if;
   perform md_supply.dispatch_outbound(o,eid);
  elsif action='outbound_payment' then
   if o.status not in ('approved','dispatched') then raise exception 'Invoice belum terbit atau dibatalkan';end if;
   amount:=md_supply.note_amount(payload->>'amount');if amount>o.total-o.paid then raise exception 'Pembayaran melebihi sisa tagihan';end if;
  elsif action='outbound_cancel' then
   if o.status not in ('packing','ready','approved') or o.paid>0 then raise exception 'Hanya dokumen belum dikirim dan belum dibayar dapat dibatalkan';end if;
   reason:=btrim(coalesce(payload->>'reason',''));if length(reason) not between 5 and 500 then raise exception 'Isi alasan pembatalan 5–500 karakter';end if;
   update md_supply.outbound_orders set status='cancelled',cancel_reason=reason where id=oid;update md_supply.outbound_items set released=true where order_id=oid;
  end if;
  update md_supply.outbound_orders set revision=revision+1 where id=oid;
 end if;
 insert into md_supply.events(id,action,actor,request) values(eid,action,auth.uid(),payload);
 if action='receipt_expected_edit' then insert into md_supply.note_changes(id,plan_id,before_value,after_value,reason) values(eid,pid,jsonb_build_object('expected',p.expected),jsonb_build_object('expected',values_expected),reason);end if;
 if action in ('outbound_issue','outbound_payment') and amount is not null then
  dt:=nullif(payload->>'date','')::date;
  if dt is null or dt>day or coalesce(payload->>'method','') not in ('cash','transfer','other') or length(btrim(coalesce(payload->>'reference',''))) not between 3 and 200 or payload->'paymentConfirmed' is distinct from 'true'::jsonb then raise exception 'Konfirmasi uang diterima, tanggal, metode dan referensi pembayaran wajib';end if;
  insert into md_supply.outbound_payments(id,order_id,amount,date,method,reference) values(eid,oid,amount,dt,payload->>'method',btrim(payload->>'reference'));
  update md_supply.outbound_orders set paid=paid+amount where id=oid;
  update md_supply.transfers set paid=paid+amount where id=oid;
  update public.md_pos_sales set paid=paid+amount where wholesale_order_id=oid;
 end if;
 if action in ('receipt_finish','receipt_reopen','receipt_expected_edit','outbound_dispatch') then return public.pos_read();end if;
 return case when pid is not null then md_supply.receipt_result(pid,eid) else md_supply.outbound_result(oid,eid) end;
end$$;

-- Warehouse responses contain operational data only, including nested audit payloads.
create or replace function md_supply.hide_money(v jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare k text;x jsonb;result jsonb;begin
 if jsonb_typeof(v)='object' then
  result:='{}';for k,x in select * from jsonb_each(v) loop
   if k ~* '(cost|price|paid|payment|revenue|margin|profit|subtotal|discount|shipping|freight)' or k in ('total','change','money','consumption') then continue;end if;
   result:=result||jsonb_build_object(k,md_supply.hide_money(x));end loop;return result;
 elsif jsonb_typeof(v)='array' then select coalesce(jsonb_agg(md_supply.hide_money(value)),'[]') into result from jsonb_array_elements(v);return result;
 end if;return v;
end$$;
create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;bo boolean:=public.pos_allowed('backoffice');begin
 s:=public.pos_read_before_114();
 s:=jsonb_set(s,'{receiptPlans}',coalesce((select jsonb_agg(x||jsonb_build_object('expected',p.expected,'receiving',md_supply.receipt_json(p.id))) from jsonb_array_elements(s->'receiptPlans') x join md_supply.receipt_plans p on p.id=(x->>'id')::uuid),'[]'));
 s:=s||jsonb_build_object('warehouseWorkflowVersion',114,'outboundOrders',coalesce((select jsonb_agg(md_supply.outbound_json(o) order by o.created_at desc) from md_supply.outbound_orders o where bo or public.pos_allowed('dispatch',o.source_id)),'[]'));
 s:=jsonb_set(s,'{sales}',coalesce((select jsonb_agg(case when o.id is null then x else x||jsonb_build_object('sourceType','wholesale','invoiceNo',o.invoice_no,'buyer',o.buyer,'paymentStatus',case when o.paid>=o.total then 'paid' when o.paid>0 then 'partial' else 'pending' end,'payment',case when o.paid>=o.total then 'Wholesale lunas' when o.paid>0 then 'Wholesale sebagian' else 'Wholesale belum dibayar' end) end) from jsonb_array_elements(s->'sales') x left join md_supply.outbound_orders o on o.id=(x->>'id')::uuid and o.kind='wholesale'),'[]'));
 if not bo then
  s:=jsonb_set(s,'{transferPrices}','[]');
  s:=jsonb_set(s,'{receiptPlans}',coalesce((select jsonb_agg((x-'shippingCost'-'invoiceTracked'-'shippingTracked'-'payments'-'corrections')||jsonb_build_object('lines',(select jsonb_agg(y-'purchaseCost') from jsonb_array_elements(x->'lines') y))) from jsonb_array_elements(s->'receiptPlans') x),'[]'));
  s:=jsonb_set(s,'{transfers}',coalesce((select jsonb_agg(md_supply.hide_money(x)) from jsonb_array_elements(s->'transfers') x),'[]'));
  if exists(select 1 from public.md_pos_employees where user_id=auth.uid() and role='warehouse' and active) then s:=md_supply.hide_money(s);end if;
 end if;return s;
end$$;
revoke all on all functions in schema md_supply from public,anon,authenticated;
revoke all on function public.pos_warehouse_mutate(text,jsonb),public.pos_read() from public,anon,authenticated;
grant execute on function public.pos_warehouse_mutate(text,jsonb),public.pos_read() to authenticated;
notify pgrst,'reload schema';
commit;

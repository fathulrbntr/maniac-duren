-- 107: PT. Altara Rasa Nusantara warehouse, two-sided receiving, central pricing.
-- Apply AFTER 106. No reset, no reassignment of historical stock.
begin;
set local lock_timeout='5s';
select pg_catalog.pg_advisory_xact_lock(71031,1102);
do $$begin
 if to_regprocedure('public.pos_tracking_mutate_before_105(text,text,jsonb)') is null or not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('pos_read','pos_read_before_107') and p.prosrc like '%fruitStockVersion%,106%') then raise exception 'Pasang rantai fitur sampai 106 terlebih dahulu';end if;
end$$;
create schema if not exists md_supply;
revoke all on schema md_supply from public,anon,authenticated;
alter table public.md_pos_stores add column if not exists location_type text not null default 'store' check(location_type in ('store','warehouse'));
create unique index if not exists md_one_central_warehouse on public.md_pos_stores(location_type) where location_type='warehouse';
insert into public.md_pos_stores(id,name,location_type) select 'a17a0000-0000-4000-8000-000000000107','PT. Altara Rasa Nusantara','warehouse' where not exists(select 1 from public.md_pos_stores where location_type='warehouse');
alter table public.md_pos_employees drop constraint if exists md_pos_employees_role_check;
alter table public.md_pos_employees add constraint md_pos_employees_role_check check(role in ('staff','owner','manager','admin','cashier','kitchen','warehouse','waitress','cutter'));
alter table public.md_pos_fruit_units drop constraint if exists md_pos_fruit_units_status_check;
alter table public.md_pos_fruit_units add constraint md_pos_fruit_units_status_check check(status in ('available','in_transit','sold','reject','processed','waste'));
alter table public.md_pos_fruit_units add column if not exists transfer_id uuid;
alter table public.md_pos_lots add column if not exists supplier_unit_cost numeric;
alter table public.md_pos_unit_lots add column if not exists supplier_unit_cost numeric;
update public.md_pos_lots set supplier_unit_cost=unit_cost where supplier_unit_cost is null;
update public.md_pos_unit_lots set supplier_unit_cost=unit_cost where supplier_unit_cost is null;
alter table public.md_pos_unit_lots drop constraint if exists md_pos_unit_lots_kind_check;
-- 'waste' is the legacy kind for products made from rejected fruit, including
-- historical lots that are now empty. Preserve it when adding warehouse transfers.
alter table public.md_pos_unit_lots add constraint md_pos_unit_lots_kind_check check(kind in ('purchase','opening','production','waste','transfer'));
create index if not exists md_fruit_receipt_status on public.md_pos_fruit_units(receipt_lot_id,status,store_id);
create sequence if not exists md_supply.document_number;
create table if not exists md_supply.prices(
 product_id uuid primary key references public.md_pos_products,
 unit text not null check(unit in ('kg','butir','g','ml','pcs','porsi')),
 price numeric(18,2) not null check(price>0),updated_by uuid not null references auth.users,updated_at timestamptz not null default now()
);
create table if not exists md_supply.transfers(
 id uuid primary key,invoice_no text not null unique,delivery_no text not null unique,
 source_id uuid not null references public.md_pos_stores,target_id uuid not null references public.md_pos_stores,
 status text not null default 'in_transit' check(status in ('in_transit','received','cancelled')),
 lines jsonb not null,origin jsonb not null,destination jsonb not null,
 total numeric(18,2) not null check(total>0),paid numeric(18,2) not null default 0 check(paid>=0 and paid<=total),
 note text not null default '',carrier text not null,created_by uuid not null references auth.users,created_at timestamptz not null default now(),
 received_by uuid references auth.users,received_at timestamptz,cancel_reason text,
 check(source_id<>target_id)
);
create index if not exists md_supply_transfers_source on md_supply.transfers(source_id,status,created_at);
create index if not exists md_supply_transfers_target on md_supply.transfers(target_id,status,created_at);
create table if not exists md_supply.items(
 transfer_id uuid not null references md_supply.transfers,barcode text not null references public.md_pos_fruit_units,
 source_lot_id uuid not null references public.md_pos_lots,target_lot_id uuid not null,
 scanned_by uuid references auth.users,scanned_at timestamptz,primary key(transfer_id,barcode)
);
create index if not exists md_supply_items_barcode on md_supply.items(barcode,transfer_id);
create table if not exists md_supply.events(
 id uuid primary key,action text not null,actor uuid not null references auth.users,request jsonb not null,
 transfer_id uuid references md_supply.transfers,at timestamptz not null default now()
);
create index if not exists md_supply_events_transfer on md_supply.events(transfer_id,at);
create table if not exists md_supply.receipt_plans(
 id uuid primary key,warehouse_id uuid not null references public.md_pos_stores,supplier_id uuid not null references public.md_pos_suppliers,
 invoice_no text not null,date date not null,shipping numeric not null check(shipping>=0),lines jsonb not null,
 received_id uuid references public.md_pos_receipt_shipments,created_by uuid not null references auth.users,created_at timestamptz not null default now(),
 unique(supplier_id,invoice_no)
);
create table if not exists md_supply.cut_checks(
 id uuid primary key,barcode text not null references public.md_pos_fruit_units,store_id uuid not null references public.md_pos_stores,
 table_no text not null,note text not null,actor uuid not null references auth.users,at timestamptz not null default now()
);
do $$declare t text;begin foreach t in array array['prices','transfers','items','events','receipt_plans','cut_checks'] loop
 execute format('alter table md_supply.%I enable row level security',t);
 execute format('revoke all on md_supply.%I from public,anon,authenticated',t);
end loop;end$$;
create or replace function public.pos_allowed(permission text,store uuid default null) returns boolean language plpgsql stable security definer set search_path='' as $$
declare emp public.md_pos_employees%rowtype;defaults text[];wh boolean;
begin
 select * into emp from public.md_pos_employees where user_id=auth.uid() and active;
 if not found then return false;end if;
 if emp.role='owner' then return true;end if;
 if permission='employees' then return false;end if;
 if emp.role in ('admin') then return permission=any(array['backoffice','stock','produce','waste','sell','kitchen','reports','finance','trace','master','attendance','cancel','receive','dispatch','serve','cut']);end if;
 -- Central prices and accounting cannot be delegated to a store role.
 if permission in ('master','finance','backoffice') then return false;end if;
 if store is not null and not(store=any(emp.store_ids)) then return false;end if;
 defaults:=case emp.role
 when 'manager' then array['stock','produce','waste','sell','kitchen','reports','trace','attendance','cancel','receive','serve','cut']
 when 'cashier' then array['sell','receive','attendance']
 when 'kitchen' then array['produce','waste','kitchen','trace','attendance']
 when 'warehouse' then array['stock','waste','trace','receive','dispatch','attendance']
 when 'waitress' then array['serve','attendance']
 when 'cutter' then array['cut','waste','trace','attendance']
 else array['attendance'] end;
 return permission=any(defaults||emp.permissions);
end$$;
-- Extend the original read's global scope only for central administrators.
-- The exact legacy predicate is present once in the installed 027 foundation.
do $$declare r record;d text;begin
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pos_read%' and p.prosrc like '%if e.role<>''owner'' then%' loop
  d:=pg_get_functiondef(r.oid);
  d:=replace(d,'if e.role<>''owner'' then','if e.role not in (''owner'',''admin'') then');
  d:=replace(d,'e.role=''owner''','e.role in (''owner'',''admin'')');
  execute d;
 end loop;
 if to_regprocedure('public.pos_admin_mutate_before_107(text,jsonb)') is null then alter function public.pos_admin_mutate(text,jsonb) rename to pos_admin_mutate_before_107;end if;
 if to_regprocedure('public.pos_adjust_product_stock_before_107(jsonb)') is null then alter function public.pos_adjust_product_stock(jsonb) rename to pos_adjust_product_stock_before_107;end if;
 if to_regprocedure('public.pos_read_before_107()') is null then alter function public.pos_read() rename to pos_read_before_107;end if;
 if to_regprocedure('public.pos_tracking_mutate_before_107(text,text,jsonb)') is null then alter function public.pos_tracking_mutate(text,text,jsonb) rename to pos_tracking_mutate_before_107;end if;
end$$;
revoke all on function public.pos_read_before_107(),public.pos_tracking_mutate_before_107(text,text,jsonb) from public,anon,authenticated;
do $$declare d text;begin select pg_get_functiondef(to_regprocedure('public.pos_account_target(uuid)')) into d;execute replace(d,'raw_user_meta_data','raw_app_meta_data');end$$;

create or replace function md_supply.require_location(st uuid,permission text,kind text default null) returns void language plpgsql set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Login diperlukan';end if;
 perform public.pos_require(permission,st);
 if not exists(select 1 from public.md_pos_stores where id=st and (kind is null or location_type=kind)) then raise exception 'Lokasi % tidak sesuai',coalesce(kind,'');end if;
end$$;

create or replace function public.pos_admin_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.md_pos_documents%rowtype;k text;source text;
begin
 perform public.pos_require('backoffice');
 if action='document_save' then k:=payload->>'kind';source:=coalesce(payload->>'sourceType','');
 elsif action='document_issue' then select * into d from public.md_pos_documents where id=(payload->>'documentId')::uuid;k:=d.kind;source:=d.source_type;end if;
 if (k='DO' and source='transfer') or (k='PUR' and source in ('','po')) then raise exception 'Gunakan Nota Supplier / Penerimaan Gudang atau Pengiriman Gudang. Dokumen lama tidak boleh memindahkan stok langsung';end if;
 return public.pos_admin_mutate_before_107(action,payload);
end$$;
revoke all on function public.pos_admin_mutate_before_107(text,jsonb),public.pos_admin_mutate(text,jsonb) from public,anon,authenticated;

create or replace function public.pos_adjust_product_stock(payload jsonb) returns void language plpgsql set search_path='' as $$
begin
 if payload->'stock' is not null and payload->'stock'<>'null'::jsonb and exists(select 1 from public.md_pos_products where id=(payload->>'id')::uuid and stock_unit='kg_butir') then raise exception 'Stok buah hanya melalui penerimaan, pengiriman, penjualan, atau reject barcode';end if;
 perform public.pos_adjust_product_stock_before_107(payload);
end$$;
revoke all on function public.pos_adjust_product_stock(jsonb),public.pos_adjust_product_stock_before_107(jsonb) from public,anon,authenticated;

-- Guard ALL old cashier / stock RPC routes as well as the new warehouse screen.
create or replace function public.pos_tracking_mutate(entry text,act text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare st uuid;ln jsonb;w jsonb;plan md_supply.receipt_plans%rowtype;old_request public.md_pos_fruit_requests%rowtype;result jsonb;root uuid;
begin
 if auth.uid() is null then raise exception 'Login diperlukan';end if;
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 select * into old_request from public.md_pos_fruit_requests where id=nullif(p->>'id','')::uuid;
 -- Preserve exact retries of already committed historical requests, never new legacy transfers.
 if old_request.completed and old_request.actor=auth.uid() and old_request.action=act and old_request.request_hash=md5(p::text) then
  return public.pos_tracking_mutate_before_107(entry,act,p);
 end if;
 st:=nullif(p->>'storeId','')::uuid;
 if act='movement' and p->>'kind'='Transfer' then raise exception 'Gunakan Pengiriman Gudang dan penerimaan berdasarkan surat jalan';end if;
 if act in ('receipt','receipt_batch','unit_receipt') then
  perform md_supply.require_location(st,'stock','warehouse');
  if act='receipt' then
   -- 082 calls receipt internally after inserting the authenticated parent shipment.
   if not exists(select 1 from public.md_pos_receipt_shipments rs join public.md_pos_fruit_requests fr on fr.id=rs.id and fr.actor=auth.uid() and fr.action='receipt_batch' and not fr.completed cross join lateral jsonb_array_elements(rs.payload->'lines') x where x->>'id'=p->>'id' and rs.store_id=st and x->'weighings'=p->'weighings') then raise exception 'Gunakan penerimaan nota supplier dan scan seluruh barcode buah';end if;
  end if;
  if act='receipt_batch' then
   if jsonb_typeof(p->'lines') is distinct from 'array' then raise exception 'Daftar produk wajib';end if;
   for ln in select value from jsonb_array_elements(p->'lines') loop
    if jsonb_typeof(ln->'weighings') is distinct from 'array' or jsonb_array_length(ln->'weighings')=0 then raise exception 'Scan seluruh barcode buah';end if;
    for w in select value from jsonb_array_elements(ln->'weighings') loop
     if public.pos_tracking_parse(w->>'barcode') is null then raise exception 'Setiap buah wajib label tracking 26 digit';end if;
    end loop;
   end loop;
   if nullif(p->>'planId','') is not null then
    select * into plan from md_supply.receipt_plans where id=(p->>'planId')::uuid for update;
    if not found or plan.received_id is not null or plan.warehouse_id<>st or plan.supplier_id is distinct from (p->>'supplierId')::uuid or plan.invoice_no is distinct from p->>'invoiceNo' or plan.date is distinct from (p->>'date')::date or plan.shipping is distinct from (p->>'shippingCost')::numeric then raise exception 'Nota supplier tidak cocok atau sudah diterima';end if;
    if jsonb_array_length(plan.lines)<>jsonb_array_length(p->'lines') then raise exception 'Produk harus sesuai nota admin';end if;
    for ln in select value from jsonb_array_elements(p->'lines') loop
     if not exists(select 1 from jsonb_array_elements(plan.lines) x where x->>'productId'=ln->>'productId' and (x->>'purchaseCost')::numeric=(ln->>'purchaseCost')::numeric) then raise exception 'Modal wajib mengikuti nota admin';end if;
    end loop;
   elsif not public.pos_allowed('backoffice') then raise exception 'Pilih nota supplier yang dibuat admin back office';end if;
  elsif act='unit_receipt' and not public.pos_allowed('backoffice') then raise exception 'Penerimaan bahan dengan modal diatur admin back office';end if;
 end if;
 if act in ('order_create','sale') then
  perform md_supply.require_location(st,'sell','store');
  for ln in select value from jsonb_array_elements(p->'lines') loop
   if exists(select 1 from public.md_pos_products where id=(ln->>'productId')::uuid and stock_unit='kg_butir') or exists(select 1 from public.md_pos_lots where id=(ln->>'lotId')::uuid) then
    if public.pos_tracking_parse(ln->>'barcode') is null then raise exception 'Durian wajib dijual dengan barcode terdaftar';end if;
   end if;
  end loop;
 end if;
 if act in ('reject_mark','reject_process','reject_loss','movement','sort','inventory_loss','recover','waste_process') then
  root:=coalesce(nullif(p->>'sourceLotId',''),nullif(p->>'lotId',''))::uuid;
  if exists(select 1 from public.md_pos_lots where id=root) then
   if act in ('sort','inventory_loss','recover','waste_process','movement') then raise exception 'Gunakan reject barcode atau pengiriman gudang untuk buah';end if;
   perform public.pos_tracking_selection(p->'barcodes',root,st,case when act='reject_mark' then array['available'] when act='reject_process' then array['reject'] else array['available','reject'] end,coalesce((p->>'kg')::numeric,(p->>'qty')::numeric),(p->>'pieces')::numeric);
  end if;
 end if;
 result:=public.pos_tracking_mutate_before_107(entry,act,p);
 if plan.id is not null then update md_supply.receipt_plans set received_id=(p->>'id')::uuid where id=plan.id;return public.pos_read();end if;
 return result;
end$$;

create or replace function public.pos_warehouse_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare eid uuid:=(payload->>'id')::uuid;tid uuid;st uuid;dst uuid;t md_supply.transfers%rowtype;
 ev md_supply.events%rowtype;u public.md_pos_fruit_units%rowtype;lot public.md_pos_lots%rowtype;ul public.md_pos_unit_lots%rowtype;
 rate md_supply.prices%rowtype;prod public.md_pos_products%rowtype;ln jsonb;row jsonb;lines jsonb:='[]';codes text[]:='{}';code text;
 kg numeric;pieces integer;quantity numeric;price_total numeric:=0;line_total numeric;newlot uuid;seq bigint;unit text;root uuid;old jsonb;fresh jsonb;visited uuid[]:='{}';
 tm timestamptz:=clock_timestamp();day date:=(clock_timestamp() at time zone 'Asia/Jakarta')::date;ord public.md_pos_order_runs%rowtype;
begin
 if auth.uid() is null or not exists(select 1 from public.md_pos_employees where user_id=auth.uid() and active) then raise exception 'Login diperlukan';end if;
 if eid is null then raise exception 'ID operasi wajib';end if;
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 select * into ev from md_supply.events where id=eid;
 if found then
  if ev.actor<>auth.uid() or ev.action<>action or ev.request<>payload then raise exception 'ID operasi sudah digunakan dengan isi berbeda';end if;
  if action='transfer_scan' and exists(select 1 from md_supply.transfers where id=ev.transfer_id and status='in_transit') then
   perform md_supply.require_location((select target_id from md_supply.transfers where id=ev.transfer_id),'receive','store');
   return md_supply.scan_result(ev.transfer_id,eid);
  end if;
  return public.pos_read();
 end if;
 if action='transfer_price_save' then
  perform public.pos_require('backoffice');
  select * into prod from public.md_pos_products where id=(payload->>'productId')::uuid;
  if not found or prod.item_type='recipe' then raise exception 'Produk stok tidak ditemukan';end if;
  unit:=payload->>'unit';quantity:=public.pos_positive(payload->>'price');
  if quantity>999999999999 or round(quantity,2)<>quantity then raise exception 'Harga maksimal 2 desimal';end if;
  if (prod.stock_unit='kg_butir' and unit not in ('kg','butir')) or (prod.stock_unit<>'kg_butir' and unit is distinct from prod.stock_unit) then raise exception 'Satuan harga tidak cocok';end if;
  insert into md_supply.prices values(prod.id,unit,quantity,auth.uid(),tm) on conflict(product_id) do update set unit=excluded.unit,price=excluded.price,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 elsif action='receipt_plan_save' then
  perform public.pos_require('backoffice');st:=(payload->>'storeId')::uuid;
  perform md_supply.require_location(st,'stock','warehouse');
  if nullif(btrim(payload->>'invoiceNo'),'') is null or length(payload->>'invoiceNo')>100 then raise exception 'Nomor nota wajib, maksimal 100 karakter';end if;
  if jsonb_typeof(payload->'lines') is distinct from 'array' or jsonb_array_length(payload->'lines') not between 1 and 50 then raise exception 'Isi 1–50 produk';end if;
  if (select count(distinct x->>'productId') from jsonb_array_elements(payload->'lines') x)<>jsonb_array_length(payload->'lines') then raise exception 'Produk nota terduplikasi';end if;
  for ln in select value from jsonb_array_elements(payload->'lines') loop
   if not exists(select 1 from public.md_pos_products where id=(ln->>'productId')::uuid and stock_unit='kg_butir') then raise exception 'Nota ini untuk durian berbarcode';end if;
   quantity:=public.pos_positive(ln->>'purchaseCost');
   lines:=lines||jsonb_build_array(jsonb_build_object('productId',ln->>'productId','purchaseCost',quantity));
  end loop;
  quantity:=coalesce(nullif(payload->>'shippingCost','')::numeric,-1);
  if quantity<0 or quantity>999999999999 or quantity::text in ('NaN','Infinity','-Infinity') then raise exception 'Ongkir tidak valid';end if;
  if (payload->>'date')::date>day or nullif(payload->>'date','') is null then raise exception 'Tanggal nota tidak valid';end if;
  insert into md_supply.receipt_plans(id,warehouse_id,supplier_id,invoice_no,date,shipping,lines,created_by) values(eid,st,(payload->>'supplierId')::uuid,btrim(payload->>'invoiceNo'),(payload->>'date')::date,quantity,lines,auth.uid());
 elsif action='transfer_dispatch' then
  st:=(payload->>'storeId')::uuid;dst:=(payload->>'toStoreId')::uuid;
  perform md_supply.require_location(st,'dispatch','warehouse');
  if st=dst or not exists(select 1 from public.md_pos_stores where id=dst and location_type='store') then raise exception 'Pilih toko tujuan yang berbeda';end if;
  if length(btrim(coalesce(payload->>'carrier',''))) not between 1 and 150 then raise exception 'Isi pengantar / kendaraan';end if;
  if jsonb_typeof(payload->'barcodes') is distinct from 'array' or jsonb_typeof(coalesce(payload->'units','[]')) is distinct from 'array' then raise exception 'Daftar barang tidak valid';end if;
  if jsonb_array_length(payload->'barcodes')+jsonb_array_length(coalesce(payload->'units','[]')) not between 1 and 5000 then raise exception 'Isi 1–5000 barang';end if;
  for code in select jsonb_array_elements_text(payload->'barcodes') order by 1 loop
   if code=any(codes) then raise exception 'Barcode terduplikasi';end if;codes:=array_append(codes,code);
   select * into u from public.md_pos_fruit_units where barcode=code for update;
   if not found or u.status<>'available' or u.store_id<>st then raise exception 'Barcode tidak tersedia di gudang asal: %',code;end if;
  end loop;
  for root in select distinct lot_id from public.md_pos_fruit_units where barcode=any(codes) order by lot_id loop
   select * into lot from public.md_pos_lots where id=root for update;
   if lot.quality<>'ready' then raise exception 'Buah reject/belum siap tidak dapat dikirim';end if;
   select sum(grams)::numeric/1000,count(*) into kg,pieces from public.md_pos_fruit_units where barcode=any(codes) and lot_id=root;
   if lot.kg<kg or lot.pieces<pieces then raise exception 'Stok batch tidak cukup';end if;
   select * into rate from md_supply.prices where product_id=lot.product_id;
   if not found then raise exception 'Admin belum mengatur harga transfer untuk produk %',(select name from public.md_pos_products where id=lot.product_id);end if;
   if rate.unit not in ('kg','butir') then raise exception 'Satuan harga transfer perlu diperbarui admin';end if;
   newlot:=gen_random_uuid();line_total:=round(rate.price*case when rate.unit='kg' then kg else pieces end,2);price_total:=price_total+line_total;
   lines:=lines||jsonb_build_array(jsonb_build_object('kind','fruit','sourceLotId',root,'targetLotId',newlot,'productId',lot.product_id,'productName',(select name from public.md_pos_products where id=lot.product_id),'supplierId',lot.supplier_id,'supplierName',(select name from public.md_pos_suppliers where id=lot.supplier_id),'kg',kg,'pieces',pieces,'qty',case when rate.unit='kg' then kg else pieces end,'unit',rate.unit,'price',rate.price,'total',line_total,'unitCost',lot.unit_cost,'supplierUnitCost',coalesce(lot.supplier_unit_cost,lot.unit_cost)));
  end loop;
  if (select count(distinct x->>'lotId') from jsonb_array_elements(coalesce(payload->'units','[]')) x)<>jsonb_array_length(coalesce(payload->'units','[]')) then raise exception 'Lot bahan terduplikasi';end if;
  for row in select value from jsonb_array_elements(coalesce(payload->'units','[]')) loop
   select * into ul from public.md_pos_unit_lots where id=(row->>'lotId')::uuid for update;
   quantity:=public.pos_positive(row->>'qty');
   if not found or ul.store_id<>st or ul.qty<quantity or (ul.expiry is not null and ul.expiry<day) or (ul.unit in ('pcs','porsi') and quantity<>trunc(quantity)) then raise exception 'Stok bahan tidak cukup / tidak valid';end if;
   select * into rate from md_supply.prices where product_id=ul.product_id;
   if not found or rate.unit<>ul.unit then raise exception 'Atur harga transfer bahan terlebih dahulu';end if;
   newlot:=gen_random_uuid();line_total:=round(rate.price*quantity,2);price_total:=price_total+line_total;
   lines:=lines||jsonb_build_array(jsonb_build_object('kind','unit','sourceLotId',ul.id,'targetLotId',newlot,'productId',ul.product_id,'productName',(select name from public.md_pos_products where id=ul.product_id),'supplierId',ul.supplier_id,'supplierName',(select name from public.md_pos_suppliers where id=ul.supplier_id),'qty',quantity,'unit',ul.unit,'price',rate.price,'total',line_total,'unitCost',ul.unit_cost,'supplierUnitCost',coalesce(ul.supplier_unit_cost,ul.unit_cost),'expiry',ul.expiry));
  end loop;
  seq:=nextval('md_supply.document_number');tid:=eid;
  insert into md_supply.transfers(id,invoice_no,delivery_no,source_id,target_id,lines,origin,destination,total,note,carrier,created_by)
  values(tid,'INV-ARN-'||to_char(day,'YYYYMM')||'-'||lpad(seq::text,6,'0'),'SJ-ARN-'||to_char(day,'YYYYMM')||'-'||lpad(seq::text,6,'0'),st,dst,lines,(select jsonb_build_object('name',name,'address',coalesce(to_jsonb(s)->>'address',to_jsonb(s)->>'location'),'phone',to_jsonb(s)->>'phone') from public.md_pos_stores s where id=st),(select jsonb_build_object('name',name,'address',coalesce(to_jsonb(s)->>'address',to_jsonb(s)->>'location'),'phone',to_jsonb(s)->>'phone') from public.md_pos_stores s where id=dst),price_total,left(coalesce(payload->>'note',''),500),btrim(payload->>'carrier'),auth.uid());
  for ln in select value from jsonb_array_elements(lines) loop
   if ln->>'kind'='fruit' then
    update public.md_pos_lots set kg=md_pos_lots.kg-(ln->>'kg')::numeric,pieces=md_pos_lots.pieces-(ln->>'pieces')::int where id=(ln->>'sourceLotId')::uuid;
    for code in select barcode from public.md_pos_fruit_units where barcode=any(codes) and lot_id=(ln->>'sourceLotId')::uuid loop
     insert into md_supply.items values(tid,code,(ln->>'sourceLotId')::uuid,(ln->>'targetLotId')::uuid,null,null);
     perform public.pos_tracking_change(code,eid,'transfer_dispatch',(ln->>'sourceLotId')::uuid,'in_transit');
     update public.md_pos_fruit_units set transfer_id=tid where barcode=code;
     update public.md_pos_fruit_events set after_state=(select to_jsonb(f) from public.md_pos_fruit_units f where f.barcode=code) where event_id=eid and barcode=code;
    end loop;
   else update public.md_pos_unit_lots set qty=qty-(ln->>'qty')::numeric where id=(ln->>'sourceLotId')::uuid;end if;
  end loop;
 elsif action in ('transfer_scan','transfer_receive','transfer_cancel','transfer_payment') then
  tid:=(payload->>'transferId')::uuid;select * into t from md_supply.transfers where id=tid for update;
  if not found then raise exception 'Nomor pengiriman tidak ditemukan';end if;
  if action in ('transfer_scan','transfer_receive') then
   perform md_supply.require_location(t.target_id,'receive','store');
   if payload->>'deliveryNo' is distinct from t.delivery_no then raise exception 'Nomor surat jalan tidak cocok';end if;
   if t.status<>'in_transit' then raise exception 'Kiriman tidak sedang dalam perjalanan';end if;
  else perform public.pos_require('backoffice');end if;
  if action='transfer_scan' then
   if jsonb_typeof(payload->'barcodes') is distinct from 'array' or jsonb_array_length(payload->'barcodes') not between 1 and 5000 then raise exception 'Scan barcode kiriman';end if;
   for code in select jsonb_array_elements_text(payload->'barcodes') loop
    if code=any(codes) then raise exception 'Barcode terduplikasi';end if;codes:=array_append(codes,code);
    if not exists(select 1 from md_supply.items i join public.md_pos_fruit_units fu on fu.barcode=i.barcode where i.transfer_id=tid and i.barcode=code and fu.status='in_transit' and fu.transfer_id=tid) then raise exception 'Barcode tidak tercantum pada surat jalan ini: %',code;end if;
    update md_supply.items set scanned_by=auth.uid(),scanned_at=tm where transfer_id=tid and barcode=code and scanned_at is null;
   end loop;
  elsif action='transfer_receive' then
   if exists(select 1 from md_supply.items where transfer_id=tid and scanned_at is null) then raise exception 'Penerimaan wajib lengkap: masih ada barcode belum dipindai';end if;
   if payload->'confirmed' is distinct from 'true'::jsonb then raise exception 'Konfirmasi pemeriksaan barang lengkap';end if;
   if jsonb_typeof(coalesce(payload->'units','[]')) is distinct from 'array' or jsonb_array_length(coalesce(payload->'units','[]'))<>(select count(*) from jsonb_array_elements(t.lines) x where x->>'kind'='unit') or (select count(distinct x->>'lotId') from jsonb_array_elements(coalesce(payload->'units','[]')) x)<>jsonb_array_length(coalesce(payload->'units','[]')) then raise exception 'Daftar bahan penerimaan tidak sesuai surat jalan';end if;
   for ln in select value from jsonb_array_elements(t.lines) loop
    if ln->>'kind'='fruit' then
     if exists(select 1 from md_supply.items i join public.md_pos_fruit_units fu on fu.barcode=i.barcode where i.transfer_id=tid and (fu.status<>'in_transit' or fu.transfer_id is distinct from tid)) then raise exception 'Status barcode berubah';end if;
     select * into lot from public.md_pos_lots where id=(ln->>'sourceLotId')::uuid;
     insert into public.md_pos_lots(id,store_id,supplier_id,product_id,received_date,received_kg,received_pieces,kg,pieces,source_lot_id,note,created_by,quality,unit_cost,supplier_unit_cost,invoice_no)
     values((ln->>'targetLotId')::uuid,t.target_id,lot.supplier_id,lot.product_id,day,(ln->>'kg')::numeric,(ln->>'pieces')::int,(ln->>'kg')::numeric,(ln->>'pieces')::int,lot.id,t.delivery_no,auth.uid(),'ready',(ln->>'total')::numeric/(ln->>'kg')::numeric,coalesce(lot.supplier_unit_cost,lot.unit_cost),t.invoice_no);
     for code in select barcode from md_supply.items where transfer_id=tid and target_lot_id=(ln->>'targetLotId')::uuid loop
      perform public.pos_tracking_change(code,eid,'transfer_receive',(ln->>'targetLotId')::uuid,'available');
      update public.md_pos_fruit_units set transfer_id=null where barcode=code;
      update public.md_pos_fruit_events set after_state=(select to_jsonb(f) from public.md_pos_fruit_units f where f.barcode=code) where event_id=eid and barcode=code;
     end loop;
    else
     if not exists(select 1 from jsonb_array_elements(coalesce(payload->'units','[]')) x where x->>'lotId'=ln->>'sourceLotId' and (x->>'qty')::numeric=(ln->>'qty')::numeric) then raise exception 'Jumlah bahan wajib lengkap sesuai surat jalan';end if;
     select * into ul from public.md_pos_unit_lots where id=(ln->>'sourceLotId')::uuid;
     insert into public.md_pos_unit_lots(id,product_id,store_id,supplier_id,received_date,expiry,received_qty,qty,unit,unit_cost,supplier_unit_cost,transfer_source_id,kind,note,created_by)
     values((ln->>'targetLotId')::uuid,ul.product_id,t.target_id,ul.supplier_id,day,ul.expiry,(ln->>'qty')::numeric,(ln->>'qty')::numeric,ul.unit,(ln->>'total')::numeric/(ln->>'qty')::numeric,coalesce(ul.supplier_unit_cost,ul.unit_cost),ul.id,'transfer',t.delivery_no,auth.uid());
    end if;
   end loop;
   update md_supply.transfers set status='received',received_at=tm,received_by=auth.uid() where id=tid;
  elsif action='transfer_cancel' then
   if t.status<>'in_transit' or t.paid>0 or exists(select 1 from md_supply.items where transfer_id=tid and scanned_at is not null) then raise exception 'Hanya kiriman belum dibayar dan belum dipindai penerima yang dapat dibatalkan';end if;
   if length(btrim(coalesce(payload->>'reason','')))<5 or payload->'returnedToWarehouse' is distinct from 'true'::jsonb then raise exception 'Konfirmasi barang kembali di gudang dan isi alasan';end if;
   for ln in select value from jsonb_array_elements(t.lines) loop
    if ln->>'kind'='fruit' then
     update public.md_pos_lots set kg=md_pos_lots.kg+(ln->>'kg')::numeric,pieces=md_pos_lots.pieces+(ln->>'pieces')::int where id=(ln->>'sourceLotId')::uuid;
     for code in select barcode from md_supply.items where transfer_id=tid and source_lot_id=(ln->>'sourceLotId')::uuid loop
      perform public.pos_tracking_change(code,eid,'transfer_cancel',(ln->>'sourceLotId')::uuid,'available');
      update public.md_pos_fruit_units set transfer_id=null where barcode=code;
      update public.md_pos_fruit_events set after_state=(select to_jsonb(f) from public.md_pos_fruit_units f where f.barcode=code) where event_id=eid and barcode=code;
     end loop;
    else update public.md_pos_unit_lots set qty=qty+(ln->>'qty')::numeric where id=(ln->>'sourceLotId')::uuid;end if;
   end loop;
   update md_supply.transfers set status='cancelled',cancel_reason=left(payload->>'reason',500) where id=tid;
  elsif action='transfer_payment' then
   if t.status='cancelled' then raise exception 'Invoice dibatalkan';end if;
   quantity:=public.pos_positive(payload->>'amount');
   if round(quantity,2)<>quantity or quantity>t.total-t.paid or length(btrim(coalesce(payload->>'reference','')))<3 then raise exception 'Jumlah pembayaran / referensi tidak valid';end if;
   update md_supply.transfers set paid=paid+quantity where id=tid;
  end if;
 elsif action='legacy_labels_register' then
  perform public.pos_require('backoffice');
  root:=(payload->>'lotId')::uuid;select * into lot from public.md_pos_lots where id=root for update;
  if not found or lot.kg<=0 or lot.pieces<=0 or lot.quality not in ('ready','reject') then raise exception 'Pilih batch stok lama yang masih tersedia';end if;
  if length(btrim(coalesce(payload->>'reason','')))<10 then raise exception 'Isi alasan dan hasil pemeriksaan fisik minimal 10 karakter';end if;
  if jsonb_typeof(payload->'barcodes') is distinct from 'array' or jsonb_array_length(payload->'barcodes') not between 1 and 5000 then raise exception 'Scan seluruh stok lama yang belum berbarcode';end if;
  select lot.kg-coalesce(sum(grams),0)::numeric/1000,lot.pieces-count(*) into kg,pieces from public.md_pos_fruit_units where lot_id=root and status in ('available','reject');
  quantity:=0;
  for code in select jsonb_array_elements_text(payload->'barcodes') loop
   row:=public.pos_tracking_parse(code);
   if row is null or code=any(codes) then raise exception 'Barcode tidak valid atau terduplikasi';end if;codes:=array_append(codes,code);
   if exists(select 1 from public.md_pos_fruit_units where identity_key=left(code,16)) then raise exception 'Barcode sudah terdaftar; tidak boleh dipindahkan ke batch lain';end if;
   if (select count(*) from public.md_pos_products where btrim(barcode)=row->>'itemCode')<>1 or not exists(select 1 from public.md_pos_products where id=lot.product_id and btrim(barcode)=row->>'itemCode') then raise exception 'Produk barcode tidak sesuai batch';end if;
   quantity:=quantity+(row->>'grams')::numeric/1000;
  end loop;
  if quantity<>kg or cardinality(codes)<>pieces then raise exception 'Label harus cocok tepat dengan sisa stok lama: % kg / % butir. Registrasi tidak menambah atau mengurangi stok',kg,pieces;end if;
  st:=root;
  loop
   if st=any(visited) then raise exception 'Rantai batch lama melingkar; perbaiki data sumber sebelum registrasi';end if;visited:=array_append(visited,st);
   select source_lot_id into dst from public.md_pos_lots where id=st;exit when dst is null;st:=dst;
  end loop;
  foreach code in array codes loop
   row:=public.pos_tracking_parse(code);
   insert into public.md_pos_fruit_units(barcode,product_id,receipt_lot_id,lot_id,store_id,grams,status,last_event) values(code,lot.product_id,st,lot.id,lot.store_id,(row->>'grams')::int,case when lot.quality='reject' then 'reject' else 'available' end,eid) returning to_jsonb(md_pos_fruit_units.*) into fresh;
   insert into public.md_pos_fruit_events(event_id,barcode,action,actor,after_state) values(eid,code,'legacy_labels_register',auth.uid(),fresh);
  end loop;
 elsif action='fruit_cut_check' then
  code:=payload->>'barcode';select * into u from public.md_pos_fruit_units where barcode=code for update;
  if not found or u.status<>'available' or u.store_id is distinct from (payload->>'storeId')::uuid then raise exception 'Barcode tidak tersedia di toko ini';end if;
  perform md_supply.require_location(u.store_id,'cut','store');
  if length(btrim(coalesce(payload->>'tableNo',''))) not between 1 and 30 then raise exception 'Nomor meja / pesanan wajib';end if;
  insert into md_supply.cut_checks values(eid,code,u.store_id,btrim(payload->>'tableNo'),left(coalesce(payload->>'note',''),300),auth.uid(),tm);
  perform public.pos_tracking_change(code,eid,'fruit_cut_check',u.lot_id,u.status);
 elsif action='service_complete' then
  select * into ord from public.md_pos_order_runs where id=(payload->>'orderId')::uuid for update;
  if not found then raise exception 'Pesanan tidak ditemukan';end if;
  perform md_supply.require_location(ord.store_id,'serve','store');
  if ord.status<>'ready' or ord.payment_status<>'paid' then raise exception 'Pesanan belum lunas dan siap';end if;
  update public.md_pos_order_runs set status='paid' where id=ord.id;
 else raise exception 'Operasi gudang tidak dikenal';end if;
 if action in ('transfer_dispatch','transfer_receive','transfer_cancel') then
  select * into t from md_supply.transfers where id=tid;
  st:=case when action='transfer_receive' then t.target_id else t.source_id end;
  insert into public.md_pos_events(id,action,store_id,actor,employee_id,business_date,payload) values(eid,action,st,auth.uid(),(select id from public.md_pos_employees where user_id=auth.uid()),day,payload);
  for ln in select value from jsonb_array_elements(t.lines) loop
   quantity:=case when ln->>'kind'='fruit' then (ln->>'kg')::numeric else (ln->>'qty')::numeric end;
   insert into public.md_pos_stock_journal(event_id,lot_id,product_id,store_id,supplier_id,qty,pieces,unit,cost,quality)
   values(eid,(case when action='transfer_receive' then ln->>'targetLotId' else ln->>'sourceLotId' end)::uuid,(ln->>'productId')::uuid,st,(ln->>'supplierId')::uuid,quantity*case when action='transfer_dispatch' then -1 else 1 end,coalesce((ln->>'pieces')::int,0)*case when action='transfer_dispatch' then -1 else 1 end,case when ln->>'kind'='fruit' then 'kg' else ln->>'unit' end,case when action='transfer_receive' then (ln->>'total')::numeric else quantity*(ln->>'unitCost')::numeric*case when action='transfer_dispatch' then -1 else 1 end end,'ready');
  end loop;
 end if;
 insert into md_supply.events(id,action,actor,request,transfer_id) values(eid,action,auth.uid(),payload,tid);
 if action='transfer_scan' then return md_supply.scan_result(tid,eid);end if;
 return public.pos_read();
end$$;

create or replace function md_supply.transfer_json(t md_supply.transfers) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',t.id,'invoiceNo',t.invoice_no,'deliveryNo',t.delivery_no,'sourceId',t.source_id,'targetId',t.target_id,'status',t.status,
 'origin',t.origin,'destination',t.destination,'total',t.total,'paid',t.paid,'note',t.note,'carrier',t.carrier,'createdAt',t.created_at,'receivedAt',t.received_at,'cancelReason',t.cancel_reason,
 'lines',(select jsonb_agg(case when public.pos_allowed('finance') then x else x-'unitCost'-'supplierUnitCost' end) from jsonb_array_elements(t.lines) x),
 'items',coalesce((select jsonb_agg(jsonb_build_object('barcode',i.barcode,'sourceLotId',i.source_lot_id,'targetLotId',i.target_lot_id,'grams',u.grams,'productId',u.product_id,'receiptLotId',u.receipt_lot_id,'scannedAt',i.scanned_at) order by i.barcode) from md_supply.items i join public.md_pos_fruit_units u on u.barcode=i.barcode where i.transfer_id=t.id),'[]'))
$$;
-- Per-label receiving returns only changed labels, avoiding full POS downloads on every scan.
create or replace function md_supply.scan_result(transfer uuid,event uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('warehouseDelta',true,'transferId',transfer,
 'scans',(select coalesce(jsonb_agg(jsonb_build_object('barcode',i.barcode,'scannedAt',i.scanned_at)),'[]') from md_supply.items i where i.transfer_id=transfer and i.barcode in(select jsonb_array_elements_text(ev.request->'barcodes'))),
 'event',jsonb_build_object('id',ev.id,'action',ev.action,'transferId',ev.transfer_id,'at',ev.at)) from md_supply.events ev where ev.id=event
$$;
create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;flags jsonb;bo boolean;emp public.md_pos_employees%rowtype;
begin
 s:=public.pos_read_before_107();bo:=public.pos_allowed('backoffice');
 select * into emp from public.md_pos_employees where user_id=auth.uid() and active;
 if not found then raise exception 'Login diperlukan';end if;
 select jsonb_object_agg(p,public.pos_allowed(p)) into flags from unnest(array['backoffice','dispatch','receive','serve','cut']) p;
 s:=jsonb_set(s,'{access}',(s->'access')||flags);
 s:=jsonb_set(s,'{stores}',coalesce((select jsonb_agg(x||jsonb_build_object('locationType',st.location_type) order by st.location_type,st.name) from jsonb_array_elements(s->'stores') x join public.md_pos_stores st on st.id=(x->>'id')::uuid),'[]'));
 s:=jsonb_set(s,'{unitLots}',coalesce((select jsonb_agg(x||jsonb_build_object('sourceLotId',l.transfer_source_id,'supplierUnitCost',case when public.pos_allowed('finance') then coalesce(l.supplier_unit_cost,l.unit_cost) end)) from jsonb_array_elements(s->'unitLots') x join public.md_pos_unit_lots l on l.id=(x->>'id')::uuid),'[]'));
 s:=jsonb_set(s,'{lots}',coalesce((select jsonb_agg(x||jsonb_build_object('supplierUnitCost',case when public.pos_allowed('finance') then coalesce(l.supplier_unit_cost,l.unit_cost) end)) from jsonb_array_elements(s->'lots') x join public.md_pos_lots l on l.id=(x->>'id')::uuid),'[]'));
 -- Service staff see operational orders, with monetary/consumption data removed.
 if public.pos_allowed('serve') and not public.pos_allowed('sell') then
  s:=jsonb_set(s,'{orders}',coalesce((select jsonb_agg(to_jsonb(o)-'cost'-'consumption'-'total'-'subtotal'-'paid'-'change'-'payment_meta'-'void_meta') from public.md_pos_order_runs o where public.pos_allowed('serve',o.store_id) and o.payment_status='paid' and o.status in ('queued','preparing','ready','paid') and o.created_at>now()-interval '7 days'),'[]'));
 end if;
 return s||jsonb_build_object('warehouseVersion',107,
 'locations',coalesce((select jsonb_agg(jsonb_build_object('id',st.id,'name',st.name,'locationType',st.location_type) order by st.name) from public.md_pos_stores st where bo or public.pos_allowed('dispatch') or st.id=any(emp.store_ids)),'[]'),
 'transferPrices',coalesce((select jsonb_agg(jsonb_build_object('productId',p.product_id,'unit',p.unit,'price',p.price)) from md_supply.prices p where bo or public.pos_allowed('dispatch')),'[]'),
 'transfers',coalesce((select jsonb_agg(md_supply.transfer_json(t) order by t.created_at desc) from md_supply.transfers t where bo or public.pos_allowed('dispatch',t.source_id) or public.pos_allowed('receive',t.target_id)),'[]'),
 'supplyEvents',coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'action',ev.action,'transferId',ev.transfer_id,'at',ev.at,'actor',(select name from public.md_pos_employees where user_id=ev.actor),'details',case when bo then ev.request else null end)) from md_supply.events ev where bo or ev.actor=auth.uid()),'[]'),
 'receiptPlans',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'storeId',p.warehouse_id,'supplierId',p.supplier_id,'invoiceNo',p.invoice_no,'date',p.date,'shippingCost',p.shipping,'lines',p.lines,'receivedId',p.received_id) order by p.created_at desc) from md_supply.receipt_plans p where bo or public.pos_allowed('stock',p.warehouse_id)),'[]'),
 'cutChecks',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'barcode',c.barcode,'storeId',c.store_id,'tableNo',c.table_no,'note',c.note,'at',c.at,'actor',(select name from public.md_pos_employees where user_id=c.actor)) order by c.at desc) from md_supply.cut_checks c where (bo or public.pos_allowed('cut',c.store_id) or public.pos_allowed('sell',c.store_id)) and c.at>now()-interval '7 days'),'[]'));
end$$;
-- Internal helpers use the caller's security context through guarded RPCs.
revoke all on all functions in schema md_supply from public,anon,authenticated;
revoke all on function public.pos_tracking_mutate(text,text,jsonb) from public,anon,authenticated;
revoke all on function public.pos_warehouse_mutate(text,jsonb),public.pos_read() from public,anon,authenticated;
grant execute on function public.pos_warehouse_mutate(text,jsonb),public.pos_read() to authenticated;
notify pgrst,'reload schema';
commit;

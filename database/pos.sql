-- GENERATED: node scripts/build-database.mjs
-- Install baru saja. Database aktif: jalankan migration berikutnya, bukan file ini.
begin;

-- archive/000-initial.sql
-- Jalankan di SQL Editor Supabase. Tidak mengubah tabel menu/customer.

create table if not exists public.md_pos_staff(user_id uuid primary key references auth.users(id) on delete cascade);
create table if not exists public.md_pos_stores(id uuid primary key,name text not null check(length(name) between 1 and 100));
create table if not exists public.md_pos_suppliers(id uuid primary key,name text not null check(length(name) between 1 and 100));
create table if not exists public.md_pos_products(id uuid primary key,sku text not null,name text not null,price_kg numeric not null check(price_kg>0),price_piece numeric not null check(price_piece>0));
create unique index if not exists md_pos_sku_unique on public.md_pos_products(lower(sku));
create table if not exists public.md_pos_lots(id uuid primary key,store_id uuid not null references public.md_pos_stores,supplier_id uuid not null references public.md_pos_suppliers,product_id uuid not null references public.md_pos_products,received_date date not null,received_kg numeric not null check(received_kg>0),received_pieces integer not null check(received_pieces>0),kg numeric not null check(kg>=0),pieces integer not null check(pieces>=0),source_lot_id uuid references public.md_pos_lots,note text not null default '',created_by uuid references auth.users,created_at timestamptz not null default now());
create table if not exists public.md_pos_sales(id uuid primary key,store_id uuid not null references public.md_pos_stores,sale_date date not null,payment text not null check(payment in ('Tunai','QRIS','Transfer')),paid numeric not null,total numeric not null,change numeric not null,voided boolean not null default false,void_reason text,created_by uuid references auth.users,created_at timestamptz not null default now(),voided_by uuid references auth.users,voided_at timestamptz);
create table if not exists public.md_pos_sale_items(id bigint generated always as identity primary key,sale_id uuid not null references public.md_pos_sales,lot_id uuid not null references public.md_pos_lots,product_id uuid not null references public.md_pos_products,supplier_id uuid not null references public.md_pos_suppliers,kg numeric not null check(kg>0),pieces integer not null check(pieces>0),unit text not null check(unit in ('KG','BUTIR')),price numeric not null check(price>0),total numeric not null check(total>0));
create table if not exists public.md_pos_movements(id uuid primary key,lot_id uuid not null references public.md_pos_lots,store_id uuid not null references public.md_pos_stores,to_store_id uuid references public.md_pos_stores,supplier_id uuid not null references public.md_pos_suppliers,product_id uuid not null references public.md_pos_products,movement_date date not null,kind text not null check(kind in ('Waste','Pemakaian dapur','Transfer')),kg numeric not null check(kg>0),pieces integer not null check(pieces>0),note text not null,created_by uuid references auth.users,created_at timestamptz not null default now());
create index if not exists md_pos_lot_store on public.md_pos_lots(store_id);
create index if not exists md_pos_sale_date on public.md_pos_sales(store_id,sale_date);
create index if not exists md_pos_item_sale on public.md_pos_sale_items(sale_id);
alter table public.md_pos_staff enable row level security;
alter table public.md_pos_stores enable row level security;
alter table public.md_pos_suppliers enable row level security;
alter table public.md_pos_products enable row level security;
alter table public.md_pos_lots enable row level security;
alter table public.md_pos_sales enable row level security;
alter table public.md_pos_sale_items enable row level security;
alter table public.md_pos_movements enable row level security;
-- Semua operasi dari browser lewat RPC yang memeriksa allowlist staff.
revoke all on public.md_pos_staff,public.md_pos_stores,public.md_pos_suppliers,public.md_pos_products,public.md_pos_lots,public.md_pos_sales,public.md_pos_sale_items,public.md_pos_movements from anon,authenticated;

-- Setelah membuat akun email/password di Supabase Authentication, jalankan:
-- insert into public.md_pos_staff(user_id) select id from auth.users where email='EMAIL_ADMIN_ANDA';

-- 001-master-contact.sql
-- Jalankan sekali untuk memperbarui POS yang sudah terpasang. Aman dijalankan ulang.

alter table public.md_pos_stores add column if not exists location text not null default '';
alter table public.md_pos_suppliers add column if not exists phone text not null default '';
alter table public.md_pos_suppliers add column if not exists address text not null default '';

-- 002-product-catalog.sql
-- Update 02: master produk dan bahan. Aman dijalankan ulang.

alter table public.md_pos_stores add column if not exists location text not null default '';
alter table public.md_pos_suppliers add column if not exists phone text not null default '';
alter table public.md_pos_suppliers add column if not exists address text not null default '';

alter table public.md_pos_products add column if not exists category text default 'Buah';
alter table public.md_pos_products add column if not exists item_type text not null default 'direct';
alter table public.md_pos_products add column if not exists stock_unit text not null default 'kg_butir';
alter table public.md_pos_products add column if not exists sale_price numeric;
alter table public.md_pos_products alter column price_kg drop not null;
alter table public.md_pos_products alter column price_piece drop not null;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.md_pos_products'::regclass and conname='md_pos_catalog_valid') then
  alter table public.md_pos_products add constraint md_pos_catalog_valid check (
   item_type in ('direct','raw','prep','recipe','finished')
   and stock_unit in ('kg_butir','g','ml','pcs','porsi')
   and ((item_type in ('raw','prep') and category is null) or (item_type not in ('raw','prep') and category is not null and category in ('Buah','Dessert','Minuman','Olahan Duren')))
   and (stock_unit<>'kg_butir' or (item_type='direct' and category='Buah'))
   and ((item_type='recipe' and stock_unit='porsi') or (item_type<>'recipe' and stock_unit<>'porsi'))
   and ((stock_unit='kg_butir' and price_kg is not null and price_kg>0 and price_piece is not null and price_piece>0 and sale_price is null)
     or (stock_unit<>'kg_butir' and price_kg is null and price_piece is null and
       ((item_type in ('raw','prep') and sale_price is null) or (item_type not in ('raw','prep') and sale_price is not null and sale_price>0))))
  );
 end if;
end $$;

-- 003-recipes-production.sql
-- Update 03: resep, stok bahan, dan produksi atomik.

alter table public.md_pos_stores add column if not exists location text not null default '';
alter table public.md_pos_suppliers add column if not exists phone text not null default '';
alter table public.md_pos_suppliers add column if not exists address text not null default '';

alter table public.md_pos_products add column if not exists category text default 'Buah';
alter table public.md_pos_products add column if not exists item_type text not null default 'direct';
alter table public.md_pos_products add column if not exists stock_unit text not null default 'kg_butir';
alter table public.md_pos_products add column if not exists sale_price numeric;
alter table public.md_pos_products alter column price_kg drop not null;
alter table public.md_pos_products alter column price_piece drop not null;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.md_pos_products'::regclass and conname='md_pos_catalog_valid') then
  alter table public.md_pos_products add constraint md_pos_catalog_valid check (
   item_type in ('direct','raw','prep','recipe','finished')
   and stock_unit in ('kg_butir','g','ml','pcs','porsi')
   and ((item_type in ('raw','prep') and category is null) or (item_type not in ('raw','prep') and category is not null and category in ('Buah','Dessert','Minuman','Olahan Duren')))
   and (stock_unit<>'kg_butir' or (item_type='direct' and category='Buah'))
   and ((item_type='recipe' and stock_unit='porsi') or (item_type<>'recipe' and stock_unit<>'porsi'))
   and ((stock_unit='kg_butir' and price_kg is not null and price_kg>0 and price_piece is not null and price_piece>0 and sale_price is null)
     or (stock_unit<>'kg_butir' and price_kg is null and price_piece is null and
       ((item_type in ('raw','prep') and sale_price is null) or (item_type not in ('raw','prep') and sale_price is not null and sale_price>0))))
  );
 end if;
end $$;

create table if not exists public.md_pos_recipes(
 id uuid primary key,name text not null,output_id uuid not null references public.md_pos_products,
 yield_qty numeric not null check(yield_qty>0),version integer not null default 1,
 updated_by uuid references auth.users,updated_at timestamptz not null default now());
create table if not exists public.md_pos_recipe_items(
 recipe_id uuid not null references public.md_pos_recipes,product_id uuid not null references public.md_pos_products,
 qty numeric not null check(qty>0),primary key(recipe_id,product_id));
create table if not exists public.md_pos_unit_lots(
 id uuid primary key,product_id uuid not null references public.md_pos_products,store_id uuid not null references public.md_pos_stores,
 unit text not null check(unit in ('g','ml','pcs','porsi')),received_qty numeric not null check(received_qty>0),qty numeric not null check(qty>=0 and qty<=received_qty),
 received_date date not null,expiry date,kind text not null check(kind in ('purchase','opening','production')),
 supplier_id uuid references public.md_pos_suppliers,note text not null default '',created_by uuid references auth.users,
 created_at timestamptz not null default now(),check(expiry is null or expiry>=received_date));
create table if not exists public.md_pos_productions(
 id uuid primary key references public.md_pos_unit_lots,store_id uuid not null references public.md_pos_stores,
 recipe_id uuid not null references public.md_pos_recipes,output_id uuid not null references public.md_pos_products,
 production_date date not null,snapshot jsonb not null,voided boolean not null default false,void_reason text,
 created_by uuid references auth.users,created_at timestamptz not null default now(),voided_by uuid references auth.users,voided_at timestamptz);
create index if not exists md_pos_unit_stock on public.md_pos_unit_lots(store_id,product_id,received_date,id);
alter table public.md_pos_recipes enable row level security;
alter table public.md_pos_recipe_items enable row level security;
alter table public.md_pos_unit_lots enable row level security;
alter table public.md_pos_productions enable row level security;
revoke all on public.md_pos_recipes,public.md_pos_recipe_items,public.md_pos_unit_lots,public.md_pos_productions from public,anon,authenticated;

-- 004-product-details.sql
-- Update 04: jalankan setelah Update 03.

alter table public.md_pos_products add column if not exists variant text not null default '';
alter table public.md_pos_products add column if not exists barcode text not null default '';
alter table public.md_pos_products add column if not exists buy_price numeric;
alter table public.md_pos_products add column if not exists photo text not null default '';
alter table public.md_pos_lots add column if not exists is_adjustment boolean not null default false;
alter table public.md_pos_lots drop constraint if exists md_pos_lots_received_kg_check;
alter table public.md_pos_lots drop constraint if exists md_pos_lots_received_pieces_check;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.md_pos_lots'::regclass and conname='md_pos_lots_receipt_amounts') then
  alter table public.md_pos_lots add constraint md_pos_lots_receipt_amounts check((not is_adjustment and received_kg>0 and received_pieces>0) or (is_adjustment and received_kg>=0 and received_pieces>=0 and (received_kg>0 or received_pieces>0)));
 end if;
end $$;
create table if not exists public.md_pos_stock_adjustments(
 id uuid primary key,product_id uuid not null references public.md_pos_products,store_id uuid not null references public.md_pos_stores,
 adjustment_date date not null,reason text not null,before_qty jsonb not null,after_qty jsonb not null,changes jsonb not null,
 created_by uuid references auth.users,created_at timestamptz not null default now()
);
alter table public.md_pos_stock_adjustments enable row level security;
revoke all on public.md_pos_stock_adjustments from public,anon,authenticated;

-- 005-waste-processing.sql
-- Update 05: jalankan setelah Update 04.

alter table public.md_pos_products drop constraint if exists md_pos_catalog_valid;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.md_pos_products'::regclass and conname='md_pos_catalog_valid') then
  alter table public.md_pos_products add constraint md_pos_catalog_valid check (
   item_type in ('direct','raw','prep','recipe','finished')
   and stock_unit in ('kg_butir','kg','g','ml','pcs','porsi')
   and ((item_type in ('raw','prep') and category is null) or (item_type not in ('raw','prep') and category is not null and category in ('Buah','Dessert','Minuman','Olahan Duren')))
   and (stock_unit<>'kg_butir' or (item_type='direct' and category='Buah'))
   and ((item_type='recipe' and stock_unit='porsi') or (item_type<>'recipe' and stock_unit<>'porsi'))
   and ((stock_unit='kg_butir' and price_kg is not null and price_kg>0 and price_piece is not null and price_piece>0 and sale_price is null)
     or (stock_unit<>'kg_butir' and price_kg is null and price_piece is null and
       ((item_type in ('raw','prep') and sale_price is null) or (item_type not in ('raw','prep') and sale_price is not null and sale_price>0))))
  );
 end if;
end $$;
alter table public.md_pos_unit_lots drop constraint if exists md_pos_unit_lots_unit_check;
alter table public.md_pos_unit_lots add constraint md_pos_unit_lots_unit_check check(unit in ('kg','g','ml','pcs','porsi'));
alter table public.md_pos_unit_lots drop constraint if exists md_pos_unit_lots_kind_check;
alter table public.md_pos_unit_lots add constraint md_pos_unit_lots_kind_check check(kind in ('purchase','opening','production','waste'));
create table if not exists public.md_pos_waste_runs(
 id uuid primary key,store_id uuid not null references public.md_pos_stores,source_lot_id uuid not null references public.md_pos_lots,
 waste_date date not null,snapshot jsonb not null,voided boolean not null default false,void_reason text,voided_at timestamptz,voided_by uuid references auth.users,
 created_at timestamptz not null default now(),created_by uuid references auth.users
);
create index if not exists md_pos_waste_store_date on public.md_pos_waste_runs(store_id,waste_date);
alter table public.md_pos_waste_runs enable row level security;
revoke all on public.md_pos_waste_runs from public,anon,authenticated;

-- 006-waste-evidence.sql
-- Update 06: master hasil waste dan bukti foto. Memerlukan Update 05.

alter table public.md_pos_products drop constraint if exists md_pos_catalog_valid;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.md_pos_products'::regclass and conname='md_pos_catalog_valid') then
  alter table public.md_pos_products add constraint md_pos_catalog_valid check (
   item_type in ('direct','raw','prep','recipe','finished')
   and stock_unit in ('kg_butir','kg','g','ml','pcs','porsi')
   and ((item_type in ('raw','prep') and category is null) or (item_type not in ('raw','prep') and category is not null and category in ('Buah','Dessert','Minuman','Olahan Duren')))
   and (stock_unit<>'kg_butir' or (item_type='direct' and category='Buah'))
   and ((item_type='recipe' and stock_unit='porsi') or (item_type<>'recipe' and stock_unit<>'porsi'))
   and ((stock_unit='kg_butir' and price_kg is not null and price_kg>0 and price_piece is not null and price_piece>0 and sale_price is null)
     or (stock_unit<>'kg_butir' and price_kg is null and price_piece is null and
       ((item_type in ('raw','prep') and sale_price is null) or (item_type='finished' and sale_price is null) or (item_type not in ('raw','prep') and sale_price is not null and sale_price>0))))
  );
 end if;
end $$;

-- Master hasil. Pertahankan produk yang sudah cocok; jangan timpa harga atau stok.
do $$
declare r record; existing public.md_pos_products%rowtype;
begin
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 for r in select * from (values
 ('MD-DURPAS-500','Durpas 500 gr','pcs'),
 ('MD-DURPAS-1000','Durpas 1 kg','pcs'),
 ('MD-CORAL-KG','Coral','kg')) as t(sku,name,unit) loop
  select * into existing from public.md_pos_products where lower(sku)=lower(r.sku);
  if found then
   if existing.stock_unit<>r.unit or existing.item_type not in ('finished','direct') then
    raise exception 'SKU % sudah dipakai untuk jenis/satuan berbeda. Ubah SKU tersebut dahulu agar master hasil bisa dibuat.',r.sku;
   end if;
   continue;
  end if;
  if exists(select 1 from public.md_pos_products where lower(btrim(name))=lower(r.name) and stock_unit=r.unit and item_type in ('finished','direct')) then continue; end if;
  insert into public.md_pos_products(id,sku,name,item_type,category,stock_unit,sale_price,price_kg,price_piece)
  values(gen_random_uuid(),r.sku,r.name,'finished','Olahan Duren',r.unit,null,null,null);
 end loop;
end $$;

-- 007-flow-audit.sql
-- Audit alur: jalankan setelah update 06.

-- 008-waste-output-proof.sql
-- Update 08: bukti foto per hasil olahan dan nama pengolah.

-- Fungsi versi terakhir
create or replace function public.pos_positive(value text) returns numeric language plpgsql immutable set search_path='' as $$
begin
 if value is null or value !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Angka tidak valid'; end if;
 if value::numeric<=0 then raise exception 'Jumlah harus lebih dari 0'; end if;
 return value::numeric;
end $$;

create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.md_pos_staff where user_id=auth.uid()) then raise exception 'Akun tidak memiliki akses POS'; end if;
 return jsonb_build_object(
 'wasteRuns',coalesce((select jsonb_agg((snapshot-'evidence')||jsonb_build_object('id',id,'storeId',store_id,'sourceLotId',source_lot_id,'hasEvidence',(coalesce(snapshot->'evidence'->>'reject','')<>'' or coalesce(snapshot->'evidence'->>'processed','')<>'' or coalesce(snapshot->'evidence'->>'durpas500','')<>'' or coalesce(snapshot->'evidence'->>'durpas1000','')<>'' or coalesce(snapshot->'evidence'->>'coral','')<>''),'date',waste_date,'voided',voided,'voidReason',void_reason,'voidedAt',voided_at,'createdAt',created_at) order by created_at,id) from public.md_pos_waste_runs),'[]'::jsonb),
 'stockAdjustments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'productId',product_id,'storeId',store_id,'date',adjustment_date,'reason',reason,'before',before_qty,'after',after_qty,'changes',changes) order by created_at,id) from public.md_pos_stock_adjustments),'[]'::jsonb),
 'recipes',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'outputId',r.output_id,'yieldQty',r.yield_qty,'version',r.version,'ingredients',coalesce((select jsonb_agg(jsonb_build_object('productId',i.product_id,'qty',i.qty) order by i.product_id) from public.md_pos_recipe_items i where i.recipe_id=r.id),'[]'::jsonb)) order by r.name) from public.md_pos_recipes r),'[]'::jsonb),
 'unitLots',coalesce((select jsonb_agg(jsonb_build_object('id',id,'productId',product_id,'storeId',store_id,'unit',unit,'receivedQty',received_qty,'qty',qty,'date',received_date,'expiry',expiry,'kind',kind,'supplierId',supplier_id,'note',note) order by received_date,id) from public.md_pos_unit_lots),'[]'::jsonb),
 'productions',coalesce((select jsonb_agg(snapshot||jsonb_build_object('id',id,'storeId',store_id,'recipeId',recipe_id,'outputId',output_id,'date',production_date,'voided',voided,'voidReason',void_reason) order by created_at,id) from public.md_pos_productions),'[]'::jsonb),
 'stores',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'location',location) order by name) from public.md_pos_stores),'[]'::jsonb),
 'suppliers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'phone',phone,'address',address) order by name) from public.md_pos_suppliers),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'sku',sku,'priceKg',price_kg,'pricePiece',price_piece,'category',category,'itemType',item_type,'stockUnit',stock_unit,'salePrice',sale_price,'variant',variant,'barcode',barcode,'buyPrice',buy_price,'photo',photo) order by name) from public.md_pos_products),'[]'::jsonb),
 'lots',coalesce((select jsonb_agg(jsonb_build_object('id',id,'storeId',store_id,'supplierId',supplier_id,'productId',product_id,'date',received_date,'receivedKg',received_kg,'receivedPieces',received_pieces,'kg',kg,'pieces',pieces,'sourceLotId',source_lot_id,'note',note) order by created_at) from public.md_pos_lots),'[]'::jsonb),
 'sales',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'date',s.sale_date,'storeId',s.store_id,'payment',s.payment,'paid',s.paid,'total',s.total,'change',s.change,'voided',s.voided,'voidReason',s.void_reason,'createdAt',s.created_at,'lines',coalesce((select jsonb_agg(jsonb_build_object('lotId',i.lot_id,'productId',i.product_id,'supplierId',i.supplier_id,'kg',i.kg,'pieces',i.pieces,'price',i.price,'unit',i.unit,'total',i.total) order by i.id) from public.md_pos_sale_items i where i.sale_id=s.id),'[]'::jsonb)) order by s.created_at) from public.md_pos_sales s),'[]'::jsonb),
 'movements',coalesce((select jsonb_agg(jsonb_build_object('id',id,'lotId',lot_id,'storeId',store_id,'toStoreId',to_store_id,'supplierId',supplier_id,'productId',product_id,'date',movement_date,'kind',kind,'kg',kg,'pieces',pieces,'note',note) order by created_at) from public.md_pos_movements),'[]'::jsonb));
end $$;

create or replace function public.pos_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_id uuid; v_store uuid; v_date date; v_lot public.md_pos_lots%rowtype; v_sale public.md_pos_sales%rowtype;
 v_line jsonb; v_kg numeric; v_pieces numeric; v_price numeric; v_total numeric:=0; v_paid numeric; v_kind text; v_name text; v_to uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.md_pos_staff where user_id=auth.uid()) then raise exception 'Akun tidak memiliki akses POS'; end if;
 v_id:=(payload->>'id')::uuid;
 if v_id is null then raise exception 'ID wajib'; end if;
 -- Satu lock operasional menjaga konsistensi lintas kasir dan pembatalan.
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 if action in ('waste_process','waste_void') then
  perform public.pos_waste_action(action,payload);
  return public.pos_read();
 end if;
 if action='product_save' then
  perform public.pos_save_product(payload,coalesce((payload->>'editing')::boolean,false));
  perform public.pos_save_product_details(payload);
  perform public.pos_adjust_product_stock(payload);
  return public.pos_read();
 elsif action='product_delete' then
  perform public.pos_delete_product(payload);
  return public.pos_read();
 end if;
 if action in ('recipe_save','unit_receipt','produce','production_void') then
  perform public.pos_production_action(action,payload);
  return public.pos_read();
 end if;
 if action in ('master','master_details') then
  if length(btrim(coalesce(payload->>'location','')))>300 or length(btrim(coalesce(payload->>'address','')))>300 or length(btrim(coalesce(payload->>'phone','')))>40 then raise exception 'Detail terlalu panjang'; end if;
 end if;
 if action='master' then
  v_name:=btrim(payload->>'name');
  if v_name is null or length(v_name) not between 1 and 100 then raise exception 'Nama wajib, maksimal 100 karakter'; end if;
  case payload->>'kind'
   when 'stores' then insert into public.md_pos_stores(id,name,location) values(v_id,v_name,btrim(coalesce(payload->>'location',''))) on conflict(id) do nothing;
   when 'suppliers' then insert into public.md_pos_suppliers(id,name,phone,address) values(v_id,v_name,btrim(coalesce(payload->>'phone','')),btrim(coalesce(payload->>'address',''))) on conflict(id) do nothing;
   when 'products' then
    perform public.pos_save_product(payload,false);
   else raise exception 'Master tidak valid';
  end case;
 elsif action='product_update' then
  perform public.pos_save_product(payload,true);
 elsif action='master_details' then
  case payload->>'kind'
   when 'stores' then update public.md_pos_stores set location=btrim(coalesce(payload->>'location','')) where id=v_id;
   when 'suppliers' then update public.md_pos_suppliers set phone=btrim(coalesce(payload->>'phone','')),address=btrim(coalesce(payload->>'address','')) where id=v_id;
   else raise exception 'Jenis master tidak valid';
  end case;
  if not found then raise exception 'Master tidak ditemukan'; end if;
 elsif action='receipt' then
  if exists(select 1 from public.md_pos_lots where id=v_id) then return public.pos_read(); end if;
  if not exists(select 1 from public.md_pos_products where id=(payload->>'productId')::uuid and item_type='direct' and stock_unit='kg_butir') then raise exception 'Operasional item ini belum aktif; saat ini hanya master produk'; end if;
  v_kg:=public.pos_positive(payload->>'kg');v_pieces:=public.pos_positive(payload->>'pieces');
  if v_pieces<>trunc(v_pieces) then raise exception 'Butir harus bilangan bulat'; end if;
  v_date:=(payload->>'date')::date;
  insert into public.md_pos_lots(id,store_id,supplier_id,product_id,received_date,received_kg,received_pieces,kg,pieces,note,created_by)
  values(v_id,(payload->>'storeId')::uuid,(payload->>'supplierId')::uuid,(payload->>'productId')::uuid,v_date,v_kg,v_pieces::integer,v_kg,v_pieces::integer,left(coalesce(payload->>'note',''),300),auth.uid());
 elsif action='sale' then
  if exists(select 1 from public.md_pos_sales where id=v_id) then return public.pos_read(); end if;
  if jsonb_typeof(payload->'lines') is distinct from 'array' or jsonb_array_length(payload->'lines') not between 1 and 100 then raise exception 'Keranjang tidak valid'; end if;
  v_store:=(payload->>'storeId')::uuid;v_date:=(payload->>'date')::date;v_paid:=public.pos_positive(payload->>'paid');
  if v_date is null then raise exception 'Tanggal wajib'; end if;
  insert into public.md_pos_sales(id,store_id,sale_date,payment,paid,total,change,created_by) values(v_id,v_store,v_date,payload->>'payment',v_paid,0,0,auth.uid());
  for v_line in select value from jsonb_array_elements(payload->'lines') loop
   select * into v_lot from public.md_pos_lots where id=(v_line->>'lotId')::uuid for update;
   if not found or v_lot.store_id<>v_store then raise exception 'Barang bukan milik store'; end if;
   if not exists(select 1 from public.md_pos_products where id=v_lot.product_id and item_type='direct' and stock_unit='kg_butir') then raise exception 'Operasional item ini belum aktif'; end if;
   if v_date<v_lot.received_date then raise exception 'Penjualan sebelum barang masuk'; end if;
   v_kg:=public.pos_positive(v_line->>'kg');v_pieces:=public.pos_positive(v_line->>'pieces');v_price:=public.pos_positive(v_line->>'price');
   if v_pieces<>trunc(v_pieces) then raise exception 'Butir harus bilangan bulat'; end if;
   if v_kg>v_lot.kg or v_pieces>v_lot.pieces then raise exception 'Stok tidak cukup. Perbarui stok.'; end if;
   v_kind:=v_line->>'unit';if v_kind is null or v_kind not in ('KG','BUTIR') then raise exception 'Satuan tidak valid'; end if;
   insert into public.md_pos_sale_items(sale_id,lot_id,product_id,supplier_id,kg,pieces,unit,price,total) values(v_id,v_lot.id,v_lot.product_id,v_lot.supplier_id,v_kg,v_pieces::integer,v_kind,v_price,v_price*case when v_kind='KG' then v_kg else v_pieces end);
   v_total:=v_total+v_price*case when v_kind='KG' then v_kg else v_pieces end;
   update public.md_pos_lots set kg=kg-v_kg,pieces=pieces-v_pieces::integer where id=v_lot.id;
  end loop;
  if v_paid<v_total then raise exception 'Pembayaran kurang'; end if;
  update public.md_pos_sales set total=v_total,change=v_paid-v_total where id=v_id;
 elsif action='void' then
  select * into v_sale from public.md_pos_sales where id=(payload->>'saleId')::uuid for update;
  if not found then raise exception 'Transaksi tidak ditemukan'; end if;
  if v_sale.voided then return public.pos_read(); end if;
  if coalesce(length(btrim(payload->>'reason')),0)=0 then raise exception 'Alasan wajib'; end if;
  for v_line in select jsonb_build_object('lotId',lot_id,'kg',kg,'pieces',pieces) from public.md_pos_sale_items where sale_id=v_sale.id loop
   update public.md_pos_lots set kg=kg+(v_line->>'kg')::numeric,pieces=pieces+(v_line->>'pieces')::integer where id=(v_line->>'lotId')::uuid;
  end loop;
  update public.md_pos_sales set voided=true,void_reason=left(payload->>'reason',300),voided_by=auth.uid(),voided_at=now() where id=v_sale.id;
 elsif action='movement' then
  if exists(select 1 from public.md_pos_movements where id=v_id) then return public.pos_read(); end if;
  select * into v_lot from public.md_pos_lots where id=(payload->>'lotId')::uuid for update;
  if not found then raise exception 'Barang tidak ditemukan'; end if;
  v_kg:=public.pos_positive(payload->>'kg');v_pieces:=public.pos_positive(payload->>'pieces');v_date:=(payload->>'date')::date;v_kind:=payload->>'kind';
  if v_date is null or v_date<v_lot.received_date then raise exception 'Tanggal sebelum barang masuk'; end if;
  if v_pieces<>trunc(v_pieces) or v_pieces>v_lot.pieces or v_kg>v_lot.kg then raise exception 'Jumlah tidak valid atau melebihi stok'; end if;
  if coalesce(length(btrim(payload->>'note')),0)=0 then raise exception 'Catatan wajib'; end if;
  if v_kind='Transfer' then
   v_to:=(payload->>'toStoreId')::uuid;
   if v_to is null or v_to=v_lot.store_id then raise exception 'Store tujuan harus berbeda'; end if;
   insert into public.md_pos_lots(id,store_id,supplier_id,product_id,received_date,received_kg,received_pieces,kg,pieces,source_lot_id,note,created_by) values(v_id,v_to,v_lot.supplier_id,v_lot.product_id,v_date,v_kg,v_pieces::integer,v_kg,v_pieces::integer,v_lot.id,left(payload->>'note',300),auth.uid());
  end if;
  insert into public.md_pos_movements(id,lot_id,store_id,to_store_id,supplier_id,product_id,movement_date,kind,kg,pieces,note,created_by) values(v_id,v_lot.id,v_lot.store_id,v_to,v_lot.supplier_id,v_lot.product_id,v_date,v_kind,v_kg,v_pieces::integer,left(payload->>'note',300),auth.uid());
  update public.md_pos_lots set kg=kg-v_kg,pieces=pieces-v_pieces::integer where id=v_lot.id;
 else raise exception 'Aksi tidak dikenal';
 end if;
 return public.pos_read();
end $$;

create or replace function public.pos_save_product(payload jsonb,editing boolean) returns void language plpgsql set search_path='' as $$
declare
 v_id uuid:=(payload->>'id')::uuid;
 v_name text:=btrim(payload->>'name'); v_sku text:=btrim(payload->>'sku');
 v_type text:=coalesce(payload->>'itemType','direct');
 v_unit text:=coalesce(payload->>'stockUnit','kg_butir');
 v_category text:=coalesce(payload->>'category','Buah');
 v_kg numeric; v_piece numeric; v_price numeric; v_old public.md_pos_products%rowtype;
begin
 if v_id is null then raise exception 'ID wajib'; end if;
 if not editing and exists(select 1 from public.md_pos_products where id=v_id) then return; end if;
 if v_name is null or length(v_name) not between 1 and 100 then raise exception 'Nama wajib, maksimal 100 karakter'; end if;
 if v_sku is null or length(v_sku) not between 1 and 40 then raise exception 'SKU wajib, maksimal 40 karakter'; end if;
 if v_type not in ('direct','raw','prep','recipe','finished') or v_unit not in ('kg_butir','kg','g','ml','pcs','porsi') then raise exception 'Jenis item atau satuan tidak valid'; end if;
 if v_type in ('raw','prep') then v_category:=null;
 elsif v_category not in ('Buah','Dessert','Minuman','Olahan Duren') then raise exception 'Kategori jual tidak valid'; end if;
 if v_unit='kg_butir' and (v_type<>'direct' or v_category is distinct from 'Buah') then raise exception 'Kg + butir khusus produk jual langsung kategori Buah'; end if;
 if (v_type='recipe')<>(v_unit='porsi') then raise exception 'Satuan porsi khusus menu resep'; end if;
 if v_unit='kg_butir' then
  v_kg:=public.pos_positive(payload->>'priceKg');v_piece:=public.pos_positive(payload->>'pricePiece');
 elsif v_type='finished' and nullif(payload->>'salePrice','') is null then v_price:=null;
 elsif v_type not in ('raw','prep') then v_price:=public.pos_positive(payload->>'salePrice'); end if;
 if exists(select 1 from public.md_pos_products where lower(sku)=lower(v_sku) and id<>v_id) then raise exception 'SKU sudah digunakan'; end if;
 if editing then
  select * into v_old from public.md_pos_products where id=v_id for update;
  if not found then raise exception 'Produk tidak ditemukan'; end if;
  if (v_old.item_type<>v_type or v_old.stock_unit<>v_unit) and
     (exists(select 1 from public.md_pos_unit_lots where product_id=v_id) or exists(select 1 from public.md_pos_recipes where output_id=v_id) or exists(select 1 from public.md_pos_recipe_items where product_id=v_id) or exists(select 1 from public.md_pos_lots where product_id=v_id) or exists(select 1 from public.md_pos_sale_items where product_id=v_id)) then
   raise exception 'Jenis dan satuan terkunci karena sudah dipakai dalam resep atau stok/transaksi';
  end if;
  update public.md_pos_products set name=v_name,sku=v_sku,category=v_category,item_type=v_type,stock_unit=v_unit,price_kg=v_kg,price_piece=v_piece,sale_price=v_price where id=v_id;
 else
  insert into public.md_pos_products(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
   values(v_id,v_name,v_sku,v_category,v_type,v_unit,v_kg,v_piece,v_price);
 end if;
end $$;

create or replace function public.pos_unit_qty(value text,unit text) returns numeric language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
 n:=public.pos_positive(value);
 if n>9000000000 or n<>trunc(n,6) then raise exception 'Jumlah terlalu besar atau lebih dari 6 angka desimal'; end if;
 if unit in ('pcs','porsi') and n<>trunc(n) then raise exception 'Pcs dan porsi harus bilangan bulat'; end if;
 return n;
end $$;

create or replace function public.pos_production_action(action text,payload jsonb) returns void language plpgsql set search_path='' as $$
declare
 v_id uuid:=(payload->>'id')::uuid; v_store uuid; v_date date; v_expiry date;
 v_recipe public.md_pos_recipes%rowtype; v_output public.md_pos_products%rowtype;
 v_product public.md_pos_products%rowtype; v_lot public.md_pos_unit_lots%rowtype; v_run public.md_pos_productions%rowtype;
 v_line jsonb; v_used jsonb:='[]'::jsonb; v_ingredients jsonb:='[]'::jsonb; v_seen uuid[]:='{}';
 v_name text; v_qty numeric; v_yield numeric; v_batches numeric; v_expected numeric; v_actual numeric;
 v_needed numeric; v_take numeric; v_version integer; v_kind text;
begin
 if v_id is null then raise exception 'ID wajib'; end if;
 if action='recipe_save' then
  v_name:=btrim(payload->>'name');
  if v_name is null or length(v_name) not between 1 and 100 then raise exception 'Nama resep wajib, maksimal 100 karakter'; end if;
  select * into v_output from public.md_pos_products where id=(payload->>'outputId')::uuid;
  if not found or v_output.item_type not in ('prep','finished','recipe') or v_output.stock_unit not in ('kg','g','ml','pcs','porsi') then raise exception 'Pilih hasil produksi yang sesuai'; end if;
  v_yield:=public.pos_unit_qty(payload->>'yieldQty',v_output.stock_unit);
  if jsonb_typeof(payload->'ingredients') is distinct from 'array' then raise exception 'Bahan resep harus diisi'; end if;
  if jsonb_array_length(payload->'ingredients') not between 1 and 50 then raise exception 'Isi 1–50 bahan resep'; end if;
  select * into v_recipe from public.md_pos_recipes where id=v_id for update;
  if found then
   if (payload->>'version')::integer is distinct from v_recipe.version then raise exception 'Resep berubah. Muat ulang sebelum menyimpan'; end if;
   update public.md_pos_recipes set name=v_name,output_id=v_output.id,yield_qty=v_yield,version=version+1,updated_by=auth.uid(),updated_at=now() where id=v_id;
   delete from public.md_pos_recipe_items where recipe_id=v_id;
  else
   if (payload->>'version')::integer is distinct from 0 then raise exception 'Resep belum tersimpan. Muat ulang'; end if;
   insert into public.md_pos_recipes(id,name,output_id,yield_qty,updated_by) values(v_id,v_name,v_output.id,v_yield,auth.uid());
  end if;
  for v_line in select value from jsonb_array_elements(payload->'ingredients') loop
   select * into v_product from public.md_pos_products where id=(v_line->>'productId')::uuid;
   if not found or v_product.id=v_output.id or v_product.id=any(v_seen) or v_product.item_type not in ('raw','prep','direct','finished') or v_product.stock_unit not in ('kg','g','ml','pcs') then raise exception 'Bahan tidak valid, sama dengan hasil, atau terduplikasi'; end if;
   v_seen:=array_append(v_seen,v_product.id);v_qty:=public.pos_unit_qty(v_line->>'qty',v_product.stock_unit);
   insert into public.md_pos_recipe_items(recipe_id,product_id,qty) values(v_id,v_product.id,v_qty);
  end loop;
 elsif action='unit_receipt' then
  if exists(select 1 from public.md_pos_unit_lots where id=v_id) then return; end if;
  select * into v_product from public.md_pos_products where id=(payload->>'productId')::uuid;
  if not found or v_product.stock_unit not in ('kg','g','ml','pcs','porsi') then raise exception 'Pilih item gram, ml, pcs atau porsi'; end if;
  v_kind:=payload->>'kind';
  if v_kind is null or v_kind not in ('purchase','opening') then raise exception 'Jenis penerimaan tidak valid'; end if;
  if v_kind='purchase' and (v_product.item_type not in ('raw','direct') or not exists(select 1 from public.md_pos_suppliers where id=(payload->>'supplierId')::uuid)) then raise exception 'Pembelian hanya untuk bahan pembelian / produk jual langsung dan wajib supplier'; end if;
  if v_kind='opening' and coalesce(length(btrim(payload->>'note')),0)=0 then raise exception 'Catatan stok awal wajib'; end if;
  v_qty:=public.pos_unit_qty(payload->>'qty',v_product.stock_unit);
  insert into public.md_pos_unit_lots(id,product_id,store_id,unit,received_qty,qty,received_date,expiry,kind,supplier_id,note,created_by)
   values(v_id,v_product.id,(payload->>'storeId')::uuid,v_product.stock_unit,v_qty,v_qty,(payload->>'date')::date,nullif(payload->>'expiry','')::date,v_kind,case when v_kind='purchase' then (payload->>'supplierId')::uuid end,left(coalesce(payload->>'note',''),300),auth.uid());
 elsif action='produce' then
  if exists(select 1 from public.md_pos_productions where id=v_id) then return; end if;
  v_store:=(payload->>'storeId')::uuid;v_date:=(payload->>'date')::date;v_expiry:=nullif(payload->>'expiry','')::date;
  if v_date is null or not exists(select 1 from public.md_pos_stores where id=v_store) then raise exception 'Tanggal/store tidak valid'; end if;
  select * into v_recipe from public.md_pos_recipes where id=(payload->>'recipeId')::uuid for update;
  if not found or v_recipe.version is distinct from (payload->>'recipeVersion')::integer then raise exception 'Resep berubah / tidak ditemukan. Muat ulang'; end if;
  v_batches:=public.pos_positive(payload->>'batches');
  if v_batches<>trunc(v_batches) or v_batches>10000 then raise exception 'Jumlah resep harus 1–10.000 kali'; end if;
  select * into v_output from public.md_pos_products where id=v_recipe.output_id;
  v_expected:=public.pos_unit_qty((v_recipe.yield_qty*v_batches)::text,v_output.stock_unit);
  v_actual:=public.pos_unit_qty(payload->>'actualQty',v_output.stock_unit);
  if not exists(select 1 from public.md_pos_recipe_items where recipe_id=v_recipe.id) then raise exception 'Resep belum memiliki bahan'; end if;
  for v_line in select jsonb_build_object('productId',i.product_id,'qty',i.qty,'name',p.name,'unit',p.stock_unit) from public.md_pos_recipe_items i join public.md_pos_products p on p.id=i.product_id where i.recipe_id=v_recipe.id order by i.product_id loop
   v_needed:=public.pos_unit_qty(((v_line->>'qty')::numeric*v_batches)::text,v_line->>'unit');
   v_ingredients:=v_ingredients||jsonb_build_array(v_line||jsonb_build_object('qty',v_needed));
   for v_lot in select * from public.md_pos_unit_lots where product_id=(v_line->>'productId')::uuid and store_id=v_store and received_date<=v_date and (expiry is null or expiry>=v_date) and qty>0 order by received_date,id for update loop
    v_take:=least(v_needed,v_lot.qty);
    update public.md_pos_unit_lots set qty=qty-v_take where id=v_lot.id;
    v_used:=v_used||jsonb_build_array(jsonb_build_object('lotId',v_lot.id,'productId',v_lot.product_id,'name',v_line->>'name','unit',v_lot.unit,'qty',v_take));
    v_needed:=v_needed-v_take;exit when v_needed=0;
   end loop;
   if v_needed>0 then raise exception 'Stok tidak cukup: %',v_line->>'name'; end if;
  end loop;
  insert into public.md_pos_unit_lots(id,product_id,store_id,unit,received_qty,qty,received_date,expiry,kind,note,created_by)
   values(v_id,v_output.id,v_store,v_output.stock_unit,v_actual,v_actual,v_date,v_expiry,'production',left(coalesce(payload->>'note',''),300),auth.uid());
  insert into public.md_pos_productions(id,store_id,recipe_id,output_id,production_date,snapshot,created_by)
   values(v_id,v_store,v_recipe.id,v_output.id,v_date,jsonb_build_object('recipeVersion',v_recipe.version,'recipeName',v_recipe.name,'outputName',v_output.name,'unit',v_output.stock_unit,'batches',v_batches,'expectedQty',v_expected,'actualQty',v_actual,'ingredients',v_ingredients,'used',v_used,'note',left(coalesce(payload->>'note',''),300)),auth.uid());
 elsif action='production_void' then
  select * into v_run from public.md_pos_productions where id=(payload->>'productionId')::uuid for update;
  if not found then raise exception 'Produksi tidak ditemukan'; end if;
  if v_run.voided then return; end if;
  if coalesce(length(btrim(payload->>'reason')),0)=0 then raise exception 'Alasan pembatalan wajib'; end if;
  select * into v_lot from public.md_pos_unit_lots where id=v_run.id for update;
  if v_lot.qty<>v_lot.received_qty then raise exception 'Hasil sudah digunakan; produksi tidak bisa dibatalkan'; end if;
  update public.md_pos_unit_lots set qty=0 where id=v_run.id;
  for v_line in select value from jsonb_array_elements(v_run.snapshot->'used') loop
   update public.md_pos_unit_lots set qty=qty+(v_line->>'qty')::numeric where id=(v_line->>'lotId')::uuid;
  end loop;
  update public.md_pos_productions set voided=true,void_reason=left(btrim(payload->>'reason'),300),voided_by=auth.uid(),voided_at=now() where id=v_run.id;
 else raise exception 'Aksi produksi tidak valid'; end if;
end $$;

create or replace function public.pos_save_product_details(payload jsonb) returns void language plpgsql set search_path='' as $$
declare
 v_variant text:=btrim(coalesce(payload->>'variant',''));v_barcode text:=btrim(coalesce(payload->>'barcode',''));
 v_price numeric;v_photo text:=coalesce(payload->>'photo','');v_bytes bytea;
begin
 if length(v_variant)>100 or length(v_barcode)>80 then raise exception 'Variant maksimal 100 karakter dan barcode maksimal 80 karakter'; end if;
 if nullif(payload->>'buyPrice','') is not null then
  v_price:=(payload->>'buyPrice')::numeric;
  if v_price<0 or v_price>1000000000000 or v_price::text in ('NaN','Infinity','-Infinity') then raise exception 'Harga beli harus 0–1 triliun'; end if;
 end if;
 if v_photo<>'' then
  if length(v_photo)>2796240 or v_photo !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$' then raise exception 'Foto harus JPG, PNG, WebP maksimal 2 MB'; end if;
  v_bytes:=decode(split_part(v_photo,',',2),'base64');
  if octet_length(v_bytes)>2097152 then raise exception 'Foto maksimal 2 MB'; end if;
  if not ((v_photo like 'data:image/jpeg;%' and encode(substring(v_bytes from 1 for 3),'hex')='ffd8ff') or
   (v_photo like 'data:image/png;%' and encode(substring(v_bytes from 1 for 8),'hex')='89504e470d0a1a0a') or
   (v_photo like 'data:image/webp;%' and encode(substring(v_bytes from 1 for 4),'hex')='52494646' and encode(substring(v_bytes from 9 for 4),'hex')='57454250')) then raise exception 'Isi foto tidak sesuai format'; end if;
 end if;
 update public.md_pos_products set variant=v_variant,barcode=v_barcode,buy_price=v_price,photo=v_photo where id=(payload->>'id')::uuid;
end $$;

create or replace function public.pos_adjust_product_stock(payload jsonb) returns void language plpgsql set search_path='' as $$
declare
 a jsonb:=payload->'stock';v_id uuid;v_product uuid:=(payload->>'id')::uuid;v_store uuid;
 v_unit text;v_dual boolean;v_reason text;v_date date:=(now() at time zone 'Asia/Jakarta')::date;
 v_before jsonb;v_target jsonb:='{}';v_key text;v_keys text[];v_n numeric;v_old numeric;
 v_kg numeric;v_pieces numeric;v_qty numeric;v_remaining numeric;v_take numeric;v_addkg numeric;v_addpieces numeric;
 v_lot record;v_changes jsonb:='[]';v_supplier uuid;
begin
 if a is null or a='null'::jsonb then return; end if;
 v_id:=(a->>'id')::uuid;v_store:=(a->>'storeId')::uuid;v_reason:=btrim(a->>'reason');
 if v_id is null then raise exception 'ID penyesuaian wajib'; end if;
 if exists(select 1 from public.md_pos_stock_adjustments where id=v_id) then return; end if;
 if not exists(select 1 from public.md_pos_stores where id=v_store) then raise exception 'Pilih store untuk penyesuaian'; end if;
 if v_reason is null or length(v_reason) not between 1 and 300 then raise exception 'Alasan penyesuaian wajib, maksimal 300 karakter'; end if;
 select stock_unit into v_unit from public.md_pos_products where id=v_product;
 v_dual:=v_unit='kg_butir';
 if v_dual then
  select coalesce(sum(kg),0),coalesce(sum(pieces),0) into v_kg,v_pieces from public.md_pos_lots where product_id=v_product and store_id=v_store;
  v_before:=jsonb_build_object('kg',v_kg,'pieces',v_pieces);v_keys:=array['kg','pieces'];
 else
  select coalesce(sum(qty),0) into v_qty from public.md_pos_unit_lots where product_id=v_product and store_id=v_store;
  v_before:=jsonb_build_object('qty',v_qty);v_keys:=array['qty'];
 end if;
 foreach v_key in array v_keys loop
  if coalesce(a->'target'->>v_key,'') !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Stok harus nonnegatif'; end if;
  v_n:=(a->'target'->>v_key)::numeric;
  if v_n>1000000000 or v_n<>round(v_n,6) or ((v_key='pieces' or (not v_dual and v_unit in ('pcs','porsi'))) and v_n<>trunc(v_n)) then raise exception 'Stok maksimal 6 desimal; pcs/porsi/butir harus bulat'; end if;
  if (a->'expected'->>v_key)::numeric is distinct from (v_before->>v_key)::numeric then raise exception 'Stok berubah. Tutup form dan muat ulang sebelum menyesuaikan'; end if;
  v_target:=v_target||jsonb_build_object(v_key,v_n);
 end loop;
 if v_before=v_target then return; end if;
 if v_dual then
  v_addkg:=greatest(0,(v_target->>'kg')::numeric-v_kg);v_addpieces:=greatest(0,(v_target->>'pieces')::numeric-v_pieces);
  if v_addkg>0 or v_addpieces>0 then
   v_supplier:=nullif(a->>'supplierId','')::uuid;
   if not exists(select 1 from public.md_pos_suppliers where id=v_supplier) then raise exception 'Supplier wajib untuk penambahan stok durian'; end if;
  end if;
  foreach v_key in array v_keys loop
   v_remaining:=greatest(0,(v_before->>v_key)::numeric-(v_target->>v_key)::numeric);
   for v_lot in select * from public.md_pos_lots where product_id=v_product and store_id=v_store order by received_date,id for update loop
    exit when v_remaining=0;
    v_take:=least(v_remaining,case when v_key='kg' then v_lot.kg else v_lot.pieces end);
    if v_take>0 then
     if v_key='kg' then update public.md_pos_lots set kg=kg-v_take where id=v_lot.id;
     else update public.md_pos_lots set pieces=pieces-v_take::integer where id=v_lot.id; end if;
     v_changes:=v_changes||jsonb_build_array(jsonb_build_object('lotId',v_lot.id,'key',v_key,'delta',-v_take));v_remaining:=v_remaining-v_take;
    end if;
   end loop;
  end loop;
  if v_addkg>0 or v_addpieces>0 then
   insert into public.md_pos_lots(id,product_id,store_id,supplier_id,received_date,received_kg,received_pieces,kg,pieces,is_adjustment,note,created_by)
   values(v_id,v_product,v_store,v_supplier,v_date,v_addkg,v_addpieces::integer,v_addkg,v_addpieces::integer,true,'Penyesuaian: '||v_reason,auth.uid());
   v_changes:=v_changes||jsonb_build_array(jsonb_build_object('lotId',v_id,'kg',v_addkg,'pieces',v_addpieces));
  end if;
 else
  v_n:=(v_target->>'qty')::numeric;
  if v_n>v_qty then
   insert into public.md_pos_unit_lots(id,product_id,store_id,unit,received_qty,qty,received_date,kind,note,created_by)
   values(v_id,v_product,v_store,v_unit,v_n-v_qty,v_n-v_qty,v_date,'opening','Penyesuaian: '||v_reason,auth.uid());
   v_changes:=jsonb_build_array(jsonb_build_object('lotId',v_id,'qty',v_n-v_qty));
  else
   v_remaining:=v_qty-v_n;
   for v_lot in select * from public.md_pos_unit_lots where product_id=v_product and store_id=v_store order by received_date,id for update loop
    exit when v_remaining=0;v_take:=least(v_remaining,v_lot.qty);
    if v_take>0 then
     update public.md_pos_unit_lots set qty=qty-v_take where id=v_lot.id;
     v_changes:=v_changes||jsonb_build_array(jsonb_build_object('lotId',v_lot.id,'key','qty','delta',-v_take));v_remaining:=v_remaining-v_take;
    end if;
   end loop;
  end if;
 end if;
 insert into public.md_pos_stock_adjustments(id,product_id,store_id,adjustment_date,reason,before_qty,after_qty,changes,created_by)
 values(v_id,v_product,v_store,v_date,v_reason,v_before,v_target,v_changes,auth.uid());
end $$;

create or replace function public.pos_delete_product(payload jsonb) returns void language plpgsql set search_path='' as $$
declare v_id uuid:=(payload->>'id')::uuid;
begin
 if payload->'confirmed' is distinct from 'true'::jsonb then raise exception 'Konfirmasi penghapusan diperlukan'; end if;
 if exists(select 1 from public.md_pos_lots where product_id=v_id) or exists(select 1 from public.md_pos_unit_lots where product_id=v_id)
 or exists(select 1 from public.md_pos_recipes where output_id=v_id) or exists(select 1 from public.md_pos_recipe_items where product_id=v_id)
 or exists(select 1 from public.md_pos_sale_items where product_id=v_id) or exists(select 1 from public.md_pos_stock_adjustments where product_id=v_id)
 then raise exception 'Produk sudah digunakan dalam stok, transaksi, atau resep sehingga tidak dapat dihapus'; end if;
 delete from public.md_pos_products where id=v_id;
end $$;

create or replace function public.pos_waste_action(action text,payload jsonb) returns void language plpgsql set search_path='' as $$
declare
 v_evidence jsonb;v_processor text;v_id uuid:=(payload->>'id')::uuid;v_store uuid;v_date date;v_received date;v_kg numeric;v_pieces numeric;v_reason text;
 v_source public.md_pos_lots%rowtype;v_product public.md_pos_products%rowtype;v_output public.md_pos_products%rowtype;
 v_run public.md_pos_waste_runs%rowtype;v_lot public.md_pos_unit_lots%rowtype;
 v_spec record;v_line jsonb;v_qty numeric;v_weight numeric;v_total numeric:=0;v_outputs jsonb:='[]';v_seen uuid[]:='{}';v_lot_ids uuid[]:='{}';v_lot_id uuid;v_expiry date;
begin
 if action='waste_process' then
  if exists(select 1 from public.md_pos_waste_runs where id=v_id) then return; end if;
  v_evidence:=jsonb_build_object('reject',public.pos_waste_photo(payload->'evidence'->>'reject'),'processed',public.pos_waste_photo(payload->'evidence'->>'processed'),'durpas500',public.pos_waste_photo(payload->'evidence'->>'durpas500'),'durpas1000',public.pos_waste_photo(payload->'evidence'->>'durpas1000'),'coral',public.pos_waste_photo(payload->'evidence'->>'coral'));
  v_store:=(payload->>'storeId')::uuid;v_date:=(payload->>'date')::date;v_received:=(payload->>'receivedDate')::date;v_reason:=btrim(payload->>'reason');v_processor:=btrim(payload->>'processedBy');
  if v_date is null or v_received is null or v_date<v_received or v_date>(now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal waste harus sejak barang masuk sampai hari ini'; end if;
  if v_reason is null or length(v_reason) not between 1 and 300 then raise exception 'Alasan waste wajib, maksimal 300 karakter'; end if;
  if v_processor is null or length(v_processor) not between 1 and 100 then raise exception 'Nama pengolah wajib, maksimal 100 karakter'; end if;
  if public.pos_waste_photo(payload->'evidence'->>'reject')='' then raise exception 'Foto reject sebelum diolah wajib diupload'; end if;
  select * into v_source from public.md_pos_lots where id=(payload->>'sourceLotId')::uuid and store_id=v_store and received_date=v_received for update;
  if not found then raise exception 'Pilih batch sesuai tanggal barang masuk dan store'; end if;
  select * into v_product from public.md_pos_products where id=v_source.product_id;
  if v_product.item_type<>'direct' or v_product.stock_unit<>'kg_butir' then raise exception 'Pilih durian utuh'; end if;
  v_kg:=public.pos_unit_qty(payload->>'kg','kg');v_pieces:=public.pos_unit_qty(payload->>'pieces','pcs');
  if v_kg>v_source.kg or v_pieces>v_source.pieces then raise exception 'Stok batch tidak cukup. Perbarui stok'; end if;
  if jsonb_typeof(payload->'outputs') is distinct from 'array' then raise exception 'Isi tiga jenis hasil olahan'; end if;
  if jsonb_array_length(payload->'outputs')<>3 then raise exception 'Isi tiga jenis hasil olahan'; end if;
  for v_spec in select * from (values ('durpas500','Durpas 500 gr','pcs',0.5::numeric),('durpas1000','Durpas 1 kg','pcs',1::numeric),('coral','Coral','kg',1::numeric)) as t(key,label,unit,weight) loop
   if (select count(*) from jsonb_array_elements(payload->'outputs') x where x->>'key'=v_spec.key)<>1 then raise exception 'Jenis hasil tidak lengkap / duplikat'; end if;
   select x into v_line from jsonb_array_elements(payload->'outputs') x where x->>'key'=v_spec.key;
   if coalesce(v_line->>'qty','') !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Jumlah hasil harus nonnegatif'; end if;
   if (v_line->>'qty')::numeric=0 then continue; end if;
   if public.pos_waste_photo(payload->'evidence'->>v_spec.key)='' then raise exception 'Bukti foto wajib untuk %',v_spec.label; end if;
   v_qty:=public.pos_unit_qty(v_line->>'qty',v_spec.unit);
   select * into v_output from public.md_pos_products where id=(v_line->>'productId')::uuid;
   if not found or v_output.item_type not in ('direct','finished') or v_output.stock_unit<>v_spec.unit or v_output.id=any(v_seen) then raise exception 'Pilih produk hasil berbeda dengan satuan % untuk %',v_spec.unit,v_spec.label; end if;
   v_seen:=array_append(v_seen,v_output.id);v_lot_id:=(v_line->>'lotId')::uuid;v_expiry:=nullif(v_line->>'expiry','')::date;
   if v_lot_id is null or v_lot_id=any(v_lot_ids) or exists(select 1 from public.md_pos_unit_lots where id=v_lot_id) then raise exception 'ID batch hasil tidak valid'; end if;
   if v_expiry<v_date then raise exception 'Kedaluwarsa hasil sebelum tanggal waste'; end if;
   v_lot_ids:=array_append(v_lot_ids,v_lot_id);v_weight:=v_qty*v_spec.weight;v_total:=v_total+v_weight;
   v_outputs:=v_outputs||jsonb_build_array(jsonb_build_object('key',v_spec.key,'label',v_spec.label,'productId',v_output.id,'name',v_output.name,'unit',v_spec.unit,'qty',v_qty,'weightKg',v_weight,'lotId',v_lot_id,'expiry',v_expiry));
  end loop;
  if v_total>v_kg then raise exception 'Berat total hasil olahan melebihi berat durian yang diolah'; end if;
  update public.md_pos_lots set kg=kg-v_kg,pieces=pieces-v_pieces::integer where id=v_source.id;
  for v_line in select * from jsonb_array_elements(v_outputs) loop
   insert into public.md_pos_unit_lots(id,product_id,store_id,unit,received_qty,qty,received_date,expiry,kind,supplier_id,note,created_by)
   values((v_line->>'lotId')::uuid,(v_line->>'productId')::uuid,v_store,v_line->>'unit',(v_line->>'qty')::numeric,(v_line->>'qty')::numeric,v_date,nullif(v_line->>'expiry','')::date,'waste',v_source.supplier_id,'Hasil waste '||v_id::text,auth.uid());
  end loop;
  insert into public.md_pos_waste_runs(id,store_id,source_lot_id,waste_date,snapshot,created_by) values(v_id,v_store,v_source.id,v_date,
   jsonb_build_object('sourceProductId',v_product.id,'sourceName',v_product.name,'supplierId',v_source.supplier_id,'supplierName',(select name from public.md_pos_suppliers where id=v_source.supplier_id),'receivedDate',v_received,'kg',v_kg,'pieces',v_pieces,'outputKg',v_total,'lossKg',v_kg-v_total,'outputs',v_outputs,'reason',v_reason,'processedBy',v_processor,'evidence',v_evidence),auth.uid());
 elsif action='waste_void' then
  select * into v_run from public.md_pos_waste_runs where id=(payload->>'wasteId')::uuid for update;
  if not found then raise exception 'Pencatatan waste tidak ditemukan'; end if;
  if v_run.voided then return; end if;
  v_reason:=btrim(payload->>'reason');if v_reason is null or length(v_reason) not between 1 and 300 then raise exception 'Alasan hapus wajib, maksimal 300 karakter'; end if;
  for v_line in select * from jsonb_array_elements(v_run.snapshot->'outputs') loop
   select * into v_lot from public.md_pos_unit_lots where id=(v_line->>'lotId')::uuid for update;
   if not found or v_lot.qty<>(v_line->>'qty')::numeric then raise exception 'Hasil olahan sudah dipakai atau stoknya berubah. Waste tidak dapat dihapus'; end if;
  end loop;
  for v_line in select * from jsonb_array_elements(v_run.snapshot->'outputs') loop
   update public.md_pos_unit_lots set qty=0 where id=(v_line->>'lotId')::uuid;
  end loop;
  update public.md_pos_lots set kg=kg+(v_run.snapshot->>'kg')::numeric,pieces=pieces+(v_run.snapshot->>'pieces')::integer where id=v_run.source_lot_id;
  if not found then raise exception 'Batch asal tidak ditemukan'; end if;
  update public.md_pos_waste_runs set voided=true,void_reason=v_reason,voided_at=now(),voided_by=auth.uid() where id=v_run.id;
 else raise exception 'Aksi waste tidak valid'; end if;
end $$;

create or replace function public.pos_waste_photo(value text) returns text language plpgsql set search_path='' as $$
declare v_photo text:=coalesce(value,'');v_bytes bytea;
begin
 if v_photo='' then return ''; end if;
 if length(v_photo)>2796240 or v_photo !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$' then raise exception 'Foto bukti harus JPG, PNG, WebP maksimal 2 MB'; end if;
 v_bytes:=decode(split_part(v_photo,',',2),'base64');
 if octet_length(v_bytes)>2097152 then raise exception 'Foto bukti maksimal 2 MB'; end if;
 if not ((v_photo like 'data:image/jpeg;%' and encode(substring(v_bytes from 1 for 3),'hex')='ffd8ff') or
 (v_photo like 'data:image/png;%' and encode(substring(v_bytes from 1 for 8),'hex')='89504e470d0a1a0a') or
 (v_photo like 'data:image/webp;%' and encode(substring(v_bytes from 1 for 4),'hex')='52494646' and encode(substring(v_bytes from 9 for 4),'hex')='57454250')) then raise exception 'Isi foto bukti tidak sesuai format'; end if;
 return v_photo;
end $$;

create or replace function public.pos_waste_evidence(waste_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.md_pos_staff where user_id=auth.uid()) then raise exception 'Akun tidak memiliki akses POS'; end if;
 select coalesce(snapshot->'evidence','{}'::jsonb) into result from public.md_pos_waste_runs where id=waste_id;
 if not found then raise exception 'Pencatatan waste tidak ditemukan'; end if;
 return result;
end $$;
revoke all on function public.pos_positive(text) from public,anon,authenticated;
revoke all on function public.pos_read(),public.pos_mutate(text,jsonb) from public,anon;
grant execute on function public.pos_read(),public.pos_mutate(text,jsonb) to authenticated;
revoke all on function public.pos_save_product(jsonb,boolean) from public,anon,authenticated;
revoke all on function public.pos_unit_qty(text,text) from public,anon,authenticated;
revoke all on function public.pos_production_action(text,jsonb) from public,anon,authenticated;
revoke all on function public.pos_save_product_details(jsonb) from public,anon,authenticated;
revoke all on function public.pos_adjust_product_stock(jsonb) from public,anon,authenticated;
revoke all on function public.pos_delete_product(jsonb) from public,anon,authenticated;
revoke all on function public.pos_waste_action(text,jsonb) from public,anon,authenticated;
revoke all on function public.pos_waste_photo(text) from public,anon,authenticated;
revoke all on function public.pos_waste_evidence(uuid) from public,anon;
grant execute on function public.pos_waste_evidence(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;

-- Bagian detail produk dan penyesuaian stok.
begin;
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
revoke all on function public.pos_save_product_details(jsonb) from public,anon,authenticated;

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
revoke all on function public.pos_adjust_product_stock(jsonb) from public,anon,authenticated;

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
revoke all on function public.pos_delete_product(jsonb) from public,anon,authenticated;

create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.md_pos_staff where user_id=auth.uid()) then raise exception 'Akun tidak memiliki akses POS'; end if;
 return jsonb_build_object(
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
   insert into public.md_pos_lots(id,store_id,supplier_id,product_id,received_date,received_kg,received_pieces,kg,pieces,source_lot_id,note,created_by) values(v_id,v_to,v_lot.supplier_id,v_lot.product_id,v_lot.received_date,v_kg,v_pieces::integer,v_kg,v_pieces::integer,v_lot.id,left(payload->>'note',300),auth.uid());
  end if;
  insert into public.md_pos_movements(id,lot_id,store_id,to_store_id,supplier_id,product_id,movement_date,kind,kg,pieces,note,created_by) values(v_id,v_lot.id,v_lot.store_id,v_to,v_lot.supplier_id,v_lot.product_id,v_date,v_kind,v_kg,v_pieces::integer,left(payload->>'note',300),auth.uid());
  update public.md_pos_lots set kg=kg-v_kg,pieces=pieces-v_pieces::integer where id=v_lot.id;
 else raise exception 'Aksi tidak dikenal';
 end if;
 return public.pos_read();
end $$;
revoke all on function public.pos_read(),public.pos_mutate(text,jsonb) from public,anon;
grant execute on function public.pos_read(),public.pos_mutate(text,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;

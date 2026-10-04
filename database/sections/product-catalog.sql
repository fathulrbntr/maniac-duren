-- Bagian katalog produk, kategori, satuan, dan harga.
begin;
alter table public.md_pos_stores add column if not exists location text not null default '';
alter table public.md_pos_suppliers add column if not exists phone text not null default '';
alter table public.md_pos_suppliers add column if not exists address text not null default '';
create or replace function public.pos_positive(value text) returns numeric language plpgsql immutable set search_path='' as $$
begin
 if value is null or value !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Angka tidak valid'; end if;
 if value::numeric<=0 then raise exception 'Jumlah harus lebih dari 0'; end if;
 return value::numeric;
end $$;
revoke all on function public.pos_positive(text) from public,anon,authenticated;
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
 if v_type not in ('direct','raw','prep','recipe','finished') or v_unit not in ('kg_butir','g','ml','pcs','porsi') then raise exception 'Jenis item atau satuan tidak valid'; end if;
 if v_type in ('raw','prep') then v_category:=null;
 elsif v_category not in ('Buah','Dessert','Minuman','Olahan Duren') then raise exception 'Kategori jual tidak valid'; end if;
 if v_unit='kg_butir' and (v_type<>'direct' or v_category is distinct from 'Buah') then raise exception 'Kg + butir khusus produk jual langsung kategori Buah'; end if;
 if (v_type='recipe')<>(v_unit='porsi') then raise exception 'Satuan porsi khusus menu resep'; end if;
 if v_unit='kg_butir' then
  v_kg:=public.pos_positive(payload->>'priceKg');v_piece:=public.pos_positive(payload->>'pricePiece');
 elsif v_type not in ('raw','prep') then v_price:=public.pos_positive(payload->>'salePrice'); end if;
 if exists(select 1 from public.md_pos_products where lower(sku)=lower(v_sku) and id<>v_id) then raise exception 'SKU sudah digunakan'; end if;
 if editing then
  select * into v_old from public.md_pos_products where id=v_id for update;
  if not found then raise exception 'Produk tidak ditemukan'; end if;
  if (v_old.item_type<>v_type or v_old.stock_unit<>v_unit) and
     (exists(select 1 from public.md_pos_lots where product_id=v_id) or exists(select 1 from public.md_pos_sale_items where product_id=v_id)) then
   raise exception 'Jenis dan satuan terkunci karena sudah ada riwayat stok/transaksi';
  end if;
  update public.md_pos_products set name=v_name,sku=v_sku,category=v_category,item_type=v_type,stock_unit=v_unit,price_kg=v_kg,price_piece=v_piece,sale_price=v_price where id=v_id;
 else
  insert into public.md_pos_products(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
   values(v_id,v_name,v_sku,v_category,v_type,v_unit,v_kg,v_piece,v_price);
 end if;
end $$;
revoke all on function public.pos_save_product(jsonb,boolean) from public,anon,authenticated;

create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.md_pos_staff where user_id=auth.uid()) then raise exception 'Akun tidak memiliki akses POS'; end if;
 return jsonb_build_object(
 'stores',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'location',location) order by name) from public.md_pos_stores),'[]'::jsonb),
 'suppliers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'phone',phone,'address',address) order by name) from public.md_pos_suppliers),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'sku',sku,'priceKg',price_kg,'pricePiece',price_piece,'category',category,'itemType',item_type,'stockUnit',stock_unit,'salePrice',sale_price) order by name) from public.md_pos_products),'[]'::jsonb),
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

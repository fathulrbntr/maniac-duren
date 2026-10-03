-- Jalankan sekali untuk memperbarui POS yang sudah terpasang. Aman dijalankan ulang.
begin;
alter table public.md_pos_stores add column if not exists location text not null default '';
alter table public.md_pos_suppliers add column if not exists phone text not null default '';
alter table public.md_pos_suppliers add column if not exists address text not null default '';
create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.md_pos_staff where user_id=auth.uid()) then raise exception 'Akun tidak memiliki akses POS'; end if;
 return jsonb_build_object(
 'stores',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'location',location) order by name) from public.md_pos_stores),'[]'::jsonb),
 'suppliers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'phone',phone,'address',address) order by name) from public.md_pos_suppliers),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'sku',sku,'priceKg',price_kg,'pricePiece',price_piece) order by name) from public.md_pos_products),'[]'::jsonb),
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
    if coalesce(length(btrim(payload->>'sku')),0) not between 1 and 40 then raise exception 'SKU wajib, maksimal 40 karakter'; end if;
    insert into public.md_pos_products values(v_id,btrim(payload->>'sku'),v_name,public.pos_positive(payload->>'priceKg'),public.pos_positive(payload->>'pricePiece')) on conflict(id) do nothing;
   else raise exception 'Master tidak valid';
  end case;
 elsif action='master_details' then
  case payload->>'kind'
   when 'stores' then update public.md_pos_stores set location=btrim(coalesce(payload->>'location','')) where id=v_id;
   when 'suppliers' then update public.md_pos_suppliers set phone=btrim(coalesce(payload->>'phone','')),address=btrim(coalesce(payload->>'address','')) where id=v_id;
   else raise exception 'Jenis master tidak valid';
  end case;
  if not found then raise exception 'Master tidak ditemukan'; end if;
 elsif action='receipt' then
  if exists(select 1 from public.md_pos_lots where id=v_id) then return public.pos_read(); end if;
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

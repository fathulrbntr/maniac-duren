-- Bagian bukti foto dan riwayat waste.
begin;
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
revoke all on function public.pos_waste_photo(text) from public,anon,authenticated;

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
revoke all on function public.pos_save_product(jsonb,boolean) from public,anon,authenticated;
create or replace function public.pos_waste_action(action text,payload jsonb) returns void language plpgsql set search_path='' as $$
declare
 v_evidence jsonb;v_id uuid:=(payload->>'id')::uuid;v_store uuid;v_date date;v_received date;v_kg numeric;v_pieces numeric;v_reason text;
 v_source public.md_pos_lots%rowtype;v_product public.md_pos_products%rowtype;v_output public.md_pos_products%rowtype;
 v_run public.md_pos_waste_runs%rowtype;v_lot public.md_pos_unit_lots%rowtype;
 v_spec record;v_line jsonb;v_qty numeric;v_weight numeric;v_total numeric:=0;v_outputs jsonb:='[]';v_seen uuid[]:='{}';v_lot_ids uuid[]:='{}';v_lot_id uuid;v_expiry date;
begin
 if action='waste_process' then
  if exists(select 1 from public.md_pos_waste_runs where id=v_id) then return; end if;
  v_evidence:=jsonb_build_object('reject',public.pos_waste_photo(payload->'evidence'->>'reject'),'processed',public.pos_waste_photo(payload->'evidence'->>'processed'));
  v_store:=(payload->>'storeId')::uuid;v_date:=(payload->>'date')::date;v_received:=(payload->>'receivedDate')::date;v_reason:=btrim(payload->>'reason');
  if v_date is null or v_received is null or v_date<v_received or v_date>(now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal waste harus sejak barang masuk sampai hari ini'; end if;
  if v_reason is null or length(v_reason) not between 1 and 300 then raise exception 'Alasan waste wajib, maksimal 300 karakter'; end if;
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
   jsonb_build_object('sourceProductId',v_product.id,'sourceName',v_product.name,'supplierId',v_source.supplier_id,'supplierName',(select name from public.md_pos_suppliers where id=v_source.supplier_id),'receivedDate',v_received,'kg',v_kg,'pieces',v_pieces,'outputKg',v_total,'lossKg',v_kg-v_total,'outputs',v_outputs,'reason',v_reason,'evidence',v_evidence),auth.uid());
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
revoke all on function public.pos_waste_action(text,jsonb) from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;

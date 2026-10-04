-- Update 08: bukti foto per hasil olahan dan nama pengolah.
begin;
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
end $$;revoke all on function public.pos_waste_action(text,jsonb) from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;

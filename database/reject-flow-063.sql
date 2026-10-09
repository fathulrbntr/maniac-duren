-- PATCH 063: jalur reject, olah Coral aktual, waste, dan jejak batch.
-- Jalankan seluruh file setelah patch 043 (hubungan durian) dan 054 (kasir).
-- Tidak mereset data; aman dijalankan ulang. Foto tidak ikut pembacaan login.
begin;
set local lock_timeout='5s';
select pg_catalog.pg_advisory_xact_lock(71031,1102);
do $$begin
 if to_regprocedure('public.pos_cashier_mutate(text,jsonb)') is null or to_regprocedure('public.pos_waste_output_product(uuid,text)') is null then
  raise exception 'Pasang patch hubungan durian 043 dan kontrol kasir 054 terlebih dahulu';end if;
 if to_regprocedure('public.pos_read_before_063()') is null then alter function public.pos_read() rename to pos_read_before_063;end if;
 if to_regprocedure('public.pos_mutate_before_063(text,jsonb)') is null then alter function public.pos_mutate(text,jsonb) rename to pos_mutate_before_063;end if;
 if to_regprocedure('public.pos_mutate_027_before_063(text,jsonb)') is null then alter function public.pos_mutate_027(text,jsonb) rename to pos_mutate_027_before_063;end if;
end$$;
revoke all on function public.pos_read_before_063(),public.pos_mutate_before_063(text,jsonb),public.pos_mutate_027_before_063(text,jsonb) from public,anon,authenticated;
create table if not exists public.md_pos_reject_records(
 id uuid primary key references public.md_pos_events(id),store_id uuid not null references public.md_pos_stores(id),
 business_date date not null,kind text not null check(kind in ('mark','direct','process','coral','loss')),
 source_lot_id uuid not null,doc jsonb not null,evidence jsonb not null default '{}',
 voided boolean not null default false,void_reason text,void_event_id uuid references public.md_pos_events(id),created_at timestamptz not null default now());
create index if not exists md_pos_reject_records_store on public.md_pos_reject_records(store_id,business_date,id);
create index if not exists md_pos_reject_records_source on public.md_pos_reject_records(source_lot_id);
create index if not exists md_pos_batch_open_orders on public.md_pos_order_runs(store_id) where status in ('queued','preparing','ready');
alter table public.md_pos_reject_records enable row level security;
revoke all on public.md_pos_reject_records from public,anon,authenticated;

-- Jurnal spesifik lot: tidak memindai seluruh stok untuk tiap transaksi.
create or replace function public.pos_reject_log(event uuid,lot uuid,amount numeric,butir numeric default 0)
returns void language sql set search_path='' as $$
 insert into public.md_pos_stock_journal(event_id,lot_id,product_id,store_id,supplier_id,qty,pieces,unit,cost,quality)
 select event,id,product_id,store_id,supplier_id,amount,butir,'kg',amount*unit_cost,quality from public.md_pos_lots where id=lot
 union all select event,id,product_id,store_id,supplier_id,amount,0,unit,amount*unit_cost,null from public.md_pos_unit_lots where id=lot
$$;

create or replace function public.pos_reject_mutate(action text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
 me public.md_pos_employees%rowtype;prior public.md_pos_events%rowtype;r public.md_pos_reject_records%rowtype;
 fruit public.md_pos_lots%rowtype;source_fruit public.md_pos_lots%rowtype;u public.md_pos_unit_lots%rowtype;p public.md_pos_products%rowtype;outp public.md_pos_products%rowtype;
 eid uuid:=(payload->>'id')::uuid;st uuid:=(payload->>'storeId')::uuid;source uuid:=(payload->>'sourceLotId')::uuid;newlot uuid;outlot uuid;
 dt date:=(payload->>'date')::date;nowdate date:=(now() at time zone 'Asia/Jakarta')::date;
 kg numeric;pieces numeric;qty numeric;net numeric;input_cost numeric;weight numeric;reason text:=btrim(payload->>'reason');cause text:=payload->>'cause';
 doc jsonb:='{}';proof jsonb:='{}';work jsonb;line jsonb;kind text;instant boolean:=coalesce((payload->>'processNow')::boolean,false);delta record;
begin
 select * into me from public.md_pos_employees where user_id=auth.uid() and active;
 if not found then raise exception 'Akun tidak memiliki akses POS';end if;
 if eid is null or st is null or dt is null or dt>nowdate then raise exception 'ID, outlet, dan tanggal sampai hari ini wajib';end if;
 perform public.pos_require(case when action='reject_void' then 'cancel' else 'waste' end,st);
 if action not in ('reject_mark','reject_process','reject_coral','reject_loss','reject_void') then raise exception 'Aksi reject tidak dikenal';end if;
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 select * into prior from public.md_pos_events where id=eid;
 if found then
  if prior.action<>action or prior.actor is distinct from auth.uid() or prior.details->>'requestHash' is distinct from md5(payload::text) then raise exception 'ID pengiriman sudah digunakan untuk data lain';end if;
  return public.pos_read();
 end if;
 if reason is null or length(reason) not between 3 and 300 then raise exception 'Alasan wajib, 3–300 karakter';end if;
 if action='reject_void' then
  select * into r from public.md_pos_reject_records where id=(payload->>'recordId')::uuid and store_id=st for update;
  if not found or r.voided then raise exception 'Pencatatan tidak ditemukan atau sudah dibatalkan';end if;
  if dt<r.business_date then raise exception 'Tanggal pembatalan sebelum pencatatan';end if;
  insert into public.md_pos_events(id,action,store_id,actor,employee_id,business_date,payload,details)
   values(eid,action,st,auth.uid(),me.id,dt,payload-'evidence',jsonb_build_object('requestHash',md5(payload::text)));
  -- Periksa semua hasil sebelum memulihkan input; proses langsung memiliki lot perantara bernilai neto nol.
  for delta in select lot_id,sum(j.qty) qty,sum(j.pieces) pieces from public.md_pos_stock_journal j where event_id=r.id group by lot_id having sum(j.qty)>0 loop
   select * into fruit from public.md_pos_lots where id=delta.lot_id for update;
   if found then
    if fruit.kg<>delta.qty or fruit.pieces<>delta.pieces then raise exception 'Hasil sudah dipakai atau stok berubah; batalkan proses turunannya lebih dahulu';end if;
   else
    select * into u from public.md_pos_unit_lots where id=delta.lot_id for update;
    if not found or u.qty<>delta.qty then raise exception 'Hasil sudah dipakai atau stok berubah; batalkan proses turunannya lebih dahulu';end if;
   end if;
  end loop;
  for delta in select lot_id,sum(j.qty) qty,sum(j.pieces) pieces from public.md_pos_stock_journal j where event_id=r.id group by lot_id having sum(j.qty)<>0 or sum(j.pieces)<>0 loop
   update public.md_pos_lots set kg=md_pos_lots.kg-delta.qty,pieces=md_pos_lots.pieces-delta.pieces where id=delta.lot_id;
   if not found then update public.md_pos_unit_lots set qty=md_pos_unit_lots.qty-delta.qty where id=delta.lot_id;end if;
   perform public.pos_reject_log(eid,delta.lot_id,-delta.qty,-delta.pieces);
  end loop;
  update public.md_pos_reject_records set voided=true,void_reason=reason,void_event_id=eid where id=r.id;
  update public.md_pos_waste_runs set voided=true,void_reason=reason,voided_at=now(),voided_by=auth.uid() where id=r.id;
  insert into public.md_pos_money_journal(event_id,store_id,category,revenue,cost,note)
   select eid,st,'loss',-revenue,-cost,'Koreksi waste: '||reason from public.md_pos_money_journal where event_id=r.id and category='loss';
  perform public.pos_check_reserved(st);
  return public.pos_read();
 end if;
 select * into fruit from public.md_pos_lots where id=source and store_id=st for update;
 if found then
  if fruit.received_date>dt then raise exception 'Tanggal sebelum barang masuk';end if;
  if to_jsonb(fruit)->>'cost_finalized'='false' then raise exception 'Selesaikan modal nota sebelum menggunakan batch ini';end if;
  select * into p from public.md_pos_products where id=fruit.product_id;
 else
  select * into u from public.md_pos_unit_lots where id=source and store_id=st for update;
  if not found or u.received_date>dt then raise exception 'Pilih stok pada outlet dan tanggal yang sesuai';end if;
  select * into p from public.md_pos_products where id=u.product_id;
 end if;
 if action in ('reject_mark','reject_process') and (fruit.id is null or p.stock_unit<>'kg_butir') then raise exception 'Pilih batch durian utuh';end if;
 for line in select to_jsonb(k) from unnest(array['reject','durpas500','durpas1000','coral','daging']) k loop
  proof:=proof||jsonb_build_object(line#>>'{}',public.pos_waste_photo(payload->'evidence'->>(line#>>'{}')));
 end loop;
 doc:=jsonb_build_object('sourceName',p.name,'sourceProductId',p.id,'supplierId',coalesce(fruit.supplier_id,u.supplier_id),
  'receivedDate',coalesce(fruit.received_date,u.received_date),'reason',reason,'cause',cause,'processedBy',me.name,'outputs','[]'::jsonb);
 insert into public.md_pos_events(id,action,store_id,actor,employee_id,business_date,payload,details)
  values(eid,action,st,auth.uid(),me.id,dt,payload-'evidence',jsonb_build_object('requestHash',md5(payload::text)));
 if action in ('reject_mark','reject_process') then
  kg:=public.pos_unit_qty(payload->>'kg','kg');pieces:=public.pos_unit_qty(payload->>'pieces','pcs');
  if kg>fruit.kg or pieces>fruit.pieces or ((fruit.kg-kg=0)<>(fruit.pieces-pieces=0)) then raise exception 'Jumlah melebihi stok atau sisa kg dan butir tidak konsisten';end if;
  input_cost:=kg*fruit.unit_cost;
  doc:=doc||jsonb_build_object('kg',kg,'pieces',pieces,'inputCost',input_cost);
  if action='reject_mark' then
   if fruit.quality not in ('ready','unripe') then raise exception 'Buah ini sudah berada di stok reject';end if;
   if cause is null or cause not in ('arrival','taste','overripe','damage','other') then raise exception 'Pilih penyebab reject';end if;
   if proof->>'reject'='' then raise exception 'Foto buah reject wajib';end if;
   newlot:=(payload->>'rejectLotId')::uuid;
   if newlot is null or exists(select 1 from public.md_pos_lots where id=newlot) or exists(select 1 from public.md_pos_unit_lots where id=newlot) then raise exception 'ID stok reject tidak valid';end if;
   source_fruit:=fruit;
   update public.md_pos_lots set kg=md_pos_lots.kg-kg,pieces=md_pos_lots.pieces-pieces where id=fruit.id;
   insert into public.md_pos_lots(id,store_id,supplier_id,product_id,received_date,received_kg,received_pieces,kg,pieces,source_lot_id,quality,unit_cost,note,created_by)
    values(newlot,st,fruit.supplier_id,fruit.product_id,fruit.received_date,kg,pieces,kg,pieces,fruit.id,'reject',fruit.unit_cost,'Reject: '||reason,auth.uid());
   perform public.pos_reject_log(eid,fruit.id,-kg,-pieces);perform public.pos_reject_log(eid,newlot,kg,pieces);
   select * into fruit from public.md_pos_lots where id=newlot;
   doc:=doc||jsonb_build_object('rejectLotId',newlot,'markedKg',kg,'markedPieces',pieces);
   kind:=case when instant then 'direct' else 'mark' end;
  else
   if fruit.quality<>'reject' then raise exception 'Catat buah sebagai reject sebelum diolah';end if;
   kind:='process';
  end if;
  if action='reject_process' or instant then
   if proof->>'reject'='' then
    proof:=jsonb_set(proof,'{reject}',to_jsonb(coalesce((select marked.evidence->>'reject' from public.md_pos_reject_records marked where marked.doc->>'rejectLotId'=fruit.id::text and not marked.voided order by marked.created_at desc limit 1),'')));
   end if;
   if exists(select 1 from jsonb_array_elements(case when jsonb_typeof(payload->'outputs')='array' then payload->'outputs' else '[]'::jsonb end) item join public.md_pos_lots existing on existing.id::text=item->>'lotId') then raise exception 'ID batch hasil sudah digunakan untuk stok buah';end if;
   work:=payload||jsonb_build_object('sourceLotId',fruit.id,'receivedDate',fruit.received_date,'processedBy',me.name,'evidence',proof);
   perform public.pos_waste_action('waste_process',work);
   select snapshot into work from public.md_pos_waste_runs where id=eid;
   weight:=(work->>'outputKg')::numeric;
   doc:=doc||(work-'evidence'-'sourceLotId')||jsonb_build_object('inputCost',input_cost,'stage',1);
   perform public.pos_reject_log(eid,fruit.id,-kg,-pieces);
   for line in select value from jsonb_array_elements(work->'outputs') loop
    update public.md_pos_unit_lots set unit_cost=input_cost*(line->>'weightKg')::numeric/weight/received_qty where id=(line->>'lotId')::uuid;
    perform public.pos_reject_log(eid,(line->>'lotId')::uuid,(line->>'qty')::numeric,0);
   end loop;
   if weight=0 then insert into public.md_pos_money_journal(event_id,store_id,category,cost,note) values(eid,st,'loss',input_cost,'Reject dibuang seluruhnya: '||reason);end if;
   proof:='{}'; -- Foto proses sudah tersimpan di waste_runs, tidak diduplikasi.
  end if;
 elsif action='reject_coral' then
  kind:='coral';
  if u.id is null or p.durian_output is distinct from 'coral' or p.stock_unit<>'kg' then raise exception 'Pilih stok Coral yang terhubung ke durian asal';end if;
  if u.expiry<dt then raise exception 'Coral kedaluwarsa; gunakan Catat waste';end if;
  kg:=public.pos_unit_qty(payload->>'kg','kg');net:=public.pos_unit_qty(payload->>'netKg','kg');
  if kg>u.qty or net>kg then raise exception 'Berat daging melebihi Coral atau stok Coral tidak cukup';end if;
  select * into outp from public.md_pos_products where durian_source_id=p.durian_source_id and durian_output='daging' and stock_unit='kg' and item_type in ('finished','direct');
  if not found then raise exception 'Daging durian untuk jenis Coral ini belum dihubungkan di master';end if;
  if proof->>'coral'='' or proof->>'daging'='' then raise exception 'Foto Coral dan hasil daging wajib';end if;
  if nullif(payload->>'expiry','')::date<dt then raise exception 'Kedaluwarsa hasil sebelum tanggal proses';end if;
  outlot:=(payload->>'outputLotId')::uuid;
  if outlot is null or exists(select 1 from public.md_pos_lots where id=outlot) or exists(select 1 from public.md_pos_unit_lots where id=outlot) then raise exception 'ID hasil tidak valid';end if;
  input_cost:=kg*u.unit_cost;
  update public.md_pos_unit_lots set qty=md_pos_unit_lots.qty-kg where id=u.id;
  insert into public.md_pos_unit_lots(id,product_id,store_id,unit,received_qty,qty,received_date,expiry,kind,supplier_id,note,created_by,unit_cost)
   values(outlot,outp.id,st,'kg',net,net,dt,nullif(payload->>'expiry','')::date,'production',u.supplier_id,'Olah Coral '||eid,auth.uid(),input_cost/net);
  perform public.pos_reject_log(eid,u.id,-kg,0);perform public.pos_reject_log(eid,outlot,net,0);
  doc:=doc||jsonb_build_object('kg',kg,'outputKg',net,'lossKg',kg-net,'stage',2,'inputCost',input_cost,'outputs',jsonb_build_array(jsonb_build_object('key','daging','productId',outp.id,'name',outp.name,'lotId',outlot,'qty',net,'weightKg',net,'unit','kg')));
 elsif action='reject_loss' then
  kind:='loss';qty:=public.pos_unit_qty(payload->>'qty',case when fruit.id is not null then 'kg' else u.unit end);
  if cause is null or cause not in ('spoiled','mistake','shrinkage','discard') then raise exception 'Pilih penyebab waste';end if;
  if proof->>'reject'='' then raise exception 'Foto bukti waste wajib';end if;
  if fruit.id is not null then
   pieces:=coalesce(nullif(payload->>'pieces','')::numeric,0);
   if pieces::text in ('NaN','Infinity','-Infinity') then raise exception 'Butir tidak valid';end if;
   if pieces<>trunc(pieces) or qty>fruit.kg or pieces>fruit.pieces or (cause='shrinkage' and pieces<>0) or (cause<>'shrinkage' and pieces=0) or ((fruit.kg-qty=0)<>(fruit.pieces-pieces=0)) then raise exception 'Jumlah waste / butir tidak konsisten; penyusutan berat tidak mengurangi butir';end if;
   update public.md_pos_lots set kg=md_pos_lots.kg-qty,pieces=md_pos_lots.pieces-pieces where id=fruit.id;
   input_cost:=qty*fruit.unit_cost;
  else
   if cause='shrinkage' then raise exception 'Penyusutan berat hanya untuk buah utuh';end if;
   if qty>u.qty then raise exception 'Waste melebihi stok';end if;
   pieces:=0;update public.md_pos_unit_lots set qty=md_pos_unit_lots.qty-qty where id=u.id;input_cost:=qty*u.unit_cost;
  end if;
  perform public.pos_reject_log(eid,source,-qty,-pieces);
  insert into public.md_pos_money_journal(event_id,store_id,category,cost,note) values(eid,st,'loss',input_cost,'Waste: '||reason);
  doc:=doc||jsonb_build_object('qty',qty,'unit',case when fruit.id is not null then 'kg' else u.unit end,'pieces',pieces,'inputCost',input_cost);
 end if;
 insert into public.md_pos_reject_records(id,store_id,business_date,kind,source_lot_id,doc,evidence) values(eid,st,dt,kind,source,doc,proof);
 perform public.pos_check_reserved(st);
 return public.pos_read();
end$$;

create or replace function public.pos_reject_evidence(record_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.md_pos_reject_records%rowtype;proof jsonb;
begin
 select * into r from public.md_pos_reject_records where id=record_id;
 if not found or not(public.pos_allowed('waste',r.store_id) or public.pos_allowed('trace',r.store_id) or public.pos_allowed('finance',r.store_id)) then raise exception 'Bukti tidak tersedia untuk akun ini';end if;
 if r.kind in ('direct','process') then select snapshot->'evidence' into proof from public.md_pos_waste_runs where id=r.id;else proof:=r.evidence;end if;
 return coalesce(proof,'{}');
end$$;
create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;begin
 s:=public.pos_read_before_063();
 s:=s||jsonb_build_object('rejectFlowVersion',63,'rejectRecords',coalesce((select jsonb_agg((case when public.pos_allowed('finance',r.store_id) then r.doc else r.doc-'inputCost' end)||jsonb_build_object('id',r.id,'storeId',r.store_id,'date',r.business_date,'kind',r.kind,'createdAt',r.created_at,'sourceLotId',r.source_lot_id,'voided',r.voided,'voidReason',r.void_reason,'voidEventId',r.void_event_id,'hasEvidence',true) order by r.created_at desc,r.id)
  from public.md_pos_reject_records r where public.pos_allowed('waste',r.store_id) or public.pos_allowed('trace',r.store_id) or public.pos_allowed('finance',r.store_id)),'[]'));
 s:=jsonb_set(s,'{origins}',coalesce(s->'origins','[]')||coalesce((select jsonb_agg(jsonb_build_object('lot_id',o->>'lotId','inputs',jsonb_build_array(jsonb_build_object('lotId',r.source_lot_id,'qty',(r.doc->>'kg')::numeric)))) from public.md_pos_reject_records r cross join lateral jsonb_array_elements(r.doc->'outputs') o where r.kind='coral' and not r.voided and (public.pos_allowed('waste',r.store_id) or public.pos_allowed('trace',r.store_id) or public.pos_allowed('finance',r.store_id))),'[]'));
 s:=s||jsonb_build_object('batchOpenOrders',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'lotIds',(select coalesce(jsonb_agg(c->>'lotId'),'[]') from jsonb_array_elements(o.consumption) c))) from public.md_pos_order_runs o where o.status in ('queued','preparing','ready') and (public.pos_allowed('trace',o.store_id) or public.pos_allowed('waste',o.store_id) or public.pos_allowed('finance',o.store_id))),'[]'));
 return s;
end$$;

-- Satu jalur baru; endpoint lama tetap menerima retry / pembatalan riwayat lama.
create or replace function public.pos_reject_legacy_guard(action text,payload jsonb) returns void language plpgsql set search_path='' as $$
#variable_conflict use_variable
begin
 if action in ('waste_process','recover','inventory_loss') and not exists(select 1 from public.md_pos_events where id=(payload->>'id')::uuid) then raise exception 'Gunakan menu Reject & Waste terbaru';end if;
 if action='waste_void' and exists(select 1 from public.md_pos_reject_records where id=(payload->>'wasteId')::uuid) then raise exception 'Batalkan melalui riwayat Reject & Waste';end if;
 if action='produce' and exists(select 1 from public.md_pos_recipes r join public.md_pos_products p on p.id=r.output_id where r.id=(payload->>'recipeId')::uuid and p.durian_output='daging' and exists(select 1 from public.md_pos_recipe_items i join public.md_pos_products ingredient on ingredient.id=i.product_id where i.recipe_id=r.id and ingredient.durian_output='coral')) and not exists(select 1 from public.md_pos_events where id=(payload->>'id')::uuid) then raise exception 'Gunakan Olah Coral untuk mencatat berat aktual daging';end if;
end$$;
create or replace function public.pos_mutate_027(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if action in ('reject_mark','reject_process','reject_coral','reject_loss','reject_void') then return public.pos_reject_mutate(action,payload);end if;
 perform public.pos_reject_legacy_guard(action,payload);return public.pos_mutate_027_before_063(action,payload);
end$$;
create or replace function public.pos_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if action in ('reject_mark','reject_process','reject_coral','reject_loss','reject_void') then return public.pos_reject_mutate(action,payload);end if;
 perform public.pos_reject_legacy_guard(action,payload);return public.pos_mutate_before_063(action,payload);
end$$;
revoke all on function public.pos_reject_log(uuid,uuid,numeric,numeric),public.pos_reject_mutate(text,jsonb),public.pos_reject_legacy_guard(text,jsonb),public.pos_reject_evidence(uuid),public.pos_read(),public.pos_mutate(text,jsonb),public.pos_mutate_027(text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_reject_evidence(uuid),public.pos_read(),public.pos_mutate(text,jsonb),public.pos_mutate_027(text,jsonb) to authenticated;
insert into public.md_pos_schema_versions(version) values(63) on conflict do nothing;
notify pgrst,'reload schema';
commit;

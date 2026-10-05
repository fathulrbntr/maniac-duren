-- Update 012: bayar di kasir sebelum kitchen. Jalankan setelah 011, tanpa reset.
begin;
alter table public.md_pos_order_runs add column if not exists payment_status text not null default 'unpaid' check(payment_status in ('unpaid','paid','refunded'));
-- Riwayat lama tetap utuh. Antrean lama belum lunas dapat dibayar dari kasir.
update public.md_pos_order_runs set payment_status='paid' where status='paid' and payment_status='unpaid';
create or replace function public.pos_mutate_v12(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare eid uuid:=(payload->>'id')::uuid;ev_id uuid;st uuid;dt date:=coalesce(nullif(payload->>'date','')::date,(now() at time zone 'Asia/Jakarta')::date);me public.md_pos_employees%rowtype;
 old jsonb;fresh jsonb;result jsonb;j jsonb;l jsonb;used jsonb:='[]';line jsonb;req text;rec public.md_pos_recipes%rowtype;p public.md_pos_products%rowtype;
 fruit public.md_pos_lots%rowtype;unitlot public.md_pos_unit_lots%rowtype;ord public.md_pos_order_runs%rowtype;emp public.md_pos_employees%rowtype;
 q numeric;b numeric;amount numeric;v_cost numeric;input_cost numeric;output_weight numeric;total numeric:=0;cnt integer;reason text;target uuid;
begin
 select * into me from public.md_pos_employees where user_id=auth.uid() and active;if not found then raise exception 'Akun tidak memiliki akses POS';end if;
 if eid is null then raise exception 'ID wajib';end if;
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 ev_id:=case when action in ('product_save','recipe_save','master','master_details','product_update') then md5(action||payload::text||auth.uid()::text)::uuid else eid end;
 if exists(select 1 from public.md_pos_events where id=ev_id) then
 if not exists(select 1 from public.md_pos_events where id=ev_id and md_pos_events.action=pos_mutate_v12.action and md_pos_events.payload=pos_mutate_v12.payload and actor=auth.uid()) then raise exception 'ID sudah digunakan untuk data lain';end if;
 return public.pos_read();end if;
 st:=nullif(payload->>'storeId','')::uuid;
 if action in ('sale','receipt','unit_receipt','produce','waste_process','order_create','attendance_in') and st is null then raise exception 'Pilih cabang';end if;
 if action in ('movement','sort','inventory_loss','recover') then
 select store_id into st from public.md_pos_lots where id=(payload->>'lotId')::uuid;
 if st is null then select store_id into st from public.md_pos_unit_lots where id=(payload->>'lotId')::uuid;end if;
 if st is null then raise exception 'Stok tidak ditemukan';end if;end if;
 if action like 'order_%' and action<>'order_create' then select * into ord from public.md_pos_order_runs where id=(payload->>'orderId')::uuid for update;if not found then raise exception 'Pesanan tidak ditemukan';end if;st:=ord.store_id;if dt<ord.business_date then raise exception 'Tanggal sebelum pesanan';end if;end if;
 if action='production_void' then select store_id into st from public.md_pos_productions where id=(payload->>'productionId')::uuid;end if;
 if action='waste_void' then select store_id into st from public.md_pos_waste_runs where id=(payload->>'wasteId')::uuid;end if;
 if action='void' then select store_id into st from public.md_pos_sales where id=(payload->>'saleId')::uuid;end if;
 req:=case when action in ('employee_save','employee_link') then 'employees' when action like 'attendance_%' then 'attendance' when action in ('order_start','order_ready') then 'kitchen' when action in ('order_cancel','void','waste_void','production_void') then 'cancel' when action in ('order_create','order_pay','order_complete','sale') then 'sell' when action in ('waste_process','recover','inventory_loss') then 'waste' when action in ('receipt','unit_receipt','sort','movement') then 'stock' when action='produce' then 'produce' else 'master' end;
 if action in ('order_start','order_ready') and not exists(select 1 from jsonb_array_elements(ord.lines) x where x->>'itemType'='recipe') then req:='sell';end if;
 perform public.pos_require(req,st);
 if dt>(now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal tidak boleh di masa depan';end if;
 old:=public.pos_stock_snapshot();
 insert into public.md_pos_events(id,action,store_id,actor,employee_id,business_date,payload) values(ev_id,action,st,auth.uid(),me.id,dt,payload);
 if action in ('employee_save','employee_link') and me.role<>'owner' then raise exception 'Pengelolaan karyawan hanya untuk owner';end if;
 if action='employee_save' then
 target:=(payload->>'employeeId')::uuid;
 if target is null then raise exception 'ID karyawan wajib';end if;
 select * into emp from public.md_pos_employees where id=target;
 if target=me.id and (payload->>'role'<>'owner' or not coalesce((payload->>'active')::boolean,true)) then raise exception 'Tidak dapat menonaktifkan / menurunkan akses sendiri';end if;
 if exists(select 1 from jsonb_array_elements_text(payload->'storeIds') x where not exists(select 1 from public.md_pos_stores where id=x::uuid)) then raise exception 'Cabang tidak valid';end if;
 if exists(select 1 from jsonb_array_elements_text(payload->'permissions') x where x not in ('stock','produce','waste','sell','kitchen','reports','finance','trace','master','attendance','cancel','employees')) then raise exception 'Permission tidak valid';end if;
 insert into public.md_pos_employees(id,name,email,phone,role,active,store_ids,permissions) values(target,btrim(payload->>'name'),lower(btrim(payload->>'email')),coalesce(payload->>'phone',''),payload->>'role',coalesce((payload->>'active')::boolean,true),array(select jsonb_array_elements_text(payload->'storeIds'))::uuid[],array(select jsonb_array_elements_text(payload->'permissions')))
 on conflict(id) do update set name=excluded.name,email=case when md_pos_employees.user_id is null then excluded.email else md_pos_employees.email end,phone=excluded.phone,role=excluded.role,active=excluded.active,store_ids=excluded.store_ids,permissions=excluded.permissions;
 elsif action='employee_link' then
 target:=(payload->>'employeeId')::uuid;
 select * into emp from public.md_pos_employees where id=target for update;if not found then raise exception 'Karyawan tidak ada';end if;
 if emp.user_id is not null then raise exception 'Akun sudah terhubung';end if;
 if not exists(select 1 from auth.users where id=(payload->>'userId')::uuid and lower(email)=emp.email) then raise exception 'Email akun tidak cocok';end if;
 update public.md_pos_employees set user_id=(payload->>'userId')::uuid where id=target;
 insert into public.md_pos_staff(user_id) values((payload->>'userId')::uuid) on conflict do nothing;
 elsif action='attendance_in' then
 insert into public.md_pos_attendance(id,employee_id,store_id) values(eid,me.id,st);
 elsif action='attendance_out' then
 update public.md_pos_attendance set clock_out=now() where employee_id=me.id and clock_out is null;if not found then raise exception 'Belum absen masuk';end if;
 elsif action='sort' then
 select * into fruit from public.md_pos_lots where id=(payload->>'lotId')::uuid for update;
 if dt<fruit.received_date then raise exception 'Tanggal sebelum penerimaan';end if;
 q:=0;b:=0;
 if jsonb_array_length(payload->'parts')<1 then raise exception 'Isi hasil sortir';end if;
 for l in select value from jsonb_array_elements(payload->'parts') loop
 amount:=public.pos_positive(l->>'kg');cnt:=public.pos_positive(l->>'pieces');
 if (l->>'pieces')::numeric<>cnt or l->>'quality' not in ('ready','unripe','reject') then raise exception 'Hasil sortir tidak valid';end if;
 q:=q+amount;b:=b+cnt;
 insert into public.md_pos_lots(id,store_id,supplier_id,product_id,received_date,received_kg,received_pieces,kg,pieces,source_lot_id,quality,unit_cost,note,created_by)
 values((l->>'id')::uuid,st,fruit.supplier_id,fruit.product_id,fruit.received_date,amount,cnt,amount,cnt,fruit.id,l->>'quality',fruit.unit_cost,'Sortir '||eid,auth.uid());end loop;
 if q<>fruit.kg or b<>fruit.pieces then raise exception 'Total hasil sortir harus sama dengan sisa kg dan butir asal';end if;
 update public.md_pos_lots set kg=0,pieces=0 where id=fruit.id;
 elsif action='recover' then
 select * into fruit from public.md_pos_lots where id=(payload->>'lotId')::uuid and quality='reject' for update;
 if not found or dt<fruit.received_date then raise exception 'Pilih buah reject dengan tanggal sesuai';end if;
 q:=public.pos_positive(payload->>'kg');b:=public.pos_unit_qty(payload->>'pieces','pcs');
 if q>fruit.kg or b>fruit.pieces then raise exception 'Melebihi stok reject';end if;
 select * into p from public.md_pos_products where id=(payload->>'productId')::uuid;
 if not found or p.item_type not in ('prep','finished','direct') or p.stock_unit not in ('kg','g','pcs') then raise exception 'Pilih bahan siap pakai / hasil olahan dengan satuan kg, g, atau pcs';end if;
 amount:=public.pos_unit_qty(payload->>'qty',p.stock_unit);
 output_weight:=case p.stock_unit when 'kg' then amount when 'g' then amount/1000 else public.pos_positive(payload->>'weightKg') end;
 if output_weight>q then raise exception 'Berat hasil melebihi buah asal';end if;
 if coalesce(length(btrim(payload->>'reason')),0)<3 then raise exception 'Catatan pengolahan wajib';end if;
 v_cost:=fruit.unit_cost*q;
 update public.md_pos_lots set kg=kg-q,pieces=pieces-b where id=fruit.id;
 insert into public.md_pos_unit_lots(id,product_id,store_id,unit,received_qty,qty,received_date,expiry,kind,supplier_id,note,created_by,unit_cost)
 values(eid,p.id,st,p.stock_unit,amount,amount,dt,nullif(payload->>'expiry','')::date,'waste',fruit.supplier_id,'Hasil reject '||eid,auth.uid(),v_cost/amount);
 insert into public.md_pos_waste_runs(id,store_id,source_lot_id,waste_date,snapshot,created_by) values(eid,st,fruit.id,dt,
 jsonb_build_object('sourceProductId',fruit.product_id,'sourceName',(select name from public.md_pos_products where id=fruit.product_id),'supplierId',fruit.supplier_id,'supplierName',(select name from public.md_pos_suppliers where id=fruit.supplier_id),'receivedDate',fruit.received_date,'kg',q,'pieces',b,'outputKg',output_weight,'lossKg',q-output_weight,'reason',payload->>'reason','processedBy',me.name,'outputs',jsonb_build_array(jsonb_build_object('key','custom','label',p.name,'productId',p.id,'name',p.name,'unit',p.stock_unit,'qty',amount,'weightKg',output_weight,'lotId',eid,'expiry',payload->>'expiry'))),auth.uid());
 elsif action='inventory_loss' then
 reason:=btrim(payload->>'reason');if coalesce(length(reason),0)<3 then raise exception 'Isi alasan waste / penyusutan';end if;
 if payload->>'cause' not in ('shrinkage','spoiled','mistake','discard') then raise exception 'Penyebab tidak valid';end if;
 q:=public.pos_positive(payload->>'qty');b:=coalesce((payload->>'pieces')::numeric,0);
 select * into fruit from public.md_pos_lots where id=(payload->>'lotId')::uuid for update;
 if found then
 if dt<fruit.received_date then raise exception 'Tanggal sebelum penerimaan';end if;
 if q>fruit.kg or b<0 or b<>trunc(b) or b>fruit.pieces or (payload->>'cause'<>'shrinkage' and b=0) then raise exception 'Jumlah waste tidak valid';end if;
 if payload->>'cause'='shrinkage' and b<>0 then raise exception 'Penyusutan berat tidak mengurangi butir';end if;
 if (fruit.kg-q=0)<>(fruit.pieces-b=0) then raise exception 'Sisa kg dan butir harus konsisten';end if;
 update public.md_pos_lots set kg=kg-q,pieces=pieces-b where id=fruit.id;v_cost:=q*fruit.unit_cost;
 else
 select * into unitlot from public.md_pos_unit_lots where id=(payload->>'lotId')::uuid for update;
 if dt<unitlot.received_date then raise exception 'Tanggal sebelum penerimaan';end if;
 q:=public.pos_unit_qty(payload->>'qty',unitlot.unit);
 if q>unitlot.qty then raise exception 'Waste melebihi stok';end if;
 update public.md_pos_unit_lots set qty=qty-q where id=unitlot.id;v_cost:=q*unitlot.unit_cost;end if;
 insert into public.md_pos_money_journal(event_id,store_id,category,cost,note) values(ev_id,st,'loss',v_cost,payload->>'cause'||': '||reason);
 elsif action='order_create' then
 if jsonb_typeof(payload->'lines') is distinct from 'array' or jsonb_array_length(payload->'lines') not between 1 and 100 then raise exception 'Isi pesanan';end if;
 used:='[]';
 for l in select value from jsonb_array_elements(payload->'lines') loop
 select * into p from public.md_pos_products where id=(l->>'productId')::uuid;
 if not found or p.item_type in ('raw','prep') then raise exception 'Bahan internal tidak dijual';end if;
 if p.stock_unit='kg_butir' then
 select * into fruit from public.md_pos_lots where id=(l->>'lotId')::uuid and product_id=p.id and store_id=st and quality='ready';
 if not found then raise exception 'Pilih stok buah matang';end if;
 q:=public.pos_positive(l->>'kg');b:=public.pos_unit_qty(l->>'pieces','pcs');amount:=public.pos_positive(l->>'price');
 if l->>'unit' not in ('KG','BUTIR') or q>fruit.kg or b>fruit.pieces then raise exception 'Jumlah / cara jual buah tidak valid';end if;
 used:=used||jsonb_build_array(jsonb_build_object('lineId',gen_random_uuid(),'productId',p.id,'name',p.name,'itemType','fruit','unit',l->>'unit','qty',case when l->>'unit'='KG' then q else b end,'kg',q,'pieces',b,'price',amount,'lotId',fruit.id));
 total:=total+amount*case when l->>'unit'='KG' then q else b end;continue;end if;
 q:=public.pos_unit_qty(l->>'qty',p.stock_unit);amount:=public.pos_positive(l->>'price');
 if p.item_type='recipe' then
 select * into rec from public.md_pos_recipes where output_id=p.id;
 if not found then raise exception 'Resep menu belum dibuat: %',p.name;end if;
 select count(*) into cnt from public.md_pos_recipes where output_id=p.id;if cnt<>1 then raise exception 'Menu harus memiliki tepat satu resep aktif: %',p.name;end if;
 end if;
 used:=used||jsonb_build_array(jsonb_build_object('lineId',gen_random_uuid(),'productId',p.id,'name',p.name,'itemType',p.item_type,'unit',p.stock_unit,'qty',q,'price',amount,'recipeId',case when p.item_type='recipe' then rec.id end,'recipeVersion',case when p.item_type='recipe' then rec.version end));total:=total+q*amount;end loop;
 amount:=(payload->>'paid')::numeric;
 if amount is null or amount::text in ('NaN','Infinity','-Infinity') or amount<total or coalesce(payload->>'payment','') not in ('Tunai','QRIS','Transfer') then raise exception 'Pembayaran wajib lunas sebelum dikirim ke kitchen';end if;
 if payload->>'payment'<>'Tunai' and amount<>total then raise exception 'Pembayaran non-tunai harus sesuai total';end if;
 insert into public.md_pos_order_runs(id,store_id,created_by,business_date,status,note,lines,total,payment_status,paid_date,paid,payment)
 values(eid,st,auth.uid(),dt,'queued',left(coalesce(payload->>'note',''),300),used,total,'paid',dt,amount,payload->>'payment');
 insert into public.md_pos_money_journal(event_id,store_id,category,revenue,cost,note) values(ev_id,st,'sale',total,null,'Pesanan '||eid);

 elsif action='order_start' then
 if ord.payment_status<>'paid' then raise exception 'Pesanan belum lunas';end if;
 if ord.status<>'queued' then raise exception 'Pesanan sudah diproses';end if;
 used:='[]';
 for l in select value from jsonb_array_elements(ord.lines) loop
 cnt:=jsonb_array_length(used);
 select * into p from public.md_pos_products where id=(l->>'productId')::uuid;
 if l->>'itemType'='fruit' then
 select * into fruit from public.md_pos_lots where id=(l->>'lotId')::uuid and store_id=st and quality='ready' for update;
 if not found or fruit.kg<(l->>'kg')::numeric or fruit.pieces<(l->>'pieces')::numeric then raise exception 'Stok buah berubah / tidak cukup';end if;
 update public.md_pos_lots set kg=kg-(l->>'kg')::numeric,pieces=pieces-(l->>'pieces')::integer where id=fruit.id;
 used:=used||jsonb_build_array(jsonb_build_object('lotId',fruit.id,'productId',fruit.product_id,'qty',(l->>'kg')::numeric,'pieces',(l->>'pieces')::integer,'unit','kg','unitCost',fruit.unit_cost,'supplierId',fruit.supplier_id));
 elsif l->>'itemType'='recipe' then
 select * into rec from public.md_pos_recipes where id=(l->>'recipeId')::uuid;
 if not found or rec.version<>(l->>'recipeVersion')::integer then raise exception 'Resep berubah. Batalkan pesanan yang belum dibuat lalu input ulang';end if;
 for line in select jsonb_build_object('productId',product_id,'qty',qty) from public.md_pos_recipe_items where recipe_id=rec.id loop
 used:=used||public.pos_take((line->>'productId')::uuid,st,(line->>'qty')::numeric*(l->>'qty')::numeric/rec.yield_qty,greatest(dt,(now() at time zone 'Asia/Jakarta')::date));end loop;
 else used:=used||public.pos_take(p.id,st,(l->>'qty')::numeric,greatest(dt,(now() at time zone 'Asia/Jakarta')::date));end if;
 select coalesce(jsonb_agg(case when ix>cnt then x||jsonb_build_object('lineId',l->>'lineId') else x end order by ix),'[]') into used from jsonb_array_elements(used) with ordinality as z(x,ix);
 end loop;
 select case when bool_or(x->>'unitCost' is null) then null else sum((x->>'qty')::numeric*(x->>'unitCost')::numeric) end into v_cost from jsonb_array_elements(used) x;
 update public.md_pos_order_runs set status='preparing',consumption=used,cost=v_cost,started_by=auth.uid() where id=ord.id;
 -- HPP aktual dilengkapi pada transaksi pembayaran, tanpa mencatat omzet dua kali.
 update public.md_pos_money_journal m set cost=v_cost from public.md_pos_events ev
 where m.event_id=ev.id and m.category='sale' and
 ((ev.action='order_create' and ev.id=ord.id) or (ev.action='order_pay' and ev.payload->>'orderId'=ord.id::text));
 elsif action='order_ready' then
 if ord.payment_status<>'paid' then raise exception 'Pesanan belum lunas';end if;
 if ord.status<>'preparing' then raise exception 'Pesanan belum dibuat';end if;
 update public.md_pos_order_runs set status='ready',finished_by=auth.uid() where id=ord.id;
 elsif action='order_complete' then
 if ord.status<>'ready' or ord.payment_status<>'paid' then raise exception 'Pesanan harus lunas dan siap';end if;
 update public.md_pos_order_runs set status='paid' where id=ord.id;
 elsif action='order_pay' then
 -- Hanya untuk pesanan belum lunas yang tersisa sebelum upgrade.
 if ord.payment_status<>'unpaid' or ord.status not in ('queued','preparing','ready') then raise exception 'Pesanan sudah dibayar atau dibatalkan';end if;
 amount:=(payload->>'paid')::numeric;
 if amount is null or amount::text in ('NaN','Infinity','-Infinity') or amount<ord.total or coalesce(payload->>'payment','') not in ('Tunai','QRIS','Transfer') then raise exception 'Pembayaran tidak valid';end if;
 if payload->>'payment'<>'Tunai' and amount<>ord.total then raise exception 'Pembayaran non-tunai harus sesuai total';end if;
 update public.md_pos_order_runs set payment_status='paid',paid_date=dt,paid=amount,payment=payload->>'payment' where id=ord.id;
 insert into public.md_pos_money_journal(event_id,store_id,category,revenue,cost,note) values(ev_id,st,'sale',ord.total,ord.cost,'Pesanan '||ord.id);
 elsif action='order_cancel' then
 if ord.status not in ('queued','preparing','ready') then raise exception 'Pesanan tidak dapat dibatalkan';end if;
 reason:=btrim(payload->>'reason');if coalesce(length(reason),0)<3 then raise exception 'Alasan wajib';end if;
 if ord.payment_status='paid' then
 if not coalesce((payload->>'refundConfirmed')::boolean,false) then raise exception 'Konfirmasi pengembalian pembayaran terlebih dahulu';end if;
 insert into public.md_pos_money_journal(event_id,store_id,category,revenue,cost,note)
 values(ev_id,st,'reversal',-ord.total,case when ord.status='queued' then 0 else -ord.cost end,'Refund pesanan '||ord.id||': '||reason);
 -- Pesanan dibatalkan sebelum produksi: tidak ada biaya fisik.
 if ord.status='queued' then
 update public.md_pos_money_journal m set cost=0 from public.md_pos_events ev
 where m.event_id=ev.id and m.category='sale' and ((ev.action='order_create' and ev.id=ord.id) or (ev.action='order_pay' and ev.payload->>'orderId'=ord.id::text));
 end if;
 end if;
 if ord.status<>'queued' then
 -- Setelah bahan dipakai, pembatalan menjadi waste, tidak mengembalikan bahan yang telah diolah.
 insert into public.md_pos_money_journal(event_id,store_id,category,cost,note) values(ev_id,st,'loss',ord.cost,'Pesanan batal setelah dibuat: '||reason);end if;
 update public.md_pos_order_runs set status='cancelled',payment_status=case when payment_status='paid' then 'refunded' else payment_status end,cancel_reason=reason where id=ord.id;
 else
 -- Operasi lama tetap dipakai, dengan aturan baru yang diperiksa di server.
 if action in ('receipt','unit_receipt') then
 if payload->>'totalCost' is null or (payload->>'totalCost')::numeric<0 then raise exception 'Isi total modal penerimaan (termasuk ongkos masuk)';end if;end if;
 if action='product_save' and (payload ? 'stock') then raise exception 'Gunakan menu kehilangan / penyusutan atau penerimaan untuk perubahan stok';end if;
 if action='produce' and exists(select 1 from public.md_pos_recipes r join public.md_pos_products prod on prod.id=r.output_id where r.id=(payload->>'recipeId')::uuid and prod.item_type='recipe') then raise exception 'Menu pesanan dibuat melalui Pesanan & Kitchen';end if;
 if action='sale' then for l in select value from jsonb_array_elements(payload->'lines') loop
 if not exists(select 1 from public.md_pos_lots where id=(l->>'lotId')::uuid and quality='ready') then raise exception 'Buah harus berstatus matang / siap jual';end if;end loop;end if;
 if action='waste_process' and not exists(select 1 from public.md_pos_lots where id=(payload->>'sourceLotId')::uuid and quality='reject') then raise exception 'Sortir buah menjadi reject sebelum diolah';end if;
 if action='movement' then
 if payload->>'kind'<>'Transfer' then raise exception 'Pemakaian dapur harus mencatat hasil melalui Olah reject / Produksi';end if;
 perform public.pos_require('stock',(payload->>'toStoreId')::uuid);end if;
 if action='void' and exists(select 1 from public.md_pos_sales where id=(payload->>'saleId')::uuid and voided) then raise exception 'Transaksi sudah dibatalkan';end if;
 if action='waste_void' and exists(select 1 from public.md_pos_waste_runs where id=(payload->>'wasteId')::uuid and voided) then raise exception 'Waste sudah dibatalkan';end if;
 if action in ('receipt','unit_receipt','produce','sale','waste_process','movement') and (exists(select 1 from public.md_pos_lots where id=eid) or exists(select 1 from public.md_pos_unit_lots where id=eid) or exists(select 1 from public.md_pos_sales where id=eid) or exists(select 1 from public.md_pos_waste_runs where id=eid)) then raise exception 'ID lama sudah digunakan';end if;
 if action='waste_process' then payload:=payload||jsonb_build_object('processedBy',me.name);end if;
 result:=public.pos_mutate_v8(action,payload);
 if action='receipt' then update public.md_pos_lots set unit_cost=(payload->>'totalCost')::numeric/received_kg,quality='unsorted' where id=eid;
 elsif action='unit_receipt' then update public.md_pos_unit_lots set unit_cost=(payload->>'totalCost')::numeric/received_qty where id=eid;
 elsif action='movement' then update public.md_pos_lots n set unit_cost=o.unit_cost,quality=o.quality from public.md_pos_lots o where n.id=eid and o.id=n.source_lot_id;
 elsif action='produce' then
 select case when bool_or(u.unit_cost is null) then null else sum((x->>'qty')::numeric*u.unit_cost) end into v_cost from public.md_pos_productions r cross join lateral jsonb_array_elements(r.snapshot->'used') x join public.md_pos_unit_lots u on u.id=(x->>'lotId')::uuid where r.id=eid;
 update public.md_pos_unit_lots set unit_cost=v_cost/received_qty where id=eid;
 elsif action='waste_process' then
 select * into fruit from public.md_pos_lots where id=(payload->>'sourceLotId')::uuid;
 input_cost:=fruit.unit_cost*(payload->>'kg')::numeric;
 select snapshot into j from public.md_pos_waste_runs where id=eid;
 output_weight:=(j->>'outputKg')::numeric;
 if output_weight>0 then
 for l in select value from jsonb_array_elements(j->'outputs') loop
 select * into unitlot from public.md_pos_unit_lots where id=(l->>'lotId')::uuid;
 -- Hasil kemasan dihitung menurut berat, Coral menurut kg.
 amount:=(l->>'weightKg')::numeric;
 update public.md_pos_unit_lots set unit_cost=input_cost*amount/output_weight/received_qty where id=unitlot.id;end loop;
 else insert into public.md_pos_money_journal(event_id,store_id,category,cost,note) values(ev_id,st,'loss',input_cost,'Reject tidak dapat dimanfaatkan');end if;
 elsif action='sale' then
 select case when bool_or(l.unit_cost is null) then null else sum(i.kg*l.unit_cost) end into v_cost from public.md_pos_sale_items i join public.md_pos_lots l on l.id=i.lot_id where i.sale_id=eid;
 insert into public.md_pos_money_journal(event_id,store_id,category,revenue,cost,note) select ev_id,st,'sale',s.total,v_cost,'Buah '||eid from public.md_pos_sales s where s.id=eid;
 elsif action in ('void','waste_void') then
 target:=case when action='void' then (payload->>'saleId')::uuid else (payload->>'wasteId')::uuid end;
 insert into public.md_pos_money_journal(event_id,store_id,category,revenue,cost,note) select ev_id,st,'reversal',-m.revenue,-m.cost,'Pembatalan '||target from public.md_pos_money_journal m where m.event_id=target;
 end if;
 end if;
 if exists(select 1 from public.md_pos_lots where (kg=0)<>(pieces=0) and id in (select (x->>'id')::uuid from jsonb_array_elements(public.pos_stock_snapshot()) x where x->>'unit'='kg')) then
 -- Check only rows changed by this operation; historical inconsistent rows remain visible for correction.
 if exists(select 1 from public.md_pos_lots l join jsonb_array_elements(old) o on l.id=(o->>'id')::uuid where (l.kg=0)<>(l.pieces=0) and (l.kg<>(o->>'qty')::numeric or l.pieces<>(o->>'pieces')::numeric)) then raise exception 'Sisa berat dan butir tidak konsisten';end if;end if;
 fresh:=public.pos_stock_snapshot();
 -- Jurnal selisih sebelum/sesudah menyimpan jejak fisik setiap lot dan orang yang bertindak.
 insert into public.md_pos_stock_journal(event_id,lot_id,product_id,store_id,supplier_id,qty,pieces,unit,cost,quality)
 select ev_id,(n->>'id')::uuid,(n->>'product_id')::uuid,(n->>'store_id')::uuid,(n->>'supplier_id')::uuid,
 (n->>'qty')::numeric-coalesce((o->>'qty')::numeric,0),(n->>'pieces')::numeric-coalesce((o->>'pieces')::numeric,0),n->>'unit',
 ((n->>'qty')::numeric-coalesce((o->>'qty')::numeric,0))*(n->>'unit_cost')::numeric,n->>'quality'
 from jsonb_array_elements(fresh) n left join jsonb_array_elements(old) o on n->>'id'=o->>'id'
 where (n->>'qty')::numeric<>coalesce((o->>'qty')::numeric,0) or (n->>'pieces')::numeric<>coalesce((o->>'pieces')::numeric,0);
 return public.pos_read();
end$$;

create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;begin
 s:=public.pos_read_v10();
 s:=jsonb_set(s,'{orders}',coalesce((select jsonb_agg(x||jsonb_build_object('reserved',o.reserved)) from jsonb_array_elements(s->'orders') x join public.md_pos_order_runs o on o.id=(x->>'id')::uuid),'[]'));
 return s||jsonb_build_object('orderStockVersion',12,'orderPaymentVersion',12);end $$;

create or replace function public.pos_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;branch uuid;record_id uuid;begin
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 result:=public.pos_mutate_v12(action,payload);
 if action='order_create' then
  record_id:=(payload->>'id')::uuid;
  update public.md_pos_order_runs set reserved=public.pos_order_needs(lines) where id=record_id and status='queued' and reserved='{}';
  select store_id into branch from public.md_pos_order_runs where id=record_id;
  perform public.pos_check_reserved(branch);
 elsif action='order_pay' then
  select store_id into branch from public.md_pos_order_runs where id=(payload->>'orderId')::uuid;
  perform public.pos_check_reserved(branch);
 elsif action in ('sale','produce','movement') then
  branch:=nullif(payload->>'storeId','')::uuid;
  if action='movement' then select store_id into branch from public.md_pos_lots where id=(payload->>'lotId')::uuid;end if;
  if branch is not null then perform public.pos_check_reserved(branch);end if;
 elsif action='order_start' then
  select store_id into branch from public.md_pos_order_runs where id=(payload->>'orderId')::uuid;
  perform public.pos_check_reserved(branch);
 end if;
 return public.pos_read();end $$;
revoke all on function public.pos_mutate_v12(text,jsonb),public.pos_mutate_v10(text,jsonb),public.pos_read_v10() from public,anon,authenticated;
revoke all on function public.pos_read(),public.pos_mutate(text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_read(),public.pos_mutate(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

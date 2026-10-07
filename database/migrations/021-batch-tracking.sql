-- 021: penerimaan aktual, rekonsiliasi nota, reject harian dan pengolahan berantai.
begin;
do $$begin if to_regprocedure('public.pos_mutate_v20(text,jsonb)') is null then raise exception 'Jalankan migration 020 terlebih dahulu';end if;end$$;
alter table public.md_pos_lots add column if not exists expected_kg numeric;
alter table public.md_pos_lots add column if not exists expected_pieces integer;
alter table public.md_pos_lots add column if not exists invoice_no text;
alter table public.md_pos_lots add column if not exists cost_finalized boolean not null default true;
create table if not exists public.md_pos_batch_processes(id uuid primary key,store_id uuid not null references public.md_pos_stores,snapshot jsonb not null);
alter table public.md_pos_batch_processes enable row level security;
revoke all on public.md_pos_batch_processes from public,anon,authenticated;
do $$begin
 if to_regprocedure('public.pos_mutate_v21(text,jsonb)') is null then alter function public.pos_mutate(text,jsonb) rename to pos_mutate_v21;end if;
 if to_regprocedure('public.pos_read_v21()') is null then alter function public.pos_read() rename to pos_read_v21;end if;
end$$;
revoke all on function public.pos_mutate_v21(text,jsonb),public.pos_read_v21() from public,anon,authenticated;
create or replace function public.pos_nonnegative(value text) returns numeric language plpgsql set search_path='' as $$
declare n numeric;begin n:=value::numeric;if n is null or n<0 or n>9000000000000000 or n::text in ('NaN','Infinity','-Infinity') then raise exception 'Angka nonnegatif wajib';end if;return n;end$$;
revoke all on function public.pos_nonnegative(text) from public,anon,authenticated;
do $$declare body text;begin
 body:=pg_get_functiondef('public.pos_waste_action(text,jsonb)'::regprocedure);
 execute replace(body,'v_output.item_type not in (''direct'',''finished'')','v_output.item_type not in (''prep'',''direct'',''finished'')');
end$$;
create or replace function public.pos_hide_batch_costs(value jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb;begin
 if jsonb_typeof(value)='object' then select coalesce(jsonb_object_agg(key,public.pos_hide_batch_costs(val)),'{}') into result from jsonb_each(value) as fields(key,val) where key not in ('inputCost','totalCost','additionalCost','wasteCost','unitCost');
 elsif jsonb_typeof(value)='array' then select coalesce(jsonb_agg(public.pos_hide_batch_costs(val)),'[]') into result from jsonb_array_elements(value) as items(val);
 else result:=value;end if;return result;
end$$;
revoke all on function public.pos_hide_batch_costs(jsonb) from public,anon,authenticated;
alter table public.md_pos_employees drop constraint if exists md_pos_employees_role_check;
alter table public.md_pos_employees add constraint md_pos_employees_role_check check(role in ('staff','owner','admin','manager','cashier','kitchen','warehouse'));
-- Admin pusat dapat mengurus semua outlet; tidak otomatis memperoleh izin pembatalan / produksi.
do $$declare fn record;body text;begin
 for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'pos_read%' or p.proname='pos_allowed') loop
  body:=pg_get_functiondef(fn.oid);
  body:=replace(body,'e.role<>''owner''','e.role not in (''owner'',''admin'')');
  body:=replace(body,'e.role=''owner'' or','e.role in (''owner'',''admin'') or');
  if fn.oid='public.pos_allowed(text,uuid)'::regprocedure then
   body:=replace(body,'if permission=''employees'' then return false;end if;', 'if permission=''employees'' then return false;end if; if e.role=''admin'' then return permission=any(array[''stock'',''reports'',''finance'',''trace'',''master'',''attendance'']::text[]||e.permissions);end if;');
  end if;
  execute body;
 end loop;
end$$;
create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;begin
 s:=public.pos_read_v21();
 s:=jsonb_set(s,'{lots}',coalesce((select jsonb_agg(x||jsonb_build_object('expectedKg',l.expected_kg,'expectedPieces',l.expected_pieces,'invoiceNo',l.invoice_no,'costFinalized',l.cost_finalized)) from jsonb_array_elements(s->'lots') x join public.md_pos_lots l on l.id=(x->>'id')::uuid),'[]'));
 s:=jsonb_set(s,'{wasteRuns}',coalesce((select jsonb_agg(case when public.pos_allowed('finance',(x->>'storeId')::uuid) then x else public.pos_hide_batch_costs(x) end) from jsonb_array_elements(s->'wasteRuns') x),'[]'));
 s:=s||jsonb_build_object('rejects',coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'action',ev.action,'business_date',ev.business_date,'employee_id',ev.employee_id,'payload',ev.payload)) from public.md_pos_events ev where ev.action='reject_mark' and (public.pos_allowed('stock',ev.store_id) or public.pos_allowed('waste',ev.store_id) or public.pos_allowed('trace',ev.store_id))),'[]'),'batchTrackingVersion',21,'batchProcesses',coalesce((select jsonb_agg(case when public.pos_allowed('finance',b.store_id) then b.snapshot else public.pos_hide_batch_costs(b.snapshot) end) from public.md_pos_batch_processes b where public.pos_allowed('waste',b.store_id) or public.pos_allowed('trace',b.store_id) or public.pos_allowed('finance',b.store_id)),'[]'));
 s:=jsonb_set(s,'{origins}',coalesce(s->'origins','[]')||coalesce((select jsonb_agg(jsonb_build_object('lot_id',o->>'lotId','inputs',case when public.pos_allowed('finance',b.store_id) then o->'inputs' else public.pos_hide_batch_costs(o->'inputs') end)) from public.md_pos_batch_processes b cross join lateral jsonb_array_elements(b.snapshot->'outputs') o where not coalesce((b.snapshot->>'voided')::boolean,false) and (public.pos_allowed('trace',b.store_id) or public.pos_allowed('waste',b.store_id) or public.pos_allowed('finance',b.store_id))),'[]'));
 return s;
end$$;
create or replace function public.pos_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare eid uuid:=(payload->>'id')::uuid;st uuid:=(payload->>'storeId')::uuid;dt date:=coalesce(nullif(payload->>'date','')::date,(now() at time zone 'Asia/Jakarta')::date);
 safe jsonb:=payload;result jsonb;old jsonb;fresh jsonb;line jsonb;r jsonb;o jsonb;used jsonb:='[]';outs jsonb:='[]';meta jsonb;
 fruit public.md_pos_lots%rowtype;u public.md_pos_unit_lots%rowtype;prod public.md_pos_products%rowtype;employee uuid;
 v_kg numeric;v_pieces numeric;total_kg numeric:=0;output_kg numeric:=0;waste_kg numeric;normal_kg numeric;input_cost numeric:=0;extra numeric:=0;v_cost numeric;waste_cost numeric;share numeric;allocated numeric:=0;purchase numeric;shipping numeric;idx integer:=0;known boolean:=true;
begin
 if action='receipt' then perform public.pos_require('finance',st);end if;
 if action='inventory_loss' and exists(select 1 from public.md_pos_lots where id=(payload->>'lotId')::uuid and not cost_finalized) then raise exception 'Tetapkan modal nota sebelum mencatat waste';end if;
 if action not in ('receipt_intake','receipt_reconcile','reject_mark','coral_process','coral_void','waste_process','receipt_batch','movement','recover') then return public.pos_mutate_v21(action,payload);end if;
 if eid is null then raise exception 'ID wajib';end if;
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 select id into employee from public.md_pos_employees where user_id=auth.uid() and active;
 if employee is null then raise exception 'Akun tidak memiliki akses POS';end if;
 if dt is null or dt>(now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal tidak valid';end if;
 if action in ('receipt_intake','receipt_reconcile','reject_mark','coral_process','coral_void') then
  if st is null then raise exception 'Pilih outlet';end if;
  perform public.pos_require(case when action='receipt_reconcile' then 'finance' when action='coral_void' then 'cancel' when action='coral_process' then 'produce' else 'stock' end,st);
  if exists(select 1 from public.md_pos_events where id=eid) then
   if not exists(select 1 from public.md_pos_events where id=eid and md_pos_events.action=$1 and md_pos_events.payload=$2 and actor=auth.uid()) then raise exception 'ID sudah digunakan dengan isi berbeda';end if;
   return public.pos_read();
  end if;
  old:=public.pos_stock_snapshot();
  insert into public.md_pos_events(id,action,store_id,actor,employee_id,business_date,payload) values(eid,action,st,auth.uid(),employee,dt,payload);
 end if;
 if action in ('receipt_batch','receipt_intake') then
  if action='receipt_batch' then perform public.pos_require('finance',st);end if;
  if action='receipt_intake' then
   if length(btrim(coalesce(payload->>'invoiceNo',''))) not between 1 and 100 then raise exception 'Nomor nota / surat jalan wajib';end if;
   safe:=payload||jsonb_build_object('shippingCost',0,'lines',(select jsonb_agg(x||jsonb_build_object('purchaseCost',0)) from jsonb_array_elements(payload->'lines') x));
  end if;
  for line in select value from jsonb_array_elements(payload->'lines') loop
   for r in select value from jsonb_array_elements(line->'weighings') loop
    if r ? 'tareKg' and (public.pos_nonnegative(r->>'tareKg') is null or abs(public.pos_nonnegative(r->>'grossKg')-public.pos_nonnegative(r->>'tareKg')-(r->>'kg')::numeric)>0.00000001) then raise exception 'Berat bersih tidak sesuai berat timbangan dikurangi keranjang';end if;
   end loop;
  end loop;
  result:=public.pos_mutate_v21('receipt_batch',safe);
  for line in select value from jsonb_array_elements(payload->'lines') loop
   v_kg:=case when nullif(line->>'expectedKg','') is null then null else public.pos_nonnegative(line->>'expectedKg') end;
   v_pieces:=case when nullif(line->>'expectedPieces','') is null then null else public.pos_nonnegative(line->>'expectedPieces') end;
   if v_pieces<>trunc(v_pieces) or v_pieces>2147483647 then raise exception 'Butir PO harus bilangan bulat';end if;
   update public.md_pos_lots set expected_kg=v_kg,expected_pieces=v_pieces,invoice_no=left(coalesce(payload->>'invoiceNo',''),100),cost_finalized=action<>'receipt_intake',quality=case when action='receipt_intake' then 'unsorted' else quality end,
    unit_cost=case when action='receipt_intake' then null else unit_cost end,total_cost=case when action='receipt_intake' then null else total_cost end,purchase_cost=case when action='receipt_intake' then null else purchase_cost end,shipping_cost=case when action='receipt_intake' then null else shipping_cost end where id=(line->>'id')::uuid;
   v_kg:=public.pos_nonnegative(coalesce(nullif(line->>'rejectKg',''),'0'));v_pieces:=public.pos_nonnegative(coalesce(nullif(line->>'rejectPieces',''),'0'));
   if (v_kg=0)<>(v_pieces=0) then raise exception 'Berat dan butir reject harus sama-sama diisi';end if;
   if v_kg>0 then
    result:=public.pos_mutate('reject_mark',jsonb_build_object('id',line->>'rejectId','storeId',st,'date',dt,'lotId',line->>'id','kg',v_kg,'pieces',v_pieces,'reason','Reject saat penerimaan','cause','arrival'));
   end if;
  end loop;
  if action='receipt_intake' then update public.md_pos_stock_journal set cost=null where event_id in (select id from public.md_pos_lots where shipment_id=eid);end if;
  return public.pos_read();
 elsif action='receipt_reconcile' then
  shipping:=public.pos_nonnegative(payload->>'shippingCost');
  if jsonb_typeof(payload->'lines') is distinct from 'array' or jsonb_array_length(payload->'lines')<1 then raise exception 'Isi rincian nota';end if;
  if (select count(*) from public.md_pos_lots where shipment_id=(payload->>'shipmentId')::uuid and source_lot_id is null and store_id=st)<>jsonb_array_length(payload->'lines') then raise exception 'Rincian nota harus mencakup seluruh produk kiriman';end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(payload->'lines') x)<>jsonb_array_length(payload->'lines') then raise exception 'Rincian nota terduplikasi';end if;
  for line in select value from jsonb_array_elements(payload->'lines') loop
   select * into fruit from public.md_pos_lots where id=(line->>'id')::uuid and shipment_id=(payload->>'shipmentId')::uuid and store_id=st and source_lot_id is null for update;
   if not found or fruit.cost_finalized then raise exception 'Batch tidak ditemukan / modal sudah ditetapkan';end if;
   total_kg:=total_kg+fruit.received_kg;
  end loop;
  for line in select value from jsonb_array_elements(payload->'lines') loop
   select * into fruit from public.md_pos_lots where id=(line->>'id')::uuid;
   purchase:=public.pos_nonnegative(line->>'purchaseCost');v_pieces:=public.pos_nonnegative(line->>'expectedPieces');if v_pieces<>trunc(v_pieces) or v_pieces>2147483647 then raise exception 'Butir PO harus bilangan bulat';end if;idx:=idx+1;
   share:=case when idx=jsonb_array_length(payload->'lines') then shipping-allocated else shipping*fruit.received_kg/total_kg end;allocated:=allocated+share;
   update public.md_pos_lots set purchase_cost=purchase,shipping_cost=share,total_cost=purchase+share,unit_cost=(purchase+share)/received_kg,expected_kg=public.pos_nonnegative(line->>'expectedKg'),expected_pieces=public.pos_nonnegative(line->>'expectedPieces'),cost_finalized=true,quality=case when quality='unsorted' then 'ready' else quality end where id=fruit.id;
   update public.md_pos_lots set unit_cost=(purchase+share)/fruit.received_kg,cost_finalized=true where source_lot_id=fruit.id and quality='reject';
  end loop;
  update public.md_pos_stock_journal j set cost=j.qty*l.unit_cost from public.md_pos_lots l where j.lot_id=l.id and l.shipment_id=(payload->>'shipmentId')::uuid;
 elsif action='reject_mark' then
  select * into fruit from public.md_pos_lots where id=(payload->>'lotId')::uuid and store_id=st and quality in ('ready','unsorted','unripe') for update;
  if not found or dt<fruit.received_date then raise exception 'Pilih batch buah jual yang sesuai';end if;
  v_kg:=public.pos_unit_qty(payload->>'kg','kg');v_pieces:=public.pos_unit_qty(payload->>'pieces','pcs');
  if v_kg>fruit.kg or v_pieces>fruit.pieces or (fruit.kg-v_kg=0)<>(fruit.pieces-v_pieces=0) then raise exception 'Reject melebihi stok / sisa kg dan butir tidak konsisten';end if;
  if payload->>'cause' is null or payload->>'cause' not in ('arrival','taste','overripe','other') or length(btrim(coalesce(payload->>'reason','')))<3 then raise exception 'Isi penyebab dan alasan reject';end if;
  insert into public.md_pos_lots(id,store_id,supplier_id,product_id,received_date,received_kg,received_pieces,kg,pieces,source_lot_id,quality,unit_cost,note,created_by,shipment_id,invoice_no,cost_finalized)
   values(eid,st,fruit.supplier_id,fruit.product_id,fruit.received_date,v_kg,v_pieces,v_kg,v_pieces,fruit.id,'reject',fruit.unit_cost,payload->>'reason',auth.uid(),fruit.shipment_id,fruit.invoice_no,fruit.cost_finalized);
  update public.md_pos_lots set kg=md_pos_lots.kg-public.pos_unit_qty(payload->>'kg','kg'),pieces=md_pos_lots.pieces-public.pos_unit_qty(payload->>'pieces','pcs') where id=fruit.id;
  perform public.pos_check_reserved(st);
 elsif action='waste_process' then
  -- Riwayat sebelum 021 tetap terbaca; proses baru wajib memakai reject yang dipisahkan.
  perform public.pos_require('produce',st);
  select * into fruit from public.md_pos_lots where id=(payload->>'sourceLotId')::uuid and store_id=st;
  if not found or fruit.quality<>'reject' or not fruit.cost_finalized or fruit.unit_cost is null then raise exception 'Pisahkan reject dan selesaikan modal nota sebelum kitchen mengolah';end if;
  if exists(select 1 from public.md_pos_waste_runs where id=eid) then return public.pos_mutate_v21(action,payload);end if;
  v_kg:=public.pos_unit_qty(payload->>'kg','kg');
  normal_kg:=public.pos_nonnegative(payload->>'shellKg');waste_kg:=public.pos_nonnegative(payload->>'spoiledKg');extra:=public.pos_nonnegative(coalesce(payload->>'additionalCost','0'));
  for o in select value from jsonb_array_elements(payload->'outputs') loop
   purchase:=public.pos_nonnegative(coalesce(o->>'additionalCost','0'));
   if coalesce((o->>'qty')::numeric,0)=0 and purchase>0 then raise exception 'Biaya kemasan membutuhkan jumlah hasil';end if;
  end loop;
  select coalesce(sum((x->>'qty')::numeric*case x->>'key' when 'durpas500' then 0.5 else 1 end),0) into output_kg from jsonb_array_elements(payload->'outputs') x;
  if abs(v_kg-output_kg-normal_kg-waste_kg)>0.000001 then raise exception 'Berat input harus sama dengan hasil + kulit + isi rusak';end if;
  if output_kg>0 and (not exists(select 1 from jsonb_array_elements(payload->'outputs') x where x->>'key'='coral' and (x->>'qty')::numeric>0) or not exists(select 1 from jsonb_array_elements(payload->'outputs') x where x->>'key' in ('durpas500','durpas1000') and (x->>'qty')::numeric>0)) then raise exception 'Catat hasil durian kupas dan coral sekaligus';end if;
  result:=public.pos_mutate_v21(action,payload);
  input_cost:=v_kg*fruit.unit_cost;v_cost:=input_cost+extra;
  waste_cost:=case when output_kg+waste_kg=0 then v_cost else v_cost*waste_kg/(output_kg+waste_kg) end;
  select snapshot into meta from public.md_pos_waste_runs where id=eid;
  for o in select value from jsonb_array_elements(meta->'outputs') loop
   share:=(v_cost-waste_cost)*(o->>'weightKg')::numeric/nullif(output_kg,0);
   select public.pos_nonnegative(coalesce(x->>'additionalCost','0')) into purchase from jsonb_array_elements(payload->'outputs') x where x->>'key'=o->>'key';
   update public.md_pos_unit_lots set unit_cost=(share+purchase)/received_qty where id=(o->>'lotId')::uuid;
  end loop;
  update public.md_pos_waste_runs set snapshot=snapshot||jsonb_build_object('shellKg',normal_kg,'spoiledKg',waste_kg,'inputCost',input_cost,'additionalCost',extra,'totalCost',v_cost+(select coalesce(sum(public.pos_nonnegative(coalesce(x->>'additionalCost','0'))),0) from jsonb_array_elements(payload->'outputs') x),'wasteCost',waste_cost) where id=eid;
  delete from public.md_pos_money_journal where event_id=eid and category='loss';
  if waste_cost>0 then insert into public.md_pos_money_journal(event_id,store_id,category,cost,note) values(eid,st,'loss',waste_cost,'Isi reject rusak / tidak dapat dimanfaatkan');end if;
  update public.md_pos_stock_journal j set cost=j.qty*unitrow.unit_cost from public.md_pos_unit_lots unitrow where j.event_id=eid and j.lot_id=unitrow.id;
  return public.pos_read();
 elsif action='coral_process' then
  if jsonb_typeof(payload->'inputs') is distinct from 'array' or jsonb_array_length(payload->'inputs') not between 1 and 50 then raise exception 'Pilih 1–50 batch coral';end if;
  if (select count(distinct x->>'lotId') from jsonb_array_elements(payload->'inputs') x)<>jsonb_array_length(payload->'inputs') then raise exception 'Batch coral terduplikasi';end if;
  for line in select value from jsonb_array_elements(payload->'inputs') loop
   select * into u from public.md_pos_unit_lots where id=(line->>'lotId')::uuid and store_id=st for update;
   if not found or u.unit<>'kg' or dt<u.received_date or u.expiry<dt or not exists(select 1 from public.md_pos_waste_runs w cross join lateral jsonb_array_elements(w.snapshot->'outputs') x where x->>'lotId'=u.id::text and x->>'key'='coral' and not w.voided) then raise exception 'Pilih stok coral hasil pengolahan yang belum kedaluwarsa';end if;
   v_kg:=public.pos_unit_qty(line->>'qty','kg');if v_kg>u.qty then raise exception 'Stok coral tidak cukup';end if;
   total_kg:=total_kg+v_kg;if u.unit_cost is null then known:=false;else input_cost:=input_cost+v_kg*u.unit_cost;end if;
   used:=used||jsonb_build_array(jsonb_build_object('lotId',u.id,'qty',v_kg,'supplierId',u.supplier_id,'unitCost',u.unit_cost));
  end loop;
  if not known then raise exception 'Modal coral belum diketahui';end if;
  normal_kg:=public.pos_nonnegative(payload->>'seedKg');waste_kg:=public.pos_nonnegative(payload->>'spoiledKg');extra:=public.pos_nonnegative(coalesce(payload->>'additionalCost','0'));
  if jsonb_typeof(payload->'outputs') is distinct from 'array' or jsonb_array_length(payload->'outputs') not between 1 and 50 then raise exception 'Isi hasil daging / es durian';end if;
  if (select count(distinct x->>'lotId') from jsonb_array_elements(payload->'outputs') x)<>jsonb_array_length(payload->'outputs') then raise exception 'ID hasil terduplikasi';end if;
  for o in select value from jsonb_array_elements(payload->'outputs') loop
   select * into prod from public.md_pos_products where id=(o->>'productId')::uuid;
   if not found or prod.item_type not in ('prep','finished','direct') or prod.stock_unit='kg_butir' or prod.stock_unit='porsi' then raise exception 'Pilih bahan produksi / produk jadi';end if;
   v_kg:=public.pos_unit_qty(o->>'durianKg','kg');v_pieces:=public.pos_unit_qty(o->>'qty',prod.stock_unit);output_kg:=output_kg+v_kg;
   if prod.stock_unit='kg' and v_pieces<v_kg or prod.stock_unit='g' and v_pieces/1000<v_kg then raise exception 'Berat hasil tidak boleh kurang dari daging durian yang digunakan';end if;
   if nullif(o->>'expiry','')::date<dt then raise exception 'Kedaluwarsa sebelum produksi';end if;
   outs:=outs||jsonb_build_array(o||jsonb_build_object('name',prod.name,'unit',prod.stock_unit,'qty',v_pieces,'durianKg',v_kg));
  end loop;
  if abs(total_kg-output_kg-normal_kg-waste_kg)>0.000001 then raise exception 'Coral input harus sama dengan daging bersih + biji + isi rusak';end if;
  v_cost:=input_cost+extra;waste_cost:=v_cost*waste_kg/(output_kg+waste_kg);
  for line in select value from jsonb_array_elements(used) loop update public.md_pos_unit_lots set qty=qty-(line->>'qty')::numeric where id=(line->>'lotId')::uuid;end loop;
  meta:='[]';
  for o in select value from jsonb_array_elements(outs) loop
   share:=(o->>'durianKg')::numeric/output_kg;
   insert into public.md_pos_unit_lots(id,product_id,store_id,unit,received_qty,qty,received_date,expiry,kind,note,created_by,unit_cost)
    values((o->>'lotId')::uuid,(o->>'productId')::uuid,st,o->>'unit',(o->>'qty')::numeric,(o->>'qty')::numeric,dt,nullif(o->>'expiry','')::date,'production','Olahan coral '||eid,auth.uid(),((v_cost-waste_cost)*share+public.pos_nonnegative(coalesce(o->>'additionalCost','0')))/(o->>'qty')::numeric);
   meta:=meta||jsonb_build_array(o||jsonb_build_object('inputs',(select jsonb_agg(x||jsonb_build_object('qty',(x->>'qty')::numeric*share)) from jsonb_array_elements(used) x)));
  end loop;
  insert into public.md_pos_batch_processes values(eid,st,jsonb_build_object('id',eid,'storeId',st,'date',dt,'processedBy',(select name from public.md_pos_employees where id=employee),'inputs',used,'outputs',meta,'inputKg',total_kg,'outputKg',output_kg,'seedKg',normal_kg,'spoiledKg',waste_kg,'inputCost',input_cost,'additionalCost',extra,'totalCost',v_cost+(select coalesce(sum(public.pos_nonnegative(coalesce(x->>'additionalCost','0'))),0) from jsonb_array_elements(outs) x),'wasteCost',waste_cost,'note',left(coalesce(payload->>'note',''),300),'voided',false));
  if waste_cost>0 then insert into public.md_pos_money_journal(event_id,store_id,category,cost,note) values(eid,st,'loss',waste_cost,'Isi coral rusak');end if;
  perform public.pos_check_reserved(st);
 elsif action='coral_void' then
  select snapshot into meta from public.md_pos_batch_processes where id=(payload->>'processId')::uuid and store_id=st for update;
  if not found or coalesce((meta->>'voided')::boolean,false) then raise exception 'Proses tidak ditemukan / sudah dibatalkan';end if;
  if length(btrim(coalesce(payload->>'reason','')))<3 then raise exception 'Alasan pembatalan wajib';end if;
  for o in select value from jsonb_array_elements(meta->'outputs') loop
   select * into u from public.md_pos_unit_lots where id=(o->>'lotId')::uuid for update;
   if u.qty<>u.received_qty then raise exception 'Hasil sudah digunakan; tidak dapat dibatalkan';end if;
   update public.md_pos_unit_lots set qty=0 where id=u.id;
  end loop;
  for line in select value from jsonb_array_elements(meta->'inputs') loop update public.md_pos_unit_lots set qty=qty+(line->>'qty')::numeric where id=(line->>'lotId')::uuid;end loop;
  update public.md_pos_batch_processes set snapshot=snapshot||jsonb_build_object('voided',true,'voidReason',payload->>'reason') where id=(payload->>'processId')::uuid;
  insert into public.md_pos_money_journal(event_id,store_id,category,cost,note) select eid,st,'reversal',-md_pos_money_journal.cost,'Pembatalan olahan coral' from public.md_pos_money_journal where event_id=(payload->>'processId')::uuid;
  perform public.pos_check_reserved(st);
 elsif action='movement' then
  if exists(select 1 from public.md_pos_lots where id=(payload->>'lotId')::uuid and not cost_finalized) then raise exception 'Tetapkan modal nota sebelum transfer';end if;
  result:=public.pos_mutate_v21(action,payload);
  update public.md_pos_lots n set shipment_id=o.shipment_id,invoice_no=o.invoice_no,cost_finalized=o.cost_finalized from public.md_pos_lots o where n.id=eid and o.id=n.source_lot_id;
  return public.pos_read();
 elsif action='recover' then raise exception 'Gunakan Olah reject untuk mencatat durian kupas dan coral sekaligus';
 end if;
 fresh:=public.pos_stock_snapshot();
 insert into public.md_pos_stock_journal(event_id,lot_id,product_id,store_id,supplier_id,qty,pieces,unit,cost,quality)
 select eid,(n->>'id')::uuid,(n->>'product_id')::uuid,(n->>'store_id')::uuid,(n->>'supplier_id')::uuid,(n->>'qty')::numeric-coalesce((prior->>'qty')::numeric,0),(n->>'pieces')::numeric-coalesce((prior->>'pieces')::numeric,0),n->>'unit',((n->>'qty')::numeric-coalesce((prior->>'qty')::numeric,0))*(n->>'unit_cost')::numeric,n->>'quality'
 from jsonb_array_elements(fresh) n left join jsonb_array_elements(old) prior on n->>'id'=prior->>'id' where (n->>'qty')::numeric<>coalesce((prior->>'qty')::numeric,0) or (n->>'pieces')::numeric<>coalesce((prior->>'pieces')::numeric,0);
 return public.pos_read();
end$$;
revoke all on function public.pos_read(),public.pos_mutate(text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_read(),public.pos_mutate(text,jsonb) to authenticated;
update public.md_pos_products set item_type='prep',category=null,sale_price=null where lower(btrim(name))='coral' and stock_unit='kg';
update public.md_pos_products set item_type='prep',category=null,sale_price=null where lower(btrim(name))='daging durian' and item_type='raw' and stock_unit in ('kg','g');
insert into public.md_pos_schema_versions values(21) on conflict do nothing;
notify pgrst,'reload schema';
commit;

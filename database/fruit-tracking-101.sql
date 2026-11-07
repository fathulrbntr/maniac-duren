-- Patch 101: identity per fruit, atomic receipt/sale/reject/transfer tracking.
-- Apply AFTER the existing feature chain (082/083/084/085/092). No reset.
begin;
set local lock_timeout='5s';
select pg_catalog.pg_advisory_xact_lock(71031,1102);
do $$begin
 if to_regprocedure('public.pos_receive_shipment(jsonb)') is null or to_regprocedure('public.pos_reject_mutate(text,jsonb)') is null or to_regprocedure('public.pos_cashier_mutate(text,jsonb)') is null then
  raise exception 'Pasang fitur penerimaan 082, kasir, dan reject 063 terlebih dahulu';end if;
end$$;
create table if not exists public.md_pos_fruit_units(
 barcode text primary key check(barcode ~ '^92[0-9]{24}$'),
 identity_key text generated always as (left(barcode,16)) stored unique,
 product_id uuid not null references public.md_pos_products,
 receipt_lot_id uuid not null references public.md_pos_lots,
 lot_id uuid not null references public.md_pos_lots,
 store_id uuid not null references public.md_pos_stores,
 grams integer not null check(grams between 1 and 30000),
 status text not null check(status in ('available','sold','reject','processed','waste')),
 last_event uuid not null,
 created_at timestamptz not null default now()
);
create index if not exists md_pos_fruit_units_lot on public.md_pos_fruit_units(lot_id,status);
create index if not exists md_pos_fruit_units_store on public.md_pos_fruit_units(store_id,status);
create table if not exists public.md_pos_fruit_events(
 event_id uuid not null,barcode text not null references public.md_pos_fruit_units,
 action text not null,actor uuid not null references auth.users,
 before_state jsonb,after_state jsonb not null,created_at timestamptz not null default now(),
 primary key(event_id,barcode)
);
create table if not exists public.md_pos_fruit_requests(
 id uuid primary key,action text not null,actor uuid not null references auth.users,
 request_hash text not null,completed boolean not null default false
);
alter table public.md_pos_fruit_units enable row level security;
alter table public.md_pos_fruit_events enable row level security;
alter table public.md_pos_fruit_requests enable row level security;
revoke all on public.md_pos_fruit_units,public.md_pos_fruit_events,public.md_pos_fruit_requests from public,anon,authenticated;

create or replace function public.pos_tracking_parse(code text) returns jsonb language plpgsql immutable set search_path='' as $$
declare dt date;g integer;begin
 if left(coalesce(code,''),2)<>'92' then return null;end if;
 if code !~ '^92[0-9]{24}$' then raise exception 'Label tracking harus lengkap 26 digit';end if;
 begin dt:=make_date(2000+substring(code,9,2)::int,substring(code,7,2)::int,substring(code,5,2)::int);
 exception when others then raise exception 'Tanggal barcode tidak valid';end;
 g:=substring(code,21,6)::integer;if g not between 1 and 30000 then raise exception 'Berat barcode harus lebih dari 0 dan maksimal 30 kg';end if;
 return jsonb_build_object('machineId',substring(code,3,2),'packedDate',dt,'sequence',substring(code,11,6),'itemCode',substring(code,17,4),'grams',g);
end$$;

create or replace function public.pos_tracking_change(code text,eid uuid,act text,newlot uuid,newstatus text) returns void language plpgsql set search_path='' as $$
declare old jsonb;fresh jsonb;begin
 select to_jsonb(u) into old from public.md_pos_fruit_units u where barcode=code for update;
 if old is null then raise exception 'Barcode belum terdaftar sebagai stok masuk';end if;
 update public.md_pos_fruit_units set lot_id=newlot,store_id=(select store_id from public.md_pos_lots where id=newlot),status=newstatus,last_event=eid where barcode=code returning to_jsonb(md_pos_fruit_units.*) into fresh;
 insert into public.md_pos_fruit_events(event_id,barcode,action,actor,before_state,after_state) values(eid,code,act,auth.uid(),old,fresh);
end$$;

create or replace function public.pos_tracking_receipt(lines jsonb,commit_rows boolean) returns void language plpgsql set search_path='' as $$
declare ln jsonb;w jsonb;v jsonb;code text;keys text[]:='{}';tracked integer;cnt integer;pid uuid;known public.md_pos_fruit_units%rowtype;fresh jsonb;lot public.md_pos_lots%rowtype;begin
 for ln in select value from jsonb_array_elements(lines) loop
  tracked:=0;
  for w in select value from jsonb_array_elements(coalesce(ln->'weighings','[]')) loop
   code:=w->>'barcode';v:=public.pos_tracking_parse(code);if v is null then continue;end if;tracked:=tracked+1;
   if left(code,16)=any(keys) then raise exception 'Barcode sudah tercatat dalam penerimaan ini';end if;keys:=array_append(keys,left(code,16));
   if (w->>'kg')::numeric is distinct from (v->>'grams')::numeric/1000 or (w->>'pieces')::numeric is distinct from 1 then raise exception 'Berat label tracking dan jumlah 1 butir tidak boleh diubah';end if;
   select count(*),(array_agg(id))[1] into cnt,pid from public.md_pos_products where btrim(barcode)=v->>'itemCode';
   if cnt<>1 or pid is distinct from (ln->>'productId')::uuid or not exists(select 1 from public.md_pos_products where id=pid and stock_unit='kg_butir') then raise exception 'Pemetaan kode barang % belum tepat di Master Barang',v->>'itemCode';end if;
   select * into known from public.md_pos_fruit_units where identity_key=left(code,16);
   if found then
    if commit_rows and known.barcode=code and known.receipt_lot_id=(ln->>'id')::uuid then continue;end if;
    raise exception 'Barcode atau nomor urut mesin sudah tercatat. Stok tidak ditambahkan lagi';
   end if;
   if commit_rows then
    select * into lot from public.md_pos_lots where id=(ln->>'id')::uuid;
    insert into public.md_pos_fruit_units(barcode,product_id,receipt_lot_id,lot_id,store_id,grams,status,last_event)
    values(code,pid,lot.id,lot.id,lot.store_id,(v->>'grams')::int,'available',lot.id) returning to_jsonb(md_pos_fruit_units.*) into fresh;
    insert into public.md_pos_fruit_events(event_id,barcode,action,actor,after_state) values(lot.id,code,'receipt',auth.uid(),fresh);
   end if;
  end loop;
  if tracked>0 and tracked<>jsonb_array_length(ln->'weighings') then raise exception 'Pisahkan catatan manual / label lama; scan seluruh label tracking produk ini';end if;
 end loop;
end$$;

create or replace function public.pos_tracking_selection(codes jsonb,lot uuid,outlet uuid,allowed text[],kg numeric,pieces numeric) returns void language plpgsql set search_path='' as $$
declare code text;u public.md_pos_fruit_units%rowtype;total integer:=0;seen text[]:='{}';begin
 if jsonb_typeof(codes) is distinct from 'array' or jsonb_array_length(codes)=0 then raise exception 'Scan barcode setiap buah pada batch ini';end if;
 for code in select jsonb_array_elements_text(codes) loop
  if code=any(seen) then raise exception 'Barcode buah terduplikasi';end if;seen:=array_append(seen,code);
  perform public.pos_tracking_parse(code);
  select * into u from public.md_pos_fruit_units where barcode=code for update;
  if not found then raise exception 'Barcode belum tercatat sebagai stok masuk';end if;
  if u.lot_id is distinct from lot or u.store_id is distinct from outlet then raise exception 'Asal batch atau outlet barcode tidak cocok';end if;
  if not u.status=any(allowed) then raise exception 'Buah sudah berstatus %',u.status;end if;
  total:=total+u.grams;
 end loop;
 if total::numeric/1000 is distinct from kg or cardinality(seen)::numeric is distinct from pieces then raise exception 'Berat dan butir harus sesuai seluruh barcode yang dipilih';end if;
end$$;

-- Capture the entry points once. Private implementations remain inaccessible to clients.
do $$declare name text;signature text;definition text;begin
 foreach name in array array['pos_mutate','pos_mutate_027','pos_reject_mutate','pos_cashier_mutate','pos_receive_shipment','pos_read'] loop
  signature:=case when name='pos_read' then '()' when name='pos_receive_shipment' then '(jsonb)' else '(text,jsonb)' end;
  if to_regprocedure('public.'||name||'_before_101'||signature) is null then execute 'alter function public.'||name||signature||' rename to '||name||'_before_101';end if;
  select pg_get_functiondef(to_regprocedure('public.'||name||'_before_101'||signature)) into definition;
  execute replace(definition,name||'.',name||'_before_101.');
  execute 'revoke all on function public.'||name||'_before_101'||signature||' from public,anon,authenticated';
 end loop;
end$$;

create or replace function public.pos_tracking_delegate(entry text,act text,p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare result jsonb;begin
 if entry not in ('pos_mutate','pos_mutate_027','pos_reject_mutate','pos_cashier_mutate','pos_receive_shipment') then raise exception 'Jalur transaksi tidak valid';end if;
 if entry='pos_receive_shipment' then select public.pos_receive_shipment_before_101(p) into result;
 else execute format('select public.%I($1,$2)',entry||'_before_101') into result using act,p;end if;return result;
end$$;

create or replace function public.pos_tracking_mutate(entry text,act text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare eid uuid;st uuid;lot uuid;target uuid;ln jsonb;codes jsonb;allcodes text[]:='{}';code text;u public.md_pos_fruit_units%rowtype;
 req public.md_pos_fruit_requests%rowtype;ev public.md_pos_fruit_events%rowtype;result jsonb;newstatus text;newlot uuid;lines jsonb;ret boolean;
begin
 if act not in ('receipt','receipt_batch','sale','order_create','movement','reject_mark','reject_process','reject_loss','reject_void','order_void','order_cancel','void','sort','inventory_loss','recover','waste_process') then return public.pos_tracking_delegate(entry,act,p);end if;
 if auth.uid() is null then raise exception 'Login diperlukan';end if;
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 eid:=(p->>'id')::uuid;st:=(p->>'storeId')::uuid;lot:=coalesce(nullif(p->>'sourceLotId',''),nullif(p->>'lotId',''))::uuid;
 if lot is not null then select store_id into st from public.md_pos_lots where id=lot;end if;
 if act in ('order_void','order_cancel') then select store_id into st from public.md_pos_order_runs where id=(p->>'orderId')::uuid;end if;
 if act='void' then select store_id into st from public.md_pos_sales where id=(p->>'saleId')::uuid;end if;
 if eid is null then raise exception 'ID transaksi wajib';end if;
 perform public.pos_require(case when act in ('order_create','sale','order_void','order_cancel') then 'sell' when act in ('reject_void','void') then 'cancel' when act in ('reject_mark','reject_process','reject_loss','inventory_loss','recover','waste_process') then 'waste' else 'stock' end,st);
 select * into req from public.md_pos_fruit_requests where id=eid;
 if found then
  if req.actor<>auth.uid() or req.action<>act then raise exception 'ID transaksi sudah digunakan';end if;
  -- Nested trusted wrappers may normalize paid/metadata; only the outer request owns validation/commit.
  if not req.completed then return public.pos_tracking_delegate(entry,act,p);end if;
  if req.request_hash<>md5(p::text) then raise exception 'ID transaksi sudah digunakan dengan isi berbeda';end if;
  return public.pos_read();
 end if;
 insert into public.md_pos_fruit_requests(id,action,actor,request_hash) values(eid,act,auth.uid(),md5(p::text));
 if act in ('receipt','receipt_batch') then
  lines:=case when act='receipt_batch' then p->'lines' else jsonb_build_array(p) end;
  perform public.pos_tracking_receipt(lines,false);
 elsif act in ('sale','order_create') then
  for ln in select value from jsonb_array_elements(p->'lines') loop
   code:=ln->>'barcode';lot:=(ln->>'lotId')::uuid;
   if left(coalesce(code,''),2)='92' or exists(select 1 from public.md_pos_fruit_units where lot_id=lot) then
    if code=any(allcodes) then raise exception 'Barcode buah sudah ada dalam pesanan';end if;allcodes:=array_append(allcodes,code);
    perform public.pos_tracking_selection(case when code is null then '[]'::jsonb else jsonb_build_array(code) end,lot,st,array['available'],(ln->>'kg')::numeric,(ln->>'pieces')::numeric);
    if act='order_create' and not exists(select 1 from public.md_pos_fruit_units where barcode=code and product_id=(ln->>'productId')::uuid) then raise exception 'Produk tidak sesuai barcode';end if;
   end if;
  end loop;
 elsif act in ('movement','reject_mark','reject_process','reject_loss') then
  if exists(select 1 from public.md_pos_fruit_units where lot_id=lot) or p ? 'barcodes' then
   if act='movement' and p->>'kind'<>'Transfer' then raise exception 'Gunakan Reject & Waste untuk mencatat pengolahan buah tracking';end if;
   perform public.pos_tracking_selection(p->'barcodes',lot,st,case when act='reject_mark' then array['available'] when act='reject_process' then array['reject'] else array['available','reject'] end,coalesce((p->>'kg')::numeric,(p->>'qty')::numeric),(p->>'pieces')::numeric);
   select array_agg(value) into allcodes from jsonb_array_elements_text(p->'barcodes');
  end if;
 elsif act in ('sort','inventory_loss','recover','waste_process') and exists(select 1 from public.md_pos_fruit_units where lot_id=lot) then
  raise exception 'Gunakan scan barcode di Reject & Waste untuk batch tracking ini';
 elsif act='reject_void' then
  target:=(p->>'recordId')::uuid;
  for ev in select * from public.md_pos_fruit_events where event_id=target loop
   if not exists(select 1 from public.md_pos_fruit_units where barcode=ev.barcode and last_event=target) then raise exception 'Buah sudah diproses lagi. Batalkan proses berikutnya terlebih dahulu';end if;
  end loop;
 end if;
 result:=public.pos_tracking_delegate(entry,act,p);
 if act in ('receipt','receipt_batch') then perform public.pos_tracking_receipt(lines,true);
 elsif act in ('sale','order_create') then
  foreach code in array allcodes loop
   select lot_id into newlot from public.md_pos_fruit_units where barcode=code;
   perform public.pos_tracking_change(code,eid,act,newlot,'sold');
  end loop;
  if act='order_create' then
   -- Preserve the scanned identities in the order snapshot (the old engine projects its own fields).
   update public.md_pos_order_runs o set lines=(select jsonb_agg(x.value||case when nullif((p->'lines'->(x.ordinality::int-1))->>'barcode','') is null then '{}'::jsonb else jsonb_build_object('barcode',(p->'lines'->(x.ordinality::int-1))->>'barcode') end order by x.ordinality) from jsonb_array_elements(o.lines) with ordinality x(value,ordinality)) where o.id=eid;
  end if;
 elsif act in ('movement','reject_mark','reject_process','reject_loss') then
  newstatus:=case when act='reject_loss' then 'waste' when act='reject_process' or act='reject_mark' and coalesce((p->>'processNow')::boolean,false) then 'processed' when act='reject_mark' then 'reject' else null end;
  foreach code in array allcodes loop
   select * into u from public.md_pos_fruit_units where barcode=code;
   newlot:=case when act='movement' then eid when act='reject_mark' then (p->>'rejectLotId')::uuid else u.lot_id end;
   perform public.pos_tracking_change(code,eid,act,newlot,coalesce(newstatus,u.status));
  end loop;
 elsif act='reject_void' then
  for ev in select * from public.md_pos_fruit_events where event_id=target loop
   perform public.pos_tracking_change(ev.barcode,eid,act,(ev.before_state->>'lot_id')::uuid,ev.before_state->>'status');
   -- Restore the last effective action so earlier operations can be reversed in order.
   update public.md_pos_fruit_units set last_event=(ev.before_state->>'last_event')::uuid where barcode=ev.barcode;
   update public.md_pos_fruit_events set after_state=(select to_jsonb(restored) from public.md_pos_fruit_units restored where restored.barcode=ev.barcode) where event_id=eid and barcode=ev.barcode;
  end loop;
 elsif act in ('void','order_void','order_cancel') then
  target:=coalesce(nullif(p->>'saleId',''),nullif(p->>'orderId',''))::uuid;
  ret:=act='void';
  if act<>'void' then select coalesce((void_meta->>'returnStock')::boolean,false) into ret from public.md_pos_order_runs where id=target;end if;
  for ev in select * from public.md_pos_fruit_events where event_id=target and action in ('sale','order_create') loop
   if not exists(select 1 from public.md_pos_fruit_units where barcode=ev.barcode and last_event=target) then raise exception 'Status buah sudah berubah setelah penjualan';end if;
   perform public.pos_tracking_change(ev.barcode,eid,act,(ev.before_state->>'lot_id')::uuid,case when ret then 'available' else 'waste' end);
  end loop;
 end if;
 update public.md_pos_fruit_requests set completed=true where id=eid;
 return public.pos_read();
end$$;

create or replace function public.pos_mutate(action text,payload jsonb) returns jsonb language sql security definer set search_path='' as $$select public.pos_tracking_mutate('pos_mutate',action,payload)$$;
create or replace function public.pos_mutate_027(action text,payload jsonb) returns jsonb language sql security definer set search_path='' as $$select public.pos_tracking_mutate('pos_mutate_027',action,payload)$$;
create or replace function public.pos_reject_mutate(action text,payload jsonb) returns jsonb language sql security definer set search_path='' as $$select public.pos_tracking_mutate('pos_reject_mutate',action,payload)$$;
create or replace function public.pos_cashier_mutate(action text,payload jsonb) returns jsonb language sql security definer set search_path='' as $$select public.pos_tracking_mutate('pos_cashier_mutate',action,payload)$$;
create or replace function public.pos_receive_shipment(payload jsonb) returns jsonb language sql security definer set search_path='' as $$select public.pos_tracking_mutate('pos_receive_shipment','receipt_batch',payload)$$;
create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;begin
 s:=public.pos_read_before_101();
 return s||jsonb_build_object('fruitTrackingVersion',101,'fruitUnits',coalesce((select jsonb_agg(jsonb_build_object('barcode',u.barcode,'productId',u.product_id,'receiptLotId',u.receipt_lot_id,'lotId',u.lot_id,'storeId',u.store_id,'grams',u.grams,'status',u.status,'lastEvent',u.last_event) order by u.barcode) from public.md_pos_fruit_units u where exists(select 1 from jsonb_array_elements(s->'lots') l where l->>'id'=u.lot_id::text)),'[]'::jsonb));
end$$;
create or replace function public.pos_fruit_history(code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare st uuid;begin
 select store_id into st from public.md_pos_fruit_units where barcode=code;
 if st is null or not(public.pos_allowed('trace',st) or public.pos_allowed('stock',st) or public.pos_allowed('reports',st)) then raise exception 'Riwayat tidak ditemukan atau tidak dapat diakses';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('action',h.action,'eventId',h.event_id,'at',h.created_at,'actor',e.name,'fromStatus',h.before_state->>'status','toStatus',h.after_state->>'status','storeId',h.after_state->>'store_id','lotId',h.after_state->>'lot_id') order by h.created_at,h.event_id) from public.md_pos_fruit_events h left join public.md_pos_employees e on e.user_id=h.actor where h.barcode=code and (public.pos_allowed('trace',(h.after_state->>'store_id')::uuid) or public.pos_allowed('stock',(h.after_state->>'store_id')::uuid) or public.pos_allowed('reports',(h.after_state->>'store_id')::uuid))),'[]'::jsonb);
end$$;
revoke all on function public.pos_tracking_parse(text),public.pos_tracking_change(text,uuid,text,uuid,text),public.pos_tracking_receipt(jsonb,boolean),public.pos_tracking_selection(jsonb,uuid,uuid,text[],numeric,numeric),public.pos_tracking_delegate(text,text,jsonb),public.pos_tracking_mutate(text,text,jsonb) from public,anon,authenticated;
revoke all on function public.pos_mutate(text,jsonb),public.pos_mutate_027(text,jsonb),public.pos_reject_mutate(text,jsonb),public.pos_cashier_mutate(text,jsonb),public.pos_receive_shipment(jsonb),public.pos_read(),public.pos_fruit_history(text) from public,anon,authenticated;
grant execute on function public.pos_mutate(text,jsonb),public.pos_mutate_027(text,jsonb),public.pos_reject_mutate(text,jsonb),public.pos_cashier_mutate(text,jsonb),public.pos_receive_shipment(jsonb),public.pos_read(),public.pos_fruit_history(text) to authenticated;
notify pgrst,'reload schema';
commit;

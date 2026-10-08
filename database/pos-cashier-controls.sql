-- PATCH 054. Jalankan SELURUH file, termasuk commit. Aman dijalankan ulang.
begin;
do $$begin
 if to_regprocedure('public.pos_mutate_027(text,jsonb)') is null then raise exception 'Pasang database kompatibilitas POS 027 terlebih dahulu';end if;
 if to_regprocedure('public.pos_read_before_054()') is null then alter function public.pos_read() rename to pos_read_before_054;end if;
 if to_regprocedure('public.pos_mutate_before_054(text,jsonb)') is null then alter function public.pos_mutate(text,jsonb) rename to pos_mutate_before_054;end if;
 if to_regprocedure('public.pos_mutate_027_before_054(text,jsonb)') is null then
  alter function public.pos_mutate_027(text,jsonb) rename to pos_mutate_027_before_054;
  execute replace(pg_get_functiondef('public.pos_mutate_027_before_054(text,jsonb)'::regprocedure),'public.pos_mutate(action,payload)','public.pos_mutate_before_054(action,payload)');
 end if;
end$$;
revoke all on function public.pos_read_before_054(),public.pos_mutate_before_054(text,jsonb),public.pos_mutate_027_before_054(text,jsonb) from public,anon,authenticated;
create table if not exists public.md_pos_discounts(
 id uuid primary key,name text not null check(length(btrim(name)) between 1 and 80),kind text not null check(kind in ('percent','amount')),
 value numeric not null check(value>0 and value::text not in ('NaN','Infinity','-Infinity')),active boolean not null default true,version integer not null default 1,
 check(kind<>'percent' or value<=100));
create table if not exists public.md_pos_cashier_approvals(
 id uuid primary key,store_id uuid not null references public.md_pos_stores,kind text not null check(kind in ('discount','void')),
 requested_by uuid not null references public.md_pos_employees,requested_name text not null,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '30 minutes',
 status text not null check(status in ('pending','approved','rejected','used')),details jsonb not null,
 decided_by uuid references public.md_pos_employees,decided_name text,decided_at timestamptz,decision_note text,used_by uuid,used_at timestamptz);
create index if not exists md_pos_cashier_approval_scope on public.md_pos_cashier_approvals(requested_by,created_at desc);
create index if not exists md_pos_cashier_approval_pending on public.md_pos_cashier_approvals(status,expires_at);
alter table public.md_pos_discounts enable row level security;
alter table public.md_pos_cashier_approvals enable row level security;
revoke all on public.md_pos_discounts,public.md_pos_cashier_approvals from public,anon,authenticated;
alter table public.md_pos_order_runs add column if not exists table_no integer check(table_no between 1 and 50);
alter table public.md_pos_order_runs add column if not exists subtotal numeric;
alter table public.md_pos_order_runs add column if not exists discount jsonb;
alter table public.md_pos_order_runs add column if not exists void_meta jsonb;

create or replace function public.pos_cashier_quote(payload jsonb) returns jsonb language plpgsql set search_path='' as $$
declare p public.md_pos_products%rowtype;l jsonb;q numeric;price numeric;items jsonb:='[]';subtotal numeric:=0;tab integer;
begin
 if jsonb_typeof(payload->'lines') is distinct from 'array' or jsonb_array_length(payload->'lines') not between 1 and 100 then raise exception 'Isi pesanan, maksimal 100 baris';end if;
 if coalesce(payload->>'tableNo','')<>'' then
  tab:=(payload->>'tableNo')::integer;
  if tab not between 1 and 50 or tab::numeric<>(payload->>'tableNo')::numeric then raise exception 'Nomor meja tidak valid';end if;
 end if;
 if length(coalesce(payload->>'note',''))>300 then raise exception 'Catatan maksimal 300 karakter';end if;
 for l in select value from jsonb_array_elements(payload->'lines') loop
  select * into p from public.md_pos_products where id=(l->>'productId')::uuid;
  if not found or p.item_type in ('raw','prep') then raise exception 'Produk tidak dapat dijual';end if;
  if p.stock_unit='kg_butir' then
   if coalesce(l->>'unit','') not in ('KG','BUTIR') then raise exception 'Cara jual buah tidak valid';end if;
   price:=case when l->>'unit'='KG' then p.price_kg else p.price_piece end;
   q:=case when l->>'unit'='KG' then public.pos_positive(l->>'kg') else public.pos_unit_qty(l->>'pieces','pcs') end;
   items:=items||jsonb_build_array(jsonb_build_object('productId',p.id,'lotId',(l->>'lotId')::uuid,'unit',l->>'unit','qty',q,'kg',public.pos_positive(l->>'kg'),'pieces',public.pos_unit_qty(l->>'pieces','pcs'),'price',price));
  else
   price:=p.sale_price;q:=public.pos_unit_qty(l->>'qty',p.stock_unit);
   items:=items||jsonb_build_array(jsonb_build_object('productId',p.id,'qty',q,'price',price,'recipeVersion',case when p.item_type='recipe' then (select r.version from public.md_pos_recipes r where r.output_id=p.id) end));
  end if;
  if price is null or price<=0 or public.pos_positive(l->>'price')<>price then raise exception 'Harga mengikuti master. Gunakan diskon dengan persetujuan owner';end if;
  subtotal:=subtotal+q*price;
 end loop;
 return jsonb_build_object('storeId',(payload->>'storeId')::uuid,'date',(payload->>'date')::date,'tableNo',tab,'note',coalesce(payload->>'note',''),'lines',items,'subtotal',subtotal);
end$$;

create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;me public.md_pos_employees%rowtype;
begin
 s:=public.pos_read_before_054();
 select * into me from public.md_pos_employees where user_id=auth.uid() and active;
 if not found then raise exception 'Login diperlukan';end if;
 s:=jsonb_set(s,'{orders}',coalesce((select jsonb_agg(x||jsonb_build_object('table_no',o.table_no,'subtotal',coalesce(o.subtotal,o.total),'discount',o.discount,'void_meta',o.void_meta)) from jsonb_array_elements(s->'orders') x join public.md_pos_order_runs o on o.id=(x->>'id')::uuid),'[]'));
 return s||jsonb_build_object('cashierVersion',54,
 'discounts',coalesce((select jsonb_agg(to_jsonb(d) order by d.name) from public.md_pos_discounts d where d.active or me.role='owner'),'[]'),
 'cashierApprovals',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select * from public.md_pos_cashier_approvals a where (me.role='owner' or (a.requested_by=me.id and public.pos_allowed('sell',a.store_id))) and a.created_at>now()-interval '1 day' order by a.created_at desc limit 200) a),'[]'));
end$$;

create or replace function public.pos_cashier_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.md_pos_employees%rowtype;d public.md_pos_discounts%rowtype;a public.md_pos_cashier_approvals%rowtype;o public.md_pos_order_runs%rowtype;
 eid uuid:=(payload->>'id')::uuid;st uuid;dt date:=coalesce(nullif(payload->>'date','')::date,(now() at time zone 'Asia/Jakarta')::date);
 old_event public.md_pos_events%rowtype;quote jsonb;details jsonb;discount_doc jsonb;legacy_payload jsonb;ignored jsonb;c jsonb;l jsonb;returned jsonb:='[]';
 v_subtotal numeric;discount_amount numeric:=0;net numeric;v_paid numeric;consumed_cost numeric;lost_cost numeric:=0;return_goods boolean:=false;lost_unknown boolean:=false;has_loss boolean:=false;
begin
 select * into me from public.md_pos_employees where user_id=auth.uid() and active;
 if not found then raise exception 'Akun tidak memiliki akses POS';end if;
 if eid is null then raise exception 'ID wajib';end if;
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 select * into old_event from public.md_pos_events where id=eid;
 if found then
  if old_event.action<>action or old_event.payload<>payload or old_event.actor<>auth.uid() then raise exception 'ID sudah digunakan untuk data lain';end if;
  return public.pos_read();
 end if;
 if dt>(now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal tidak boleh di masa depan';end if;
 st:=nullif(payload->>'storeId','')::uuid;
 if action='discount_save' then
  if me.role<>'owner' then raise exception 'Pengaturan diskon hanya untuk owner';end if;
  select * into d from public.md_pos_discounts where id=(payload->>'discountId')::uuid for update;
  if coalesce(d.version,0) is distinct from (payload->>'expectedVersion')::integer then raise exception 'Diskon berubah. Perbarui data';end if;
  insert into public.md_pos_discounts(id,name,kind,value,active,version) values((payload->>'discountId')::uuid,btrim(payload->>'name'),payload->>'kind',(payload->>'value')::numeric,(payload->>'active')::boolean,coalesce(d.version,0)+1)
  on conflict(id) do update set name=excluded.name,kind=excluded.kind,value=excluded.value,active=excluded.active,version=excluded.version;
 elsif action='cashier_approval_request' then
  if st is null then raise exception 'Pilih outlet';end if;perform public.pos_require('sell',st);
  if payload->>'kind'='discount' then
   quote:=public.pos_cashier_quote(payload->'checkout');
   if (quote->>'storeId')::uuid is distinct from st or (quote->>'date')::date<>dt then raise exception 'Outlet atau tanggal pesanan berbeda';end if;
   select * into d from public.md_pos_discounts where id=(payload->>'discountId')::uuid and active;
   if not found or d.version is distinct from (payload->>'expectedVersion')::integer then raise exception 'Diskon berubah atau tidak aktif';end if;
   discount_amount:=least((quote->>'subtotal')::numeric,case when d.kind='percent' then (quote->>'subtotal')::numeric*d.value/100 else d.value end);
   details:=jsonb_build_object('quote',quote,'discountId',d.id,'version',d.version,'name',d.name,'kind',d.kind,'value',d.value,'amount',discount_amount);
  elsif payload->>'kind'='void' then
   select * into o from public.md_pos_order_runs where id=(payload->>'orderId')::uuid and store_id=st for update;
   if not found or o.status='cancelled' then raise exception 'Pesanan tidak ditemukan atau sudah void';end if;
   if length(btrim(coalesce(payload->>'reason',''))) not between 3 and 300 then raise exception 'Alasan void wajib, 3–300 karakter';end if;
   details:=jsonb_build_object('orderId',o.id,'total',o.total,'reason',btrim(payload->>'reason'),'returnStock',coalesce((payload->>'returnStock')::boolean,false));
  else raise exception 'Jenis persetujuan tidak valid';end if;
  insert into public.md_pos_cashier_approvals(id,store_id,kind,requested_by,requested_name,status,details,decided_by,decided_name,decided_at)
  values(eid,st,payload->>'kind',me.id,me.name,case when me.role='owner' then 'approved' else 'pending' end,details,case when me.role='owner' then me.id end,case when me.role='owner' then me.name end,case when me.role='owner' then now() end);
 elsif action='cashier_approval_decide' then
  if me.role<>'owner' then raise exception 'Persetujuan hanya untuk owner';end if;
  select * into a from public.md_pos_cashier_approvals where id=(payload->>'approvalId')::uuid for update;
  if not found or a.status<>'pending' or a.expires_at<=now() then raise exception 'Permintaan sudah diproses atau kedaluwarsa';end if;
  if coalesce(payload->>'decision','') not in ('approved','rejected') then raise exception 'Keputusan tidak valid';end if;
  if a.kind='discount' and payload->>'decision'='approved' and not exists(select 1 from public.md_pos_discounts where id=(a.details->>'discountId')::uuid and active and version=(a.details->>'version')::integer) then raise exception 'Diskon sudah berubah';end if;
  update public.md_pos_cashier_approvals set status=payload->>'decision',decided_by=me.id,decided_name=me.name,decided_at=now(),decision_note=left(coalesce(payload->>'note',''),300) where id=a.id;st:=a.store_id;
 elsif action='order_create' then
  if st is null then raise exception 'Pilih outlet';end if;perform public.pos_require('sell',st);
  quote:=public.pos_cashier_quote(payload);v_subtotal:=(quote->>'subtotal')::numeric;
  if nullif(payload->>'discountApprovalId','') is not null then
   select * into a from public.md_pos_cashier_approvals where id=(payload->>'discountApprovalId')::uuid for update;
   if not found or a.kind<>'discount' or a.status<>'approved' or a.expires_at<=now() or a.requested_by<>me.id or a.store_id<>st or a.details->'quote'<>quote then raise exception 'Diskon belum disetujui owner, kedaluwarsa, atau pesanan berubah';end if;
   if not exists(select 1 from public.md_pos_employees where id=a.decided_by and active and role='owner') then raise exception 'Akses owner pemberi persetujuan sudah berubah';end if;
   select * into d from public.md_pos_discounts where id=(a.details->>'discountId')::uuid and active and version=(a.details->>'version')::integer;
   if not found then raise exception 'Diskon sudah berubah';end if;
   discount_amount:=(a.details->>'amount')::numeric;
   discount_doc:=a.details-'quote'||jsonb_build_object('approvalId',a.id,'approvedBy',a.decided_by,'approvedName',a.decided_name);
  elsif nullif(payload->>'discountId','') is not null or coalesce((payload->>'discountAmount')::numeric,0)<>0 then raise exception 'Diskon perlu persetujuan owner';end if;
  net:=v_subtotal-discount_amount;v_paid:=(payload->>'paid')::numeric;
  if v_paid is null or v_paid::text in ('NaN','Infinity','-Infinity') or v_paid<net or coalesce(payload->>'payment','') not in ('Tunai','QRIS','Transfer') then raise exception 'Pembayaran belum sesuai total';end if;
  if payload->>'payment'<>'Tunai' and v_paid<>net then raise exception 'Pembayaran non-tunai harus sesuai total';end if;
  -- The established engine consumes/reserves stock with gross item prices; money is finalized atomically below.
  legacy_payload:=payload||jsonb_build_object('paid',v_subtotal);
  ignored:=public.pos_mutate_027_before_054('order_create',legacy_payload);
  update public.md_pos_order_runs set table_no=(quote->>'tableNo')::integer,subtotal=v_subtotal,discount=discount_doc,total=net,paid=v_paid where id=eid;
  update public.md_pos_money_journal set revenue=net where event_id=eid and category='sale';
  update public.md_pos_events set payload=pos_cashier_mutate.payload where id=eid;
  if a.id is not null then update public.md_pos_cashier_approvals set status='used',used_by=eid,used_at=now() where id=a.id;end if;
  return public.pos_read();
 elsif action in ('order_void','order_cancel') then
  select * into o from public.md_pos_order_runs where id=(payload->>'orderId')::uuid for update;
  if not found or o.status='cancelled' then raise exception 'Pesanan tidak ditemukan atau sudah void';end if;
  if st is distinct from o.store_id then raise exception 'Outlet pesanan berbeda';end if;
  perform public.pos_require('sell',st);
  if dt<o.business_date then raise exception 'Tanggal sebelum pesanan';end if;
  select * into a from public.md_pos_cashier_approvals where id=(payload->>'approvalId')::uuid for update;
  if not found or a.kind<>'void' or a.status<>'approved' or a.expires_at<=now() or a.requested_by<>me.id or a.store_id<>st or a.details->>'orderId'<>o.id::text or (a.details->>'total')::numeric<>o.total then raise exception 'Void membutuhkan persetujuan owner untuk pesanan ini';end if;
  if not exists(select 1 from public.md_pos_employees where id=a.decided_by and active and role='owner') then raise exception 'Akses owner pemberi persetujuan sudah berubah';end if;
  if o.payment_status='paid' and not coalesce((payload->>'refundConfirmed')::boolean,false) then raise exception 'Konfirmasi pengembalian pembayaran terlebih dahulu';end if;
  return_goods:=(a.details->>'returnStock')::boolean;
  insert into public.md_pos_events(id,action,store_id,actor,employee_id,business_date,payload) values(eid,action,st,auth.uid(),me.id,dt,payload);
  select case when bool_or(x->>'unitCost' is null) then null else coalesce(sum((x->>'qty')::numeric*(x->>'unitCost')::numeric),0) end into consumed_cost from jsonb_array_elements(o.consumption) x;
  for c in select value from jsonb_array_elements(o.consumption) loop
   select value into l from jsonb_array_elements(o.lines) where value->>'lineId'=c->>'lineId';
   if return_goods and coalesce(l->>'itemType','recipe')<>'recipe' then
    if l->>'itemType'='fruit' then
     update public.md_pos_lots set kg=kg+(c->>'qty')::numeric,pieces=pieces+(c->>'pieces')::integer where id=(c->>'lotId')::uuid and store_id=st and product_id=(c->>'productId')::uuid and quality='ready';
    else
     update public.md_pos_unit_lots set qty=qty+(c->>'qty')::numeric where id=(c->>'lotId')::uuid and store_id=st and product_id=(c->>'productId')::uuid and (expiry is null or expiry>=dt);
    end if;
    if not found then raise exception 'Stok asal tidak layak dikembalikan. Minta void tanpa pengembalian stok';end if;
    returned:=returned||jsonb_build_array(c);
    insert into public.md_pos_stock_journal(event_id,lot_id,product_id,store_id,supplier_id,qty,pieces,unit,cost,quality)
    values(eid,(c->>'lotId')::uuid,(c->>'productId')::uuid,st,(c->>'supplierId')::uuid,(c->>'qty')::numeric,coalesce((c->>'pieces')::numeric,0),c->>'unit',(c->>'qty')::numeric*(c->>'unitCost')::numeric,case when l->>'itemType'='fruit' then 'ready' end);
   else
    has_loss:=true;lost_unknown:=lost_unknown or c->>'unitCost' is null;lost_cost:=lost_cost+coalesce((c->>'qty')::numeric*(c->>'unitCost')::numeric,0);
   end if;
  end loop;
  if o.payment_status='paid' then
   update public.md_pos_money_journal m set cost=consumed_cost from public.md_pos_events e where m.event_id=e.id and m.category='sale' and ((e.action='order_create' and e.id=o.id) or (e.action='order_pay' and e.payload->>'orderId'=o.id::text));
   insert into public.md_pos_money_journal(event_id,store_id,category,revenue,cost,note) values(eid,st,'reversal',-o.total,-consumed_cost,'Void pesanan '||o.id||': '||(a.details->>'reason'));
  end if;
  if has_loss then insert into public.md_pos_money_journal(event_id,store_id,category,cost,note) values(eid,st,'loss',case when lost_unknown then null else lost_cost end,'Void: stok telah dipakai / tidak kembali');end if;
  update public.md_pos_order_runs set status='cancelled',payment_status=case when payment_status='paid' then 'refunded' else payment_status end,reserved='{}',cancel_reason=a.details->>'reason',void_meta=jsonb_build_object('eventId',eid,'date',dt,'by',me.id,'byName',me.name,'approvedBy',a.decided_by,'approvedName',a.decided_name,'reason',a.details->>'reason','returnStock',return_goods,'returned',returned) where id=o.id;
  update public.md_pos_cashier_approvals set status='used',used_by=eid,used_at=now() where id=a.id;
  return public.pos_read();
 else raise exception 'Aksi kasir tidak dikenal';end if;
 insert into public.md_pos_events(id,action,store_id,actor,employee_id,business_date,payload) values(eid,action,st,auth.uid(),me.id,dt,payload);
 return public.pos_read();
end$$;

create or replace function public.pos_mutate_027(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if action in ('order_create','order_void','order_cancel','discount_save','cashier_approval_request','cashier_approval_decide') then return public.pos_cashier_mutate(action,payload);end if;
 if action='sale' and not exists(select 1 from public.md_pos_employees where user_id=auth.uid() and active and role='owner') then raise exception 'Gunakan menu Kasir / POS terbaru';end if;
 return public.pos_mutate_027_before_054(action,payload);
end$$;
create or replace function public.pos_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if action in ('order_create','order_void','order_cancel','discount_save','cashier_approval_request','cashier_approval_decide') then return public.pos_cashier_mutate(action,payload);end if;
 if action='sale' and not exists(select 1 from public.md_pos_employees where user_id=auth.uid() and active and role='owner') then raise exception 'Gunakan menu Kasir / POS terbaru';end if;
 return public.pos_mutate_before_054(action,payload);
end$$;
revoke all on function public.pos_cashier_quote(jsonb),public.pos_cashier_mutate(text,jsonb),public.pos_read(),public.pos_mutate(text,jsonb),public.pos_mutate_027(text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_read(),public.pos_mutate(text,jsonb),public.pos_mutate_027(text,jsonb) to authenticated;
insert into public.md_pos_schema_versions(version) values(54) on conflict do nothing;
notify pgrst,'reload schema';
commit;

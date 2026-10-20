-- 071: laporan terpadu, dokumen admin dan pengeluaran. Aman diulang, tanpa reset.
begin;
set local lock_timeout='5s';
do $$begin
 perform pg_advisory_xact_lock(71031,1102);
 if not exists(select 1 from public.md_pos_schema_versions where version=64) then raise exception 'Pasang patch profil toko 064 terlebih dahulu';end if;
end$$;
create table if not exists public.md_pos_letterheads (
 store_id uuid primary key references public.md_pos_stores, version integer not null default 1,
 name text not null,address text not null,phone text not null default '',email text not null default '',
 footer text not null default '',signer text not null default '',logo text not null default '');
create table if not exists public.md_pos_documents (
 id uuid primary key,store_id uuid not null references public.md_pos_stores,
 kind text not null check(kind in ('PO','PUR','INV','DO')),status text not null default 'draft' check(status in ('draft','issued','cancelled')),
 number text unique,document_date date not null,version integer not null default 1,
 source_type text not null default '',source_id uuid,body jsonb not null,header jsonb, total numeric not null default 0,
 created_by uuid not null references auth.users,created_at timestamptz not null default now(),issued_at timestamptz,cancel_reason text);
create unique index if not exists md_pos_document_source on public.md_pos_documents(kind,source_type,source_id) where status='issued' and source_id is not null and source_type in ('order','sale','movement','receipt','unit_receipt');
create index if not exists md_pos_documents_lookup on public.md_pos_documents(store_id,document_date desc,kind,status);
create table if not exists public.md_pos_doc_counters (period text not null,kind text not null,value bigint not null,primary key(period,kind));
create table if not exists public.md_pos_admin_events (
 id uuid primary key,action text not null,entity_id uuid not null,store_id uuid not null references public.md_pos_stores,
 actor uuid not null references auth.users,at timestamptz not null default now(),request_hash text not null,note text not null default '');
create table if not exists public.md_pos_expenses (
 id uuid primary key,store_id uuid not null references public.md_pos_stores,date date not null,category text not null,
 description text not null,amount numeric not null check(amount>0),payment text not null,reference text not null default '',
 created_by uuid not null references auth.users,created_at timestamptz not null default now(),voided boolean not null default false,void_reason text);
-- Unit transfer uses the existing lot/journal structure, with an explicit parent for tracing.
alter table public.md_pos_unit_lots add column if not exists transfer_source_id uuid references public.md_pos_unit_lots;
do $$declare t text;begin
 foreach t in array array['letterheads','documents','doc_counters','admin_events','expenses'] loop
 execute format('alter table public.md_pos_%I enable row level security',t);
 execute format('revoke all on public.md_pos_%I from public,anon,authenticated',t);end loop;
 if to_regprocedure('public.pos_read_before_071()') is null then alter function public.pos_read() rename to pos_read_before_071;end if;
 if to_regprocedure('public.pos_mutate_before_071(text,jsonb)') is null then alter function public.pos_mutate(text,jsonb) rename to pos_mutate_before_071;end if;
 if to_regprocedure('public.pos_mutate_027_before_071(text,jsonb)') is null then alter function public.pos_mutate_027(text,jsonb) rename to pos_mutate_027_before_071;end if;
end$$;
revoke all on function public.pos_read_before_071(),public.pos_mutate_before_071(text,jsonb),public.pos_mutate_027_before_071(text,jsonb) from public,anon,authenticated;

create or replace function public.pos_document_access(k text,st uuid) returns void language plpgsql set search_path='' as $$begin
 perform public.pos_require(case when k='DO' then 'stock' else 'finance' end,st);
end$$;
create or replace function public.pos_letterhead(st uuid) returns jsonb language sql set search_path='' as $$
 select coalesce((select to_jsonb(h) from public.md_pos_letterheads h where h.store_id=st),
 (select jsonb_build_object('store_id',id,'version',0,'name',name,'address',location,'phone',phone,'logo',receipt_logo,'email','','footer','','signer','') from public.md_pos_stores where id=st))
$$;
create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;begin
 s:=public.pos_read_before_071();
 s:=jsonb_set(s,'{journal}',coalesce((select jsonb_agg(j||jsonb_build_object('date',ev.business_date,'action',ev.action)) from jsonb_array_elements(s->'journal') j join public.md_pos_events ev on ev.id=(j->>'event_id')::uuid),'[]'));
 s:=jsonb_set(s,'{unitLots}',coalesce((select jsonb_agg(x||jsonb_build_object('sourceLotId',l.transfer_source_id)) from jsonb_array_elements(s->'unitLots') x join public.md_pos_unit_lots l on l.id=(x->>'id')::uuid),'[]'));
 return s||jsonb_build_object('reportsAdminVersion',71,
 'documents',coalesce((select jsonb_agg((to_jsonb(d)-'body'-'header')||jsonb_build_object('party',d.body->>'party','reference',d.body->>'reference','sourceLabel',d.body->>'sourceLabel') order by d.created_at desc) from public.md_pos_documents d where public.pos_allowed(case when d.kind='DO' then 'stock' else 'finance' end,d.store_id)),'[]'),
 'expenses',coalesce((select jsonb_agg(to_jsonb(x) order by date desc) from public.md_pos_expenses x where public.pos_allowed('finance',x.store_id)),'[]'),
 'adminEvents',coalesce((select jsonb_agg(to_jsonb(x)-'request_hash' order by at desc) from public.md_pos_admin_events x where public.pos_allowed('finance',x.store_id) or (x.action like 'document_%' and exists(select 1 from public.md_pos_documents d where d.id=x.entity_id and d.kind='DO' and public.pos_allowed('stock',d.store_id)))),'[]'));
end$$;
create or replace function public.pos_document_get(document_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.md_pos_documents%rowtype;begin
 select * into d from public.md_pos_documents where id=document_id;
 if not found then raise exception 'Dokumen tidak ditemukan';end if;
 perform public.pos_document_access(d.kind,d.store_id);
 return to_jsonb(d)||jsonb_build_object('sourceCancelled',case when d.source_type='order' then exists(select 1 from public.md_pos_order_runs where id=d.source_id and status='cancelled') when d.source_type='sale' then exists(select 1 from public.md_pos_sales where id=d.source_id and voided) else false end,'header',coalesce(d.header,public.pos_letterhead(d.store_id)),
 'history',coalesce((select jsonb_agg(to_jsonb(e)-'request_hash' order by at) from public.md_pos_admin_events e where entity_id=d.id),'[]'));
end$$;
create or replace function public.pos_letterhead_get(store_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not public.pos_allowed('finance',store_id) and not public.pos_allowed('stock',store_id) and not public.pos_allowed('reports',store_id) then raise exception 'Hak akses tidak tersedia';end if;
 return public.pos_letterhead(store_id);
end$$;

create or replace function public.pos_admin_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
<<admin>>
declare eid uuid:=(payload->>'id')::uuid;target uuid:=coalesce(nullif(payload->>'documentId','')::uuid,nullif(payload->>'expenseId','')::uuid,eid);
 st uuid:=(payload->>'storeId')::uuid; dt date;d public.md_pos_documents%rowtype;po public.md_pos_documents%rowtype;
 body jsonb;line jsonb;clean jsonb:='[]';src jsonb;s jsonb;h jsonb;prior public.md_pos_admin_events%rowtype;
 p public.md_pos_products%rowtype;u public.md_pos_unit_lots%rowtype;f public.md_pos_lots%rowtype;
 q numeric;pieces numeric;price numeric;shipping numeric;subtotal numeric:=0;total numeric:=0;share numeric;used_shipping numeric:=0;
 sid uuid;child uuid;dest uuid;count_lines integer;idx integer:=0;seq bigint;period text;number text;reason text;k text;source text;link uuid;hash text:=md5(payload::text);
begin
 if auth.uid() is null or not exists(select 1 from public.md_pos_employees where user_id=auth.uid() and active) then raise exception 'Login diperlukan';end if;
 if eid is null or st is null then raise exception 'ID dan toko wajib';end if;
 -- Shared with stock operations, preventing duplicate numbers and conflicting consumption.
 perform pg_advisory_xact_lock(71031,1102);
 select * into prior from public.md_pos_admin_events where id=eid;
 if found then
  if prior.actor is distinct from auth.uid() or prior.action<>action or prior.request_hash<>hash then raise exception 'ID pengiriman sudah digunakan untuk data lain';end if;
  if not public.pos_allowed('stock',prior.store_id) and not public.pos_allowed('finance',prior.store_id) then raise exception 'Hak akses tidak tersedia';end if;
  return public.pos_read();
 end if;
 if action='letterhead_save' then
  if not exists(select 1 from public.md_pos_employees where user_id=auth.uid() and active and role='owner') then raise exception 'Hanya owner dapat mengubah kop surat';end if;
  h:=payload->'header';
  if coalesce(length(btrim(h->>'name')),0) not between 1 and 100 or coalesce(length(btrim(h->>'address')),0) not between 1 and 500 then raise exception 'Isi nama dan alamat kop surat';end if;
  if length(coalesce(h->>'phone',''))>50 or length(coalesce(h->>'email',''))>150 or length(coalesce(h->>'footer',''))>500 or length(coalesce(h->>'signer',''))>100 then raise exception 'Isi kop surat terlalu panjang';end if;
  if coalesce(h->>'logo','')<>'' and (length(h->>'logo')>100000 or (h->>'logo') !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$') then raise exception 'Logo harus PNG/JPEG/WebP maksimal 70 KB';end if;
  if coalesce((select version from public.md_pos_letterheads where store_id=st),0) is distinct from (payload->>'version')::integer then raise exception 'Kop surat berubah. Muat ulang';end if;
  insert into public.md_pos_letterheads(store_id,name,address,phone,email,footer,signer,logo) values(st,btrim(h->>'name'),btrim(h->>'address'),coalesce(h->>'phone',''),coalesce(h->>'email',''),coalesce(h->>'footer',''),coalesce(h->>'signer',''),coalesce(h->>'logo',''))
  on conflict(store_id) do update set version=md_pos_letterheads.version+1,name=excluded.name,address=excluded.address,phone=excluded.phone,email=excluded.email,footer=excluded.footer,signer=excluded.signer,logo=excluded.logo;
  target:=st;
 elsif action in ('expense_save','expense_void') then
  perform public.pos_require('finance',st);
  if action='expense_save' then
   dt:=(payload->>'date')::date;q:=(payload->>'amount')::numeric;
   if dt is null or dt>(now() at time zone 'Asia/Jakarta')::date or q is null or q<=0 or q>1e15 or q::text in ('NaN','Infinity','-Infinity') then raise exception 'Tanggal atau nominal tidak valid';end if;
   if coalesce(length(btrim(payload->>'description')),0) not between 3 and 500 or payload->>'category' not in ('Gaji','Sewa','Listrik & air','Transportasi','Operasional','Lainnya') or payload->>'payment' not in ('Tunai','Transfer','QRIS') then raise exception 'Lengkapi pengeluaran';end if;
   insert into public.md_pos_expenses(id,store_id,date,category,description,amount,payment,reference,created_by) values(eid,st,dt,payload->>'category',btrim(payload->>'description'),q,payload->>'payment',left(coalesce(payload->>'reference',''),100),auth.uid());target:=eid;
  else
   reason:=btrim(payload->>'reason');if coalesce(length(reason),0)<3 then raise exception 'Isi alasan pembatalan';end if;
   update public.md_pos_expenses set voided=true,void_reason=left(reason,500) where id=target and store_id=st and not voided;
   if not found then raise exception 'Pengeluaran tidak ditemukan atau sudah dibatalkan';end if;
  end if;
 elsif action='document_save' then
  k:=payload->>'kind';perform public.pos_document_access(k,st);
  if k is null or k not in ('PO','PUR','INV','DO') then raise exception 'Jenis dokumen tidak valid';end if;
  dt:=(payload->>'date')::date;body:=payload->'body';source:=coalesce(body->>'sourceType','');link:=nullif(body->>'sourceId','')::uuid;
  if dt is null or dt>(now() at time zone 'Asia/Jakarta')::date or jsonb_typeof(body) is distinct from 'object' or length(body::text)>100000 then raise exception 'Tanggal atau isi dokumen tidak valid';end if;
  if coalesce(length(body->>'party'),0)>200 or coalesce(length(body->>'address'),0)>500 or coalesce(length(body->>'note'),0)>1000 then raise exception 'Isi dokumen terlalu panjang';end if;
  if not ((k='PO' and source='') or (k='PUR' and source in ('','po','receipt','unit_receipt')) or (k='INV' and source in ('order','sale')) or (k='DO' and source in ('order','sale','movement','transfer'))) then raise exception 'Sumber dokumen tidak sesuai';end if;
  if source not in ('','transfer') and link is null then raise exception 'Pilih referensi transaksi';end if;
  select * into d from public.md_pos_documents where id=target for update;
  if found then
   if d.store_id<>st or d.kind<>k or d.status<>'draft' then raise exception 'Dokumen terbit tidak dapat diedit';end if;
   if d.version is distinct from (payload->>'version')::integer then raise exception 'Dokumen berubah. Muat ulang';end if;
   update public.md_pos_documents set body=payload->'body',document_date=dt,source_type=source,source_id=link,version=version+1 where id=target;
  else
   if coalesce((payload->>'version')::integer,0)<>0 then raise exception 'Dokumen tidak ditemukan';end if;
   insert into public.md_pos_documents(id,store_id,kind,document_date,source_type,source_id,body,created_by) values(target,st,k,dt,source,link,body,auth.uid());
  end if;
 elsif action in ('document_issue','document_cancel') then
  select * into d from public.md_pos_documents where id=target for update;
  if not found or d.store_id<>st then raise exception 'Dokumen tidak ditemukan';end if;
  perform public.pos_document_access(d.kind,st);
  if d.version is distinct from (payload->>'version')::integer then raise exception 'Dokumen berubah. Muat ulang';end if;
  if action='document_cancel' then
   if d.status='cancelled' then raise exception 'Dokumen sudah dibatalkan';end if;
   if d.status='issued' and (d.kind='PUR' or (d.kind='DO' and d.source_type='transfer')) then raise exception 'Stok sudah dicatat. Gunakan koreksi stok, dokumen tetap menjadi riwayat';end if;
   if exists(select 1 from public.md_pos_documents x where x.source_id=d.id and x.status='issued') then raise exception 'Dokumen sudah dipakai pembelian';end if;
   reason:=btrim(payload->>'reason');if coalesce(length(reason),0)<3 then raise exception 'Isi alasan pembatalan';end if;
   update public.md_pos_documents set status='cancelled',cancel_reason=left(reason,500),version=version+1 where id=d.id;
  else
   if d.status<>'draft' then raise exception 'Dokumen sudah diterbitkan';end if;
   body:=d.body;clean:='[]';s:=public.pos_read();dt:=d.document_date;
   if nullif(body->>'dueDate','')::date<dt then raise exception 'Jatuh tempo tidak boleh sebelum tanggal dokumen';end if;
   if d.source_id is not null and d.source_type in ('order','sale','movement','receipt','unit_receipt') and exists(select 1 from public.md_pos_documents x where x.kind=d.kind and x.source_type=d.source_type and x.source_id=d.source_id and x.status='issued') then raise exception 'Dokumen terbit untuk referensi ini sudah ada';end if;
   if d.source_type in ('order','sale') then
    if not public.pos_allowed('reports',st) and not public.pos_allowed('sell',st) then raise exception 'Hak akses penjualan diperlukan';end if;
    select x into src from jsonb_array_elements(s->case when d.source_type='order' then 'orders' else 'sales' end) x where x->>'id'=d.source_id::text;
    if src is null or coalesce(src->>'store_id',src->>'storeId')<>st::text or (d.source_type='order' and (coalesce(src->>'payment_status',src->>'status')<>'paid' or src->>'status'='cancelled')) or coalesce((src->>'voided')::boolean,false) then raise exception 'Transaksi harus lunas, aktif dan dari toko ini';end if;
    if dt<coalesce(nullif(src->>'paid_date',''),src->>'date',src->>'business_date')::date then raise exception 'Tanggal dokumen sebelum transaksi';end if;
    total:=(src->>'total')::numeric;
    for line in select value from jsonb_array_elements(src->'lines') loop
     select * into p from public.md_pos_products where id=(line->>'productId')::uuid;
     clean:=clean||jsonb_build_array(jsonb_build_object('productId',p.id,'name',coalesce(line->>'name',p.name),'qty',coalesce(nullif(line->>'qty','')::numeric,case when line->>'unit'='KG' then (line->>'kg')::numeric else (line->>'pieces')::numeric end),'unit',line->>'unit','kg',line->'kg','pieces',line->'pieces','price',line->'price','total',coalesce(nullif(line->>'total','')::numeric,(line->>'qty')::numeric*(line->>'price')::numeric)));
    end loop;
    body:=body||jsonb_build_object('lines',clean,'subtotal',coalesce((src->>'subtotal')::numeric,(select sum((x->>'total')::numeric) from jsonb_array_elements(clean) x)),'paid',src->'paid','payment',src->'payment','sourceLabel',coalesce(src->>'receipt_no',src->>'id'));
   elsif d.source_type in ('receipt','unit_receipt','movement') then
    select x into src from jsonb_array_elements(s->case d.source_type when 'receipt' then 'lots' when 'unit_receipt' then 'unitLots' else 'movements' end) x where x->>'id'=d.source_id::text;
    if src is null or src->>'storeId'<>st::text then raise exception 'Referensi tidak ditemukan di toko ini';end if;
    if d.source_type='movement' and src->>'kind'<>'Transfer' then raise exception 'Pilih transfer barang';end if;
    if d.source_type='receipt' and src->>'sourceLotId' is not null or d.source_type='unit_receipt' and (src->>'kind'<>'purchase' or src->>'sourceLotId' is not null) then raise exception 'Pilih pembelian asli, bukan hasil transfer/produksi';end if;
    if dt<(src->>'date')::date then raise exception 'Tanggal dokumen sebelum transaksi';end if;
    select * into p from public.md_pos_products where id=(src->>'productId')::uuid;
    q:=coalesce((src->>'receivedKg')::numeric,(src->>'receivedQty')::numeric,(src->>'kg')::numeric);
    total:=case when d.kind='DO' then 0 else coalesce((src->>'totalCost')::numeric,q*(src->>'unitCost')::numeric) end;
    if total is null then raise exception 'Modal penerimaan belum lengkap';end if;
    body:=body||jsonb_build_object('supplierId',src->'supplierId','party',case when d.kind='DO' then (select name from public.md_pos_stores where id=(src->>'toStoreId')::uuid) else coalesce((select name from public.md_pos_suppliers where id=(src->>'supplierId')::uuid),body->>'party') end,'address',case when d.kind='DO' then (select location from public.md_pos_stores where id=(src->>'toStoreId')::uuid) else (select address from public.md_pos_suppliers where id=(src->>'supplierId')::uuid) end,'toStoreId',src->'toStoreId','lines',jsonb_build_array(jsonb_build_object('productId',p.id,'name',p.name,'qty',q,'pieces',coalesce(src->'receivedPieces',src->'pieces'),'unit',case when p.stock_unit='kg_butir' then 'kg' else p.stock_unit end,'price',total/q,'total',total)),'sourceLabel',d.source_id);
   elsif d.source_type='transfer' then
    dest:=(body->>'toStoreId')::uuid;perform public.pos_require('stock',dest);
    if dest is null or dest=st or not exists(select 1 from public.md_pos_stores where id=dest) then raise exception 'Pilih toko tujuan yang berbeda';end if;
    if jsonb_typeof(body->'lines') is distinct from 'array' or jsonb_array_length(body->'lines') not between 1 and 100 then raise exception 'Isi barang transfer';end if;
    if (select count(distinct x->>'lotId') from jsonb_array_elements(body->'lines') x)<>jsonb_array_length(body->'lines') then raise exception 'Lot transfer tidak boleh ganda';end if;
    for line in select value from jsonb_array_elements(body->'lines') loop
     q:=public.pos_positive(line->>'qty');if q>1e12 or q::text in ('NaN','Infinity','-Infinity') then raise exception 'Jumlah transfer tidak valid';end if;child:=gen_random_uuid();sid:=(line->>'lotId')::uuid;
     select * into f from public.md_pos_lots where id=sid for update;
     if found then
      if f.store_id<>st or dt<f.received_date then raise exception 'Asal barang atau tanggal transfer tidak sesuai';end if;
      pieces:=public.pos_positive(line->>'pieces');
      perform public.pos_mutate_027_before_071('movement',jsonb_build_object('id',child,'storeId',st,'date',dt,'lotId',sid,'toStoreId',dest,'kind','Transfer','kg',q,'pieces',pieces,'note','Surat jalan '||d.id));
      select * into p from public.md_pos_products where id=f.product_id;
      clean:=clean||jsonb_build_array(jsonb_build_object('productId',p.id,'name',p.name,'lotId',sid,'receiptId',child,'qty',q,'pieces',pieces,'unit','kg','price',0,'total',0));
     else
      select * into u from public.md_pos_unit_lots where id=sid for update;
      if not found or u.store_id<>st or dt<u.received_date or q>u.qty or (u.unit in ('pcs','porsi') and q<>trunc(q)) then raise exception 'Jumlah, asal, atau tanggal transfer tidak valid';end if;
      if exists(select 1 from public.md_pos_order_runs o where o.store_id=st and o.status='queued' and coalesce(to_jsonb(o)->>'payment_status','')='paid') then raise exception 'Selesaikan antrean kitchen sebelum transfer bahan agar cadangan pesanan aman';end if;
      insert into public.md_pos_events(id,action,store_id,actor,business_date,payload) values(child,'unit_transfer',st,auth.uid(),dt,jsonb_build_object('documentId',d.id,'toStoreId',dest));
      insert into public.md_pos_stock_journal(event_id,lot_id,product_id,store_id,supplier_id,qty,pieces,unit,cost) values(child,u.id,u.product_id,st,u.supplier_id,-q,0,u.unit,-q*u.unit_cost),(child,child,u.product_id,dest,u.supplier_id,q,0,u.unit,q*u.unit_cost);
      update public.md_pos_unit_lots set qty=qty-q where id=u.id;
      insert into public.md_pos_unit_lots(id,product_id,store_id,unit,received_qty,qty,received_date,expiry,kind,supplier_id,note,created_by,unit_cost,transfer_source_id) values(child,u.product_id,dest,u.unit,q,q,dt,u.expiry,'opening',u.supplier_id,'Transfer '||d.id,auth.uid(),u.unit_cost,u.id);
      select * into p from public.md_pos_products where id=u.product_id;
      clean:=clean||jsonb_build_array(jsonb_build_object('productId',p.id,'name',p.name,'lotId',sid,'receiptId',child,'qty',q,'unit',u.unit,'price',0,'total',0));
     end if;
    end loop;
    body:=body||jsonb_build_object('lines',clean,'party',(select name from public.md_pos_stores where id=dest),'address',(select location from public.md_pos_stores where id=dest));total:=0;
   else
    sid:=(body->>'supplierId')::uuid;
    if not exists(select 1 from public.md_pos_suppliers where id=sid) then raise exception 'Pilih supplier';end if;
    if jsonb_typeof(body->'lines') is distinct from 'array' or jsonb_array_length(body->'lines') not between 1 and 100 then raise exception 'Isi 1–100 produk';end if;
    if (select count(distinct x->>'productId') from jsonb_array_elements(body->'lines') x)<>jsonb_array_length(body->'lines') then raise exception 'Produk tidak boleh ganda';end if;
    shipping:=coalesce((body->>'shipping')::numeric,0);
    if shipping<0 or shipping>1e15 or shipping::text in ('NaN','Infinity','-Infinity') then raise exception 'Ongkir tidak valid';end if;
    for line in select value from jsonb_array_elements(body->'lines') loop
     select * into p from public.md_pos_products where id=(line->>'productId')::uuid;
     if not found or p.item_type not in ('raw','direct') then raise exception 'Pilih barang pembelian, bukan hasil produksi/resep';end if;
     q:=public.pos_positive(line->>'qty');price:=(line->>'price')::numeric;pieces:=coalesce((line->>'pieces')::numeric,0);
     if q>1e12 or price is null or price<0 or price>1e12 or price::text in ('NaN','Infinity','-Infinity') or q::text in ('NaN','Infinity','-Infinity') then raise exception 'Jumlah atau harga tidak valid';end if;
     if p.stock_unit in ('pcs','porsi') and q<>trunc(q) then raise exception 'Jumlah pcs harus bulat';end if;
     if p.stock_unit='kg_butir' and (pieces<=0 or pieces<>trunc(pieces)) then raise exception 'Isi jumlah butir';end if;
     subtotal:=subtotal+q*price;
     clean:=clean||jsonb_build_array(jsonb_build_object('productId',p.id,'name',p.name,'qty',q,'pieces',pieces,'unit',case when p.stock_unit='kg_butir' then 'kg' else p.stock_unit end,'price',price,'total',q*price,'expiry',nullif(line->>'expiry','')));
    end loop;
    if d.source_type='po' then
     select * into po from public.md_pos_documents where id=d.source_id for update;
     if not found or po.status<>'issued' or po.kind<>'PO' or po.store_id<>st or po.body->>'supplierId'<>sid::text or dt<po.document_date then raise exception 'PO tidak sesuai toko, supplier, atau tanggal';end if;
     for line in select value from jsonb_array_elements(clean) loop
      select x into src from jsonb_array_elements(po.body->'lines') x where x->>'productId'=line->>'productId';
      select coalesce(sum((x->>'qty')::numeric),0) into q from public.md_pos_documents other cross join lateral jsonb_array_elements(other.body->'lines') x where other.source_type='po' and other.source_id=po.id and other.status='issued' and x->>'productId'=line->>'productId';
      if src is null or q+(line->>'qty')::numeric>(src->>'qty')::numeric then raise exception 'Pembelian melebihi sisa jumlah PO';end if;
     end loop;
     body:=body||jsonb_build_object('sourceLabel',po.number);
    end if;
    total:=subtotal+shipping;count_lines:=jsonb_array_length(clean);
    if d.kind='PUR' then
     perform public.pos_require('stock',st);body:=body||jsonb_build_object('lines','[]'::jsonb);
     for line in select value from jsonb_array_elements(clean) loop
      idx:=idx+1;child:=gen_random_uuid();
      share:=case when idx=count_lines then shipping-used_shipping when subtotal>0 then shipping*(line->>'total')::numeric/subtotal else shipping/count_lines end;used_shipping:=used_shipping+share;
      select * into p from public.md_pos_products where id=(line->>'productId')::uuid;
      src:=jsonb_build_object('id',child,'storeId',st,'supplierId',sid,'productId',p.id,'date',dt,'expiry',line->>'expiry','note',left('Pembelian '||d.id||' · '||coalesce(body->>'reference',''),300),'kind','purchase','qty',line->'qty','kg',line->'qty','pieces',line->'pieces','purchaseCost',line->'total','shippingCost',share,'totalCost',(line->>'total')::numeric+share);
      perform public.pos_mutate_027_before_071(case when p.stock_unit='kg_butir' then 'receipt' else 'unit_receipt' end,src);
      body:=jsonb_set(body,'{lines}',(body->'lines')||jsonb_build_array(line||jsonb_build_object('receiptId',child,'shipping',share)));
     end loop;
    else body:=body||jsonb_build_object('lines',clean);end if;
    body:=body||jsonb_build_object('subtotal',subtotal,'shipping',shipping,'party',(select name from public.md_pos_suppliers where id=sid),'address',(select address from public.md_pos_suppliers where id=sid));
   end if;
   if d.kind in ('INV','DO') and coalesce(length(btrim(body->>'party')),0)=0 then raise exception 'Isi nama penerima/pelanggan';end if;
   if d.kind='DO' then
    -- Delivery documents expose quantities only, including to stock-only staff.
    select coalesce(jsonb_agg((x-'price'-'total'-'cost'-'unitCost')||jsonb_build_object('qty',coalesce(nullif(x->>'kg','')::numeric,(x->>'qty')::numeric),'unit',case when nullif(x->>'kg','')::numeric>0 then 'kg' else lower(x->>'unit') end)),'[]') into clean from jsonb_array_elements(body->'lines') x;
    body:=(body-'subtotal'-'shipping'-'paid'-'payment')||jsonb_build_object('lines',clean);total:=0;
   end if;
   -- Freeze the actual outlet, recipient, totals and letterhead at issue time.
   h:=public.pos_letterhead(st);period:=to_char(dt,'YYYYMM');
   insert into public.md_pos_doc_counters(period,kind,value) values(period,d.kind,1) on conflict on constraint md_pos_doc_counters_pkey do update set value=md_pos_doc_counters.value+1 returning value into seq;
   number:='MD/'||d.kind||'/'||period||'/'||lpad(seq::text,greatest(6,length(seq::text)),'0');
   update public.md_pos_documents set status='issued',number=admin.number,body=admin.body,header=h,total=admin.total,issued_at=now(),version=version+1 where id=d.id;
  end if;
 else raise exception 'Aksi admin tidak dikenal';end if;
 insert into public.md_pos_admin_events(id,action,entity_id,store_id,actor,request_hash,note) values(eid,action,target,st,auth.uid(),hash,coalesce(reason,''));
 return public.pos_read();
end$$;
create or replace function public.pos_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if action in ('letterhead_save','expense_save','expense_void','document_save','document_issue','document_cancel') then return public.pos_admin_mutate(action,payload);end if;
 return public.pos_mutate_before_071(action,payload);
end$$;
create or replace function public.pos_mutate_027(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if action in ('letterhead_save','expense_save','expense_void','document_save','document_issue','document_cancel') then return public.pos_admin_mutate(action,payload);end if;
 return public.pos_mutate_027_before_071(action,payload);
end$$;
revoke all on function public.pos_document_access(text,uuid),public.pos_letterhead(uuid),public.pos_admin_mutate(text,jsonb),public.pos_document_get(uuid),public.pos_letterhead_get(uuid),public.pos_read(),public.pos_mutate(text,jsonb),public.pos_mutate_027(text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_document_get(uuid),public.pos_letterhead_get(uuid),public.pos_read(),public.pos_mutate(text,jsonb),public.pos_mutate_027(text,jsonb) to authenticated;
insert into public.md_pos_schema_versions(version) values(71) on conflict do nothing;
notify pgrst,'reload schema';
commit;
select 71 as version,'Laporan dan Admin Dokumen siap' as status;

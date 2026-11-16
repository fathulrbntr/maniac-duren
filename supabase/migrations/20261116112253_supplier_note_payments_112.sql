-- 112: supplier note details, independent invoice/freight payments, owner corrections.
-- Apply after 107. No reset and no rewriting of issued customer/transfer documents.
begin;
set local lock_timeout='5s';
select pg_catalog.pg_advisory_xact_lock(71031,1102);
do $$begin
 if to_regclass('md_supply.receipt_plans') is null or to_regprocedure('public.pos_warehouse_mutate(text,jsonb)') is null then raise exception 'Pasang gudang 107 terlebih dahulu';end if;
end$$;
alter table md_supply.receipt_plans add column if not exists revision integer not null default 0;
alter table md_supply.receipt_plans add column if not exists invoice_tracked boolean not null default false;
alter table md_supply.receipt_plans add column if not exists shipping_tracked boolean not null default false;
-- Existing notes have unknown payment history. New notes start explicitly unpaid.
alter table md_supply.receipt_plans alter column invoice_tracked set default true;
alter table md_supply.receipt_plans alter column shipping_tracked set default true;
create table if not exists md_supply.note_payments(
 id uuid primary key references md_supply.events,
 plan_id uuid not null references md_supply.receipt_plans,
 component text not null check(component in ('invoice','shipping')),
 amount numeric(18,2) not null check(amount>0),paid_on date not null,
 method text not null check(method in ('transfer','cash','other')),reference text not null default '',
 void_event_id uuid unique references md_supply.events,void_reason text
);
create index if not exists md_supply_note_payments_plan on md_supply.note_payments(plan_id,component);
create table if not exists md_supply.note_changes(
 id uuid primary key references md_supply.events,plan_id uuid not null references md_supply.receipt_plans,
 before_value jsonb not null,after_value jsonb not null,reason text not null
);
create index if not exists md_supply_note_changes_plan on md_supply.note_changes(plan_id);
create index if not exists md_supply_items_target_lot on md_supply.items(target_lot_id);
alter table md_supply.note_payments enable row level security;
alter table md_supply.note_changes enable row level security;
revoke all on md_supply.note_payments,md_supply.note_changes from public,anon,authenticated;
do $$begin
 if to_regprocedure('public.pos_read_before_112()') is null then alter function public.pos_read() rename to pos_read_before_112;end if;
 if to_regprocedure('public.pos_warehouse_mutate_before_112(text,jsonb)') is null then alter function public.pos_warehouse_mutate(text,jsonb) rename to pos_warehouse_mutate_before_112;end if;
end$$;
revoke all on function public.pos_read_before_112(),public.pos_warehouse_mutate_before_112(text,jsonb) from public,anon,authenticated;

create or replace function md_supply.note_amount(v text,zero_ok boolean default false) returns numeric language plpgsql immutable set search_path='' as $$
declare n numeric:=nullif(v,'')::numeric;begin
 if n is null or n::text in ('NaN','Infinity','-Infinity') or n<0 or (not zero_ok and n=0) or n>999999999999 or round(n,2)<>n then raise exception 'Nilai rupiah tidak valid (maksimal 2 desimal)';end if;return n;
end$$;

-- Recompute current stock through its actual ancestry. Internal transfer prices
-- are an independent cost boundary; supplier attribution still follows the roots.
create or replace function md_supply.note_cost(lots jsonb,origins jsonb,key text,supplier boolean,trail text[] default '{}') returns numeric language plpgsql immutable set search_path='' as $$
declare l jsonb:=lots->key;inputs jsonb:=origins->key;x jsonb;total numeric:=0;c numeric;den numeric;begin
 if l is null then return null;end if;
 if key=any(trail) or cardinality(trail)>100 then raise exception 'Jejak modal batch melingkar atau terlalu dalam';end if;
 if l->>'sourceLotId' is not null and l->>'internalTransfer'='true' and not supplier then return (l->>'unitCost')::numeric;end if;
 if inputs is not null and jsonb_array_length(inputs)>0 then
  den:=coalesce((l->>'receivedQty')::numeric,(l->>'receivedKg')::numeric);
  if den is null or den<=0 then return null;end if;
  for x in select value from jsonb_array_elements(inputs) loop
   c:=md_supply.note_cost(lots,origins,x->>'lotId',supplier,trail||key);
   if c is null then return null;end if;
   total:=total+(x->>'qty')::numeric*c;
  end loop;return total/den;
 elsif l->>'sourceLotId' is not null then
  return md_supply.note_cost(lots,origins,l->>'sourceLotId',supplier,trail||key);
 end if;
 return case when supplier then coalesce((l->>'supplierUnitCost')::numeric,(l->>'unitCost')::numeric) else (l->>'unitCost')::numeric end;
end$$;

create or replace function md_supply.note_reprice(plan md_supply.receipt_plans) returns void language plpgsql set search_path='' as $$
declare l public.md_pos_lots%rowtype;ln jsonb;kg numeric;share numeric;allocated numeric:=0;idx int:=0;roots uuid[]:='{}';
 s jsonb;lots jsonb;origins jsonb;lot_key text;begin
 if plan.received_id is null then return;end if;
 select sum(received_kg) into kg from public.md_pos_lots where shipment_id=plan.received_id and source_lot_id is null;
 if kg is null or kg<=0 then raise exception 'Batch penerimaan tidak ditemukan; koreksi dibatalkan';end if;
 if (select count(*) from public.md_pos_lots where shipment_id=plan.received_id and source_lot_id is null)<>jsonb_array_length(plan.lines) then raise exception 'Jumlah batch tidak cocok dengan nota';end if;
 for ln in select value from jsonb_array_elements(plan.lines) loop
  select * into strict l from public.md_pos_lots where shipment_id=plan.received_id and source_lot_id is null and product_id=(ln->>'productId')::uuid;
  idx:=idx+1;share:=case when idx=jsonb_array_length(plan.lines) then plan.shipping-allocated else plan.shipping*l.received_kg/kg end;allocated:=allocated+share;
  update public.md_pos_lots set purchase_cost=(ln->>'purchaseCost')::numeric,shipping_cost=share,total_cost=(ln->>'purchaseCost')::numeric+share,
   unit_cost=((ln->>'purchaseCost')::numeric+share)/l.received_kg,supplier_unit_cost=((ln->>'purchaseCost')::numeric+share)/l.received_kg where id=l.id;
  roots:=array_append(roots,l.id);
 end loop;
 s:=public.pos_read_before_112();
 select coalesce(jsonb_object_agg(x->>'lot_id',x->'inputs'),'{}') into origins from jsonb_array_elements(coalesce(s->'origins','[]')) x;
 select jsonb_object_agg(x->>'id',x||jsonb_build_object('internalTransfer',
  exists(select 1 from md_supply.items i where i.target_lot_id=(x->>'id')::uuid) or exists(select 1 from public.md_pos_unit_lots u where u.id=(x->>'id')::uuid and u.transfer_source_id is not null))) into lots
 from jsonb_array_elements(coalesce(s->'lots','[]')||coalesce(s->'unitLots','[]')) x;
 for lot_key in
  with recursive edges as (
   select value->>'sourceLotId' parent,key child from jsonb_each(lots) where value->>'sourceLotId' is not null
   union select i->>'lotId',o.key from jsonb_each(origins) o cross join lateral jsonb_array_elements(o.value) i
  ), affected(k) as (
   select unnest(roots)::text union select e.child from affected a join edges e on e.parent=a.k
  ) select k from affected where not(k::uuid=any(roots))
 loop
  update public.md_pos_lots set unit_cost=md_supply.note_cost(lots,origins,lot_key,false),supplier_unit_cost=md_supply.note_cost(lots,origins,lot_key,true) where id=lot_key::uuid;
  update public.md_pos_unit_lots set unit_cost=md_supply.note_cost(lots,origins,lot_key,false),supplier_unit_cost=md_supply.note_cost(lots,origins,lot_key,true) where id=lot_key::uuid;
 end loop;
end$$;

create or replace function public.pos_warehouse_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare eid uuid;pid uuid;p md_supply.receipt_plans%rowtype;ev md_supply.events%rowtype;pay md_supply.note_payments%rowtype;
 owner boolean;kind text;amount numeric;due numeric;paid numeric;new_lines jsonb:='[]';ln jsonb;new_shipping numeric;reason text;before_doc jsonb;day date:=(now() at time zone 'Asia/Jakarta')::date;dt date;begin
 if action not in ('supplier_note_correct','supplier_note_payment','supplier_note_payment_void','supplier_note_confirm_unpaid') then return public.pos_warehouse_mutate_before_112(action,payload);end if;
 if auth.uid() is null then raise exception 'Login diperlukan';end if;
 perform public.pos_require('backoffice');perform public.pos_require('finance');
 select exists(select 1 from public.md_pos_employees where user_id=auth.uid() and active and role='owner') into owner;
 if action in ('supplier_note_correct','supplier_note_payment_void') and not owner then raise exception 'Hanya owner dapat melakukan koreksi';end if;
 eid:=nullif(payload->>'id','')::uuid;pid:=nullif(payload->>'planId','')::uuid;
 if eid is null or pid is null then raise exception 'ID operasi dan nota wajib';end if;
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 select * into ev from md_supply.events where id=eid;
 if found then
  if ev.actor<>auth.uid() or ev.action<>action or ev.request is distinct from payload then raise exception 'ID operasi telah dipakai untuk data berbeda';end if;
  return public.pos_read();
 end if;
 select * into p from md_supply.receipt_plans where id=pid for update;
 if not found then raise exception 'Nota supplier tidak ditemukan';end if;
 if (payload->>'expectedRevision')::integer is distinct from p.revision then raise exception 'Nota berubah. Tutup detail, perbarui, lalu coba lagi';end if;
 if action='supplier_note_correct' then
  if payload->'ownerConfirmed' is distinct from 'true'::jsonb then raise exception 'Konfirmasi persetujuan owner diperlukan';end if;
  reason:=btrim(coalesce(payload->>'reason',''));
  if length(reason) not between 5 and 500 then raise exception 'Isi alasan koreksi 5–500 karakter';end if;
  new_shipping:=md_supply.note_amount(payload->>'shippingCost',true);
  if jsonb_typeof(payload->'lines') is distinct from 'array' or jsonb_array_length(payload->'lines')<>jsonb_array_length(p.lines) then raise exception 'Produk nota tidak boleh diganti';end if;
  if (select count(distinct x->>'productId') from jsonb_array_elements(payload->'lines') x)<>jsonb_array_length(p.lines) then raise exception 'Produk terduplikasi';end if;
  for ln in select value from jsonb_array_elements(p.lines) loop
   select md_supply.note_amount(x->>'purchaseCost') into amount from jsonb_array_elements(payload->'lines') x where x->>'productId'=ln->>'productId';
   if amount is null then raise exception 'Produk nota tidak boleh diganti';end if;
   new_lines:=new_lines||jsonb_build_array(jsonb_build_object('productId',ln->>'productId','purchaseCost',amount));
  end loop;
  perform md_supply.note_amount((select sum((x->>'purchaseCost')::numeric)::text from jsonb_array_elements(new_lines) x));
  if new_lines=p.lines and new_shipping=p.shipping then raise exception 'Tidak ada perubahan nilai nota atau ongkir';end if;
  before_doc:=jsonb_build_object('lines',p.lines,'shippingCost',p.shipping,'revision',p.revision);
  update md_supply.receipt_plans rp set lines=new_lines,shipping=new_shipping where rp.id=pid returning rp.* into p;
  perform md_supply.note_reprice(p);
 elsif action in ('supplier_note_payment','supplier_note_confirm_unpaid') then
  kind:=payload->>'component';if kind is null or kind not in ('invoice','shipping') then raise exception 'Pilih pembayaran nota atau ongkir';end if;
  due:=case when kind='shipping' then p.shipping else (select sum((x->>'purchaseCost')::numeric) from jsonb_array_elements(p.lines) x) end;
  select coalesce(sum(np.amount),0) into paid from md_supply.note_payments np where np.plan_id=pid and np.component=kind and np.void_event_id is null;
  if action='supplier_note_payment' then
   amount:=md_supply.note_amount(payload->>'amount');dt:=nullif(payload->>'date','')::date;
   if dt is null or dt>day then raise exception 'Tanggal pembayaran tidak valid';end if;
   if amount>due-paid then raise exception 'Pembayaran melebihi sisa tagihan';end if;
   if coalesce(payload->>'method','') not in ('transfer','cash','other') or length(coalesce(payload->>'reference',''))>200 then raise exception 'Metode atau referensi pembayaran tidak valid';end if;
  elsif paid<>0 then raise exception 'Nota sudah memiliki pembayaran';end if;
  update md_supply.receipt_plans set invoice_tracked=case when kind='invoice' then true else invoice_tracked end,shipping_tracked=case when kind='shipping' then true else shipping_tracked end where id=pid;
 else
  reason:=btrim(coalesce(payload->>'reason',''));if length(reason) not between 5 and 500 then raise exception 'Isi alasan pembatalan 5–500 karakter';end if;
  select * into pay from md_supply.note_payments where id=(payload->>'paymentId')::uuid and plan_id=pid for update;
  if not found or pay.void_event_id is not null then raise exception 'Pembayaran tidak ditemukan atau sudah dibatalkan';end if;
 end if;
 insert into md_supply.events(id,action,actor,request) values(eid,action,auth.uid(),payload);
 if action='supplier_note_correct' then
  insert into md_supply.note_changes values(eid,pid,before_doc,jsonb_build_object('lines',p.lines,'shippingCost',p.shipping,'revision',p.revision+1),reason);
 elsif action='supplier_note_payment' then
  insert into md_supply.note_payments(id,plan_id,component,amount,paid_on,method,reference) values(eid,pid,kind,amount,dt,payload->>'method',btrim(coalesce(payload->>'reference','')));
 elsif action='supplier_note_payment_void' then
  update md_supply.note_payments set void_event_id=eid,void_reason=reason where id=pay.id;
 end if;
 update md_supply.receipt_plans set revision=revision+1 where id=pid;
 return public.pos_read();
end$$;

create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;begin
 s:=public.pos_read_before_112();
 return jsonb_set(s,'{receiptPlans}',coalesce((select jsonb_agg(x||jsonb_build_object(
  'revision',p.revision,'invoiceTracked',p.invoice_tracked,'shippingTracked',p.shipping_tracked,'createdAt',p.created_at,
  'createdBy',(select name from public.md_pos_employees where user_id=p.created_by),
  'payments',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'component',n.component,'amount',n.amount,'date',n.paid_on,'method',n.method,'reference',n.reference,'actor',(select name from public.md_pos_employees where user_id=e.actor),'at',e.at,'voided',n.void_event_id is not null,'voidReason',n.void_reason,'voidAt',v.at,'voidBy',(select name from public.md_pos_employees where user_id=v.actor)) order by e.at,n.id) from md_supply.note_payments n join md_supply.events e on e.id=n.id left join md_supply.events v on v.id=n.void_event_id where n.plan_id=p.id),'[]'),
  'corrections',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'before',c.before_value,'after',c.after_value,'reason',c.reason,'at',e.at,'actor',(select name from public.md_pos_employees where user_id=e.actor)) order by e.at,c.id) from md_supply.note_changes c join md_supply.events e on e.id=c.id where c.plan_id=p.id),'[]')) order by p.created_at desc)
  from jsonb_array_elements(s->'receiptPlans') x join md_supply.receipt_plans p on p.id=(x->>'id')::uuid),'[]'))||jsonb_build_object('supplierNotesVersion',112);
end$$;
revoke all on all functions in schema md_supply from public,anon,authenticated;
revoke all on function public.pos_warehouse_mutate(text,jsonb),public.pos_read() from public,anon,authenticated;
grant execute on function public.pos_warehouse_mutate(text,jsonb),public.pos_read() to authenticated;
notify pgrst,'reload schema';
commit;

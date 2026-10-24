-- PATCH 085: global member directory, product loyalty, auditable opt-in.
-- Apply AFTER payment-methods-084.sql. Transactional and safe to rerun.
begin;
do $$begin
 if to_regprocedure('public.pos_read_before_084()') is null then raise exception 'Pasang payment-methods-084.sql terlebih dahulu';end if;
end$$;
create table if not exists public.md_pos_members(
 id uuid primary key,name text not null check(length(name) between 2 and 100),phone text not null unique check(phone~'^[1-9][0-9]{7,14}$'),email text not null default '',
 active boolean not null default true,wa_opt_in boolean not null default false,consent_at timestamptz not null default clock_timestamp(),revision integer not null default 1,
 created_by uuid not null references auth.users,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.md_pos_point_rules(
 product_id uuid primary key references public.md_pos_products on delete cascade,unit text not null,step_qty numeric not null check(step_qty>0 and step_qty<=1000000),points integer not null check(points between 0 and 1000000),
 active boolean not null,revision integer not null,updated_by uuid not null references auth.users,updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.md_pos_crm_receipts(
 source_kind text not null check(source_kind in ('order','sale')),source_id uuid not null,store_id uuid not null references public.md_pos_stores,
 member_id uuid references public.md_pos_members,member_name text,points bigint not null default 0 check(points between 0 and 1000000000),breakdown jsonb not null default '[]',
 total numeric not null,business_date date not null,refunded boolean not null default false,created_at timestamptz not null default clock_timestamp(),primary key(source_kind,source_id)
);
create index if not exists md_pos_crm_receipts_member on public.md_pos_crm_receipts(member_id,created_at desc);
create table if not exists public.md_pos_point_ledger(
 id uuid primary key default gen_random_uuid(),member_id uuid not null references public.md_pos_members,source_kind text not null,source_id uuid not null,
 kind text not null check(kind in ('earn','refund')),points bigint not null,created_at timestamptz not null default clock_timestamp(),actor uuid references auth.users,
 unique(source_kind,source_id,kind),foreign key(source_kind,source_id) references public.md_pos_crm_receipts(source_kind,source_id)
);
create index if not exists md_pos_point_ledger_member on public.md_pos_point_ledger(member_id,created_at desc);
create table if not exists public.md_pos_crm_events(
 id uuid primary key,actor uuid not null references auth.users,action text not null,payload jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create table if not exists public.md_pos_member_consents(
 id uuid primary key default gen_random_uuid(),member_id uuid not null references public.md_pos_members,phone text not null,granted boolean not null,statement text not null,
 source text not null,actor uuid not null references auth.users,event_id uuid not null unique references public.md_pos_crm_events,created_at timestamptz not null default clock_timestamp()
);
do $$declare t text;begin foreach t in array array['members','point_rules','crm_receipts','point_ledger','crm_events','member_consents'] loop
 execute format('alter table public.md_pos_%I enable row level security',t);execute format('revoke all on public.md_pos_%I from public,anon,authenticated',t);
end loop;end$$;
create or replace function public.pos_crm_require(admin_only boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare role_name text;begin
 select role into role_name from public.md_pos_employees where user_id=auth.uid() and active;
 if role_name is null or not public.pos_allowed('sell') then raise exception 'Tidak memiliki akses member';end if;
 if admin_only and role_name not in ('owner','manager') then raise exception 'Hanya owner / manager dapat membuka data CRM';end if;
end$$;
create or replace function public.pos_crm_member_json(m public.md_pos_members) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',m.id,'name',m.name,'phone',m.phone,'email',m.email,'active',m.active,'waOptIn',m.wa_opt_in,'consentAt',m.consent_at,'revision',m.revision,'createdAt',m.created_at,
 'balance',coalesce((select sum(points) from public.md_pos_point_ledger where member_id=m.id),0));
$$;
-- Lookup is bounded. Cashiers must search or use a chosen ID; full CRM/export is manager/owner only.
create or replace function public.pos_crm_read(payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare admin_user boolean;q text:=left(btrim(coalesce(payload->>'query','')),100);mid uuid:=nullif(payload->>'memberId','')::uuid;
 off integer:=greatest(0,coalesce((payload->>'offset')::integer,0));opt boolean:=coalesce((payload->>'optInOnly')::boolean,false);exp boolean:=coalesce((payload->>'export')::boolean,false);detail boolean:=coalesce((payload->>'detail')::boolean,false);members jsonb;cnt bigint;ledger jsonb:='[]';lc bigint:=0;
begin
 perform public.pos_crm_require(exp or detail);
 select role in ('owner','manager') into admin_user from public.md_pos_employees where user_id=auth.uid() and active;
 if not admin_user and mid is null and length(q)<2 then return jsonb_build_object('members','[]'::jsonb,'total',0,'offset',off,'limit',50);end if;
 with selected as(select m.* from public.md_pos_members m where (mid is null or m.id=mid) and (admin_user or m.active)
 and (not coalesce((payload->>'activeOnly')::boolean,false) or m.active)
 and (q='' or strpos(lower(m.name),lower(q))>0 or strpos(m.phone,regexp_replace(regexp_replace(q,'[^0-9]','','g'),'^0','62'))>0 and q~'[0-9]')
 and (not(opt or exp) or m.active and m.wa_opt_in))
 select (select count(*) from selected),coalesce((select jsonb_agg(public.pos_crm_member_json(x) order by x.name,x.id) from (select * from selected order by name,id limit 50 offset off) x),'[]') into cnt,members;
 if detail then
  select count(*) into lc from public.md_pos_point_ledger l join public.md_pos_crm_receipts r using(source_kind,source_id) where l.member_id=mid and public.pos_allowed('sell',r.store_id);
  select coalesce(jsonb_agg(to_jsonb(x) order by x."createdAt" desc,x.id),'[]') into ledger from (
   select l.id,l.member_id as "memberId",l.source_id as "sourceId",l.source_kind as "sourceKind",l.kind,l.points,l.created_at as "createdAt",r.store_id as "storeId",r.total,r.business_date as date,r.breakdown
   from public.md_pos_point_ledger l join public.md_pos_crm_receipts r using(source_kind,source_id)
   where l.member_id=mid and public.pos_allowed('sell',r.store_id) order by l.created_at desc,l.id limit 50 offset off) x;
 end if;
 return jsonb_build_object('members',members,'total',cnt,'offset',off,'limit',50,'ledger',ledger,'ledgerTotal',lc);
end$$;

-- Persist a final paid snapshot, using only validated server transaction lines.
create or replace function public.pos_crm_record(kind text,target uuid,customer uuid) returns void language plpgsql security definer set search_path='' as $$
declare lines jsonb;st uuid;dt date;amount numeric;member public.md_pos_members%rowtype;r record;q numeric;earned bigint;total_points bigint:=0;details jsonb:='[]';begin
 if exists(select 1 from public.md_pos_crm_receipts where source_kind=kind and source_id=target) then return;end if;
 if kind='order' then
  select o.lines,o.store_id,o.business_date,o.total into lines,st,dt,amount from public.md_pos_order_runs o where id=target and payment_status='paid';
 else
  select s.store_id,s.sale_date,s.total into st,dt,amount from public.md_pos_sales s where id=target and not voided;
  select coalesce(jsonb_agg(jsonb_build_object('productId',i.product_id,'kg',i.kg,'pieces',i.pieces,'qty',case when i.unit='KG' then i.kg else i.pieces end)),'[]') into lines from public.md_pos_sale_items i where sale_id=target;
 end if;
 if st is null then return;end if;
 if customer is not null then
  select * into member from public.md_pos_members where id=customer and active;
  if not found then raise exception 'Member tidak aktif / tidak ditemukan';end if;
  for r in select pr.*,p.name,p.stock_unit from public.md_pos_point_rules pr join public.md_pos_products p on p.id=pr.product_id where pr.active and pr.points>0 and (p.stock_unit='kg_butir' or pr.unit=p.stock_unit) loop
   select coalesce(sum(case when r.stock_unit='kg_butir' then (l->>case when r.unit='kg' then 'kg' else 'pieces' end)::numeric else (l->>'qty')::numeric end),0) into q from jsonb_array_elements(lines) l where l->>'productId'=r.product_id::text;
   if q>0 then
    if floor(q/r.step_qty)*r.points>1000000000 then raise exception 'Poin transaksi melebihi batas';end if;
    earned:=floor(q/r.step_qty)*r.points;total_points:=total_points+earned;
    details:=details||jsonb_build_array(jsonb_build_object('productId',r.product_id,'name',r.name,'unit',r.unit,'qty',q,'stepQty',r.step_qty,'points',r.points,'awarded',earned,'revision',r.revision));
   end if;
  end loop;
 end if;
 if total_points>1000000000 then raise exception 'Poin transaksi melebihi batas';end if;
 insert into public.md_pos_crm_receipts(source_kind,source_id,store_id,member_id,member_name,points,breakdown,total,business_date) values(kind,target,st,customer,member.name,total_points,details,amount,dt);
 if customer is not null then insert into public.md_pos_point_ledger(member_id,source_kind,source_id,kind,points,actor) values(customer,kind,target,'earn',total_points,auth.uid());end if;
end$$;
-- Refund the recorded award once. Later rule/member edits cannot change the reversal.
create or replace function public.pos_crm_refund() returns trigger language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new);vkind text:=case when tg_table_name='md_pos_order_runs' then 'order' else 'sale' end;r public.md_pos_crm_receipts%rowtype;begin
 if (vkind='order' and n->>'payment_status'='refunded') or (vkind='sale' and (n->>'voided')::boolean) then
  select * into r from public.md_pos_crm_receipts where source_kind=vkind and source_id=new.id for update;
  if found and not r.refunded then
   if r.member_id is not null then insert into public.md_pos_point_ledger(member_id,source_kind,source_id,kind,points,actor) values(r.member_id,vkind,new.id,'refund',-r.points,auth.uid()) on conflict(source_kind,source_id,kind) do nothing;end if;
   update public.md_pos_crm_receipts set refunded=true where source_kind=vkind and source_id=new.id;
  end if;
 end if;return new;
end$$;
drop trigger if exists md_pos_order_crm_refund on public.md_pos_order_runs;
create trigger md_pos_order_crm_refund after update on public.md_pos_order_runs for each row execute function public.pos_crm_refund();
drop trigger if exists md_pos_sale_crm_refund on public.md_pos_sales;
create trigger md_pos_sale_crm_refund after update on public.md_pos_sales for each row execute function public.pos_crm_refund();

do $$begin
 if to_regprocedure('public.pos_read_before_085()') is null then alter function public.pos_read() rename to pos_read_before_085;end if;
 if to_regprocedure('public.pos_mutate_before_085(text,jsonb)') is null then alter function public.pos_mutate(text,jsonb) rename to pos_mutate_before_085;end if;
 if to_regprocedure('public.pos_mutate_027_before_085(text,jsonb)') is null then alter function public.pos_mutate_027(text,jsonb) rename to pos_mutate_027_before_085;end if;
end$$;
create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;key text;kind text;begin
 s:=public.pos_read_before_085();
 foreach key in array array['orders','sales'] loop
  kind:=case when key='orders' then 'order' else 'sale' end;
  s:=jsonb_set(s,array[key],coalesce((select jsonb_agg(x||jsonb_build_object('customer',case when r.member_id is not null then jsonb_build_object('id',r.member_id,'name',r.member_name) else null end,'pointsEarned',coalesce(r.points,0),'pointsReversed',coalesce(r.refunded,false))) from jsonb_array_elements(s->key) x left join public.md_pos_crm_receipts r on r.source_kind=kind and r.source_id=(x->>'id')::uuid),'[]'));
 end loop;
 return s||jsonb_build_object('crmVersion',85,'pointRules',coalesce((select jsonb_agg(jsonb_build_object('productId',r.product_id,'unit',r.unit,'stepQty',r.step_qty,'points',r.points,'active',r.active,'revision',r.revision)) from public.md_pos_point_rules r),'[]'),
 'crmEvents',coalesce((select jsonb_agg(jsonb_build_object('id',x.id)) from (select id from public.md_pos_crm_events where actor=auth.uid() order by created_at desc limit 50)x),'[]'));
end$$;
create or replace function public.pos_crm_mutate(action text,payload jsonb,compat boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare eid uuid:=(payload->>'id')::uuid;mid uuid:=nullif(payload->>'memberId','')::uuid;ev public.md_pos_crm_events%rowtype;m public.md_pos_members%rowtype;
 nm text;ph text;em text;opt boolean;act boolean;rev integer;pid uuid;un text;step numeric;pts integer;product public.md_pos_products%rowtype;ignored jsonb;depth integer:=coalesce(nullif(current_setting('pos.crm_depth',true),''),'0')::integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 if action in ('crm_member_save','crm_rule_save') then
  perform public.pos_crm_require(false);if eid is null then raise exception 'ID operasi wajib';end if;
  select * into ev from public.md_pos_crm_events where id=eid;
  if found then if ev.actor<>auth.uid() or ev.action<>action or ev.payload<>payload then raise exception 'ID sudah digunakan untuk data lain';end if;return public.pos_read();end if;
  if action='crm_member_save' then
   if mid is null then raise exception 'ID member wajib';end if;
   select * into m from public.md_pos_members where id=mid for update;
   if found then perform public.pos_crm_require(true);end if;
   if coalesce(m.revision,0) is distinct from (payload->>'expectedRevision')::integer then raise exception 'Data member berubah. Muat ulang.';end if;
   nm:=btrim(coalesce(payload->>'name',''));em:=lower(btrim(coalesce(payload->>'email','')));ph:=btrim(coalesce(payload->>'phone',''));
   if length(nm) not between 2 and 100 or nm~'[[:cntrl:]]' then raise exception 'Nama member harus 2–100 karakter';end if;
   if ph!~'^[+0-9 ().-]+$' then raise exception 'Nomor telepon tidak valid';end if;
   ph:=regexp_replace(ph,'[ ().-]','','g');ph:=regexp_replace(ph,'^0','62');ph:=regexp_replace(ph,'^\+','');
   if ph!~'^[1-9][0-9]{7,14}$' then raise exception 'Nomor telepon tidak valid';end if;
   if em<>'' and (length(em)>254 or em!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Alamat email tidak valid';end if;
   if jsonb_typeof(payload->'waOptIn') is distinct from 'boolean' or jsonb_typeof(payload->'active') is distinct from 'boolean' then raise exception 'Status member / persetujuan tidak valid';end if;
   opt:=(payload->>'waOptIn')::boolean;act:=(payload->>'active')::boolean;
   if m.id is null and not act then raise exception 'Member baru harus aktif';end if;
   if exists(select 1 from public.md_pos_members where phone=ph and id<>mid) then raise exception 'Nomor telepon sudah terdaftar. Cari member tersebut.';end if;
   insert into public.md_pos_crm_events(id,actor,action,payload) values(eid,auth.uid(),action,payload);
   insert into public.md_pos_members(id,name,phone,email,active,wa_opt_in,created_by) values(mid,nm,ph,em,act,opt,auth.uid())
   on conflict(id) do update set name=excluded.name,phone=excluded.phone,email=excluded.email,active=excluded.active,wa_opt_in=excluded.wa_opt_in,revision=md_pos_members.revision+1,updated_at=clock_timestamp(),
   consent_at=case when md_pos_members.wa_opt_in<>excluded.wa_opt_in or md_pos_members.phone<>excluded.phone then clock_timestamp() else md_pos_members.consent_at end;
   if m.id is null or m.wa_opt_in<>opt or m.phone<>ph then
    insert into public.md_pos_member_consents(member_id,phone,granted,statement,source,actor,event_id) values(mid,ph,opt,'Pelanggan setuju menerima promosi Maniac Duren melalui WhatsApp dan dapat berhenti kapan saja.','Dicatat petugas POS setelah konfirmasi pelanggan',auth.uid(),eid);
   end if;
  else
   if not exists(select 1 from public.md_pos_employees where user_id=auth.uid() and active and role='owner') then raise exception 'Hanya owner dapat mengatur poin';end if;
   pid:=(payload->>'productId')::uuid;select * into product from public.md_pos_products where id=pid;
   if not found or product.item_type in ('raw','prep') then raise exception 'Pilih produk yang dijual';end if;
   select revision into rev from public.md_pos_point_rules where product_id=pid for update;
   if coalesce(rev,0) is distinct from (payload->>'expectedRevision')::integer then raise exception 'Aturan poin berubah. Muat ulang.';end if;
   un:=payload->>'unit';step:=(payload->>'stepQty')::numeric;pts:=(payload->>'points')::integer;
   if un is null or (product.stock_unit='kg_butir' and un not in ('kg','butir')) or (product.stock_unit<>'kg_butir' and un<>product.stock_unit) then raise exception 'Satuan poin tidak valid';end if;
   if step is null or step::text in ('NaN','Infinity','-Infinity') or step<=0 or step>1000000 or step<>round(step,6) or (un in ('pcs','porsi','butir') and step<>trunc(step)) then raise exception 'Kelipatan jumlah tidak valid';end if;
   if pts is null or pts not between 0 and 1000000 or pts::numeric is distinct from (payload->>'points')::numeric or jsonb_typeof(payload->'active') is distinct from 'boolean' then raise exception 'Poin / status aturan tidak valid';end if;
   insert into public.md_pos_point_rules(product_id,unit,step_qty,points,active,revision,updated_by) values(pid,un,step,pts,(payload->>'active')::boolean,coalesce(rev,0)+1,auth.uid())
   on conflict(product_id) do update set unit=excluded.unit,step_qty=excluded.step_qty,points=excluded.points,active=excluded.active,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=clock_timestamp();
   insert into public.md_pos_crm_events(id,actor,action,payload) values(eid,auth.uid(),action,payload);
  end if;
 else
  perform set_config('pos.crm_depth',(depth+1)::text,true);
  if compat then ignored:=public.pos_mutate_027_before_085(action,payload);else ignored:=public.pos_mutate_before_085(action,payload);end if;
  perform set_config('pos.crm_depth',depth::text,true);
  if depth>0 then return ignored;end if;
  if action in ('order_create','order_pay','sale') then
   perform public.pos_crm_record(case when action='sale' then 'sale' else 'order' end,case when action='order_pay' then (payload->>'orderId')::uuid else eid end,mid);
  else return ignored;end if;
 end if;
 return public.pos_read();
end$$;
create or replace function public.pos_mutate(action text,payload jsonb) returns jsonb language sql security definer set search_path='' as $$select public.pos_crm_mutate(action,payload,false)$$;
create or replace function public.pos_mutate_027(action text,payload jsonb) returns jsonb language sql security definer set search_path='' as $$select public.pos_crm_mutate(action,payload,true)$$;
revoke all on function public.pos_crm_require(boolean),public.pos_crm_member_json(public.md_pos_members),public.pos_crm_record(text,uuid,uuid),public.pos_crm_refund(),public.pos_crm_mutate(text,jsonb,boolean),public.pos_read_before_085(),public.pos_mutate_before_085(text,jsonb),public.pos_mutate_027_before_085(text,jsonb) from public,anon,authenticated;
revoke all on function public.pos_crm_read(jsonb),public.pos_read(),public.pos_mutate(text,jsonb),public.pos_mutate_027(text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_crm_read(jsonb),public.pos_read(),public.pos_mutate(text,jsonb),public.pos_mutate_027(text,jsonb) to authenticated;
insert into public.md_pos_schema_versions(version) values(85) on conflict do nothing;
notify pgrst,'reload schema';
commit;

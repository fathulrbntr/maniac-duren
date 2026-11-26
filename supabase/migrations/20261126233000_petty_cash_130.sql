-- Patch 130. Install after cashier expenses 128. Existing source-of-funds records remain historical.
begin;
set local lock_timeout='10s';
select pg_catalog.pg_advisory_xact_lock(71031,1102);
alter table public.md_pos_expenses drop constraint if exists md_pos_expenses_funding_check;
alter table public.md_pos_expenses add constraint md_pos_expenses_funding_check
  check(funding in ('store','retail','distribution','petty'));

create table if not exists md_supply.petty_requests(
 id uuid primary key, store_id uuid not null references public.md_pos_stores,
 amount numeric not null check(amount>0 and amount<=1e15 and amount=trunc(amount)),
 reason text not null, requested_by uuid not null references auth.users, requested_at timestamptz not null default clock_timestamp(),
 status text not null default 'pending' check(status in ('pending','paid','rejected')),
 decision_id uuid unique, decided_by uuid references auth.users, decided_at timestamptz, reference text
);
create unique index if not exists md_petty_one_pending on md_supply.petty_requests(store_id) where status='pending';
create index if not exists md_petty_store_status on md_supply.petty_requests(store_id,status);
alter table md_supply.petty_requests enable row level security;
revoke all on md_supply.petty_requests from public,anon,authenticated;

-- Actual bank movements. Store sales, pending requests and supplier bills do not fund Retail.
create or replace view md_supply.retail_movements as
 select deposit_date as day,amount from public.md_pos_cash_deposits d join public.md_pos_stores st on st.id=d.store_id and st.location_type='store'
 union all select (voided_at at time zone 'Asia/Jakarta')::date,-amount from public.md_pos_cash_deposits d join public.md_pos_stores st on st.id=d.store_id and st.location_type='store' where voided_at is not null
 union all select p.date,-p.amount from md_supply.outbound_payments p join md_supply.outbound_orders o on o.id=p.order_id where o.kind='transfer'
 union all select (e.at at time zone 'Asia/Jakarta')::date,-(e.request->>'amount')::numeric
 from md_supply.events e join md_supply.transfers t on t.id=e.transfer_id where e.action='transfer_payment'
 and not exists(select 1 from md_supply.outbound_orders o where o.id=t.id)
 union all select x.date,-x.amount from public.md_pos_expenses x where x.funding='retail'
 union all select (ev.at at time zone 'Asia/Jakarta')::date,x.amount from public.md_pos_expenses x join public.md_pos_admin_events ev
 on ev.entity_id=x.id and ev.action='expense_void' where x.funding='retail'
 union all select (decided_at at time zone 'Asia/Jakarta')::date,-amount from md_supply.petty_requests where status='paid';
revoke all on md_supply.retail_movements from public,anon,authenticated;
create or replace function md_supply.require_retail_balance(dt date,value numeric)
returns void language plpgsql set search_path='' as $$
declare available numeric;
begin
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 -- A backdated debit must fit both on its effective date and after subsequent payments.
 with days as (select greatest(day,dt) d,sum(amount) movement from md_supply.retail_movements group by 1
   union all select dt,0), balances as (select sum(sum(movement)) over(order by d) balance from days group by d)
 select min(balance) into available from balances;
 if value>available then raise exception 'Saldo PT Retail dari setoran toko tidak cukup (tersedia Rp %)',available;end if;
end$$;
create or replace function md_supply.petty_balance(st uuid)
returns numeric language sql stable set search_path='' as $$
 select coalesce((select sum(amount) from md_supply.petty_requests where store_id=st and status='paid'),0)
      -coalesce((select sum(amount) from public.md_pos_expenses where store_id=st and funding='petty' and not voided),0);
$$;
-- Require available funds at each normal debit source (including direct payment on invoice issue).
create or replace function md_supply.retail_debit_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='md_pos_expenses' then
   if new.funding='retail' then perform md_supply.require_retail_balance(new.date,new.amount);
   elsif new.funding='petty' then
     perform pg_catalog.pg_advisory_xact_lock(71031,1102);
     if new.amount>md_supply.petty_balance(new.store_id) then raise exception 'Saldo petty cash tidak cukup. Ajukan reimbursement ke Back Office.';end if;
   end if;
 elsif tg_table_name='outbound_payments' then
   if exists(select 1 from md_supply.outbound_orders where id=new.order_id and kind='transfer') then perform md_supply.require_retail_balance(new.date,new.amount);end if;
 elsif tg_table_name='events' then
   if new.action='transfer_payment' and not exists(select 1 from md_supply.outbound_orders where id=new.transfer_id) then
    perform md_supply.require_retail_balance((new.at at time zone 'Asia/Jakarta')::date,(new.request->>'amount')::numeric);end if;
 elsif tg_table_name='md_pos_cash_deposits' then
   if old.voided_at is null and new.voided_at is not null and exists(select 1 from public.md_pos_stores where id=new.store_id and location_type='store') then
    perform md_supply.require_retail_balance((new.voided_at at time zone 'Asia/Jakarta')::date,new.amount);end if;
 end if;
 return new;
end$$;
drop trigger if exists md_petty_expense_guard on public.md_pos_expenses;
create trigger md_petty_expense_guard before insert on public.md_pos_expenses for each row execute function md_supply.retail_debit_guard();
drop trigger if exists md_retail_payment_guard on md_supply.outbound_payments;
create trigger md_retail_payment_guard before insert on md_supply.outbound_payments for each row execute function md_supply.retail_debit_guard();
drop trigger if exists md_retail_legacy_guard on md_supply.events;
create trigger md_retail_legacy_guard before insert on md_supply.events for each row when(new.action='transfer_payment') execute function md_supply.retail_debit_guard();
drop trigger if exists md_retail_deposit_void_guard on public.md_pos_cash_deposits;
create trigger md_retail_deposit_void_guard before update of voided_at on public.md_pos_cash_deposits for each row execute function md_supply.retail_debit_guard();

create or replace function md_supply.petty_state()
returns jsonb language sql stable set search_path='' as $$
 with permissions as (select public.pos_allowed('backoffice') and public.pos_allowed('finance') central),
 branches as (select id from public.md_pos_stores,permissions where location_type='store' and (central or public.pos_allowed('sell',id))),
 recent as (select x.* from branches b cross join lateral (
   select r.* from md_supply.petty_requests r where store_id=b.id order by (status='pending') desc,requested_at desc,id limit 30) x)
 select jsonb_build_object('pettyCashVersion',130,
 'retailBalance',case when central then (select coalesce(sum(amount),0) from md_supply.retail_movements where day<=(now() at time zone 'Asia/Jakarta')::date) end,
 'pettyBalances',coalesce((select jsonb_object_agg(id,md_supply.petty_balance(id)) from branches),'{}'),
 'pettyRequests',coalesce((select jsonb_agg(to_jsonb(r) order by requested_at desc,id) from recent r),'[]'))
 from permissions;
$$;

create or replace function public.pos_petty_mutate(action text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare st uuid:=(payload->>'storeId')::uuid; eid uuid:=(payload->>'id')::uuid;
 rid uuid:=(payload->>'requestId')::uuid; value numeric; memo text:=btrim(payload->>'note');
 prior public.md_pos_admin_events%rowtype; r md_supply.petty_requests%rowtype; fingerprint text:=md5(payload::text);
begin
 if eid is null or auth.uid() is null or action is null or action not in ('petty_request','petty_pay','petty_reject') then raise exception 'Aksi petty cash tidak valid';end if;
 if action='petty_request' then perform md_supply.require_location(st,'sell','store');
 else perform public.pos_require('backoffice');perform md_supply.require_location(st,'finance','store');end if;
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 select * into prior from public.md_pos_admin_events where id=eid;
 if found then
   if prior.actor is distinct from auth.uid() or prior.action<>action or prior.request_hash<>fingerprint then raise exception 'ID pengiriman sudah digunakan untuk data lain';end if;
   return public.pos_read();
 end if;
 if coalesce(length(memo),0) not between 3 and 300 then raise exception 'Isi keterangan atau referensi 3–300 karakter';end if;
 if action='petty_request' then
   value:=(payload->>'amount')::numeric;
   if value is null or value<=0 or value>1e15 or trunc(value)<>value or value::text='NaN' then raise exception 'Jumlah permintaan tidak valid';end if;
   if exists(select 1 from md_supply.petty_requests where store_id=st and status='pending') then raise exception 'Masih ada permintaan cabang yang menunggu';end if;
   insert into md_supply.petty_requests(id,store_id,amount,reason,requested_by) values(eid,st,value,memo,auth.uid());
   rid:=eid;
 else
   select * into r from md_supply.petty_requests where id=rid and store_id=st for update;
   if not found or r.status<>'pending' then raise exception 'Permintaan tidak tersedia atau sudah diproses';end if;
   if action='petty_pay' then perform md_supply.require_retail_balance((now() at time zone 'Asia/Jakarta')::date,r.amount);end if;
   update md_supply.petty_requests set status=case when action='petty_pay' then 'paid' else 'rejected' end,
    decision_id=eid,decided_by=auth.uid(),decided_at=clock_timestamp(),reference=memo where id=rid;
 end if;
 insert into public.md_pos_admin_events(id,action,entity_id,store_id,actor,request_hash,note) values(eid,action,rid,st,auth.uid(),fingerprint,memo);
 return public.pos_read();
end$$;

create or replace function pg_temp.petty_edit(fn regprocedure,old_text text,new_text text)
returns void language plpgsql as $$
declare definition text:=pg_get_functiondef(fn);
begin
 if strpos(definition,new_text)>0 then return;end if;
 if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Definisi % tidak sesuai untuk patch 130',fn;end if;
 execute replace(definition,old_text,new_text);
end$$;
select pg_temp.petty_edit('public.pos_read()',
 $o$s:=s||jsonb_build_object('outboundBatchVersion'$o$,
 $n$s:=s||md_supply.petty_state()||jsonb_build_object('outboundBatchVersion'$n$);
select pg_temp.petty_edit('md_supply.my_store_expenses()',
 $o$e.funding='store'$o$,$n$e.funding in ('store','petty')$n$);
select pg_temp.petty_edit('md_supply.my_store_expenses()',
 $o$e.date,e.category$o$,$n$e.date,e.funding,e.category$n$);
select pg_temp.petty_edit('md_supply.expense_funding(uuid,text)',
 $o$payer in ('store','retail')$o$,$n$payer in ('store','retail','petty')$n$);
select pg_temp.petty_edit('public.pos_admin_mutate_before_107(text,jsonb)',
 $o$'storeId','shiftId','category'$o$,$n$'storeId','funding','category'$n$);
select pg_temp.petty_edit('public.pos_admin_mutate_before_107(text,jsonb)',
 $o$payload:=payload||jsonb_build_object('date',(now() at time zone 'Asia/Jakarta')::date,'funding','store');
  else perform public.pos_require('finance',st);$o$,
 $n$if payload->>'funding' is distinct from 'petty' then raise exception 'Muat ulang POS untuk menggunakan petty cash';end if;
    if payload->>'category' in ('Gaji','Sewa','Listrik & air') then raise exception 'Biaya ini dibayar di Back Office melalui saldo PT Retail';end if;
    payload:=payload||jsonb_build_object('date',(now() at time zone 'Asia/Jakarta')::date);
  else perform public.pos_require('finance',st);
    if action='expense_save' and (payload->>'funding' is null or payload->>'funding' not in ('retail','distribution')) then raise exception 'Pilih saldo PT sesuai lokasi untuk biaya operasional';end if;$n$);
select pg_temp.petty_edit('public.pos_admin_mutate_before_107(text,jsonb)',
 $o$case when action='cashier_expense_save' then md_supply.cashier_expense_shift(st,payload) end$o$,$n$null::uuid /* petty cash is independent of the shift */$n$);
-- Assignment of old, unclassified expenses keeps its original source options.
select pg_temp.petty_edit('public.pos_admin_mutate_before_107(text,jsonb)',
 $o$update public.md_pos_expenses set funding=md_supply.expense_funding(st,payload->>'funding')$o$,
 $n$if payload->>'funding'='petty' then raise exception 'Petty cash hanya untuk pengeluaran baru';end if;
   update public.md_pos_expenses set funding=md_supply.expense_funding(st,payload->>'funding')$n$);
select pg_temp.petty_edit('public.pos_cash_flow_read(jsonb)',
 $o$select d.kind||'_collection'$o$,
 $n$select 'petty_disbursement','',false,(decided_at at time zone 'Asia/Jakarta')::date,amount from md_supply.petty_requests
      where status='paid' and (outlet is null or store_id=outlet)
    union all
    select d.kind||'_collection'$n$);
select pg_temp.petty_edit('public.pos_cash_flow_read(jsonb)',
 $o$select jsonb_build_object('rows',$o$,$n$select jsonb_build_object('pettyCashVersion',130,'rows',$n$);
revoke all on function md_supply.require_retail_balance(date,numeric),md_supply.petty_balance(uuid),md_supply.retail_debit_guard(),md_supply.petty_state(),public.pos_petty_mutate(text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_petty_mutate(text,jsonb) to authenticated;
-- Administration belongs to active central users. Branch employees keep their POS lookup and attendance.
select pg_temp.petty_edit('public.pos_allowed(text,uuid)',
 $o$if permission='employees' then return false;$o$,$n$if permission='employees' then return emp.role='admin';$n$);
create or replace function md_supply.require_employee_target(target uuid,new_role text,link_user uuid)
returns void language plpgsql set search_path='' as $$
begin
 perform public.pos_require('employees');
 if exists(select 1 from public.md_pos_employees where user_id=auth.uid() and active and role='owner') then return;end if;
 if new_role in ('owner','admin') or exists(select 1 from public.md_pos_employees where id=target and role in ('owner','admin')) then
   raise exception 'Hanya owner dapat mengelola akun pusat';end if;
 if link_user is not null and not exists(select 1 from auth.users a where a.id=link_user and to_jsonb(a)->'raw_app_meta_data'->>'employee_id'=target::text) then
   raise exception 'Akun login tidak diterbitkan untuk karyawan ini';end if;
end$$;
revoke all on function md_supply.require_employee_target(uuid,text,uuid) from public,anon,authenticated;
do $$declare fn regprocedure;begin
 foreach fn in array array['public.pos_mutate_v10(text,jsonb)'::regprocedure,'public.pos_mutate_v12(text,jsonb)'::regprocedure,'public.pos_mutate_v13(text,jsonb)'::regprocedure] loop
 perform pg_temp.petty_edit(fn,
  $o$if action in ('employee_save','employee_link') and me.role<>'owner' then raise exception 'Pengelolaan karyawan hanya untuk owner';end if;$o$,
  $n$if action in ('employee_save','employee_link') then perform md_supply.require_employee_target((payload->>'employeeId')::uuid,payload->>'role',(payload->>'userId')::uuid);end if;$n$);
 end loop;
end$$;
select pg_temp.petty_edit('public.pos_employee_document(uuid)',
 $o$perform public.pos_require('employees');$o$,$n$perform md_supply.require_employee_target(employee_id,null,null);$n$);
select pg_temp.petty_edit('public.pos_account_target(uuid)',
 $o$perform public.pos_require('employees');$o$,$n$perform md_supply.require_employee_target(employee_id,null,null);$n$);
select pg_temp.petty_edit('public.pos_crm_require(boolean)',
 $o$role_name not in ('owner','manager')$o$,$n$role_name not in ('owner','admin')$n$);
select pg_temp.petty_edit('public.pos_crm_require(boolean)',
 $o$Hanya owner / manager$o$,$n$Hanya admin Back Office atau owner$n$);
select pg_temp.petty_edit('public.pos_crm_read(jsonb)',
 $o$role in ('owner','manager')$o$,$n$role in ('owner','admin')$n$);
select pg_temp.petty_edit('public.pos_crm_mutate(text,jsonb,boolean)',
 $o$and role='owner') then raise exception 'Hanya owner dapat mengatur poin'$o$,
 $n$and role in ('admin','owner')) then raise exception 'Aturan poin dikelola Back Office'$n$);
select pg_temp.petty_edit('public.pos_admin_mutate_before_107(text,jsonb)',
 $o$if action='letterhead_save' then$o$,
 $n$if action in ('document_save','document_issue','document_cancel') then raise exception 'Dokumen manual diarsipkan. Gunakan Nota Supplier atau Pengiriman & Tagihan.';end if;
 if action='letterhead_save' then$n$);

notify pgrst,'reload schema';
commit;

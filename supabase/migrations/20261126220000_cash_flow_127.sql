-- Install after 126. Existing expenses retain an unassigned payer until reviewed.
begin;
set local lock_timeout = '10s';
select pg_catalog.pg_advisory_xact_lock(71031,1102);

alter table public.md_pos_expenses add column if not exists funding text
  check (funding in ('store','retail','distribution'));

create or replace function md_supply.expense_funding(st uuid, payer text)
returns text language plpgsql stable set search_path='' as $$
begin
  if not exists(select 1 from public.md_pos_stores where id=st and
    ((location_type='store' and payer in ('store','retail')) or
     (location_type='warehouse' and payer='distribution'))) then
    raise exception 'Pilih sumber dana yang sesuai dengan lokasi pengeluaran';
  end if;
  return payer;
end$$;

create or replace function pg_temp.cash_flow_edit(fn regprocedure, old_text text, new_text text)
returns void language plpgsql as $$
declare definition text := pg_get_functiondef(fn);
begin
  if strpos(definition,new_text)>0 then return; end if;
  if cardinality(string_to_array(definition,old_text))<>2 then
    raise exception 'Definisi % tidak sesuai untuk patch 127',fn;
  end if;
  execute replace(definition,old_text,new_text);
end$$;
select pg_temp.cash_flow_edit('public.pos_read()',
  $a$'outboundBatchVersion',126$a$, $b$'outboundBatchVersion',126,'cashFlowVersion',127$b$);

-- Reuse the normal expense RPC's operator, replay check, serialization and audit.
select pg_temp.cash_flow_edit('public.pos_admin_mutate_before_107(text,jsonb)',
  $a$elsif action in ('expense_save','expense_void') then$a$,
  $b$elsif action='expense_funding' then
   perform public.pos_require('backoffice');
   perform public.pos_require('finance',st);
   update public.md_pos_expenses set funding=md_supply.expense_funding(st,payload->>'funding')
    where id=target and store_id=st and funding is null and not voided;
   if not found then raise exception 'Pengeluaran tidak tersedia atau sumber dana sudah ditetapkan';end if;
   reason:=payload->>'funding';
 elsif action in ('expense_save','expense_void') then$b$);
select pg_temp.cash_flow_edit('public.pos_admin_mutate_before_107(text,jsonb)',
  $a$public.md_pos_expenses(id,store_id,date,category,description,amount,payment,reference,created_by) values(eid,st,dt,$a$,
  $b$public.md_pos_expenses(id,store_id,date,funding,category,description,amount,payment,reference,created_by) values(eid,st,dt,md_supply.expense_funding(st,payload->>'funding'),$b$);

select pg_temp.cash_flow_edit('public.pos_warehouse_mutate(text,jsonb)',
  $a$is_bo:=public.pos_allowed('backoffice');$a$,
  $b$is_bo:=public.pos_allowed('backoffice');
 if action='expense_funding' then return public.pos_admin_mutate(action,payload);end if;$b$);

-- The same adjusted balance is used by the dashboard and the deposit write guard.
select pg_temp.cash_flow_edit('public.pos_deposit_summary(uuid)',
  $a$'pending',cash.value-deposits.value$a$,
  $b$'pending',cash.value-deposits.value-coalesce((select sum(amount) from public.md_pos_expenses
    where store_id=outlet and funding='store' and payment='Tunai' and not voided),0)$b$);

create or replace function public.pos_cash_flow_read(filters jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  start_day date := (filters->>'from')::date;
  end_day date := (filters->>'to')::date;
  outlet uuid := nullif(filters->>'store','')::uuid;
  report jsonb;
begin
  perform public.pos_require('backoffice');
  perform public.pos_require('finance');
  if start_day is null or end_day is null or start_day>end_day then raise exception 'Periode laporan tidak valid';end if;
  if outlet is not null and not exists(select 1 from public.md_pos_stores where id=outlet and location_type='store')
    then raise exception 'Pilih cabang toko';end if;

  with outlets as (
    select id from public.md_pos_stores where location_type='store' and (outlet is null or id=outlet)
  ), orders as (
    select o.* from public.md_pos_order_runs o join outlets t on t.id=o.store_id
    where o.payment_status in ('paid','refunded') and coalesce(o.paid_date,o.business_date)<=end_day
  ), sales as (
    select s.* from public.md_pos_sales s join outlets t on t.id=s.store_id
    where s.wholesale_order_id is null and s.sale_date<=end_day
      and not exists(select 1 from public.md_pos_order_runs o where o.id=s.id)
  ), docs as (
    select o.id,o.kind,o.total,(o.issued_at at time zone 'Asia/Jakarta')::date issued,o.status
    from md_supply.outbound_orders o where o.invoice_no is not null
      and (outlet is null or o.target_id=outlet)
    union all
    select t.id,'transfer',t.total,(t.created_at at time zone 'Asia/Jakarta')::date,t.status
    from md_supply.transfers t where (outlet is null or t.target_id=outlet)
      and not exists(select 1 from md_supply.outbound_orders o where o.id=t.id)
  ), collections as (
    select p.order_id doc,p.date,p.amount from md_supply.outbound_payments p join docs d on d.id=p.order_id where p.date<=end_day
    union all
    select e.transfer_id,(e.at at time zone 'Asia/Jakarta')::date,(e.request->>'amount')::numeric
    from md_supply.events e join docs d on d.id=e.transfer_id where e.action='transfer_payment'
      and (e.at at time zone 'Asia/Jakarta')::date<=end_day
      and not exists(select 1 from md_supply.outbound_orders o where o.id=d.id)
  ), cancelled_docs as (
    select coalesce(e.transfer_id,(e.request->>'orderId')::uuid,e.id) doc,min((e.at at time zone 'Asia/Jakarta')::date) cancelled
    from md_supply.events e where e.action in ('transfer_cancel','outbound_cancel') group by 1
  ), expenses as (
    select x.*, (ev.at at time zone 'Asia/Jakarta')::date void_date
    from public.md_pos_expenses x left join public.md_pos_admin_events ev on ev.entity_id=x.id and ev.action='expense_void'
    where (outlet is null or x.store_id=outlet) and x.date<=end_day
  ), moves(kind,detail,is_cash,day,amount) as (
    select 'sale',o.payment,o.payment='Tunai',coalesce(o.paid_date,o.business_date),o.total from orders o
    union all
    select 'refund',o.payment,o.payment='Tunai',
      coalesce((o.void_meta->>'date')::date,
        (select min(e.business_date) from public.md_pos_events e where e.action in ('order_void','order_cancel') and e.payload->>'orderId'=o.id::text),
        (select (e.created_at at time zone 'Asia/Jakarta')::date from public.md_pos_cashier_shift_entries e
         where e.source_kind='order' and e.source_id=o.id and e.kind='refund')),o.total
    from orders o where o.payment_status='refunded'
    union all select 'sale',s.payment,s.payment='Tunai',s.sale_date,s.total from sales s
    union all select 'refund',s.payment,s.payment='Tunai',
      coalesce((select min(e.business_date) from public.md_pos_events e where e.action='void' and e.payload->>'saleId'=s.id::text),
        (s.voided_at at time zone 'Asia/Jakarta')::date),s.total from sales s where s.voided
    union all
    select 'deposit','',true,v.day,v.amount from public.md_pos_cash_deposits d join outlets t on t.id=d.store_id
      cross join lateral (values(d.deposit_date,d.amount),((d.voided_at at time zone 'Asia/Jakarta')::date,-d.amount)) v(day,amount)
      where v.day is not null
    union all
    select coalesce(x.funding,'unassigned')||'_expense',x.category,x.payment='Tunai',v.day,v.amount from expenses x
      cross join lateral (values(x.date,x.amount),(x.void_date,-x.amount)) v(day,amount) where v.day is not null
    union all
    select d.kind||'_collection','',false,p.date,p.amount from collections p join docs d on d.id=p.doc
    union all
    select d.kind||'_invoice','',false,d.issued,d.total from docs d
    union all
    select 'supplier_'||p.component,'',false,v.day,v.amount from md_supply.note_payments p
      left join md_supply.events ev on ev.id=p.void_event_id
      cross join lateral (values(p.paid_on,p.amount),((ev.at at time zone 'Asia/Jakarta')::date,-p.amount)) v(day,amount)
      where outlet is null and v.day is not null
  ), sums as (
    select kind,detail,is_cash,coalesce(sum(amount) filter(where day<start_day),0) opening,
      coalesce(sum(amount) filter(where day>=start_day),0) amount
    from moves where day<=end_day group by kind,detail,is_cash
  ), receivables as (
    select d.kind,sum(greatest(0,d.total-coalesce(p.paid,0))) balance
    from docs d left join (select doc,sum(amount) paid from collections group by doc) p on p.doc=d.id
      left join cancelled_docs c on c.doc=d.id
    where d.issued<=end_day and (d.status<>'cancelled' or c.cancelled>end_day) group by d.kind
  ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(s) order by kind,detail,is_cash) from sums s),'[]'),
    'receivables',coalesce((select jsonb_object_agg(kind,balance) from receivables),'{}'),
    'undatedRefunds',(select count(*) from moves where kind='refund' and day is null))
    into report;
  return report;
end$$;
revoke all on function md_supply.expense_funding(uuid,text) from public,anon,authenticated;
revoke all on function public.pos_cash_flow_read(jsonb) from public,anon,authenticated;
grant execute on function public.pos_cash_flow_read(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

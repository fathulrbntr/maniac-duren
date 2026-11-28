-- Setoran cabang mencakup semua metode pembayaran di kasir.
begin;
set local lock_timeout = '5s';
select pg_catalog.pg_advisory_xact_lock(71031,1102);

-- Shared dated movements for the live deposit limit and the period report.
-- A sale projected from an order has the same ID and is counted only once.
create or replace function public.pos_branch_sale_movements(outlet uuid, through_day date)
returns table(kind text, detail text, is_cash boolean, day date, amount numeric)
language sql stable set search_path='' as $$
  with outlets as (
    select id from public.md_pos_stores
    where location_type='store' and (outlet is null or id=outlet)
  ), orders as (
    select o.id,o.payment,o.total,o.paid_date,o.business_date,o.payment_status,o.void_meta
    from public.md_pos_order_runs o join outlets t on t.id=o.store_id
    where (o.payment_status='refunded' or (o.payment_status='paid' and o.status<>'cancelled'))
      and coalesce(o.paid_date,o.business_date)<=through_day
  ), sales as (
    select s.id,s.payment,s.total,s.sale_date,s.voided,s.voided_at
    from public.md_pos_sales s join outlets t on t.id=s.store_id
    where s.wholesale_order_id is null and s.sale_date<=through_day
      and not exists(select 1 from public.md_pos_order_runs o where o.id=s.id)
  )
  select 'sale',o.payment,o.payment='Tunai',coalesce(o.paid_date,o.business_date),o.total from orders o
  union all
  select 'refund',o.payment,o.payment='Tunai',
    coalesce((o.void_meta->>'date')::date,
      (select min(e.business_date) from public.md_pos_events e
       where e.action in ('order_void','order_cancel') and e.payload->>'orderId'=o.id::text),
      (select (e.created_at at time zone 'Asia/Jakarta')::date from public.md_pos_cashier_shift_entries e
       where e.source_kind='order' and e.source_id=o.id and e.kind='refund')),o.total
  from orders o where o.payment_status='refunded'
  union all select 'sale',s.payment,s.payment='Tunai',s.sale_date,s.total from sales s
  union all
  select 'refund',s.payment,s.payment='Tunai',
    coalesce((select min(e.business_date) from public.md_pos_events e
              where e.action='void' and e.payload->>'saleId'=s.id::text),
             (s.voided_at at time zone 'Asia/Jakarta')::date),s.total
  from sales s where s.voided;
$$;
revoke all on function public.pos_branch_sale_movements(uuid,date) from public,anon,authenticated;

create or replace function public.pos_deposit_summary(outlet uuid)
returns jsonb language sql stable set search_path='' as $$
  with cutoff as (select (now() at time zone 'Asia/Jakarta')::date today),
  movements as (
    select m.day,m.is_cash,case when m.kind='refund' then -m.amount else m.amount end amount,t.today
    from cutoff t cross join lateral public.pos_branch_sale_movements(outlet,t.today) m
    where outlet is not null and (m.day<=t.today or m.day is null)
  ), sales as (
    select coalesce(sum(amount),0) net_sales,
           coalesce(sum(amount) filter(where is_cash),0) net_cash,
           coalesce(sum(amount) filter(where day=today),0) sales_today from movements
  ), deposits as (
    select coalesce(sum(amount),0) deposited,count(*) count from public.md_pos_cash_deposits
    where store_id=outlet and voided_at is null
  )
  select jsonb_build_object('storeId',outlet,'netCash',net_cash,'netSales',net_sales,
    'salesToday',sales_today,'deposited',deposited,'pending',net_sales-deposited,'count',count)
  from sales,deposits;
$$;
revoke all on function public.pos_deposit_summary(uuid) from public,anon,authenticated;

do $$
declare
  src text := pg_get_functiondef('public.pos_cash_flow_read(jsonb)'::regprocedure);
  first_pos int;
  next_pos int;
  guard_line text := 'available:=(public.pos_deposit_summary(st)->>''pending'')::numeric;';
begin
  if strpos(src,'''turnoverDepositVersion''')=0 then
    first_pos := strpos(src,'), orders as (');
    next_pos := strpos(src,'), docs as (');
    if first_pos=0 or next_pos<=first_pos then
      raise exception 'Sumber transaksi laporan tidak dikenali';
    end if;
    src := left(src,first_pos-1)||substr(src,next_pos);
    first_pos := strpos(src,'select ''sale'',o.payment');
    next_pos := strpos(src,'select ''deposit'','''',true');
    if first_pos=0 or next_pos<=first_pos or strpos(src,'return report;')=0 then
      raise exception 'Definisi arus kas tidak dikenali';
    end if;
    src := left(src,first_pos-1)||'select * from public.pos_branch_sale_movements(outlet,end_day)
    union all
    '||substr(src,next_pos);
    execute replace(src,'return report;','return report || jsonb_build_object(''turnoverDepositVersion'',138);');
  end if;
  src := pg_get_functiondef('public.pos_cash_deposit_mutate(text,jsonb)'::regprocedure);
  if strpos(src,'Setoran omzet hanya tersedia untuk cabang toko')=0 then
    if strpos(src,guard_line)=0 or strpos(src,'Setoran melebihi cash')=0 then raise exception 'Definisi validasi setoran tidak dikenali';end if;
    src := replace(src,guard_line,'if not exists(select 1 from public.md_pos_stores where id=st and location_type=''store'') then
    raise exception ''Setoran omzet hanya tersedia untuk cabang toko'';end if;
  '||guard_line);
    execute replace(src,'Setoran melebihi cash','Setoran melebihi omzet');
  end if;
end$$;
notify pgrst,'reload schema';
commit;

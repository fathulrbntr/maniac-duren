-- Install after 127. Cashier entry uses the existing expenses and audit records.
begin;
set local lock_timeout = '10s';
select pg_catalog.pg_advisory_xact_lock(71031,1102);

alter table public.md_pos_expenses add column if not exists cashier_shift_id uuid
  references public.md_pos_cashier_shifts;
create index if not exists md_pos_expense_shift on public.md_pos_expenses(cashier_shift_id)
  where cashier_shift_id is not null;
create index if not exists md_pos_expense_operator on public.md_pos_expenses(created_by,store_id,created_at desc,id desc)
  where funding='store';

create or replace function md_supply.cashier_expense_shift(st uuid,p jsonb)
returns uuid language plpgsql set search_path='' as $$
declare target uuid;
begin
  if p->>'payment'='Tunai' then
    select s.id into target from public.md_pos_cashier_shifts s
    join public.md_pos_employees e on e.id=s.cashier_id
    where e.user_id=auth.uid() and s.store_id=st and s.closed_at is null for update of s;
  end if;
  if target is distinct from (p->>'shiftId')::uuid then
    raise exception 'Shift kasir berubah. Muat ulang sebelum menyimpan pengeluaran.';
  end if;
  return target;
end$$;

create or replace function md_supply.expense_shift_revision()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.cashier_shift_id is not null and (tg_op='INSERT' or new.voided is distinct from old.voided) then
    update public.md_pos_cashier_shifts set revision=revision+1 where id=new.cashier_shift_id and closed_at is null;
  end if;
  return null;
end$$;
drop trigger if exists md_pos_expense_shift_revision on public.md_pos_expenses;
create trigger md_pos_expense_shift_revision after insert or update of voided on public.md_pos_expenses
for each row execute function md_supply.expense_shift_revision();

create or replace function md_supply.cashier_expense_totals(target uuid,summary jsonb)
returns jsonb language sql stable set search_path='' as $$
  select summary||jsonb_build_object('cashExpenses',coalesce(sum(amount),0),
    'expectedCash',(summary->>'expectedCash')::numeric-coalesce(sum(amount),0))
  from public.md_pos_expenses where cashier_shift_id=target and not voided;
$$;

-- Show only the operator's latest store-funded entries per authorized branch.
create or replace function md_supply.my_store_expenses()
returns jsonb language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(x)-'created_at' order by x.created_at desc,x.id desc),'[]')
  from public.md_pos_stores s cross join lateral (
    select e.id,e.store_id,e.date,e.category,e.description,e.amount,e.payment,e.reference,e.voided,e.created_at
    from public.md_pos_expenses e where e.created_by=auth.uid() and e.store_id=s.id and e.funding='store'
    order by e.created_at desc,e.id desc limit 20
  ) x where s.location_type='store' and public.pos_allowed('sell',s.id);
$$;

create or replace function pg_temp.edit_cashier_expense(fn regprocedure,old_text text,new_text text)
returns void language plpgsql as $$
declare definition text:=pg_get_functiondef(fn);
begin
  if strpos(definition,new_text)>0 then return; end if;
  if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Definisi % tidak sesuai untuk patch 128',fn;end if;
  execute replace(definition,old_text,new_text);
end$$;
select pg_temp.edit_cashier_expense('public.pos_read()',
  $o$'cashFlowVersion',127$o$, $n$'cashFlowVersion',127,'cashierExpenseVersion',128,'myStoreExpenses',md_supply.my_store_expenses()$n$);
select pg_temp.edit_cashier_expense('public.pos_shift_totals(uuid)',
  $o$select public.pos_shift_totals_before_084(target)||$o$,
  $n$select md_supply.cashier_expense_totals(target,public.pos_shift_totals_before_084(target))||$n$);

-- This exact action alone can reach the shared writer via the cashier route.
select pg_temp.edit_cashier_expense('public.pos_warehouse_mutate(text,jsonb)',
  $o$if action='expense_funding' then return public.pos_admin_mutate(action,payload);end if;$o$,
  $n$if action='cashier_expense_save' then
    perform md_supply.require_location((payload->>'storeId')::uuid,'sell','store');
    return public.pos_admin_mutate_before_107(action,payload);
  end if;
  if action='expense_funding' then return public.pos_admin_mutate(action,payload);end if;$n$);
select pg_temp.edit_cashier_expense('public.pos_admin_mutate_before_107(text,jsonb)',
  $o$if not public.pos_allowed('stock',prior.store_id) and not public.pos_allowed('finance',prior.store_id) then$o$,
  $n$if action='cashier_expense_save' then
    perform md_supply.require_location(prior.store_id,'sell','store');
  elsif not public.pos_allowed('stock',prior.store_id) and not public.pos_allowed('finance',prior.store_id) then$n$);
select pg_temp.edit_cashier_expense('public.pos_admin_mutate_before_107(text,jsonb)',
  $o$elsif action in ('expense_save','expense_void') then
  perform public.pos_require('finance',st);
  if action='expense_save' then$o$,
  $n$elsif action in ('expense_save','cashier_expense_save','expense_void') then
  if action='cashier_expense_save' then
    perform md_supply.require_location(st,'sell','store');
    if exists(select 1 from jsonb_object_keys(payload) as inputs(field_name) where inputs.field_name not in ('id','storeId','shiftId','category','description','amount','payment','reference')) then
      raise exception 'Isian pengeluaran kasir tidak dikenal';end if;
    payload:=payload||jsonb_build_object('date',(now() at time zone 'Asia/Jakarta')::date,'funding','store');
  else perform public.pos_require('finance',st);
  end if;
  if action in ('expense_save','cashier_expense_save') then$n$);
select pg_temp.edit_cashier_expense('public.pos_admin_mutate_before_107(text,jsonb)',
  $o$public.md_pos_expenses(id,store_id,date,funding,category,description,amount,payment,reference,created_by) values(eid,st,dt,md_supply.expense_funding(st,payload->>'funding'),$o$,
  $n$public.md_pos_expenses(id,store_id,date,cashier_shift_id,funding,category,description,amount,payment,reference,created_by) values(eid,st,dt,case when action='cashier_expense_save' then md_supply.cashier_expense_shift(st,payload) end,md_supply.expense_funding(st,payload->>'funding'),$n$);

revoke all on function md_supply.cashier_expense_shift(uuid,jsonb),md_supply.expense_shift_revision(),
  md_supply.cashier_expense_totals(uuid,jsonb),md_supply.my_store_expenses() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;

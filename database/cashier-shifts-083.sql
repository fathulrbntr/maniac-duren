-- PATCH 083: cashier shifts, cashier attribution, payment/refund log.
-- Apply after 054 and 082. Does not reset transactions or open shifts automatically.
begin;
do $$begin
 if to_regprocedure('public.pos_cashier_mutate(text,jsonb)') is null or to_regprocedure('public.pos_read_v82()') is null then
  raise exception 'Pasang SQL kasir 054 dan receipt-shipment-082.sql terlebih dahulu';
 end if;
end$$;
create table if not exists public.md_pos_cashier_shifts (
 id uuid primary key, store_id uuid not null references public.md_pos_stores,
 cashier_id uuid not null references public.md_pos_employees, cashier_name text not null,
 opened_at timestamptz not null default clock_timestamp(), opening_cash numeric not null check(opening_cash>=0 and opening_cash<=9000000000000000),
 opening_note text not null default '', closed_at timestamptz, closing_cash numeric,
 closing_note text, closed_by uuid references public.md_pos_employees, closed_name text,
 closing_event_id uuid unique, closing_summary jsonb, revision integer not null default 0,
 check(closing_cash is null or (closing_cash>=0 and closing_cash<=9000000000000000))
);
create unique index if not exists md_pos_one_open_cashier_shift on public.md_pos_cashier_shifts(cashier_id) where closed_at is null;
create index if not exists md_pos_shift_store_time on public.md_pos_cashier_shifts(store_id,opened_at desc);
create table if not exists public.md_pos_cashier_shift_entries (
 id uuid primary key default gen_random_uuid(), shift_id uuid not null references public.md_pos_cashier_shifts,
 source_kind text not null check(source_kind in ('order','sale')), source_id uuid not null,
 kind text not null check(kind in ('sale','refund')), payment text not null check(payment in ('Tunai','QRIS','Transfer')),
 amount numeric not null check(amount>=0 and amount<=9000000000000000),
 cashier_id uuid not null references public.md_pos_employees, cashier_name text not null,
 created_at timestamptz not null default clock_timestamp(), unique(source_kind,source_id,kind)
);
create index if not exists md_pos_shift_entries_time on public.md_pos_cashier_shift_entries(shift_id,created_at desc,id);
create table if not exists public.md_pos_cashier_shift_events (
 id uuid primary key, action text not null check(action in ('cashier_shift_open','cashier_shift_close')),
 shift_id uuid not null references public.md_pos_cashier_shifts, actor uuid not null references auth.users,
 payload jsonb not null, created_at timestamptz not null default clock_timestamp()
);
alter table public.md_pos_cashier_shifts enable row level security;
alter table public.md_pos_cashier_shift_entries enable row level security;
alter table public.md_pos_cashier_shift_events enable row level security;
revoke all on public.md_pos_cashier_shifts,public.md_pos_cashier_shift_entries,public.md_pos_cashier_shift_events from public,anon,authenticated;
alter table public.md_pos_order_runs add column if not exists cashier_id uuid references public.md_pos_employees;
alter table public.md_pos_order_runs add column if not exists cashier_name text;
alter table public.md_pos_order_runs add column if not exists cashier_shift_id uuid references public.md_pos_cashier_shifts;
alter table public.md_pos_sales add column if not exists cashier_id uuid references public.md_pos_employees;
alter table public.md_pos_sales add column if not exists cashier_name text;
alter table public.md_pos_sales add column if not exists cashier_shift_id uuid references public.md_pos_cashier_shifts;
-- Historical attribution uses the recorded creator. Never use the viewer/printer's name.
update public.md_pos_order_runs o set cashier_id=e.id,cashier_name=e.name from public.md_pos_employees e where o.created_by=e.user_id and o.cashier_name is null;
update public.md_pos_sales o set cashier_id=e.id,cashier_name=e.name from public.md_pos_employees e where o.created_by=e.user_id and o.cashier_name is null;

create or replace function public.pos_shift_visible(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.md_pos_cashier_shifts s join public.md_pos_employees e on e.user_id=auth.uid() and e.active
 where s.id=target and ((s.cashier_id=e.id and (public.pos_allowed('sell',s.store_id) or s.store_id=any(e.store_ids)))
 or public.pos_allowed('reports',s.store_id) or public.pos_allowed('finance',s.store_id)));
$$;
create or replace function public.pos_shift_totals(target uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('salesCount',count(*) filter(where kind='sale'),'refundCount',count(*) filter(where kind='refund'),
 'sales',coalesce(sum(amount) filter(where kind='sale'),0),'refunds',coalesce(sum(amount) filter(where kind='refund'),0),
 'cashSales',coalesce(sum(amount) filter(where kind='sale' and payment='Tunai'),0),'cashRefunds',coalesce(sum(amount) filter(where kind='refund' and payment='Tunai'),0),
 'qrisSales',coalesce(sum(amount) filter(where kind='sale' and payment='QRIS'),0),'qrisRefunds',coalesce(sum(amount) filter(where kind='refund' and payment='QRIS'),0),
 'transferSales',coalesce(sum(amount) filter(where kind='sale' and payment='Transfer'),0),'transferRefunds',coalesce(sum(amount) filter(where kind='refund' and payment='Transfer'),0),
 'expectedCash',(select opening_cash from public.md_pos_cashier_shifts where id=target)+coalesce(sum(case when kind='sale' then amount else -amount end) filter(where payment='Tunai'),0))
 from public.md_pos_cashier_shift_entries where shift_id=target;
$$;
create or replace function public.pos_shift_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',s.id,'storeId',s.store_id,'cashierId',s.cashier_id,'cashierName',s.cashier_name,
 'openedAt',s.opened_at,'openingCash',s.opening_cash,'openingNote',s.opening_note,'closedAt',s.closed_at,
 'closingCash',s.closing_cash,'closingNote',s.closing_note,'closedBy',s.closed_by,'closedName',s.closed_name,
 'closingEventId',s.closing_event_id,'revision',s.revision,'summary',coalesce(s.closing_summary,public.pos_shift_totals(s.id)))
 from public.md_pos_cashier_shifts s where id=target;
$$;
create or replace function public.pos_shift_current(outlet uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;begin
 perform public.pos_require('sell',outlet);
 select s.id into target from public.md_pos_cashier_shifts s join public.md_pos_employees e on e.id=s.cashier_id and e.active and e.user_id=auth.uid()
 where s.store_id=outlet and s.closed_at is null for update of s;
 if target is null then raise exception 'Buka kasir di outlet ini sebelum menerima pembayaran atau refund';end if;
 return target;
end$$;
-- Triggers protect both RPC routes, including old clients and unpaid-order settlement.
create or replace function public.pos_shift_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new);o jsonb;paid_now boolean;paid_before boolean:=false;refund_now boolean;refund_before boolean:=false;
 target uuid;me public.md_pos_employees%rowtype;is_order boolean:=tg_table_name='md_pos_order_runs';
begin
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 paid_now:=case when is_order then n->>'payment_status'='paid' else not (n->>'voided')::boolean end;
 refund_now:=case when is_order then n->>'payment_status'='refunded' else (n->>'voided')::boolean end;
 if tg_op='UPDATE' then
  o:=to_jsonb(old);paid_before:=case when is_order then o->>'payment_status'='paid' else not (o->>'voided')::boolean end;
  refund_before:=case when is_order then o->>'payment_status'='refunded' else (o->>'voided')::boolean end;
  new.cashier_id:=old.cashier_id;new.cashier_name:=old.cashier_name;new.cashier_shift_id:=old.cashier_shift_id;
 end if;
 if paid_now and not paid_before then
  target:=public.pos_shift_current(new.store_id);
  select * into me from public.md_pos_employees where active and user_id=auth.uid();
  new.cashier_id:=me.id;new.cashier_name:=me.name;new.cashier_shift_id:=target;
 elsif tg_op='INSERT' then
  select * into me from public.md_pos_employees where active and user_id=auth.uid();
  new.cashier_id:=me.id;new.cashier_name:=me.name;new.cashier_shift_id:=null;
 elsif paid_now and paid_before and (new.total is distinct from old.total or new.payment is distinct from old.payment) then
  if new.cashier_shift_id is not null and not exists(select 1 from public.md_pos_cashier_shifts where id=new.cashier_shift_id and closed_at is null) then raise exception 'Shift sudah ditutup; nilai transaksi tidak dapat diubah';end if;
 end if;
 if refund_now and not refund_before and paid_before then perform public.pos_shift_current(new.store_id);end if;
 return new;
end$$;
create or replace function public.pos_shift_record() returns trigger language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new);o jsonb;paid_now boolean;paid_before boolean:=false;refund_now boolean;refund_before boolean:=false;
 target uuid;me public.md_pos_employees%rowtype;source text:=case when tg_table_name='md_pos_order_runs' then 'order' else 'sale' end;
begin
 paid_now:=case when source='order' then n->>'payment_status'='paid' else not (n->>'voided')::boolean end;
 refund_now:=case when source='order' then n->>'payment_status'='refunded' else (n->>'voided')::boolean end;
 if tg_op='UPDATE' then
  o:=to_jsonb(old);paid_before:=case when source='order' then o->>'payment_status'='paid' else not (o->>'voided')::boolean end;
  refund_before:=case when source='order' then o->>'payment_status'='refunded' else (o->>'voided')::boolean end;
 end if;
 if paid_now and new.cashier_shift_id is not null then
  insert into public.md_pos_cashier_shift_entries(shift_id,source_kind,source_id,kind,payment,amount,cashier_id,cashier_name)
  values(new.cashier_shift_id,source,new.id,'sale',new.payment,new.total,new.cashier_id,new.cashier_name)
  on conflict(source_kind,source_id,kind) do update set amount=excluded.amount,payment=excluded.payment
  where md_pos_cashier_shift_entries.amount is distinct from excluded.amount or md_pos_cashier_shift_entries.payment is distinct from excluded.payment;
  if found then update public.md_pos_cashier_shifts set revision=revision+1 where id=new.cashier_shift_id;end if;
 end if;
 if refund_now and not refund_before and paid_before then
  target:=public.pos_shift_current(new.store_id);
  select * into me from public.md_pos_employees where active and user_id=auth.uid();
  insert into public.md_pos_cashier_shift_entries(shift_id,source_kind,source_id,kind,payment,amount,cashier_id,cashier_name)
  values(target,source,new.id,'refund',old.payment,old.total,me.id,me.name) on conflict(source_kind,source_id,kind) do nothing;
  if found then update public.md_pos_cashier_shifts set revision=revision+1 where id=target;end if;
 end if;
 return new;
end$$;
drop trigger if exists md_pos_order_shift_guard on public.md_pos_order_runs;
create trigger md_pos_order_shift_guard before insert or update on public.md_pos_order_runs for each row execute function public.pos_shift_guard();
drop trigger if exists md_pos_sale_shift_guard on public.md_pos_sales;
create trigger md_pos_sale_shift_guard before insert or update on public.md_pos_sales for each row execute function public.pos_shift_guard();
drop trigger if exists md_pos_order_shift_record on public.md_pos_order_runs;
create trigger md_pos_order_shift_record after insert or update on public.md_pos_order_runs for each row execute function public.pos_shift_record();
drop trigger if exists md_pos_sale_shift_record on public.md_pos_sales;
create trigger md_pos_sale_shift_record after insert or update on public.md_pos_sales for each row execute function public.pos_shift_record();

do $$begin
 if to_regprocedure('public.pos_read_before_083()') is null then alter function public.pos_read() rename to pos_read_before_083;end if;
end$$;
revoke all on function public.pos_read_before_083() from public,anon,authenticated;
create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;begin
 s:=public.pos_read_before_083();
 s:=jsonb_set(s,'{orders}',coalesce((select jsonb_agg(x||jsonb_build_object('cashierId',o.cashier_id,'cashierName',o.cashier_name,'cashierShiftId',o.cashier_shift_id)) from jsonb_array_elements(s->'orders') x join public.md_pos_order_runs o on o.id=(x->>'id')::uuid),'[]'));
 s:=jsonb_set(s,'{sales}',coalesce((select jsonb_agg(x||jsonb_build_object('cashierId',o.cashier_id,'cashierName',o.cashier_name,'cashierShiftId',o.cashier_shift_id)) from jsonb_array_elements(s->'sales') x join public.md_pos_sales o on o.id=(x->>'id')::uuid),'[]'));
 return s||jsonb_build_object('cashierShiftVersion',83,
 'cashierShifts',coalesce((select jsonb_agg(public.pos_shift_json(x.id) order by x.opened_at desc) from public.md_pos_cashier_shifts x where x.closed_at is null and public.pos_shift_visible(x.id)),'[]'),
 'cashierShiftEvents',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'action',x.action,'shiftId',x.shift_id)) from (select * from public.md_pos_cashier_shift_events where actor=auth.uid() order by created_at desc limit 50) x),'[]'));
end$$;
create or replace function public.pos_cashier_shift_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.md_pos_employees%rowtype;sh public.md_pos_cashier_shifts%rowtype;ev public.md_pos_cashier_shift_events%rowtype;
 eid uuid:=(payload->>'id')::uuid;st uuid;amount numeric;summary jsonb;note text:=btrim(coalesce(payload->>'note',''));
begin
 select * into me from public.md_pos_employees where user_id=auth.uid() and active;
 if not found or eid is null then raise exception 'Login dan ID operasi wajib';end if;
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 select * into ev from public.md_pos_cashier_shift_events where id=eid;
 if found then
  if ev.action<>action or ev.payload<>payload or ev.actor<>auth.uid() then raise exception 'ID sudah digunakan untuk data lain';end if;
  return public.pos_read();
 end if;
 if length(note)>300 then raise exception 'Catatan maksimal 300 karakter';end if;
 if action='cashier_shift_open' then
  st:=(payload->>'storeId')::uuid;if st is null then raise exception 'Pilih outlet';end if;
  perform public.pos_require('sell',st);
  amount:=nullif(payload->>'openingCash','')::numeric;
  if amount is null or amount<0 or amount>9000000000000000 or amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Isi uang awal yang valid';end if;
  if exists(select 1 from public.md_pos_cashier_shifts where cashier_id=me.id and closed_at is null) then raise exception 'Masih ada shift terbuka. Tutup shift sebelumnya terlebih dahulu';end if;
  insert into public.md_pos_cashier_shifts(id,store_id,cashier_id,cashier_name,opening_cash,opening_note) values(eid,st,me.id,me.name,amount,note) returning * into sh;
 elsif action='cashier_shift_close' then
  select * into sh from public.md_pos_cashier_shifts where id=(payload->>'shiftId')::uuid for update;
  if not found or not public.pos_shift_visible(sh.id) then raise exception 'Shift tidak ditemukan atau tidak dapat diakses';end if;
  if sh.cashier_id<>me.id and not public.pos_allowed('finance',sh.store_id) then raise exception 'Hanya kasir pemilik shift atau pengelola keuangan yang dapat menutup';end if;
  if sh.closed_at is not null then raise exception 'Shift sudah ditutup';end if;
  if sh.revision is distinct from (payload->>'expectedRevision')::integer then raise exception 'Transaksi berubah. Perbarui perhitungan sebelum tutup kasir';end if;
  amount:=nullif(payload->>'closingCash','')::numeric;
  if amount is null or amount<0 or amount>9000000000000000 or amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Isi uang tunai aktual yang valid';end if;
  summary:=public.pos_shift_totals(sh.id);
  if (amount<>(summary->>'expectedCash')::numeric or sh.cashier_id<>me.id) and length(note)<3 then raise exception 'Catatan wajib untuk selisih kas atau menutup shift kasir lain';end if;
  update public.md_pos_cashier_shifts set closed_at=clock_timestamp(),closing_cash=amount,closing_note=note,closed_by=me.id,closed_name=me.name,
  closing_event_id=eid,closing_summary=summary||jsonb_build_object('difference',amount-(summary->>'expectedCash')::numeric) where id=sh.id;
 else raise exception 'Aksi shift tidak dikenal';end if;
 insert into public.md_pos_cashier_shift_events(id,action,shift_id,actor,payload) values(eid,action,sh.id,auth.uid(),payload);
 return public.pos_read();
end$$;
create or replace function public.pos_cashier_shifts_read(filters jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid;st uuid:=nullif(filters->>'storeId','')::uuid;cashier uuid:=nullif(filters->>'cashierId','')::uuid;target uuid:=nullif(filters->>'shiftId','')::uuid;
 start_day date:=coalesce(nullif(filters->>'from','')::date,(now() at time zone 'Asia/Jakarta')::date);
 end_day date:=coalesce(nullif(filters->>'to','')::date,(now() at time zone 'Asia/Jakarta')::date);
 off integer:=coalesce((filters->>'offset')::integer,0);hist_off integer:=coalesce((filters->>'historyOffset')::integer,0);
 active jsonb;history jsonb;entries jsonb;
begin
 select e.id into me from public.md_pos_employees e where e.user_id=auth.uid() and e.active;
 if me is null then raise exception 'Login diperlukan';end if;
 if start_day>end_day or off<0 or off>1000000 or hist_off<0 or hist_off>1000000 then raise exception 'Filter tidak valid';end if;
 if target is not null and not public.pos_shift_visible(target) then raise exception 'Shift tidak dapat diakses';end if;
 select coalesce(jsonb_agg(public.pos_shift_json(s.id) order by s.opened_at desc),'[]') into active from public.md_pos_cashier_shifts s
 where s.closed_at is null and public.pos_shift_visible(s.id);
 select coalesce(jsonb_agg(public.pos_shift_json(x.id) order by x.closed_at desc,x.id),'[]') into history from (
 select s.id,s.closed_at from public.md_pos_cashier_shifts s where s.closed_at is not null and public.pos_shift_visible(s.id)
 and (st is null or s.store_id=st) and (cashier is null or s.cashier_id=cashier)
 and s.closed_at>=start_day::timestamp at time zone 'Asia/Jakarta' and s.closed_at<(end_day+1)::timestamp at time zone 'Asia/Jakarta'
 order by s.closed_at desc,s.id offset hist_off limit 21) x;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'shiftId',x.shift_id,'storeId',x.store_id,'cashierId',x.cashier_id,'cashierName',x.cashier_name,
 'sourceKind',x.source_kind,'sourceId',x.source_id,'kind',x.kind,'payment',x.payment,'amount',x.amount,'createdAt',x.created_at) order by x.created_at desc,x.id),'[]') into entries from (
 select t.*,s.store_id from public.md_pos_cashier_shift_entries t join public.md_pos_cashier_shifts s on s.id=t.shift_id
 where public.pos_shift_visible(s.id) and (st is null or s.store_id=st) and (cashier is null or t.cashier_id=cashier)
 and (target is null or t.shift_id=target)
 and (target is not null or (t.created_at>=start_day::timestamp at time zone 'Asia/Jakarta' and t.created_at<(end_day+1)::timestamp at time zone 'Asia/Jakarta'))
 order by t.created_at desc,t.id offset off limit 21) x;
 return jsonb_build_object('active',active,'history',history,'entries',entries,'shift',case when target is not null then public.pos_shift_json(target) end,'fetchedAt',clock_timestamp());
end$$;
revoke all on function public.pos_shift_visible(uuid),public.pos_shift_totals(uuid),public.pos_shift_json(uuid),public.pos_shift_current(uuid),public.pos_shift_guard(),public.pos_shift_record() from public,anon,authenticated;
revoke all on function public.pos_cashier_shift_mutate(text,jsonb),public.pos_cashier_shifts_read(jsonb),public.pos_read() from public,anon,authenticated;
grant execute on function public.pos_cashier_shift_mutate(text,jsonb),public.pos_cashier_shifts_read(jsonb),public.pos_read() to authenticated;
insert into public.md_pos_schema_versions(version) values(83) on conflict do nothing;
notify pgrst,'reload schema';
commit;

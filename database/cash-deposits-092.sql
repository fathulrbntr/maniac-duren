-- PATCH 092: cashier bank deposit records and cumulative outlet cash balance.
-- Apply once after 085 (CRM / payment / cashier-shift chain). Safe to rerun.
begin;
do $$begin
 if to_regprocedure('public.pos_crm_read(jsonb)') is null or to_regprocedure('public.pos_cashier_shifts_read(jsonb)') is null then
  raise exception 'Pasang rangkaian fitur sampai crm-loyalty-085.sql sebelum patch setoran 092';
 end if;
end$$;

create table if not exists public.md_pos_cash_deposits (
 id uuid primary key, store_id uuid not null references public.md_pos_stores,
 deposit_date date not null, created_at timestamptz not null,
 amount numeric not null check(amount>0 and amount<=9000000000000000 and amount=trunc(amount)),
 bank text not null check(length(bank) between 2 and 80),
 cashier_id uuid not null references public.md_pos_employees, cashier_name text not null,
 created_by uuid not null references auth.users,
 voided_at timestamptz, voided_by uuid references public.md_pos_employees, voided_name text,
 void_reason text, void_event_id uuid unique
);
create index if not exists md_pos_deposit_store_date on public.md_pos_cash_deposits(store_id,deposit_date desc,created_at desc,id);
create table if not exists public.md_pos_cash_deposit_proofs (
 deposit_id uuid primary key references public.md_pos_cash_deposits,
 proof text not null check(length(proof)<=2796300)
);
create table if not exists public.md_pos_cash_deposit_events (
 id uuid primary key, deposit_id uuid not null references public.md_pos_cash_deposits,
 actor uuid not null references auth.users, action text not null,
 fingerprint jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create index if not exists md_pos_deposit_event_actor on public.md_pos_cash_deposit_events(actor,created_at desc);
alter table public.md_pos_cash_deposits enable row level security;
alter table public.md_pos_cash_deposit_proofs enable row level security;
alter table public.md_pos_cash_deposit_events enable row level security;
revoke all on public.md_pos_cash_deposits,public.md_pos_cash_deposit_proofs,public.md_pos_cash_deposit_events from public,anon,authenticated;

create or replace function public.pos_deposit_allowed(outlet uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.pos_allowed('sell',outlet) or public.pos_allowed('reports',outlet) or public.pos_allowed('finance',outlet);
$$;
create or replace function public.pos_deposit_summary(outlet uuid) returns jsonb language sql stable set search_path='' as $$
 with cash as (
  select coalesce(sum(total),0) value from (
   select o.total from public.md_pos_order_runs o where o.store_id=outlet and o.payment='Tunai' and o.payment_status='paid' and o.status<>'cancelled'
   union all
   select s.total from public.md_pos_sales s where s.store_id=outlet and s.payment='Tunai' and not s.voided
   and not exists(select 1 from public.md_pos_order_runs o where o.id=s.id)
  ) t
 ), deposits as (
  select coalesce(sum(amount),0) value,count(*) count from public.md_pos_cash_deposits where store_id=outlet and voided_at is null
 ) select jsonb_build_object('storeId',outlet,'netCash',cash.value,'deposited',deposits.value,'pending',cash.value-deposits.value,'count',deposits.count) from cash,deposits;
$$;
create or replace function public.pos_deposit_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',d.id,'storeId',d.store_id,'date',d.deposit_date,'createdAt',d.created_at,'amount',d.amount,'bank',d.bank,
 'cashierId',d.cashier_id,'cashierName',d.cashier_name,'hasProof',true,'voidedAt',d.voided_at,'voidedName',d.voided_name,'voidReason',d.void_reason)
 from public.md_pos_cash_deposits d where d.id=target;
$$;

do $$begin
 if to_regprocedure('public.pos_read_before_092()') is null then alter function public.pos_read() rename to pos_read_before_092;end if;
end$$;
revoke all on function public.pos_read_before_092() from public,anon,authenticated;
create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;begin
 s:=public.pos_read_before_092();
 return s||jsonb_build_object('cashDepositVersion',92,'cashDepositToday',(clock_timestamp() at time zone 'Asia/Jakarta')::date,
 'cashDepositSummary',coalesce((select jsonb_agg(public.pos_deposit_summary(st.id)) from public.md_pos_stores st where public.pos_deposit_allowed(st.id)),'[]'),
 'cashDepositEvents',coalesce((select jsonb_agg(jsonb_build_object('id',x.id)) from (select id from public.md_pos_cash_deposit_events where actor=auth.uid() order by created_at desc,id limit 50)x),'[]'));
end$$;

create or replace function public.pos_cash_deposits_read(filters jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare st uuid:=nullif(filters->>'storeId','')::uuid;start_day date:=nullif(filters->>'from','')::date;end_day date:=nullif(filters->>'to','')::date;
 off integer:=coalesce((filters->>'offset')::integer,0);rows jsonb;sums jsonb;period_sum numeric;begin
 if not exists(select 1 from public.md_pos_employees where user_id=auth.uid() and active) then raise exception 'Login diperlukan';end if;
 if st is not null and not public.pos_deposit_allowed(st) then raise exception 'Outlet tidak dapat diakses';end if;
 if off<0 or off>1000000 or start_day>end_day then raise exception 'Filter tidak valid';end if;
 select coalesce(jsonb_agg(public.pos_deposit_json(x.id) order by x.created_at desc,x.id),'[]') into rows from (
  select d.id,d.created_at from public.md_pos_cash_deposits d where public.pos_deposit_allowed(d.store_id) and (st is null or d.store_id=st)
  and (start_day is null or d.deposit_date>=start_day) and (end_day is null or d.deposit_date<=end_day)
  order by d.created_at desc,d.id offset off limit 21
 ) x;
 select coalesce(jsonb_agg(public.pos_deposit_summary(x.id)),'[]') into sums from public.md_pos_stores x where public.pos_deposit_allowed(x.id) and (st is null or x.id=st);
 select coalesce(sum(amount),0) into period_sum from public.md_pos_cash_deposits d where public.pos_deposit_allowed(d.store_id) and (st is null or d.store_id=st) and d.voided_at is null
 and (start_day is null or d.deposit_date>=start_day) and (end_day is null or d.deposit_date<=end_day);
 return jsonb_build_object('rows',rows,'summary',sums,'periodDeposited',period_sum,'serverDate',(clock_timestamp() at time zone 'Asia/Jakarta')::date,'fetchedAt',clock_timestamp());
end$$;
create or replace function public.pos_cash_deposit_proof(deposit_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.md_pos_cash_deposits%rowtype;begin
 select * into d from public.md_pos_cash_deposits where id=deposit_id;
 if not found or not public.pos_deposit_allowed(d.store_id) then raise exception 'Bukti setoran tidak dapat diakses';end if;
 return jsonb_build_object('deposit',public.pos_deposit_json(d.id),'proof',(select proof from public.md_pos_cash_deposit_proofs where md_pos_cash_deposit_proofs.deposit_id=d.id));
end$$;

create or replace function public.pos_cash_deposit_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.md_pos_employees%rowtype;ev public.md_pos_cash_deposit_events%rowtype;d public.md_pos_cash_deposits%rowtype;
 eid uuid:=(payload->>'id')::uuid;st uuid;value numeric;bank_name text;proof_data text;raw bytea;mime text;fp jsonb;available numeric;stamp timestamptz;target uuid;reason text;
begin
 select * into me from public.md_pos_employees where user_id=auth.uid() and active;
 if not found or eid is null then raise exception 'Login dan ID operasi wajib';end if;
 if action not in ('cash_deposit_save','cash_deposit_void') then raise exception 'Aksi setoran tidak dikenal';end if;
 if action='cash_deposit_save' then
  if exists(select 1 from jsonb_object_keys(payload) k where k not in ('id','storeId','amount','bank','proof')) then raise exception 'Tanggal dan identitas setoran ditetapkan server; isian tidak dikenal';end if;
  st:=(payload->>'storeId')::uuid;
  if st is null or not exists(select 1 from public.md_pos_stores where id=st) or not (public.pos_allowed('sell',st) or public.pos_allowed('finance',st)) then raise exception 'Hak akses setoran outlet tidak tersedia';end if;
  value:=nullif(payload->>'amount','')::numeric;bank_name:=btrim(coalesce(payload->>'bank',''));proof_data:=payload->>'proof';
  if value is null or value::text in ('NaN','Infinity','-Infinity') or value<=0 or value>9000000000000000 or value<>trunc(value) then raise exception 'Nilai setoran harus Rupiah bulat lebih dari nol';end if;
  if length(bank_name)<2 or length(bank_name)>80 or bank_name ~ '[[:cntrl:]]' then raise exception 'Isi bank tujuan setor (2–80 karakter)';end if;
  if proof_data is null or length(proof_data)>2796300 or proof_data !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$' then raise exception 'Bukti struk wajib JPG, PNG, atau WebP, maksimal 2 MB';end if;
  begin raw:=decode(split_part(proof_data,',',2),'base64');exception when others then raise exception 'Bukti struk tidak valid';end;
  mime:=split_part(proof_data,';',1);
  if octet_length(raw)<12 or octet_length(raw)>2097152 or not (
   (mime='data:image/png' and substring(raw from 1 for 8)=decode('89504e470d0a1a0a','hex')) or
   (mime='data:image/jpeg' and substring(raw from 1 for 3)=decode('ffd8ff','hex')) or
   (mime='data:image/webp' and substring(raw from 1 for 4)=decode('52494646','hex') and substring(raw from 9 for 4)=decode('57454250','hex'))
  ) then raise exception 'Isi bukti tidak sesuai format gambar';end if;
  fp:=jsonb_build_object('storeId',st,'amount',value,'bank',bank_name,'proofHash',md5(proof_data));
 else
  if exists(select 1 from jsonb_object_keys(payload) k where k not in ('id','depositId','reason')) then raise exception 'Isian pembatalan tidak dikenal';end if;
  target:=(payload->>'depositId')::uuid;reason:=btrim(coalesce(payload->>'reason',''));
  if length(reason)<3 or length(reason)>300 then raise exception 'Alasan pembatalan wajib 3–300 karakter';end if;
  fp:=jsonb_build_object('depositId',target,'reason',reason);
 end if;
 -- The same lock used by cash sales/refunds prevents simultaneous deposits
 -- from spending the same balance and serializes with all cashier mutations.
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 select * into ev from public.md_pos_cash_deposit_events where id=eid;
 if found then
  if ev.actor<>auth.uid() or ev.action<>action or ev.fingerprint<>fp then raise exception 'ID sudah digunakan untuk data lain';end if;
  return public.pos_read();
 end if;
 stamp:=clock_timestamp();
 if action='cash_deposit_save' then
  available:=(public.pos_deposit_summary(st)->>'pending')::numeric;
  if value>available then raise exception 'Setoran melebihi cash yang belum disetor (%). Perbarui saldo.',available;end if;
  insert into public.md_pos_cash_deposits(id,store_id,deposit_date,created_at,amount,bank,cashier_id,cashier_name,created_by)
  values(eid,st,(stamp at time zone 'Asia/Jakarta')::date,stamp,value,bank_name,me.id,me.name,auth.uid());
  insert into public.md_pos_cash_deposit_proofs(deposit_id,proof) values(eid,proof_data);target:=eid;
 else
  select * into d from public.md_pos_cash_deposits where id=target for update;
  if not found or not public.pos_allowed('finance',d.store_id) then raise exception 'Hanya pengelola keuangan yang dapat membatalkan setoran';end if;
  if d.voided_at is not null then raise exception 'Setoran sudah dibatalkan';end if;
  update public.md_pos_cash_deposits set voided_at=stamp,voided_by=me.id,voided_name=me.name,void_reason=reason,void_event_id=eid where id=target;
 end if;
 insert into public.md_pos_cash_deposit_events(id,deposit_id,actor,action,fingerprint) values(eid,target,auth.uid(),action,fp);
 return public.pos_read();
end$$;
revoke all on function public.pos_deposit_allowed(uuid),public.pos_deposit_summary(uuid),public.pos_deposit_json(uuid),public.pos_cash_deposits_read(jsonb),public.pos_cash_deposit_proof(uuid),public.pos_cash_deposit_mutate(text,jsonb),public.pos_read() from public,anon,authenticated;
grant execute on function public.pos_cash_deposits_read(jsonb),public.pos_cash_deposit_proof(uuid),public.pos_cash_deposit_mutate(text,jsonb),public.pos_read() to authenticated;
insert into public.md_pos_schema_versions(version) values(92) on conflict do nothing;
notify pgrst, 'reload schema';
commit;

-- PATCH 084: configurable payment channels per outlet; manual confirmation.
-- Apply after 083. Safe to rerun. Does not delete or relabel historical transactions.
begin;
do $$begin
 if to_regprocedure('public.pos_read_before_083()') is null or to_regprocedure('public.pos_cashier_shift_mutate(text,jsonb)') is null then
  raise exception 'Pasang cashier-shifts-083.sql terlebih dahulu';
 end if;
end$$;
create table if not exists public.md_pos_payment_catalog(
 key text primary key, group_key text not null, label text not null unique
);
insert into public.md_pos_payment_catalog(key,group_key,label) values ('cash','cash','Tunai'),('qris','qris','QRIS'),('transfer','bank','Transfer'),('bca','bank','Transfer BCA'),('bri','bank','Transfer BRI'),('bni','bank','Transfer BNI'),('mandiri','bank','Transfer Mandiri'),('cimb','bank','Transfer CIMB Niaga'),('permata','bank','Transfer Permata'),('bsi','bank','Transfer BSI'),('debit','card','Kartu Debit'),('credit','card','Kartu Kredit'),('gopay','ewallet','GoPay'),('ovo','ewallet','OVO'),('dana','ewallet','DANA'),('shopeepay','ewallet','ShopeePay'),('linkaja','ewallet','LinkAja'),('shopee','ecommerce','Shopee'),('tokopedia','ecommerce','Tokopedia'),('tiktok','ecommerce','TikTok Shop'),('lazada','ecommerce','Lazada'),('marketplace_other','ecommerce','E-Commerce Lainnya'),('gofood','delivery','GoFood'),('grabfood','delivery','GrabFood'),('shopeefood','delivery','ShopeeFood') on conflict(key) do nothing;
create table if not exists public.md_pos_payment_settings(
 store_id uuid primary key references public.md_pos_stores,
 revision integer not null check(revision>0), config jsonb not null,
 updated_by uuid not null references auth.users, updated_at timestamptz not null default clock_timestamp(), event_id uuid not null
);
create table if not exists public.md_pos_payment_setting_events(
 id uuid primary key, store_id uuid not null references public.md_pos_stores,
 actor uuid not null references auth.users, payload jsonb not null, created_at timestamptz not null default clock_timestamp()
);
alter table public.md_pos_payment_catalog enable row level security;
alter table public.md_pos_payment_settings enable row level security;
alter table public.md_pos_payment_setting_events enable row level security;
revoke all on public.md_pos_payment_catalog,public.md_pos_payment_settings,public.md_pos_payment_setting_events from public,anon,authenticated;

create or replace function public.pos_payment_defaults() returns jsonb language sql immutable set search_path='' as $$
 select '{"groups":{"cash":true,"qris":true,"bank":true,"card":false,"ewallet":false,"ecommerce":false,"delivery":false},"methods":{"cash":{"enabled":true,"bank":"","accountName":"","accountNumber":"","note":""},"qris":{"enabled":true,"bank":"","accountName":"","accountNumber":"","note":""},"transfer":{"enabled":true,"bank":"","accountName":"","accountNumber":"","note":""},"bca":{"enabled":false,"bank":"","accountName":"","accountNumber":"","note":""},"bri":{"enabled":false,"bank":"","accountName":"","accountNumber":"","note":""},"bni":{"enabled":false,"bank":"","accountName":"","accountNumber":"","note":""},"mandiri":{"enabled":false,"bank":"","accountName":"","accountNumber":"","note":""},"cimb":{"enabled":false,"bank":"","accountName":"","accountNumber":"","note":""},"permata":{"enabled":false,"bank":"","accountName":"","accountNumber":"","note":""},"bsi":{"enabled":false,"bank":"","accountName":"","accountNumber":"","note":""},"debit":{"enabled":true,"bank":"","accountName":"","accountNumber":"","note":""},"credit":{"enabled":true,"bank":"","accountName":"","accountNumber":"","note":""},"gopay":{"enabled":true,"bank":"","accountName":"","accountNumber":"","note":""},"ovo":{"enabled":true,"bank":"","accountName":"","accountNumber":"","note":""},"dana":{"enabled":true,"bank":"","accountName":"","accountNumber":"","note":""},"shopeepay":{"enabled":true,"bank":"","accountName":"","accountNumber":"","note":""},"linkaja":{"enabled":true,"bank":"","accountName":"","accountNumber":"","note":""},"shopee":{"enabled":true,"bank":"","accountName":"","accountNumber":"","note":""},"tokopedia":{"enabled":true,"bank":"","accountName":"","accountNumber":"","note":""},"tiktok":{"enabled":true,"bank":"","accountName":"","accountNumber":"","note":""},"lazada":{"enabled":true,"bank":"","accountName":"","accountNumber":"","note":""},"marketplace_other":{"enabled":true,"bank":"","accountName":"","accountNumber":"","note":""},"gofood":{"enabled":true,"bank":"","accountName":"","accountNumber":"","note":""},"grabfood":{"enabled":true,"bank":"","accountName":"","accountNumber":"","note":""},"shopeefood":{"enabled":true,"bank":"","accountName":"","accountNumber":"","note":""}}}'::jsonb;
$$;
create or replace function public.pos_payment_enabled(outlet uuid,method text) returns boolean language sql stable set search_path='' as $$
 select coalesce((select (cfg->'groups'->>c.group_key)::boolean and (cfg->'methods'->c.key->>'enabled')::boolean
 from public.md_pos_payment_catalog c cross join lateral(select coalesce((select config from public.md_pos_payment_settings where store_id=outlet),public.pos_payment_defaults()) cfg) s where c.label=method),false);
$$;

-- Reuse the established stock, discount and idempotency engines. Only expand their
-- exact payment whitelist; amounts, permissions, events and stock logic are unchanged.
do $$declare f record;definition text;old_list text:='(''Tunai'',''QRIS'',''Transfer'')';new_list text;begin
 select '('||string_agg(quote_literal(label),',' order by key)||')' into new_list from public.md_pos_payment_catalog;
 for f in select p.oid from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like 'pos_mutate%' or p.proname='pos_cashier_mutate') and position(old_list in p.prosrc)>0 loop
  definition:=pg_get_functiondef(f.oid);execute replace(definition,old_list,new_list);
 end loop;
end$$;
alter table public.md_pos_sales drop constraint if exists md_pos_sales_payment_check;
alter table public.md_pos_cashier_shift_entries drop constraint if exists md_pos_cashier_shift_entries_payment_check;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.md_pos_sales'::regclass and conname='md_pos_sale_payment_catalog') then
  alter table public.md_pos_sales add constraint md_pos_sale_payment_catalog foreign key(payment) references public.md_pos_payment_catalog(label);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.md_pos_order_runs'::regclass and conname='md_pos_order_payment_catalog') then
  alter table public.md_pos_order_runs add constraint md_pos_order_payment_catalog foreign key(payment) references public.md_pos_payment_catalog(label);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.md_pos_cashier_shift_entries'::regclass and conname='md_pos_shift_payment_catalog') then
  alter table public.md_pos_cashier_shift_entries add constraint md_pos_shift_payment_catalog foreign key(payment) references public.md_pos_payment_catalog(label);
 end if;
end$$;
-- Settings guard covers both current and older checkout RPCs. Refunds keep the
-- original payment label even when the owner later disables the method.
create or replace function public.pos_payment_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new);o jsonb;paid_now boolean;paid_before boolean:=false;begin
 paid_now:=case when tg_table_name='md_pos_order_runs' then n->>'payment_status'='paid' else not (n->>'voided')::boolean end;
 if tg_op='UPDATE' then
  o:=to_jsonb(old);paid_before:=case when tg_table_name='md_pos_order_runs' then o->>'payment_status'='paid' else not (o->>'voided')::boolean end;
 end if;
 if paid_now and (not paid_before or n->>'payment' is distinct from o->>'payment') then
  perform pg_catalog.pg_advisory_xact_lock(71031,1102);
  if not public.pos_payment_enabled(new.store_id,new.payment) then raise exception 'Metode pembayaran tidak aktif di outlet ini. Pilih kembali metode pembayaran.';end if;
 end if;
 -- Legacy fruit checkout inserts total 0 first, then finalizes the amount.
 if paid_now and (tg_table_name='md_pos_order_runs' or new.total>0) then
  if new.paid is null or new.paid::text in ('NaN','Infinity','-Infinity') or new.paid<new.total or (new.payment<>'Tunai' and new.paid<>new.total) then raise exception 'Pembayaran belum sesuai total';end if;
 end if;
 return new;
end$$;
drop trigger if exists md_pos_order_payment_guard on public.md_pos_order_runs;
create trigger md_pos_order_payment_guard before insert or update on public.md_pos_order_runs for each row execute function public.pos_payment_guard();
drop trigger if exists md_pos_sale_payment_guard on public.md_pos_sales;
create trigger md_pos_sale_payment_guard before insert or update on public.md_pos_sales for each row execute function public.pos_payment_guard();

-- Preserve legacy summary keys; new clients use a complete per-method breakdown.
do $$begin
 if to_regprocedure('public.pos_shift_totals_before_084(uuid)') is null then alter function public.pos_shift_totals(uuid) rename to pos_shift_totals_before_084;end if;
 if to_regprocedure('public.pos_read_before_084()') is null then alter function public.pos_read() rename to pos_read_before_084;end if;
end$$;
create or replace function public.pos_shift_totals(target uuid) returns jsonb language sql stable set search_path='' as $$
 select public.pos_shift_totals_before_084(target)||jsonb_build_object('payments',coalesce((select jsonb_agg(jsonb_build_object('payment',payment,'sales',sales,'refunds',refunds) order by payment) from (
 select payment,coalesce(sum(amount) filter(where kind='sale'),0) sales,coalesce(sum(amount) filter(where kind='refund'),0) refunds from public.md_pos_cashier_shift_entries where shift_id=target group by payment) t),'[]'));
$$;
create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;begin
 s:=public.pos_read_before_084();
 return s||jsonb_build_object('paymentMethodsVersion',84,
 'paymentSettings',coalesce((select jsonb_agg(jsonb_build_object('storeId',x.store_id,'revision',x.revision,'config',x.config,'eventId',x.event_id)) from public.md_pos_payment_settings x where exists(select 1 from jsonb_array_elements(s->'stores') st where st->>'id'=x.store_id::text)),'[]'),
 'paymentSettingEvents',coalesce((select jsonb_agg(jsonb_build_object('id',x.id)) from (select id from public.md_pos_payment_setting_events where actor=auth.uid() order by created_at desc limit 50) x),'[]'));
end$$;
create or replace function public.pos_payment_settings_save(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare st uuid:=(payload->>'storeId')::uuid;eid uuid:=(payload->>'id')::uuid;cfg jsonb:=payload->'config';v jsonb;c record;g text;k text;maxlen integer;
 ev public.md_pos_payment_setting_events%rowtype;rev integer;active_count integer:=0;
begin
 if not exists(select 1 from public.md_pos_employees where user_id=auth.uid() and active and role='owner') then raise exception 'Hanya owner yang dapat mengatur metode pembayaran';end if;
 if st is null or eid is null or not exists(select 1 from public.md_pos_stores where id=st) then raise exception 'Outlet dan ID operasi wajib';end if;
 perform public.pos_require('master',st);
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 select * into ev from public.md_pos_payment_setting_events where id=eid;
 if found then
  if ev.actor<>auth.uid() or ev.payload<>payload then raise exception 'ID sudah digunakan untuk data lain';end if;
  return public.pos_read();
 end if;
 select revision into rev from public.md_pos_payment_settings where store_id=st for update;rev:=coalesce(rev,0);
 if rev is distinct from (payload->>'expectedRevision')::integer then raise exception 'Pengaturan berubah. Muat ulang sebelum menyimpan.';end if;
 if jsonb_typeof(cfg) is distinct from 'object' or jsonb_typeof(cfg->'groups') is distinct from 'object' or jsonb_typeof(cfg->'methods') is distinct from 'object' then raise exception 'Pengaturan pembayaran tidak valid';end if;
 if cfg-array['groups','methods']<>'{}'::jsonb then raise exception 'Pengaturan tidak dikenal';end if;
 if (cfg->'groups')-array['cash','qris','bank','card','ewallet','ecommerce','delivery']<>'{}'::jsonb then raise exception 'Kategori tidak dikenal';end if;
 if exists(select 1 from jsonb_object_keys(cfg->'methods') x where not exists(select 1 from public.md_pos_payment_catalog where key=x)) then raise exception 'Metode tidak dikenal';end if;
 foreach g in array array['cash','qris','bank','card','ewallet','ecommerce','delivery'] loop
  if jsonb_typeof(cfg->'groups'->g) is distinct from 'boolean' then raise exception 'Status kategori tidak valid';end if;
 end loop;
 for c in select * from public.md_pos_payment_catalog loop
  v:=cfg->'methods'->c.key;
  if jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'enabled') is distinct from 'boolean' then raise exception 'Status metode tidak valid';end if;
  if v-array['enabled','bank','accountName','accountNumber','note']<>'{}'::jsonb then raise exception 'Detail tidak dikenal';end if;
  foreach k in array array['bank','accountName','accountNumber','note'] loop
   maxlen:=case k when 'bank' then 60 when 'accountName' then 100 when 'accountNumber' then 50 else 200 end;
   if jsonb_typeof(v->k) is distinct from 'string' or length(v->>k)>maxlen or (v->>k)~'[[:cntrl:]]' then raise exception 'Detail rekening / catatan tidak valid';end if;
   cfg:=jsonb_set(cfg,array['methods',c.key,k],to_jsonb(btrim(v->>k)));
  end loop;
  if (cfg->'groups'->>c.group_key)::boolean and (v->>'enabled')::boolean then active_count:=active_count+1;end if;
 end loop;
 if active_count=0 then raise exception 'Aktifkan minimal satu metode pembayaran';end if;
 insert into public.md_pos_payment_settings(store_id,revision,config,updated_by,event_id) values(st,rev+1,cfg,auth.uid(),eid)
 on conflict(store_id) do update set revision=excluded.revision,config=excluded.config,updated_by=excluded.updated_by,updated_at=clock_timestamp(),event_id=excluded.event_id;
 insert into public.md_pos_payment_setting_events(id,store_id,actor,payload) values(eid,st,auth.uid(),payload);
 return public.pos_read();
end$$;
revoke all on function public.pos_payment_defaults(),public.pos_payment_enabled(uuid,text),public.pos_payment_guard(),public.pos_shift_totals_before_084(uuid),public.pos_shift_totals(uuid),public.pos_read_before_084() from public,anon,authenticated;
revoke all on function public.pos_payment_settings_save(jsonb),public.pos_read() from public,anon,authenticated;
grant execute on function public.pos_payment_settings_save(jsonb),public.pos_read() to authenticated;
insert into public.md_pos_schema_versions(version) values(84) on conflict do nothing;
notify pgrst,'reload schema';
commit;

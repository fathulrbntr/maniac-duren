-- RESET DATA OPERASIONAL MANIAC DUREN (109)
-- DESTRUKTIF: stok, transaksi, supplier, member, absensi, dan log dikosongkan.
-- Master barang beserta konfigurasi, karyawan/akses, outlet/gudang tetap utuh.
-- Jalankan hanya pada proyek Maniac Duren yang memang ingin direset.
-- SQL pemeliharaan satu kali, BUKAN migration/startup/deployment otomatis.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_catalog.pg_advisory_xact_lock(71031,1102);

create temporary table md_reset_109_manifest (
 schema_name text not null,
 table_name text not null,
 preserve boolean not null,
 before_rows bigint,
 after_rows bigint,
 before_hash text,
 primary key(schema_name,table_name)
) on commit drop;

-- Explicit reviewed allowlist. Unknown tables stop the reset for inspection.
insert into md_reset_109_manifest(schema_name,table_name,preserve) values
 ('public','md_pos_products',true),
 ('public','md_pos_menu_categories',true),
 ('public','md_pos_menu_category_products',true),
 ('public','md_pos_recipes',true),
 ('public','md_pos_recipe_items',true),
 ('public','md_pos_point_rules',true),
 ('public','md_pos_employees',true),
 ('public','md_pos_employee_documents',true),
 ('public','md_pos_staff',true),
 ('public','md_pos_work_hours',true),
 ('public','md_pos_stores',true),
 ('public','md_pos_letterheads',true),
 ('public','md_pos_payment_settings',true),
 ('public','md_pos_payment_catalog',true),
 ('public','md_pos_schema_versions',true),
 ('md_supply','prices',true),
 ('public','md_pos_admin_events',false),
 ('public','md_pos_attendance',false),
 ('public','md_pos_attendance_legacy',false),
 ('public','md_pos_batch_processes',false),
 ('public','md_pos_cash_deposit_events',false),
 ('public','md_pos_cash_deposit_proofs',false),
 ('public','md_pos_cash_deposits',false),
 ('public','md_pos_cashier_approvals',false),
 ('public','md_pos_cashier_shift_entries',false),
 ('public','md_pos_cashier_shift_events',false),
 ('public','md_pos_cashier_shifts',false),
 ('public','md_pos_crm_events',false),
 ('public','md_pos_crm_receipts',false),
 ('public','md_pos_customer_displays',false),
 ('public','md_pos_discounts',false),
 ('public','md_pos_display_pair_limits',false),
 ('public','md_pos_doc_counters',false),
 ('public','md_pos_documents',false),
 ('public','md_pos_events',false),
 ('public','md_pos_expenses',false),
 ('public','md_pos_fruit_events',false),
 ('public','md_pos_fruit_requests',false),
 ('public','md_pos_fruit_units',false),
 ('public','md_pos_login_attempts',false),
 ('public','md_pos_lots',false),
 ('public','md_pos_member_consents',false),
 ('public','md_pos_members',false),
 ('public','md_pos_money_journal',false),
 ('public','md_pos_movements',false),
 ('public','md_pos_order_runs',false),
 ('public','md_pos_payment_setting_events',false),
 ('public','md_pos_point_ledger',false),
 ('public','md_pos_productions',false),
 ('public','md_pos_receipt_shipments',false),
 ('public','md_pos_reject_records',false),
 ('public','md_pos_sale_items',false),
 ('public','md_pos_sales',false),
 ('public','md_pos_stock_adjustments',false),
 ('public','md_pos_stock_journal',false),
 ('public','md_pos_suppliers',false),
 ('public','md_pos_sync_receipts',false),
 ('public','md_pos_unit_lots',false),
 ('public','md_pos_waste_runs',false),
 ('md_supply','transfers',false),
 ('md_supply','items',false),
 ('md_supply','events',false),
 ('md_supply','receipt_plans',false),
 ('md_supply','cut_checks',false);

do $$
declare
 t record;
 unexpected text;
 targets text;
 row_count bigint;
 row_hash text;
begin
 -- Refuse an unrelated/incomplete database before touching any business data.
 if to_regclass('public.md_pos_products') is null
    or to_regclass('public.md_pos_employees') is null
    or to_regclass('public.md_pos_stores') is null
    or to_regprocedure('public.pos_read()') is null then
  raise exception 'Database POS Maniac Duren tidak lengkap. Reset dibatalkan.';
 end if;

 select string_agg(format('%I.%I',n.nspname,c.relname),', ' order by n.nspname,c.relname)
 into unexpected
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.relkind in ('r','p')
   and (n.nspname='md_supply' or (n.nspname='public' and starts_with(c.relname,'md_pos_')))
   and not exists(select 1 from md_reset_109_manifest m where m.schema_name=n.nspname and m.table_name=c.relname);
 if unexpected is not null then
  raise exception 'Tabel belum ditinjau: %. Tidak ada data yang direset.',unexpected;
 end if;

 -- Optional modules can be absent; core tables above must exist.
 delete from md_reset_109_manifest m
 where to_regclass(format('%I.%I',m.schema_name,m.table_name)) is null;
 for t in select * from md_reset_109_manifest order by schema_name,table_name loop
  execute format('lock table %I.%I in %s mode',t.schema_name,t.table_name,
   case when t.preserve then 'SHARE' else 'ACCESS EXCLUSIVE' end);
 end loop;

 -- A truncate trigger could write outside the reviewed scope: stop instead.
 if exists(
  select 1 from pg_trigger tr join pg_class c on c.oid=tr.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  join md_reset_109_manifest m on m.schema_name=n.nspname and m.table_name=c.relname
  where not m.preserve and not tr.tgisinternal and (tr.tgtype::int & 32)>0
 ) then raise exception 'Ada trigger TRUNCATE yang harus ditinjau. Reset dibatalkan.';end if;

 -- Hash ALL fields of preserved rows, including photos, prices and permissions.
 -- Only counts and pass/fail are returned; no employee/photo data is exported.
 for t in select * from md_reset_109_manifest order by schema_name,table_name loop
  if t.preserve then
   execute format('select count(*),md5(coalesce(string_agg(h, '''' order by h),'''')) from (select md5(to_jsonb(r)::text) h from %I.%I r) x',t.schema_name,t.table_name)
    into row_count,row_hash;
  else
   execute format('select count(*) from %I.%I',t.schema_name,t.table_name) into row_count;
   row_hash:=null;
  end if;
  update md_reset_109_manifest set before_rows=row_count,before_hash=row_hash
   where schema_name=t.schema_name and table_name=t.table_name;
 end loop;

 select string_agg(format('%I.%I',schema_name,table_name),', ' order by schema_name,table_name)
 into targets from md_reset_109_manifest where not preserve;
 if targets is not null then
  -- RESTRICT is intentional: an unexpected dependency aborts the transaction.
  execute 'truncate table '||targets||' restart identity restrict';
 end if;
 if to_regclass('md_supply.document_number') is not null then
  -- ALTER RESTART rolls back with this transaction; setval would not.
  execute 'alter sequence md_supply.document_number restart with 1';
 end if;

 for t in select * from md_reset_109_manifest order by schema_name,table_name loop
  execute format('select count(*) from %I.%I',t.schema_name,t.table_name) into row_count;
  if t.preserve then
   execute format('select md5(coalesce(string_agg(h, '''' order by h),'''')) from (select md5(to_jsonb(r)::text) h from %I.%I r) x',t.schema_name,t.table_name) into row_hash;
   if row_count<>t.before_rows or row_hash is distinct from t.before_hash then
    raise exception 'Data yang dilindungi berubah: %.%. Semua perubahan dibatalkan.',t.schema_name,t.table_name;
   end if;
  elsif row_count<>0 then
   raise exception 'Reset belum kosong: %.%. Semua perubahan dibatalkan.',t.schema_name,t.table_name;
  end if;
  update md_reset_109_manifest set after_rows=row_count
   where schema_name=t.schema_name and table_name=t.table_name;
 end loop;

 -- Carry a non-sensitive verification report past COMMIT without permanent tables.
 perform set_config('md_pos.reset_109_report',(
  select jsonb_build_object('status','verified','at',clock_timestamp(),
   'tables',jsonb_agg(jsonb_build_object('table',schema_name||'.'||table_name,
     'action',case when preserve then 'preserved' else 'reset' end,
     'before',before_rows,'after',after_rows,'verified',true) order by schema_name,table_name))::text
  from md_reset_109_manifest
 ),false);
end $$;
commit;
select current_setting('md_pos.reset_109_report')::jsonb as reset_report;

-- DESTRUCTIVE: clear operational data only. Export a backup before running.
-- Run in Supabase SQL Editor as database administrator, after database/upgrade.sql.
-- Preserves auth accounts, employees, documents, attendance, work hours,
-- staff access, outlet identities, schema versions and employee audit events.
begin;
lock table public.md_pos_employees in share mode;
truncate table
 public.md_pos_sync_receipts,
 public.md_pos_stock_journal,
 public.md_pos_money_journal,
 public.md_pos_order_runs,
 public.md_pos_batch_processes,
 public.md_pos_waste_runs,
 public.md_pos_stock_adjustments,
 public.md_pos_productions,
 public.md_pos_sale_items,
 public.md_pos_sales,
 public.md_pos_movements,
 public.md_pos_recipe_items,
 public.md_pos_recipes,
 public.md_pos_unit_lots,
 public.md_pos_lots,
 public.md_pos_receipt_shipments,
 public.md_pos_products,
 public.md_pos_suppliers,
 public.md_pos_login_attempts
 restart identity;
-- No CASCADE: unexpected foreign keys stop this transaction instead of
-- silently deleting employee or external application data.
delete from public.md_pos_events
 where action not like 'employee_%' and action not like 'attendance_%';
commit;

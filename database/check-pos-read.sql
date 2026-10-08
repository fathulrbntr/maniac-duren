-- Read-only diagnostics. Run in Supabase SQL Editor and retain all result tabs.
-- Does not call pos_read, expose photos, or change operational records.
select 'Foto karyawan' as item,count(*) as records,
 round(coalesce(sum(octet_length(profile_photo)),0)/1048576.0,2) as total_mb
from public.md_pos_employees
union all
select 'Foto produk',count(*),round(coalesce(sum(octet_length(photo)),0)/1048576.0,2)
from public.md_pos_products;

select name,rows from (
 select 'karyawan' as name,count(*) as rows from public.md_pos_employees
 union all select 'penjualan',count(*) from public.md_pos_sales
 union all select 'pesanan',count(*) from public.md_pos_order_runs
 union all select 'audit',count(*) from public.md_pos_events
 union all select 'stok buah',count(*) from public.md_pos_lots
 union all select 'stok bahan',count(*) from public.md_pos_unit_lots
) counts order by name;

select position('MD_POS_PHOTO_FIX_040' in pg_get_functiondef('public.pos_read()'::regprocedure))>0
 as perbaikan_foto_terpasang;

-- Report circular calls without running the heavy function.
with recursive functions as (
 select p.proname::text collate "default" name,p.prosrc collate "default" body
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'pos_read%' and p.pronargs=0
), edges as (
 select f.name parent,m[1] child from functions f
 cross join lateral regexp_matches(f.body,'public\.(pos_read[a-zA-Z0-9_]*)\s*\(\s*\)','g') m
), walk as (
 select 'pos_read'::text name,array['pos_read']::text[] chain,false circular
 union all
 select e.child,w.chain||e.child,e.child=any(w.chain)
 from walk w join edges e on e.parent=w.name
 where not w.circular and cardinality(w.chain)<32
)
select array_to_string(chain,' -> ') as function_chain,circular from walk
where circular or not exists(select 1 from edges e where e.parent=walk.name)
order by function_chain;

-- No query text or account credentials are returned.
select pid,now()-query_start as running_for,wait_event_type,wait_event,
 cardinality(pg_blocking_pids(pid)) as blocking_sessions
from pg_stat_activity
where datname=current_database() and state='active' and pid<>pg_backend_pid()
order by query_start;

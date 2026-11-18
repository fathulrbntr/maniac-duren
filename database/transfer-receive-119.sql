-- Maniac Duren 119. Validate the entire delivery before posting its first lot.
begin;
set local lock_timeout = '10s';
select pg_catalog.pg_advisory_xact_lock(71031, 1102);

do $migration$
declare
  handler regprocedure := coalesce(
    to_regprocedure('public.pos_warehouse_mutate_before_112(text,jsonb)'),
    to_regprocedure('public.pos_warehouse_mutate_before_114(text,jsonb)'),
    to_regprocedure('public.pos_warehouse_mutate(text,jsonb)')
  );
  definition text;
  old_block constant text := $old$   for ln in select value from jsonb_array_elements(t.lines) loop
    if ln->>'kind'='fruit' then
     if exists(select 1 from md_supply.items i join public.md_pos_fruit_units fu on fu.barcode=i.barcode where i.transfer_id=tid and (fu.status<>'in_transit' or fu.transfer_id is distinct from tid)) then raise exception 'Status barcode berubah';end if;$old$;
  new_block constant text := $new$   -- Check every unit once, while every batch is still in transit.
   for u in
    select fu.*
    from md_supply.items i
    join public.md_pos_fruit_units fu on fu.barcode = i.barcode
    where i.transfer_id = tid
    order by fu.barcode
    for update of fu
   loop
    if u.status is distinct from 'in_transit' or u.transfer_id is distinct from tid then
     raise exception 'Barcode % tidak sesuai surat jalan % (status: %). Periksa riwayat barcode.', u.barcode, t.delivery_no, u.status;
    end if;
   end loop;
   for ln in select value from jsonb_array_elements(t.lines) loop
    if ln->>'kind'='fruit' then$new$;
begin
  if handler is null then
    raise exception 'Fungsi penerimaan gudang belum terpasang.';
  end if;
  definition := pg_get_functiondef(handler);
  if strpos(definition, new_block) > 0 and strpos(definition, old_block) = 0 then
    return;
  end if;
  if cardinality(string_to_array(definition, old_block)) <> 2 then
    raise exception 'Versi fungsi % berbeda. Periksa definisi penerimaan sebelum memasang patch 119.', handler;
  end if;
  execute replace(definition, old_block, new_block);
end
$migration$;
commit;

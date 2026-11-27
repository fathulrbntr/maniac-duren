-- Require the destination to scan the labels on the dispatch manifest before posting stock.
begin;
set local lock_timeout = '10s';
select pg_catalog.pg_advisory_xact_lock(71031,1102);

do $migration$
declare
 handler regprocedure := 'public.pos_warehouse_mutate_before_112(text,jsonb)'::regprocedure;
 definition text := replace(pg_get_functiondef(handler),chr(13)||chr(10),chr(10));
 rule record;
begin
 for rule in select * from (values
  ($before$if t.invoice_no is null and (payload->'fruitCounts') is distinct from
     (select coalesce(jsonb_object_agg(x->>'sourceLotId',(x->>'pieces')::int),'{}'::jsonb)
      from jsonb_array_elements(t.lines) x where x->>'kind'='fruit') then
    raise exception 'Jumlah fisik buah per batch belum sesuai surat jalan';
   end if;
   if t.invoice_no is not null and exists(select 1 from md_supply.items where transfer_id=tid and scanned_at is null) then$before$,
   $after$if t.invoice_no is null and exists(
    select 1 from jsonb_array_elements(t.lines) as manifest(line)
    left join (
     select i.source_lot_id, i.target_lot_id, fu.product_id, count(*) pieces, sum(fu.grams)::numeric/1000 kg
     from md_supply.items i join public.md_pos_fruit_units fu on fu.barcode=i.barcode
     where i.transfer_id=tid and i.scanned_at is not null
     group by i.source_lot_id,i.target_lot_id,fu.product_id
    ) scanned on scanned.source_lot_id=(line->>'sourceLotId')::uuid
      and scanned.target_lot_id=(line->>'targetLotId')::uuid and scanned.product_id=(line->>'productId')::uuid
    where line->>'kind'='fruit' and (scanned.pieces is distinct from (line->>'pieces')::integer
      or scanned.kg is distinct from (line->>'kg')::numeric)
   ) then raise exception 'Scan penerimaan buah belum lengkap atau tidak sesuai batch pada surat jalan';end if;
   if exists(select 1 from md_supply.items where transfer_id=tid and scanned_at is null) then$after$),
  ($before$for code in select jsonb_array_elements_text(payload->'barcodes') loop
    if code=any(codes) then$before$,
   $after$if t.invoice_no is null and jsonb_array_length(payload->'barcodes')<>1 then
    raise exception 'Pindai satu barcode buah untuk setiap scan penerimaan';
   end if;
   for code in select jsonb_array_elements_text(payload->'barcodes') loop
    if code=any(codes) then$after$),
  ($before$update md_supply.items set scanned_by=auth.uid(),scanned_at=tm where transfer_id=tid and barcode=code and scanned_at is null;$before$,
   $after$update md_supply.items set scanned_by=auth.uid(),scanned_at=tm where transfer_id=tid and barcode=code and scanned_at is null;
    if not found and t.invoice_no is null then raise exception 'Barcode sudah dipindai pada penerimaan ini';end if;$after$)
 ) as rules(previous,replacement) loop
  if strpos(definition,rule.replacement)>0 then continue;end if;
  if cardinality(string_to_array(definition,rule.previous))<>2 then raise exception 'Definisi penerimaan tidak sesuai untuk patch 136';end if;
  definition:=replace(definition,rule.previous,rule.replacement);
 end loop;
 execute definition;
end $migration$;
commit;

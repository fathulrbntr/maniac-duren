-- 133. Only Back Office can dispatch inventory between locations.
-- Preserve the existing RPC, its grants, location checks and retry handling.
begin;
do $migration$
declare
  fn regprocedure := 'public.pos_warehouse_mutate(text,jsonb)'::regprocedure;
  -- Existing installations may have stored the function from a Windows SQL file.
  crlf text := chr(13) || chr(10);
  definition text := replace(pg_get_functiondef(fn),crlf,chr(10));
  rule record;
begin
  for rule in select * from (values
    ($old$if action='transfer_dispatch' then
  perform md_supply.require_location((payload->>'storeId')::uuid,'stock');$old$,
     $new$if action='transfer_dispatch' then
  perform public.pos_require('backoffice');
  perform md_supply.require_location((payload->>'storeId')::uuid,'stock');$new$),
    ($old$perform md_supply.require_location(coalesce(o.source_id,(payload->>'storeId')::uuid),'dispatch','warehouse');$old$,
     $new$if action='outbound_dispatch' and o.kind='transfer' then
    perform public.pos_require('backoffice');
  end if;
  perform md_supply.require_location(coalesce(o.source_id,(payload->>'storeId')::uuid),'dispatch','warehouse');$new$)
  ) as rules(previous, replacement) loop
    rule.previous := replace(rule.previous,crlf,chr(10));
    rule.replacement := replace(rule.replacement,crlf,chr(10));
    if strpos(definition,rule.replacement)>0 then continue; end if;
    if cardinality(string_to_array(definition,rule.previous))<>2 then
      raise exception 'Definisi % tidak sesuai patch 132',fn;
    end if;
    definition := replace(definition,rule.previous,rule.replacement);
  end loop;
  execute definition;
end $migration$;
notify pgrst,'reload schema';
commit;

-- Cancel an unposted supplier note. Originals and posted cash movements are retained.
begin;
set local lock_timeout='10s';
select pg_catalog.pg_advisory_xact_lock(71031,1102);
alter table md_supply.receipt_plans
  add column if not exists cancel_event_id uuid references md_supply.events(id),
  add column if not exists cancelled_draft jsonb;
create unique index if not exists receipt_plans_active_invoice
  on md_supply.receipt_plans(supplier_id,invoice_no) where cancel_event_id is null;
alter table md_supply.receipt_plans drop constraint if exists receipt_plans_supplier_id_invoice_no_key;

create or replace function md_supply.cancel_supplier_note(payload jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare
  pid uuid := (payload->>'planId')::uuid;
  eid uuid := (payload->>'id')::uuid;
  p md_supply.receipt_plans%rowtype;
  r md_supply.receipt_sessions%rowtype;
  previous md_supply.events%rowtype;
  reason text := btrim(coalesce(payload->>'reason',''));
begin
  -- The dispatching RPC already holds the workflow lock and checks the active employee.
  perform public.pos_require('backoffice');
  if pid is null or eid is null then raise exception 'ID operasi dan nota wajib'; end if;
  select * into strict p from md_supply.receipt_plans where id=pid for update;
  perform md_supply.require_location(p.warehouse_id,'stock');
  select * into previous from md_supply.events where id=eid;
  if found then
    if previous.actor<>auth.uid() or previous.action<>'supplier_note_cancel' or previous.request is distinct from payload then
      raise exception 'ID operasi telah dipakai untuk data berbeda';
    end if;
    return public.pos_read();
  end if;
  if p.cancel_event_id is not null then raise exception 'Nota sudah dibatalkan'; end if;
  select * into strict r from md_supply.receipt_sessions where plan_id=pid for update;
  if p.received_id is not null or r.status not in ('open','paused') then
    raise exception 'Stok sudah dibukukan. Nota tidak dapat dibatalkan';
  end if;
  if exists(select from md_supply.note_payments where plan_id=pid and void_event_id is null) then
    raise exception 'Masih ada pembayaran nota atau ongkir yang aktif';
  end if;
  if not p.invoice_tracked or (p.shipping>0 and not p.shipping_tracked) then
    raise exception 'Pastikan dulu status pembayaran nota dan ongkir';
  end if;
  if (payload->>'expectedRevision')::int is distinct from p.revision or
     (payload->>'expectedSessionRevision')::int is distinct from r.revision then
    raise exception 'Nota atau penerimaan berubah. Perbarui dan periksa kembali';
  end if;
  if length(reason) not between 5 and 500 then raise exception 'Isi alasan pembatalan 5–500 karakter'; end if;
  insert into md_supply.events(id,action,actor,request) values(eid,'supplier_note_cancel',auth.uid(),payload);
  update md_supply.receipt_plans set cancel_event_id=eid, cancelled_draft=md_supply.receipt_json(pid),
    revision=revision+1 where id=pid;
  -- Draft scans reserve unique label codes. The snapshot above preserves the evidence.
  delete from md_supply.receipt_scans where plan_id=pid;
  update md_supply.receipt_sessions set revision=revision+1,updated_at=now() where plan_id=pid;
  return public.pos_read();
end $$;

create or replace function md_supply.split_cancelled_notes(s jsonb,bo boolean) returns jsonb
language sql stable set search_path='' as $$
  select s || jsonb_build_object('supplierNoteCancelVersion',134,
    'receiptPlans',coalesce(jsonb_agg(x order by n) filter(where p.cancel_event_id is null),'[]'::jsonb),
    'cancelledReceiptPlans',coalesce(jsonb_agg(x || jsonb_build_object(
      'cancelled',jsonb_build_object('at',ev.at,'actor',emp.name,'reason',ev.request->>'reason'),
      'receiving',p.cancelled_draft) order by ev.at desc,p.id)
      filter(where bo and p.cancel_event_id is not null),'[]'::jsonb))
  from jsonb_array_elements(s->'receiptPlans') with ordinality a(x,n)
  join md_supply.receipt_plans p on p.id=(x->>'id')::uuid
  left join md_supply.events ev on ev.id=p.cancel_event_id
  left join public.md_pos_employees emp on emp.user_id=ev.actor
$$;
revoke all on function md_supply.cancel_supplier_note(jsonb),md_supply.split_cancelled_notes(jsonb,boolean) from public,anon,authenticated;

-- Extend the existing restricted RPCs after their permission and retry checks.
do $migration$
declare
  rule record;
  definition text;
begin
  for rule in select * from (values
    ('public.pos_warehouse_mutate(text,jsonb)'::regprocedure,
     $a$is_bo:=public.pos_allowed('backoffice');$a$,
     $b$is_bo:=public.pos_allowed('backoffice');
 if action='supplier_note_cancel' then return md_supply.cancel_supplier_note(payload); end if;$b$),
    ('public.pos_warehouse_mutate(text,jsonb)'::regprocedure,
     $a$if (payload->>'expectedSessionRevision')::int is distinct from r.revision$a$,
     $b$if p.cancel_event_id is not null then raise exception 'Nota sudah dibatalkan'; end if;
  if (payload->>'expectedSessionRevision')::int is distinct from r.revision$b$),
    ('public.pos_warehouse_mutate_before_114(text,jsonb)'::regprocedure,
     $a$if (payload->>'expectedRevision')::integer is distinct from p.revision$a$,
     $b$if p.cancel_event_id is not null then raise exception 'Nota sudah dibatalkan'; end if;
 if (payload->>'expectedRevision')::integer is distinct from p.revision$b$),
    ('public.pos_read()'::regprocedure,
     $a$ if not bo then$a$,
     $b$ s:=md_supply.split_cancelled_notes(s,bo);
 if not bo then$b$)
  ) as rules(fn,needle,replacement) loop
    definition:=replace(pg_get_functiondef(rule.fn),chr(13)||chr(10),chr(10));
    if strpos(definition,rule.replacement)>0 then continue; end if;
    if cardinality(string_to_array(definition,rule.needle))<>2 then
      raise exception 'Definisi % tidak sesuai patch 133',rule.fn;
    end if;
    execute replace(definition,rule.needle,rule.replacement);
  end loop;
end $migration$;
notify pgrst,'reload schema';
commit;

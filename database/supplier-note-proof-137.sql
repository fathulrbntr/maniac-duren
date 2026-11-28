-- 137: branch supplier notes, photo evidence and server-issued numbers.
begin;

create sequence if not exists md_supply.supplier_note_number;
create table if not exists md_supply.supplier_note_proofs (
  plan_id uuid primary key references md_supply.receipt_plans(id) on delete cascade
    deferrable initially deferred,
  photo text not null
);
alter table md_supply.supplier_note_proofs enable row level security;
revoke all on md_supply.supplier_note_number, md_supply.supplier_note_proofs from public,anon,authenticated;

-- Called under the warehouse transaction lock. The deferred FK lets the existing
-- mutation insert the plan and its receiving session in the same transaction.
create or replace function md_supply.prepare_supplier_note(payload jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare
  pid uuid := (payload->>'id')::uuid;
  photo text := payload->>'noteProof';
  raw bytea;
  mime text;
  serial text;
  invoice text;
begin
  perform md_supply.require_location((payload->>'storeId')::uuid,'stock');
  if payload ? 'noteProofHash' then raise exception 'Isian nota tidak dikenal'; end if;
  if payload ? 'invoiceNo' then
    if payload ? 'noteProof' then raise exception 'Nomor nota dengan foto dibuat otomatis'; end if;
    -- Previously submitted manual numbers, including retries, remain valid.
    if btrim(payload->>'invoiceNo') ~ '^NS-[0-9]{6}-[0-9]{6,}$'
       and not exists(select 1 from md_supply.receipt_plans where id=pid) then
      raise exception 'Nomor NS dibuat otomatis. Muat ulang POS';
    end if;
    return payload;
  end if;
  if photo is not null then
    if length(photo)>955760 or photo !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$' then
      raise exception 'Bukti foto nota harus JPG, PNG, atau WebP hingga 700 KB setelah kompresi';
    end if;
    raw := decode(split_part(photo,',',2),'base64');
    mime := split_part(photo,';',1);
    if octet_length(raw) not between 12 and 716800 or not (
      (mime='data:image/png' and substring(raw from 1 for 8)=decode('89504e470d0a1a0a','hex')) or
      (mime='data:image/jpeg' and substring(raw from 1 for 3)=decode('ffd8ff','hex')) or
      (mime='data:image/webp' and substring(raw from 1 for 4)=decode('52494646','hex') and substring(raw from 9 for 4)=decode('57454250','hex'))
    ) then raise exception 'Isi bukti foto nota tidak sesuai format gambar'; end if;
  end if;

  select invoice_no into invoice from md_supply.receipt_plans where id=pid;
  if not found then
    loop
      serial := nextval('md_supply.supplier_note_number')::text;
      invoice := 'NS-' || to_char(now() at time zone 'Asia/Jakarta','YYYYMM') || '-' ||
                 lpad(serial,greatest(6,length(serial)),'0');
      exit when not exists(select 1 from md_supply.receipt_plans where invoice_no=invoice);
    end loop;
  end if;
  if photo is not null then
    insert into md_supply.supplier_note_proofs(plan_id,photo) values(pid,photo)
      on conflict(plan_id) do nothing;
  end if;
  -- The existing event comparison rejects changes on retry without copying
  -- image bytes into the audit log or the POS state.
  return (payload - 'noteProof') || jsonb_build_object('invoiceNo',invoice,
    'noteProofHash',encode(sha256(raw),'hex'));
end $$;
revoke all on function md_supply.prepare_supplier_note(jsonb) from public,anon,authenticated;

do $migration$
declare
  handler regprocedure := 'public.pos_warehouse_mutate(text,jsonb)'::regprocedure;
  definition text := pg_get_functiondef(handler);
  needle text := $a$perform public.pos_require('backoffice');values_expected:=md_supply.expected_values(payload->'lines');$a$;
  replacement text := $b$perform public.pos_require('backoffice');
  payload:=md_supply.prepare_supplier_note(payload);
  values_expected:=md_supply.expected_values(payload->'lines');$b$;
begin
  if strpos(definition,replacement)>0 then return; end if;
  if cardinality(string_to_array(definition,needle))<>2 then raise exception 'Definisi nota supplier tidak sesuai patch 136'; end if;
  execute replace(definition,needle,replacement);
end $migration$;

create or replace function md_supply.split_cancelled_notes(s jsonb,bo boolean) returns jsonb
language sql stable set search_path='' as $$
  select s || jsonb_build_object('supplierNoteCancelVersion',134,'supplierNoteProofVersion',137,
    'receiptPlans',coalesce(jsonb_agg(x || jsonb_build_object('hasProof',doc.plan_id is not null) order by n)
      filter(where p.cancel_event_id is null),'[]'::jsonb),
    'cancelledReceiptPlans',coalesce(jsonb_agg(x || jsonb_build_object('hasProof',doc.plan_id is not null,
      'cancelled',jsonb_build_object('at',ev.at,'actor',emp.name,'reason',ev.request->>'reason'),
      'receiving',p.cancelled_draft) order by ev.at desc,p.id)
      filter(where bo and p.cancel_event_id is not null),'[]'::jsonb))
  from jsonb_array_elements(s->'receiptPlans') with ordinality a(x,n)
  join md_supply.receipt_plans p on p.id=(x->>'id')::uuid
  left join md_supply.supplier_note_proofs doc on bo and doc.plan_id=p.id
  left join md_supply.events ev on ev.id=p.cancel_event_id
  left join public.md_pos_employees emp on emp.user_id=ev.actor
$$;

create or replace function public.pos_supplier_note_proof(plan_id uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare
  st uuid;
begin
  if auth.uid() is null then raise exception 'Login diperlukan'; end if;
  perform public.pos_require('backoffice');
  select warehouse_id into st from md_supply.receipt_plans where id=$1;
  perform md_supply.require_location(st,'stock');
  return (select photo from md_supply.supplier_note_proofs d where d.plan_id=$1);
end $$;
revoke all on function public.pos_supplier_note_proof(uuid) from public,anon,authenticated;
grant execute on function public.pos_supplier_note_proof(uuid) to authenticated;
notify pgrst,'reload schema';
commit;

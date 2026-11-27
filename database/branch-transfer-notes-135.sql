-- Apply after 134. An estimate has no stock effect. Actual quantities are held until dispatch.
begin;
set local lock_timeout='10s';
select pg_catalog.pg_advisory_xact_lock(71031,1102);

create table if not exists md_supply.branch_notes (
 id uuid primary key, number text not null unique, source_id uuid not null references public.md_pos_stores,
 target_id uuid not null references public.md_pos_stores, sender_id uuid not null references public.md_pos_employees,
 sender_name text not null, note text not null, requested jsonb not null,
 items jsonb not null default '[]', lines jsonb not null default '[]',
 status text not null default 'packing' check(status in ('packing','ready','approved','dispatched','cancelled')),
 revision integer not null default 0, delivery_no text unique, issued_at timestamptz,
 transfer_id uuid unique references md_supply.transfers, created_at timestamptz not null default now(),
 check(source_id<>target_id)
);
alter table md_supply.branch_notes enable row level security;
revoke all on md_supply.branch_notes from public,anon,authenticated;
create index if not exists branch_note_source on md_supply.branch_notes(source_id,created_at desc);
create index if not exists branch_note_fruit_hold on md_supply.branch_notes using gin(items jsonb_path_ops)
 where status in ('packing','ready','approved');
create index if not exists branch_note_unit_hold on md_supply.branch_notes using gin(lines jsonb_path_ops)
 where status in ('packing','ready','approved');

create or replace function md_supply.branch_holds_barcode(code text, except_note uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select from md_supply.branch_notes n where n.status in ('packing','ready','approved')
 and n.id is distinct from except_note and n.items @> jsonb_build_array(jsonb_build_object('barcode',code)))
$$;
create or replace function md_supply.branch_held_qty(lot uuid, except_note uuid) returns numeric
language sql stable set search_path='' as $$
 select coalesce(sum((ln->>'qty')::numeric),0) from md_supply.branch_notes n
 cross join lateral jsonb_array_elements(n.lines) ln where n.status in ('packing','ready','approved')
 and n.id is distinct from except_note and n.lines @> jsonb_build_array(jsonb_build_object('kind','unit','sourceLotId',lot))
 and ln->>'kind'='unit' and ln->>'sourceLotId'=lot::text
$$;

create or replace function md_supply.branch_note_state() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('branchNoteVersion',135,'branchNotes',coalesce(jsonb_agg(jsonb_build_object(
 'id',n.id,'number',n.number,'sourceId',n.source_id,'targetId',n.target_id,'carrier',n.sender_name,'note',n.note,
 'requested',n.requested,'items',n.items,'lines',n.lines,'status',n.status,'revision',n.revision,
 'deliveryNo',n.delivery_no,'issuedAt',n.issued_at,'transferId',n.transfer_id,'transferStatus',t.status,
 'origin',jsonb_build_object('name',src.name,'address',to_jsonb(src)->>'address','phone',to_jsonb(src)->>'phone'),
 'destination',jsonb_build_object('name',dst.name,'address',to_jsonb(dst)->>'address','phone',to_jsonb(dst)->>'phone'))
 order by n.created_at desc,n.id),'[]'))
 from md_supply.branch_notes n join public.md_pos_stores src on src.id=n.source_id
 join public.md_pos_stores dst on dst.id=n.target_id left join md_supply.transfers t on t.id=n.transfer_id
 where public.pos_allowed('backoffice') or public.pos_allowed('stock',n.source_id)
$$;

-- Build the manifest under row locks. The client supplies only labels and counted quantities.
create or replace function md_supply.pack_branch_note(n md_supply.branch_notes,p jsonb,submit boolean) returns void
language plpgsql set search_path='' as $$
<<manifest>>
declare items jsonb; lines jsonb; row jsonb; lot public.md_pos_unit_lots%rowtype;
 left_qty numeric; take_qty numeric; unit_name text;
begin
 if jsonb_typeof(p->'barcodes') is distinct from 'array' or jsonb_typeof(p->'quantities') is distinct from 'array'
 or jsonb_array_length(p->'barcodes')>5000 or jsonb_array_length(p->'quantities')>50 then raise exception 'Daftar penyiapan tidak valid';end if;
 perform 1 from public.md_pos_fruit_units u where u.barcode in (select jsonb_array_elements_text(p->'barcodes')) order by u.barcode for update;
 select coalesce(jsonb_agg(jsonb_build_object('barcode',u.barcode,'grams',u.grams,'productId',u.product_id,'sourceLotId',u.lot_id) order by u.barcode),'[]')
 into items from public.md_pos_fruit_units u join public.md_pos_lots l on l.id=u.lot_id
 where u.barcode in (select jsonb_array_elements_text(p->'barcodes')) and u.status='available'
 and u.store_id=n.source_id and l.store_id=n.source_id and l.quality='ready' and l.unit_cost is not null
 and n.requested @> jsonb_build_array(jsonb_build_object('productId',u.product_id,'unit','kg_butir'))
 and not md_supply.branch_holds_barcode(u.barcode,n.id)
 and not exists(select from md_supply.outbound_items i where i.barcode=u.barcode and not i.released)
 and not exists(select from md_supply.receipt_line_ids li join md_supply.receipt_sessions rs on rs.plan_id=li.plan_id
 where li.lot_id=u.receipt_lot_id and rs.status<>'completed');
 if jsonb_array_length(items)<>jsonb_array_length(p->'barcodes') then
  raise exception 'Barcode ganda, berbeda SKU, atau tidak tersedia di toko asal';end if;
 select coalesce(jsonb_agg(jsonb_build_object('kind','fruit','sourceLotId',l.id,'productId',l.product_id,'productName',pr.name,
 'supplierName',s.name,'kg',a.kg,'pieces',a.pieces) order by l.id),'[]') into lines
 from (select (i->>'sourceLotId')::uuid lot_id,sum((i->>'grams')::numeric)/1000 kg,count(*) pieces
 from jsonb_array_elements(items) i group by 1) a join public.md_pos_lots l on l.id=a.lot_id
 join public.md_pos_products pr on pr.id=l.product_id left join public.md_pos_suppliers s on s.id=l.supplier_id;
 if (select count(distinct x->>'productId') from jsonb_array_elements(p->'quantities') x)<>jsonb_array_length(p->'quantities')
 then raise exception 'SKU satuan terduplikasi';end if;
 for row in select value from jsonb_array_elements(p->'quantities') order by value->>'productId' loop
  select r->>'unit' into unit_name from jsonb_array_elements(n.requested) r where r->>'productId'=row->>'productId';
  if unit_name is null or unit_name='kg_butir' then raise exception 'Barang satuan tidak sesuai nota';end if;
  left_qty:=public.pos_unit_qty(row->>'qty',unit_name);
  for lot in select b.* from public.md_pos_unit_lots b where b.store_id=n.source_id and b.product_id=(row->>'productId')::uuid
   and b.unit=unit_name and b.qty>0 and b.unit_cost is not null and (b.expiry is null or b.expiry>=(now() at time zone 'Asia/Jakarta')::date)
   and not exists(select from md_supply.receipt_sessions rs where rs.plan_id=b.receipt_plan_id and rs.status<>'completed')
   order by b.received_date,b.id for update loop
   take_qty:=least(left_qty,lot.qty-md_supply.reserved_unit_qty(lot.id,n.id));
   if take_qty<=0 then continue;end if;
   lines:=lines||jsonb_build_array(jsonb_build_object('kind','unit','sourceLotId',lot.id,'productId',lot.product_id,
    'productName',(select name from public.md_pos_products where id=lot.product_id),
    'supplierName',(select name from public.md_pos_suppliers where id=lot.supplier_id),'qty',take_qty,'unit',lot.unit));
   left_qty:=left_qty-take_qty;
   exit when left_qty=0;
  end loop;
  if left_qty>0 then raise exception 'Jumlah aktual melebihi stok tersedia di toko asal';end if;
 end loop;
 if submit and jsonb_array_length(lines)=0 then raise exception 'Siapkan setidaknya satu barang sebelum mengajukan';end if;
 if jsonb_array_length(items)+(select count(*) from jsonb_array_elements(lines) l where l->>'kind'='unit')>5000 then raise exception 'Maksimal 5000 barang per kiriman';end if;
 update md_supply.branch_notes set items=manifest.items,lines=manifest.lines,status=case when submit then 'ready' else 'packing' end where id=n.id;
end$$;

create or replace function md_supply.mutate_branch_note(act text,p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare eid uuid:=(p->>'id')::uuid; n md_supply.branch_notes%rowtype; ev md_supply.events%rowtype;
 src uuid; dst uuid; sender public.md_pos_employees%rowtype; req jsonb; doc uuid; manifest jsonb;
begin
 if eid is null then raise exception 'ID operasi wajib';end if;
 if act='branch_note_create' then
  perform public.pos_require('backoffice');
 else
  select * into n from md_supply.branch_notes where id=(p->>'noteId')::uuid for update;
  if n.id is null then raise exception 'Nota transfer tidak ditemukan';end if;
  if act in ('branch_note_pack','branch_note_draft','branch_note_ship') then perform md_supply.require_location(n.source_id,'stock');
  else perform public.pos_require('backoffice');end if;
 end if;
 select * into ev from md_supply.events where id=eid;
 if found then
  if ev.actor<>auth.uid() or ev.action<>act or ev.request<>p then raise exception 'ID operasi sudah digunakan';end if;
  return public.pos_read();
 end if;
 if act<>'branch_note_create' and (p->>'revision')::int is distinct from n.revision then raise exception 'Nota berubah. Perbarui halaman transfer';end if;
 if act='branch_note_create' then
  src:=(p->>'storeId')::uuid;dst:=(p->>'toStoreId')::uuid;
  perform md_supply.require_location(src,'stock','store');
  if src=dst or not exists(select from public.md_pos_stores where id=dst and location_type='store') then raise exception 'Pilih toko tujuan yang berbeda';end if;
  select * into sender from public.md_pos_employees where id=(p->>'senderEmployeeId')::uuid and active;
  if sender.id is null then raise exception 'Pilih karyawan pengirim aktif';end if;
  if jsonb_typeof(p->'lines') is distinct from 'array' or jsonb_array_length(p->'lines') not between 1 and 50 then raise exception 'Isi 1–50 SKU untuk nota transfer';end if;
  select jsonb_agg(jsonb_build_object('productId',pr.id,'name',pr.name,'unit',pr.stock_unit,'qty',public.pos_unit_qty(x->>'qty',pr.stock_unit)) order by ord) into req
  from jsonb_array_elements(p->'lines') with ordinality a(x,ord) join public.md_pos_products pr on pr.id=(x->>'productId')::uuid
  where pr.item_type<>'recipe';
  if coalesce(jsonb_array_length(req),0)<>jsonb_array_length(p->'lines') or
   jsonb_array_length(req)<>(select count(distinct x->>'productId') from jsonb_array_elements(req) x) then raise exception 'SKU tidak valid atau terduplikasi';end if;
  insert into md_supply.branch_notes(id,number,source_id,target_id,sender_id,sender_name,note,requested)
   values(eid,'NT-'||nextval('md_supply.document_number'),src,dst,sender.id,sender.name,left(coalesce(p->>'note',''),500),req);
 elsif act in ('branch_note_pack','branch_note_draft') and n.status='packing' then
  perform md_supply.pack_branch_note(n,p,act='branch_note_pack');
 elsif act='branch_note_return' and n.status='ready' then
  update md_supply.branch_notes set status='packing' where id=n.id;
 elsif act='branch_note_cancel' and n.status in ('packing','ready','approved') then
  update md_supply.branch_notes set status='cancelled' where id=n.id;
 elsif act='branch_note_approve' and n.status='ready' then
  if exists(select from jsonb_array_elements(n.lines) x join public.md_pos_unit_lots b on b.id=(x->>'sourceLotId')::uuid where x->>'kind'='unit' and b.expiry<(now() at time zone 'Asia/Jakarta')::date) then raise exception 'Batch kedaluwarsa. Kembalikan untuk disiapkan ulang';end if;
  update md_supply.branch_notes set status='approved',issued_at=now(),
   delivery_no='SJ-CBG-'||to_char(now() at time zone 'Asia/Jakarta','YYYYMM')||'-'||lpad(nextval('md_supply.document_number')::text,6,'0') where id=n.id;
 elsif act='branch_note_ship' and n.status='approved' then
  -- Unlock only this note's holds inside the same transaction as stock posting.
  update md_supply.branch_notes set status='dispatched' where id=n.id;
  doc:=gen_random_uuid();
  manifest:=jsonb_build_object('id',doc,'storeId',n.source_id,'toStoreId',n.target_id,'senderEmployeeId',n.sender_id,
   'carrier',n.sender_name,'note',n.note,'barcodes',coalesce((select jsonb_agg(i->'barcode') from jsonb_array_elements(n.items) i),'[]'),
   'units',coalesce((select jsonb_agg(jsonb_build_object('lotId',l->'sourceLotId','qty',l->'qty')) from jsonb_array_elements(n.lines) l where l->>'kind'='unit'),'[]'));
  perform public.pos_warehouse_mutate_before_112('transfer_dispatch',manifest);
  update md_supply.transfers set delivery_no=n.delivery_no where id=doc;
  update md_supply.branch_notes set transfer_id=doc where id=n.id;
 else raise exception 'Tindakan tidak sesuai status nota transfer';end if;
 if act<>'branch_note_create' then update md_supply.branch_notes set revision=revision+1 where id=n.id;end if;
 insert into md_supply.events(id,action,actor,request,transfer_id) values(eid,act,auth.uid(),p,doc);
 return public.pos_read();
end$$;
revoke all on function md_supply.branch_holds_barcode(text,uuid),md_supply.branch_held_qty(uuid,uuid),
 md_supply.branch_note_state(),md_supply.pack_branch_note(md_supply.branch_notes,jsonb,boolean),md_supply.mutate_branch_note(text,jsonb)
 from public,anon,authenticated;

-- Extend the existing reservation guards, RPC authorization and read projection in place.
do $migration$
declare rule record; def text;
begin
 for rule in select * from (values
 ('public.pos_read()'::regprocedure,$a$s:=md_supply.split_cancelled_notes(s,bo);$a$,
  $b$s:=md_supply.split_cancelled_notes(s,bo) || md_supply.branch_note_state();$b$),
 ('public.pos_warehouse_mutate(text,jsonb)'::regprocedure,$a$is_bo:=public.pos_allowed('backoffice');$a$,
  $b$is_bo:=public.pos_allowed('backoffice');
 if action in ('branch_note_create','branch_note_pack','branch_note_draft','branch_note_return','branch_note_approve','branch_note_ship','branch_note_cancel') then return md_supply.mutate_branch_note(action,payload);end if;
 if action='transfer_dispatch' and not exists(select from md_supply.events e where e.id=(payload->>'id')::uuid and e.actor=auth.uid() and e.action=action and e.request=payload) then raise exception 'Gunakan nota transfer yang sudah disetujui Back Office';end if;
 if action='outbound_scan' and md_supply.branch_holds_barcode(payload->>'barcode',null) then raise exception 'Barcode sedang disiapkan untuk nota transfer';end if;
 if action='receipt_reopen' and exists(select from md_supply.receipt_line_ids li join public.md_pos_fruit_units u on u.receipt_lot_id=li.lot_id where li.plan_id=(payload->>'planId')::uuid and md_supply.branch_holds_barcode(u.barcode,null)) then raise exception 'Buah telah disiapkan untuk nota transfer';end if;$b$),
 ('md_supply.reserved_unit_qty(uuid,uuid)'::regprocedure,$a$select coalesce(sum((r->>'qty')::numeric),0)$a$,
  $b$select md_supply.branch_held_qty(lot,except_doc)+coalesce(sum((r->>'qty')::numeric),0)$b$),
 ('md_supply.guard_fruit()'::regprocedure,$a$select i.order_id into oid$a$,
  $b$if md_supply.branch_holds_barcode(old.barcode,null) then raise exception 'Barcode sedang disiapkan untuk nota transfer';end if;
 select i.order_id into oid$b$)
 ) rules(fn,needle,replacement) loop
  def:=replace(pg_get_functiondef(rule.fn),chr(13)||chr(10),chr(10));
  if strpos(def,rule.replacement)>0 then continue;end if;
  if cardinality(string_to_array(def,rule.needle))<>2 then raise exception 'Definisi % tidak sesuai patch 134',rule.fn;end if;
  execute replace(def,rule.needle,rule.replacement);
 end loop;
end$migration$;
notify pgrst,'reload schema';
commit;

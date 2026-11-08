-- Fruit transfer/reject: explicit linking of labels to existing stock, never a receipt.
-- Identity, batch balance and movement commit in one transaction.
begin;
do $$begin
 if to_regprocedure('public.pos_tracking_mutate(text,text,jsonb)') is null then raise exception 'Pasang tracking buah 101 terlebih dahulu';end if;
 if to_regprocedure('public.pos_tracking_mutate_before_105(text,text,jsonb)') is null then
  alter function public.pos_tracking_mutate(text,text,jsonb) rename to pos_tracking_mutate_before_105;
 end if;
 if to_regprocedure('public.pos_read_before_105()') is null then alter function public.pos_read() rename to pos_read_before_105;end if;
end$$;

create or replace function public.pos_tracking_mutate(entry text,act text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare lot public.md_pos_lots%rowtype;u public.md_pos_fruit_units%rowtype;code text;v jsonb;pid uuid;matches integer;
 root_id uuid;next_id uuid;visited uuid[]:='{}';link_id uuid:=gen_random_uuid();fresh jsonb;reserved_kg numeric;reserved_pieces integer;
 req public.md_pos_fruit_requests%rowtype;seen text[]:='{}';
begin
 if act not in ('movement','reject_mark','reject_process','reject_loss') or (coalesce(p->>'fruitStockMode','')<>'barcode' and not(p ? 'linkBarcodes')) then
  return public.pos_tracking_mutate_before_105(entry,act,p);
 end if;
 if auth.uid() is null then raise exception 'Login diperlukan';end if;
 -- Same ordering as existing sale/receipt/reject engine; also serializes first-time label claims.
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 select * into req from public.md_pos_fruit_requests where id=(p->>'id')::uuid;
 if found then return public.pos_tracking_mutate_before_105(entry,act,p);end if;
 select * into lot from public.md_pos_lots where id=coalesce(nullif(p->>'sourceLotId',''),nullif(p->>'lotId',''))::uuid for update;
 if not found then raise exception 'Batch buah tidak ditemukan';end if;
 perform public.pos_require(case when act='movement' then 'stock' else 'waste' end,lot.store_id);
 if (p->>'storeId')::uuid is distinct from lot.store_id then raise exception 'Outlet asal tidak cocok dengan batch';end if;
 if act='movement' and p->>'kind' is distinct from 'Transfer' then raise exception 'Gunakan Reject & Waste untuk pengolahan buah';end if;
 if jsonb_typeof(p->'barcodes') is distinct from 'array' or jsonb_array_length(p->'barcodes')=0 then raise exception 'Scan barcode setiap buah pada batch ini';end if;
 if jsonb_typeof(coalesce(p->'linkBarcodes','[]'::jsonb)) is distinct from 'array' then raise exception 'Daftar tautan barcode tidak valid';end if;
 if not (p ? 'id') or nullif(p->>'id','') is null then raise exception 'ID transaksi wajib';end if;
 if lot.quality not in ('ready','unripe','reject') then raise exception 'Status batch tidak sesuai';end if;
 -- Follow existing lot lineage (including transfers and reject lots) to the original supplier receipt.
 root_id:=lot.id;
 loop
  if root_id=any(visited) then raise exception 'Jejak batch membentuk siklus';end if;
  visited:=array_append(visited,root_id);
  select source_lot_id into next_id from public.md_pos_lots where id=root_id;
  exit when next_id is null;root_id:=next_id;
 end loop;
 for code in select jsonb_array_elements_text(coalesce(p->'linkBarcodes','[]'::jsonb)) order by 1 loop
  if not(p->'barcodes' @> jsonb_build_array(code)) or code=any(seen) then raise exception 'Daftar tautan barcode tidak cocok atau terduplikasi';end if;
  seen:=array_append(seen,code);v:=public.pos_tracking_parse(code);
  if v is null then raise exception 'Gunakan label tracking buah 26 digit';end if;
  select * into u from public.md_pos_fruit_units where identity_key=left(code,16) for update;
  if found then
   -- A stale client cannot reassign a label. The original validator checks status/outlet/lot below.
   if u.barcode<>code then raise exception 'Nomor label sudah tercatat dengan isi berbeda';end if;
   continue;
  end if;
  select count(*),(array_agg(id))[1] into matches,pid from public.md_pos_products where btrim(barcode)=v->>'itemCode' and stock_unit='kg_butir';
  if matches<>1 or pid<>lot.product_id then raise exception 'Kode barang pada label tidak sesuai produk batch';end if;
  insert into public.md_pos_fruit_units(barcode,product_id,receipt_lot_id,lot_id,store_id,grams,status,last_event)
  values(code,pid,root_id,lot.id,lot.store_id,(v->>'grams')::int,case when lot.quality='reject' then 'reject' else 'available' end,link_id)
  returning to_jsonb(md_pos_fruit_units.*) into fresh;
  insert into public.md_pos_fruit_events(event_id,barcode,action,actor,after_state) values(link_id,code,'label_link',auth.uid(),fresh);
 end loop;
 select coalesce(sum(grams),0)::numeric/1000,count(*) into reserved_kg,reserved_pieces from public.md_pos_fruit_units where lot_id=lot.id and status in ('available','reject');
 if reserved_kg>lot.kg or reserved_pieces>lot.pieces then raise exception 'Sisa stok yang belum tertaut label tidak cukup';end if;
 if (reserved_kg=lot.kg)<>(reserved_pieces=lot.pieces) then raise exception 'Berat label dan sisa butir yang belum tertaut tidak seimbang';end if;
 -- Always validate even if there are no registered units yet. Unknown labels need explicit linking.
 perform public.pos_tracking_selection(p->'barcodes',lot.id,lot.store_id,
  case when act='reject_mark' then array['available'] when act='reject_process' then array['reject'] else array['available','reject'] end,
  coalesce((p->>'kg')::numeric,(p->>'qty')::numeric),(p->>'pieces')::numeric);
 return public.pos_tracking_mutate_before_105(entry,act,p);
end$$;

create or replace function public.pos_read() returns jsonb language sql security definer set search_path='' as $$
 select public.pos_read_before_105()||jsonb_build_object('fruitStockVersion',105)
$$;
revoke all on function public.pos_tracking_mutate_before_105(text,text,jsonb),public.pos_read_before_105(),public.pos_tracking_mutate(text,text,jsonb) from public,anon,authenticated;
revoke all on function public.pos_read() from public,anon;
grant execute on function public.pos_read() to authenticated;
notify pgrst,'reload schema';
commit;

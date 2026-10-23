-- Patch 082: multi-product receipts and invoice numbers for the active 027-compatible UI.
-- Run after the current POS database and rollback-027-compat.sql. No data reset.
begin;
do $$begin
 if to_regprocedure('public.pos_mutate_027(text,jsonb)') is null or to_regprocedure('public.pos_mutate_v19(text,jsonb)') is null then
  raise exception 'Jalankan database/rollback-027-compat.sql setelah database POS 019 atau lebih baru';
 end if;
end$$;
create table if not exists public.md_pos_receipt_shipments (
 id uuid primary key,
 store_id uuid not null references public.md_pos_stores(id),
 payload jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.md_pos_receipt_shipments enable row level security;
revoke all on public.md_pos_receipt_shipments from public,anon,authenticated;
alter table public.md_pos_lots add column if not exists shipment_id uuid references public.md_pos_receipt_shipments(id);
alter table public.md_pos_lots add column if not exists invoice_no text;
do $$begin
 if to_regprocedure('public.pos_read_v82()') is null then alter function public.pos_read() rename to pos_read_v82;end if;
end$$;
revoke all on function public.pos_read_v82() from public,anon,authenticated;
create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;begin
 s:=public.pos_read_v82();
 -- Enrich only lots already visible to the caller; retain existing cost redaction.
 s:=jsonb_set(s,'{lots}',coalesce((select jsonb_agg(x||jsonb_build_object('shipmentId',l.shipment_id,'invoiceNo',l.invoice_no)) from jsonb_array_elements(s->'lots') x join public.md_pos_lots l on l.id=(x->>'id')::uuid),'[]'::jsonb));
 return s||jsonb_build_object('receiptShipmentVersion',82);
end$$;
create or replace function public.pos_receive_shipment(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare shipment uuid; outlet uuid; invoice text; lines jsonb; line jsonb; row jsonb; old jsonb; safe jsonb;
 shipping numeric; total_kg numeric:=0; kg numeric; pieces numeric; purchase numeric; total_purchase numeric:=0;
 share numeric; allocated numeric:=0; idx integer:=0; w numeric; c numeric;
begin
 if auth.uid() is null then raise exception 'Login diperlukan';end if;
 shipment:=(payload->>'id')::uuid;outlet:=(payload->>'storeId')::uuid;
 if shipment is null or outlet is null then raise exception 'ID kiriman dan store wajib';end if;
 perform public.pos_require('stock',outlet);
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 select s.payload into old from public.md_pos_receipt_shipments s where s.id=shipment;
 if found then
  if old is distinct from payload then raise exception 'Kiriman ini sudah disimpan dengan isi berbeda';end if;
  return public.pos_read();
 end if;
 invoice:=btrim(coalesce(payload->>'invoiceNo',''));
 if length(invoice) not between 1 and 100 then raise exception 'Nomor nota wajib diisi, maksimal 100 karakter';end if;
 if nullif(payload->>'date','') is null or (payload->>'date')::date>(now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal masuk tidak valid';end if;
 if payload->'unloadingComplete' is distinct from 'true'::jsonb then raise exception 'Konfirmasi penurunan barang selesai terlebih dahulu';end if;
 lines:=payload->'lines';
 if jsonb_typeof(lines) is distinct from 'array' then raise exception 'Daftar produk tidak valid';end if;
 if jsonb_array_length(lines) not between 1 and 50 then raise exception 'Isi 1–50 produk dalam kiriman';end if;
 if (select count(distinct x->>'productId') from jsonb_array_elements(lines) x)<>jsonb_array_length(lines) then raise exception 'Produk terduplikasi dalam kiriman';end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(lines) x)<>jsonb_array_length(lines) then raise exception 'ID produk kiriman terduplikasi';end if;
 shipping:=nullif(payload->>'shippingCost','')::numeric;
 if shipping is null or shipping<0 or shipping>9000000000000000 or shipping::text in ('NaN','Infinity','-Infinity') then raise exception 'Ongkir tidak valid';end if;
 for line in select value from jsonb_array_elements(lines) loop
  if jsonb_typeof(line->'weighings') is distinct from 'array' then raise exception 'Isi penimbangan setiap produk';end if;
  if jsonb_array_length(line->'weighings') not between 1 and 1000 then raise exception 'Isi 1–1.000 penimbangan per produk';end if;
  kg:=0;pieces:=0;
  for row in select value from jsonb_array_elements(line->'weighings') loop
   if jsonb_typeof(row->'kg') is distinct from 'number' or jsonb_typeof(row->'pieces') is distinct from 'number' then raise exception 'Berat dan butir timbang harus angka';end if;
   w:=(row->>'kg')::numeric;c:=(row->>'pieces')::numeric;
   if w<=0 or c<=0 or c<>trunc(c) then raise exception 'Berat harus positif dan butir harus bilangan bulat positif';end if;
   kg:=kg+w;pieces:=pieces+c;
  end loop;
  if kg>9000000000 or pieces>2147483647 then raise exception 'Jumlah terlalu besar';end if;
  purchase:=nullif(line->>'purchaseCost','')::numeric;
  if purchase is null or purchase<0 or purchase>9000000000000000 or purchase::text in ('NaN','Infinity','-Infinity') then raise exception 'Isi harga barang setiap produk';end if;
  if exists(select 1 from public.md_pos_lots l where l.id=(line->>'id')::uuid) then raise exception 'ID penerimaan sudah digunakan';end if;
  total_kg:=total_kg+kg;total_purchase:=total_purchase+purchase;
 end loop;
 if total_purchase+shipping>9000000000000000 then raise exception 'Total biaya terlalu besar';end if;
 insert into public.md_pos_receipt_shipments(id,store_id,payload) values(shipment,outlet,payload);
 for line in select value from jsonb_array_elements(lines) loop
  idx:=idx+1;kg:=0;pieces:=0;
  for row in select value from jsonb_array_elements(line->'weighings') loop
   kg:=kg+(row->>'kg')::numeric;pieces:=pieces+(row->>'pieces')::numeric;
  end loop;
  share:=case when idx=jsonb_array_length(lines) then shipping-allocated else shipping*kg/total_kg end;
  allocated:=allocated+share;purchase:=(line->>'purchaseCost')::numeric;
  safe:=jsonb_build_object('id',line->>'id','storeId',outlet,'supplierId',payload->>'supplierId','date',payload->>'date',
   'productId',line->>'productId','kg',kg::text,'pieces',pieces::text,'purchaseCost',purchase::text,
   'shippingCost',share::text,'totalCost',(purchase+share)::text,'weighings',line->'weighings',
   'unloadingComplete',true,'invoiceNo',invoice,'note',left(coalesce(payload->>'note',''),300));
  -- Reuse the active client's permission, product, weighing, journal and ready-stock rules.
  perform public.pos_mutate_027('receipt',safe);
  update public.md_pos_lots set shipment_id=shipment,invoice_no=invoice where id=(line->>'id')::uuid;
 end loop;
 return public.pos_read();
end$$;
revoke all on function public.pos_receive_shipment(jsonb),public.pos_read() from public,anon,authenticated;
grant execute on function public.pos_receive_shipment(jsonb),public.pos_read() to authenticated;
notify pgrst,'reload schema';
commit;

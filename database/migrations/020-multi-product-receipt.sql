-- 020: satu kiriman supplier, beberapa produk, satu ongkir berdasarkan berat.
begin;
create table if not exists public.md_pos_receipt_shipments (
 id uuid primary key,
 store_id uuid not null references public.md_pos_stores(id),
 payload jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.md_pos_receipt_shipments enable row level security;
revoke all on public.md_pos_receipt_shipments from public,anon,authenticated;
alter table public.md_pos_lots add column if not exists shipment_id uuid references public.md_pos_receipt_shipments(id);
do $$begin
 if to_regprocedure('public.pos_mutate_v19(text,jsonb)') is null then raise exception 'Jalankan migration 019 terlebih dahulu';end if;
 if to_regprocedure('public.pos_mutate_v20(text,jsonb)') is null then alter function public.pos_mutate(text,jsonb) rename to pos_mutate_v20;end if;
 if to_regprocedure('public.pos_read_v20()') is null then alter function public.pos_read() rename to pos_read_v20;end if;
end$$;
revoke all on function public.pos_mutate_v20(text,jsonb),public.pos_read_v20() from public,anon,authenticated;
create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;begin
 s:=public.pos_read_v20();
 s:=jsonb_set(s,'{lots}',coalesce((select jsonb_agg(x||jsonb_build_object('shipmentId',l.shipment_id)) from jsonb_array_elements(s->'lots') x join public.md_pos_lots l on l.id=(x->>'id')::uuid),'[]'::jsonb));
 return s||jsonb_build_object('multiReceiptVersion',20);
end$$;
create or replace function public.pos_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare shipment uuid; store uuid; lines jsonb; line jsonb; row jsonb; old jsonb; safe jsonb;
 shipping numeric; total_kg numeric:=0; kg numeric; pieces numeric; purchase numeric;
 share numeric; allocated numeric:=0; index integer:=0; result jsonb;
begin
 if action<>'receipt_batch' then return public.pos_mutate_v20(action,payload);end if;
 shipment:=(payload->>'id')::uuid;store:=(payload->>'storeId')::uuid;
 perform public.pos_require('stock',store);
 if shipment is null then raise exception 'ID kiriman wajib';end if;
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 select s.payload into old from public.md_pos_receipt_shipments s where s.id=shipment;
 if found then
  if old is distinct from payload then raise exception 'Kiriman ini sudah disimpan dengan isi berbeda';end if;
  return public.pos_read();
 end if;
 if payload->'unloadingComplete' is distinct from 'true'::jsonb then raise exception 'Konfirmasi penurunan barang selesai terlebih dahulu';end if;
 lines:=payload->'lines';
 if jsonb_typeof(lines) is distinct from 'array' then raise exception 'Daftar produk tidak valid';end if;
 if jsonb_array_length(lines) not between 1 and 50 then raise exception 'Isi 1–50 produk dalam kiriman';end if;
 if (select count(distinct x->>'productId') from jsonb_array_elements(lines) x)<>jsonb_array_length(lines) then raise exception 'Produk terduplikasi dalam kiriman';end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(lines) x)<>jsonb_array_length(lines) then raise exception 'ID produk kiriman terduplikasi';end if;
 shipping:=nullif(payload->>'shippingCost','')::numeric;
 if shipping is null or shipping<0 or shipping::text in ('NaN','Infinity','-Infinity') then raise exception 'Ongkir tidak valid';end if;
 for line in select value from jsonb_array_elements(lines) loop
  if jsonb_typeof(line->'weighings') is distinct from 'array' then raise exception 'Isi penimbangan setiap produk';end if;
  if jsonb_array_length(line->'weighings') not between 1 and 1000 then raise exception 'Isi 1–1.000 penimbangan per produk';end if;
  kg:=0;
  for row in select value from jsonb_array_elements(line->'weighings') loop
   kg:=kg+(row->>'kg')::numeric;
  end loop;
  if kg is null or kg<=0 or kg>9000000000 or kg::text in ('NaN','Infinity','-Infinity') then raise exception 'Berat produk tidak valid';end if;
  purchase:=nullif(line->>'purchaseCost','')::numeric;
  if purchase is null or purchase<0 or purchase::text in ('NaN','Infinity','-Infinity') then raise exception 'Isi harga barang setiap produk';end if;
  if exists(select 1 from public.md_pos_lots l where l.id=(line->>'id')::uuid) then raise exception 'ID penerimaan sudah digunakan';end if;
  total_kg:=total_kg+kg;
 end loop;
 insert into public.md_pos_receipt_shipments(id,store_id,payload) values(shipment,store,payload);
 for line in select value from jsonb_array_elements(lines) loop
  index:=index+1;kg:=0;pieces:=0;
  for row in select value from jsonb_array_elements(line->'weighings') loop
   kg:=kg+(row->>'kg')::numeric;pieces:=pieces+(row->>'pieces')::numeric;
  end loop;
  share:=case when index=jsonb_array_length(lines) then shipping-allocated else shipping*kg/total_kg end;
  allocated:=allocated+share;purchase:=(line->>'purchaseCost')::numeric;
  safe:=(payload-'lines')||jsonb_build_object('id',line->>'id','productId',line->>'productId','kg',kg::text,'pieces',pieces::text,'purchaseCost',purchase::text,'shippingCost',share::text,'totalCost',(purchase+share)::text,'weighings',line->'weighings');
  result:=public.pos_mutate_v20('receipt',safe);
  update public.md_pos_lots set shipment_id=shipment where id=(line->>'id')::uuid;
 end loop;
 return public.pos_read();
end$$;
revoke all on function public.pos_read(),public.pos_mutate(text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_read(),public.pos_mutate(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

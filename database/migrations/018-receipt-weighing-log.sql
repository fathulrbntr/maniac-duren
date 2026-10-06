-- 018: riwayat berat + butir per timbang; konfirmasi penurunan selesai.
-- Database aktif versi 017 atau 016: aman dijalankan ulang, tanpa reset stok.
begin;
alter table public.md_pos_lots add column if not exists weighings jsonb not null default '[]'::jsonb;
do $$begin
 if to_regprocedure('public.pos_mutate_v18(text,jsonb)') is null then alter function public.pos_mutate(text,jsonb) rename to pos_mutate_v18; end if;
 if to_regprocedure('public.pos_read_v18()') is null then alter function public.pos_read() rename to pos_read_v18; end if;
end$$;
revoke all on function public.pos_mutate_v18(text,jsonb),public.pos_read_v18() from public,anon,authenticated;
-- Referensi parameter berbasis nama fungsi harus tetap valid setelah fungsi di-rename.
do $$declare fn record;body text;begin
 for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pos_mutate%' loop
  body:=pg_get_functiondef(fn.oid);
  if position('pos_mutate.payload' in body)>0 then execute replace(body,'pos_mutate.payload','$2');end if;
 end loop;
end$$;

create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;begin
 s:=public.pos_read_v18();
 s:=jsonb_set(s,'{lots}',coalesce((select jsonb_agg(x||jsonb_build_object('weighings',l.weighings,'purchaseCost',case when public.pos_allowed('finance',l.store_id) then l.purchase_cost end,'shippingCost',case when public.pos_allowed('finance',l.store_id) then l.shipping_cost end,'totalCost',case when public.pos_allowed('finance',l.store_id) then l.total_cost end)) from jsonb_array_elements(s->'lots') x join public.md_pos_lots l on l.id=(x->>'id')::uuid),'[]'::jsonb));
 return s||jsonb_build_object('receiptWeighingVersion',18);
end$$;
create or replace function public.pos_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare safe jsonb:=payload; result jsonb; row jsonb; log jsonb:=payload->'weighings'; kg numeric:=0; pieces numeric:=0; w numeric; c numeric; existing boolean; purchase numeric; shipping numeric;
begin
 if action='receipt' then
  perform public.pos_require('stock',(payload->>'storeId')::uuid);
  if payload ? 'weighings' then
  if payload->'unloadingComplete' is distinct from 'true'::jsonb then raise exception 'Konfirmasi penurunan barang selesai terlebih dahulu';end if;
  if jsonb_typeof(log) is distinct from 'array' then raise exception 'Riwayat timbang harus berupa daftar';end if;
  if jsonb_array_length(log) not between 1 and 1000 then raise exception 'Isi 1–1.000 penimbangan';end if;
  for row in select value from jsonb_array_elements(log) loop
   if jsonb_typeof(row) is distinct from 'object' or jsonb_typeof(row->'kg') is distinct from 'number' or jsonb_typeof(row->'pieces') is distinct from 'number' then raise exception 'Berat dan butir timbang harus angka';end if;
   w:=(row->>'kg')::numeric;c:=(row->>'pieces')::numeric;
   if w<=0 or c<=0 or c<>trunc(c) then raise exception 'Berat harus positif dan butir harus bilangan bulat positif';end if;
   if row->>'id' is null or row->>'createdAt' is null then raise exception 'Identitas dan waktu timbang wajib';end if;
   perform (row->>'id')::uuid;perform (row->>'createdAt')::timestamptz;
   if row ? 'editedAt' then perform (row->>'editedAt')::timestamptz;end if;
   kg:=kg+w;pieces:=pieces+c;
  end loop;
  if (select count(distinct x->>'id') from jsonb_array_elements(log) x)<>jsonb_array_length(log) then raise exception 'ID timbang terduplikasi';end if;
  if kg>9000000000 or pieces>9000000000 then raise exception 'Jumlah terlalu besar';end if;
  if payload->>'kg' is null or payload->>'pieces' is null or abs(kg-(payload->>'kg')::numeric)>0.00000001 or pieces<>(payload->>'pieces')::numeric then raise exception 'Total tidak sesuai riwayat timbang';end if;
  else
   kg:=public.pos_sum_positive(payload->>'kg');pieces:=public.pos_sum_positive(payload->>'pieces');
   if pieces<>trunc(pieces) then raise exception 'Butir harus bilangan bulat';end if;
  end if;
  purchase:=coalesce(nullif(payload->>'purchaseCost','')::numeric,nullif(payload->>'totalCost','')::numeric);
  shipping:=coalesce(nullif(payload->>'shippingCost','')::numeric,0);
  if purchase is null or purchase<0 or shipping<0 then raise exception 'Isi harga pembelian dan ongkir yang valid';end if;
  safe:=payload||jsonb_build_object('kg',kg::text,'pieces',pieces::text,'purchaseCost',purchase::text,'shippingCost',shipping::text,'totalCost',(purchase+shipping)::text);
  perform pg_catalog.pg_advisory_xact_lock(71031,1102);
  select exists(select 1 from public.md_pos_lots where id=(payload->>'id')::uuid) into existing;
  result:=public.pos_mutate_v18(action,safe);
  if not existing then update public.md_pos_lots set weighings=coalesce(log,'[]'::jsonb),purchase_cost=purchase,shipping_cost=shipping,total_cost=purchase+shipping,unit_cost=(purchase+shipping)/received_kg where id=(payload->>'id')::uuid;end if;
  return public.pos_read();
 end if;
 return public.pos_mutate_v18(action,payload);
end$$;
revoke all on function public.pos_read(),public.pos_mutate(text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_read(),public.pos_mutate(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

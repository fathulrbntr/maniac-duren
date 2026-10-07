-- Migration 017: penerimaan durian dengan kalkulasi timbang parsial + harga/ongkir terpisah.
-- Aman untuk database yang sudah menjalankan versi 016. Tidak mereset transaksi lama.
begin;

alter table public.md_pos_lots add column if not exists purchase_cost numeric check(purchase_cost>=0);
alter table public.md_pos_lots add column if not exists shipping_cost numeric check(shipping_cost>=0);
alter table public.md_pos_lots add column if not exists total_cost numeric check(total_cost>=0);
update public.md_pos_lots
set total_cost=coalesce(total_cost,unit_cost*received_kg),
    purchase_cost=coalesce(purchase_cost,total_cost),
    shipping_cost=coalesce(shipping_cost,0)
where total_cost is null or purchase_cost is null or shipping_cost is null;

create or replace function public.pos_sum_positive(value text) returns numeric language plpgsql immutable set search_path='' as $$
declare part text; total numeric:=0; pieces integer:=0; n numeric; raw text:=btrim(coalesce(value,''));
begin
 if raw='' or raw !~ '^[[:space:]]*[0-9]+([.,][0-9]+)?([[:space:]]*\+\s*[0-9]+([.,][0-9]+)?)*[[:space:]]*$' then raise exception 'Format angka tidak valid. Gunakan contoh 12+5+8'; end if;
 for part in select regexp_split_to_table(raw,'\+') loop
  part:=replace(btrim(part),',','.');
  part:=replace(btrim(part),',','.');
  n:=part::numeric;
  if n<=0 then raise exception 'Jumlah harus lebih dari 0'; end if;
  pieces:=pieces+1;
  if pieces>100 then raise exception 'Maksimal 100 angka dalam satu perhitungan'; end if;
  total:=total+n;
  if total>9000000000 then raise exception 'Jumlah terlalu besar'; end if;
 end loop;
 return total;
end $$;
revoke all on function public.pos_sum_positive(text) from public,anon,authenticated;

-- Simpan fungsi lama sebagai v17, lalu normalisasi penerimaan sebelum diteruskan.
do $$begin
 if to_regprocedure('public.pos_mutate_v17(text,jsonb)') is null then alter function public.pos_mutate(text,jsonb) rename to pos_mutate_v17; end if;
 if to_regprocedure('public.pos_read_v17()') is null then alter function public.pos_read() rename to pos_read_v17; end if;
end$$;
revoke all on function public.pos_mutate_v17(text,jsonb),public.pos_read_v17() from public,anon,authenticated;

create or replace function public.pos_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare safe jsonb:=payload; result jsonb; v_purchase numeric; v_shipping numeric; v_total numeric; v_kg numeric; v_pieces numeric;
begin
 if action='receipt' then
  v_kg:=public.pos_sum_positive(payload->>'kg');
  v_pieces:=public.pos_sum_positive(payload->>'pieces');
  if v_pieces<>trunc(v_pieces) then raise exception 'Butir harus bilangan bulat'; end if;
  v_purchase:=coalesce(nullif(payload->>'purchaseCost','')::numeric,nullif(payload->>'totalCost','')::numeric);
  v_shipping:=coalesce(nullif(payload->>'shippingCost','')::numeric,0);
  if v_purchase is null or v_purchase<0 then raise exception 'Isi harga pembelian'; end if;
  if v_shipping<0 then raise exception 'Ongkir tidak boleh negatif'; end if;
  v_total:=v_purchase+v_shipping;
  safe:=payload||jsonb_build_object('kg',v_kg::text,'pieces',v_pieces::text,'purchaseCost',v_purchase::text,'shippingCost',v_shipping::text,'totalCost',v_total::text);
  result:=public.pos_mutate_v17(action,safe);
  update public.md_pos_lots
  set purchase_cost=v_purchase,shipping_cost=v_shipping,total_cost=v_total,unit_cost=v_total/received_kg
  where id=(payload->>'id')::uuid;
  return result;
 end if;
 return public.pos_mutate_v17(action,payload);
end$$;

create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;
begin
 s:=public.pos_read_v17();
 s:=jsonb_set(s,'{lots}',coalesce((select jsonb_agg(x||jsonb_build_object('purchaseCost',case when public.pos_allowed('finance',l.store_id) then l.purchase_cost end,'shippingCost',case when public.pos_allowed('finance',l.store_id) then l.shipping_cost end,'totalCost',case when public.pos_allowed('finance',l.store_id) then l.total_cost end)) from jsonb_array_elements(s->'lots') x join public.md_pos_lots l on l.id=(x->>'id')::uuid),'[]'));
 return s;
end$$;

revoke all on function public.pos_read(),public.pos_mutate(text,jsonb) from public,anon;
grant execute on function public.pos_read(),public.pos_mutate(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

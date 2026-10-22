-- 077: harga beli referensi per butir; aman diulang, tanpa reset.
begin;
set local lock_timeout='5s';
do $$begin
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 if to_regprocedure('public.pos_save_product_details(jsonb)') is null
    or to_regprocedure('public.pos_read()') is null
    or to_regprocedure('public.pos_allowed(text,uuid)') is null then
  raise exception 'Database POS dengan detail produk dan hak akses diperlukan';
 end if;
end$$;
alter table public.md_pos_products add column if not exists buy_price_piece numeric;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.md_pos_products'::regclass and conname='md_pos_buy_piece_valid_077') then
  alter table public.md_pos_products add constraint md_pos_buy_piece_valid_077
   check(buy_price_piece is null or (buy_price_piece>=0 and buy_price_piece<=1000000000000));
 end if;
 if to_regprocedure('public.pos_save_product_details_before_077(jsonb)') is null then
  alter function public.pos_save_product_details(jsonb) rename to pos_save_product_details_before_077;
 end if;
 if to_regprocedure('public.pos_read_before_product_cost_077()') is null then
  alter function public.pos_read() rename to pos_read_before_product_cost_077;
 end if;
end$$;
revoke all on function public.pos_save_product_details_before_077(jsonb),public.pos_read_before_product_cost_077() from public,anon,authenticated;

-- Invoker helper: existing authenticated mutation functions still own authorization,
-- locks, retries, product validation and the transaction boundary.
create or replace function public.pos_save_product_details(payload jsonb)
returns void language plpgsql set search_path='' as $$
declare n numeric;unit text;pid uuid:=(payload->>'id')::uuid;raw text;
begin
 perform public.pos_save_product_details_before_077(payload);
 select stock_unit into unit from public.md_pos_products where id=pid;
 if not found then raise exception 'Produk tidak ditemukan';end if;
 if payload ? 'buyPricePiece' then
  perform public.pos_require('finance');
  if jsonb_typeof(payload->'buyPricePiece') not in ('null','string','number') then
   raise exception 'Harga beli per butir harus berupa angka';
  end if;
  raw:=nullif(btrim(payload->>'buyPricePiece'),'');
  if raw is not null then
   n:=raw::numeric;
   if n<0 or n>1000000000000 or n::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Harga beli per butir harus 0–1 triliun';
   end if;
   if unit<>'kg_butir' then raise exception 'Harga beli per butir khusus barang kg + butir';end if;
  end if;
  update public.md_pos_products set buy_price_piece=n where id=pid;
 elsif unit<>'kg_butir' then
  update public.md_pos_products set buy_price_piece=null where id=pid;
 end if;
 -- Missing key from older clients preserves the stored dual-unit reference.
end$$;
revoke all on function public.pos_save_product_details(jsonb) from public,anon,authenticated;

create or replace function public.pos_read() returns jsonb
language plpgsql security definer set search_path='' as $$
declare s jsonb;
begin
 s:=public.pos_read_before_product_cost_077();
 if public.pos_allowed('finance') then
  s:=jsonb_set(s,'{products}',coalesce((
   select jsonb_agg(x.item||jsonb_build_object('buyPricePiece',p.buy_price_piece) order by x.n)
   from jsonb_array_elements(coalesce(s->'products','[]'::jsonb)) with ordinality x(item,n)
   join public.md_pos_products p on p.id=(x.item->>'id')::uuid
  ),'[]'::jsonb));
 else
  s:=jsonb_set(s,'{products}',coalesce((select jsonb_agg(x.item-'buyPricePiece' order by x.n)
   from jsonb_array_elements(coalesce(s->'products','[]'::jsonb)) with ordinality x(item,n)),'[]'::jsonb));
 end if;
 return s||jsonb_build_object('productCostVersion',77);
end$$;
revoke all on function public.pos_read() from public,anon,authenticated;
grant execute on function public.pos_read() to authenticated;
notify pgrst,'reload schema';
commit;
select 77 as version,'Harga beli referensi per butir siap' as status;

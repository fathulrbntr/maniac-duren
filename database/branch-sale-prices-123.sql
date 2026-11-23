-- Apply after supplier-stock-122.sql. Existing transactions retain their recorded prices.
begin;
set local lock_timeout='10s';
select pg_catalog.pg_advisory_xact_lock(71031,1102);
do $$begin
 if to_regprocedure('md_supply.post_receipt_units(md_supply.receipt_plans,uuid)') is null then
  raise exception 'Pasang patch nota dan stok 122 terlebih dahulu';
 end if;
end$$;

create table if not exists md_supply.branch_prices (
 store_id uuid not null references public.md_pos_stores on delete cascade,
 product_id uuid not null references public.md_pos_products on delete cascade,
 stock_unit text not null,
 price_kg numeric check(price_kg>0 and price_kg<=1000000000000),
 price_piece numeric check(price_piece>0 and price_piece<=1000000000000),
 sale_price numeric check(sale_price>0 and sale_price<=1000000000000),
 revision integer not null check(revision>0),
 primary key(store_id, product_id),
 check ((price_kg is null and price_piece is null and sale_price is null)
     or (stock_unit='kg_butir' and price_kg is not null and price_piece is not null and sale_price is null)
     or (stock_unit<>'kg_butir' and sale_price is not null and price_kg is null and price_piece is null))
);
alter table md_supply.branch_prices enable row level security;
revoke all on md_supply.branch_prices from public,anon,authenticated;

-- Resolve the price against the current master product if the branch has no override.
create or replace function md_supply.branch_product(p public.md_pos_products, branch uuid)
returns public.md_pos_products language plpgsql stable set search_path='' as $$
declare b md_supply.branch_prices%rowtype;
begin
 select * into b from md_supply.branch_prices where store_id=branch and product_id=p.id and stock_unit=p.stock_unit;
 if found then
  p.price_kg:=coalesce(b.price_kg,p.price_kg);
  p.price_piece:=coalesce(b.price_piece,p.price_piece);
  p.sale_price:=coalesce(b.sale_price,p.sale_price);
 end if;
 return p;
end$$;

create or replace function md_supply.clear_branch_prices() returns trigger language plpgsql set search_path='' as $$
begin
 update md_supply.branch_prices set stock_unit=new.stock_unit,price_kg=null,price_piece=null,sale_price=null,revision=revision+1 where product_id=new.id;
 return new;
end$$;
drop trigger if exists md_branch_prices_unit_change on public.md_pos_products;
create trigger md_branch_prices_unit_change after update of stock_unit,item_type on public.md_pos_products
 for each row when (old.stock_unit is distinct from new.stock_unit or (old.item_type<>new.item_type and new.item_type in ('raw','prep')))
 execute function md_supply.clear_branch_prices();

create or replace function md_supply.retail_amount(v text) returns numeric language plpgsql immutable set search_path='' as $$
declare amount numeric:=public.pos_positive(v);
begin
 if amount<>round(amount,2) or amount>1000000000000 then raise exception 'Harga jual maksimal 1 triliun dan dua angka desimal';end if;
 return amount;
end$$;

-- Called inside pos_warehouse_mutate after its active-user check and transaction lock.
create or replace function md_supply.save_branch_price(payload jsonb) returns jsonb language plpgsql set search_path='' as $$
declare
 branch uuid:=(payload->>'storeId')::uuid; pid uuid:=(payload->>'productId')::uuid; eid uuid:=(payload->>'id')::uuid;
 prod public.md_pos_products%rowtype; event md_supply.events%rowtype; rev integer;
 kg numeric; piece numeric; sale numeric;
begin
 perform md_supply.require_location(branch,'backoffice','store');
 if eid is null then raise exception 'ID operasi wajib';end if;
 select * into event from md_supply.events where id=eid;
 if found then
  if event.action<>'branch_price_save' or event.actor<>auth.uid() or event.request is distinct from payload then
   raise exception 'ID operasi sudah digunakan untuk perubahan lain';
  end if;
  return public.pos_read();
 end if;
 select * into prod from public.md_pos_products where id=pid for share;
 if not found or prod.item_type not in ('direct','recipe','finished') then raise exception 'Pilih produk jual';end if;
 if prod.stock_unit is distinct from payload->>'stockUnit' then raise exception 'Satuan produk berubah. Perbarui halaman.';end if;
 select revision into rev from md_supply.branch_prices where store_id=branch and product_id=pid for update;
 if (payload->>'expectedRevision')::integer is distinct from coalesce(rev,0) then raise exception 'Harga cabang sudah berubah. Perbarui halaman sebelum menyimpan.';end if;
 if payload->'inherit'='false'::jsonb then
  if prod.stock_unit='kg_butir' then
   kg:=md_supply.retail_amount(payload->>'priceKg'); piece:=md_supply.retail_amount(payload->>'pricePiece');
  else sale:=md_supply.retail_amount(payload->>'salePrice');end if;
 elsif payload->'inherit' is distinct from 'true'::jsonb then raise exception 'Pilih harga cabang atau harga master';end if;
 insert into md_supply.branch_prices(store_id,product_id,stock_unit,price_kg,price_piece,sale_price,revision)
 values(branch,pid,prod.stock_unit,kg,piece,sale,coalesce(rev,0)+1)
 on conflict(store_id,product_id) do update set stock_unit=excluded.stock_unit,price_kg=excluded.price_kg,
 price_piece=excluded.price_piece,sale_price=excluded.sale_price,revision=excluded.revision;
 insert into md_supply.events(id,action,actor,request) values(eid,'branch_price_save',auth.uid(),payload);
 return public.pos_read();
end$$;

-- Keep existing mutation, read redaction, discount approvals and replay behavior.
create or replace function pg_temp.edit_branch_price(fn regprocedure, old_text text, new_text text)
returns void language plpgsql as $$
declare d text:=pg_get_functiondef(fn);
begin
 if strpos(d,new_text)>0 then return;end if;
 if cardinality(string_to_array(d,old_text))<>2 then raise exception 'Versi fungsi % tidak sesuai untuk patch 123',fn;end if;
 execute replace(d,old_text,new_text);
end$$;
select pg_temp.edit_branch_price('public.pos_warehouse_mutate(text,jsonb)',
 $a$is_bo:=public.pos_allowed('backoffice');$a$,
 $a$is_bo:=public.pos_allowed('backoffice');
 if action='branch_price_save' then return md_supply.save_branch_price(payload);end if;$a$);
select pg_temp.edit_branch_price('public.pos_read()',
 $a$ if not bo then$a$,
 $a$ s:=s||jsonb_build_object('branchPricingVersion',123,'branchPrices',coalesce((
  select jsonb_agg(jsonb_build_object('storeId',b.store_id,'productId',b.product_id,'stockUnit',b.stock_unit,
   'priceKg',b.price_kg,'pricePiece',b.price_piece,'salePrice',b.sale_price,'revision',b.revision))
  from md_supply.branch_prices b join jsonb_array_elements(s->'stores') as stores(x) on x->>'id'=b.store_id::text
  where x->>'locationType'='store' and (bo or public.pos_allowed('sell',b.store_id) or public.pos_allowed('stock',b.store_id))
 ),'[]'::jsonb));
 if not bo then$a$);
select pg_temp.edit_branch_price('public.pos_cashier_quote(jsonb)',
 $a$  if p.stock_unit='kg_butir' then$a$,
 $a$  p:=md_supply.branch_product(p,(payload->>'storeId')::uuid);
  if p.stock_unit='kg_butir' then$a$);
select pg_temp.edit_branch_price('public.pos_cashier_quote(jsonb)',
 $a$Harga mengikuti master. Gunakan diskon dengan persetujuan owner$a$,
 $a$Harga jual cabang berbeda. Perbarui kasir dan masukkan kembali produk.$a$);

-- The legacy fruit sale RPC writes sale_items directly. Wholesale uses the issued invoice rate.
create or replace function md_supply.check_retail_sale_item() returns trigger language plpgsql set search_path='' as $$
declare sale public.md_pos_sales%rowtype; prod public.md_pos_products%rowtype; expected numeric;
begin
 select * into strict sale from public.md_pos_sales where id=new.sale_id;
 if sale.wholesale_order_id is not null then return new;end if;
 select * into strict prod from public.md_pos_products where id=new.product_id;
 prod:=md_supply.branch_product(prod,sale.store_id);
 expected:=case new.unit when 'KG' then prod.price_kg when 'BUTIR' then prod.price_piece end;
 if new.price is distinct from expected then raise exception 'Harga jual cabang berbeda. Perbarui kasir dan masukkan kembali buah.';end if;
 return new;
end$$;
drop trigger if exists md_retail_sale_item_price on public.md_pos_sale_items;
create trigger md_retail_sale_item_price before insert on public.md_pos_sale_items for each row execute function md_supply.check_retail_sale_item();
revoke all on function md_supply.branch_product(public.md_pos_products,uuid), md_supply.clear_branch_prices(),
 md_supply.save_branch_price(jsonb),md_supply.retail_amount(text),md_supply.check_retail_sale_item() from public,anon,authenticated;
commit;

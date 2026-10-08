-- Maniac Duren · patch 060. Jalankan seluruh file setelah product-variants.sql.
-- Satu SKU tersisa kembali menjadi produk biasa; nama, ID, stok dan histori tetap.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.md_pos_products in share row exclusive mode;

-- Hanya pelepasan kelompok tunggal yang boleh melewati penguncian identitas.
create or replace function public.pos_variant_identity_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.variant_group_id is not null
    and new.variant_group_id is null and new.variant_group_name is null
    and new.variant_options='[]'::jsonb and new.variant=''
    and (to_jsonb(new)-array['variant_group_id','variant_group_name','variant_options','variant'])
      = (to_jsonb(old)-array['variant_group_id','variant_group_name','variant_options','variant'])
    and not exists(select 1 from public.md_pos_products p where p.variant_group_id=old.variant_group_id and p.id<>old.id)
 then return new;end if;
 if old.variant_group_id is not null and
   (new.name is distinct from old.name or new.variant is distinct from old.variant
    or new.item_type is distinct from old.item_type or new.stock_unit is distinct from old.stock_unit
    or new.category is distinct from old.category or new.variant_group_id is distinct from old.variant_group_id
    or new.variant_group_name is distinct from old.variant_group_name or new.variant_options is distinct from old.variant_options) then
  raise exception 'Identitas varian sudah terdaftar. Edit harga, SKU, barcode, atau foto pada varian tersebut.';
 end if;
 return new;
end$$;
revoke all on function public.pos_variant_identity_guard() from public,anon,authenticated;

create or replace function public.pos_delete_product(payload jsonb) returns void
language plpgsql set search_path='' as $$
declare v_id uuid:=(payload->>'id')::uuid;v_group uuid;
begin
 if payload->'confirmed' is distinct from 'true'::jsonb then raise exception 'Konfirmasi penghapusan diperlukan';end if;
 -- Sama dengan penambahan varian: hapus dan tambah tidak menghitung kelompok bersamaan.
 lock table public.md_pos_products in share row exclusive mode;
 select variant_group_id into v_group from public.md_pos_products where id=v_id;
 if exists(select 1 from public.md_pos_lots where product_id=v_id) or exists(select 1 from public.md_pos_unit_lots where product_id=v_id)
 or exists(select 1 from public.md_pos_recipes where output_id=v_id) or exists(select 1 from public.md_pos_recipe_items where product_id=v_id)
 or exists(select 1 from public.md_pos_sale_items where product_id=v_id) or exists(select 1 from public.md_pos_stock_adjustments where product_id=v_id)
 then raise exception 'Produk sudah digunakan dalam stok, transaksi, atau resep sehingga tidak dapat dihapus';end if;
 delete from public.md_pos_products where id=v_id;
 if v_group is not null and (select count(*) from public.md_pos_products where variant_group_id=v_group)=1 then
  update public.md_pos_products set variant_group_id=null,variant_group_name=null,variant_options='[]',variant=''
  where variant_group_id=v_group;
 end if;
end$$;
revoke all on function public.pos_delete_product(jsonb) from public,anon,authenticated;

-- Perbaiki kelompok lama yang sudah tinggal satu, tanpa menyentuh kelompok lengkap.
update public.md_pos_products p
set variant_group_id=null,variant_group_name=null,variant_options='[]',variant=''
where p.variant_group_id in (
 select variant_group_id from public.md_pos_products where variant_group_id is not null
 group by variant_group_id having count(*)=1
);
notify pgrst,'reload schema';
commit;

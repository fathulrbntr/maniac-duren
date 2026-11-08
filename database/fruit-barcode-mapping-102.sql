-- Mapping buah 2026-11-08. Hanya Barcode master; tidak mengubah harga/stok/label lama.
-- PLU di foto tidak menunjukkan ItemCode. Samakan ItemCode pada CL-Works dengan kode ini.
-- Sudah dijalankan pada project maniac-duren-pos. File ini untuk referensi / pemulihan terkontrol.
begin;
set local lock_timeout = '5s';
do $mapping$
declare spec jsonb := $json$[{"sku": "MD-MONTHONG-BUAH", "old_code": "0001", "new_code": "0001"}, {"sku": "MD-BAWOR-BUAH", "old_code": "0002", "new_code": "0002"}, {"sku": "MD-MK-FRESH-BUAH", "old_code": "0003", "new_code": "0003"}, {"sku": "MD-PETRUK-BUAH", "old_code": "0004", "new_code": "0004"}, {"sku": "MD-MK-NITROGEN-BUAH", "old_code": "0007", "new_code": "0005"}, {"sku": "MD-MATAHARI-BUAH", "old_code": "0011", "new_code": "0006"}, {"sku": "MD-BT-FRESH-BUAH", "old_code": "0028", "new_code": "0008"}, {"sku": "MD-BT-NITROGEN-BUAH", "old_code": "0029", "new_code": "0009"}, {"sku": "MD-CUMASI-BUAH", "old_code": "0030", "new_code": "0010"}, {"sku": "MD-LOKAL-SUPER-BUAH", "old_code": "0032", "new_code": "0012"}, {"sku": "MD-MIMANG-BUAH", "old_code": "0034", "new_code": "0014"}, {"sku": "MD-SUPER-TEMBAGA-BUAH", "old_code": "0035", "new_code": "0015"}]$json$; before_products jsonb; before_units jsonb; r record; affected integer;
begin
  lock table public.md_pos_products in share row exclusive mode;
  select jsonb_agg(to_jsonb(p) order by id) into before_products from public.md_pos_products p;
  select jsonb_agg(to_jsonb(u) order by barcode) into before_units from public.md_pos_fruit_units u;
  for r in select * from jsonb_to_recordset(spec) as x(sku text,old_code text,new_code text) loop
    if (select count(*) from public.md_pos_products where sku=r.sku and stock_unit='kg_butir' and barcode in(r.old_code,r.new_code))<>1 then
      raise exception 'Produk/kode berubah: %. Tinjau manual.',r.sku;
    end if;
    if exists(select 1 from public.md_pos_products where trim(barcode)=r.new_code and sku<>r.sku) then
      raise exception 'Kode sudah dipakai produk lain: %',r.new_code;
    end if;
  end loop;
  update public.md_pos_products p set barcode=x.new_code from jsonb_to_recordset(spec) as x(sku text,old_code text,new_code text)
    where p.sku=x.sku and p.barcode is distinct from x.new_code;
  get diagnostics affected = row_count;
  if exists(select 1 from jsonb_array_elements(before_products) b join public.md_pos_products p on p.id::text=b->>'id' where (to_jsonb(p)-'barcode')<>(b-'barcode')) then
    raise exception 'Kolom selain barcode berubah; membatalkan.';
  end if;
  if (select jsonb_agg(to_jsonb(u) order by barcode) from public.md_pos_fruit_units u) is distinct from before_units then
    raise exception 'Label tracking berubah; membatalkan.';
  end if;
  raise notice '% barcode diperbarui.',affected;
end $mapping$;
commit;
select sku,name,barcode,price_kg from public.md_pos_products where sku in ('MD-MONTHONG-BUAH','MD-BAWOR-BUAH','MD-MK-FRESH-BUAH','MD-PETRUK-BUAH','MD-MK-NITROGEN-BUAH','MD-MATAHARI-BUAH','MD-BT-FRESH-BUAH','MD-BT-NITROGEN-BUAH','MD-CUMASI-BUAH','MD-LOKAL-SUPER-BUAH','MD-MIMANG-BUAH','MD-SUPER-TEMBAGA-BUAH') order by barcode;

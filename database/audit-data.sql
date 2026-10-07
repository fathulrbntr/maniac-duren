-- Audit READ ONLY: paste the entire file into Supabase SQL Editor.
-- Does not delete, merge or reset operational data. Review each finding manually.
with findings as (
 select 'barcode_duplikat' issue,string_agg(id::text,', ' order by id) record_id,
        'Barcode '||btrim(barcode)||' dipakai '||count(*)||' produk' detail
 from public.md_pos_products where btrim(barcode)<>'' group by btrim(barcode) having count(*)>1
 union all
 select 'sku_duplikat_normalisasi',string_agg(id::text,', ' order by id),'SKU '||lower(btrim(sku))||' berbeda kapital/spasi saja'
 from public.md_pos_products group by lower(btrim(sku)) having count(*)>1
 union all
 select 'saldo_buah_tidak_seimbang',id::text,'Sisa '||kg||' kg / '||pieces||' butir'
 from public.md_pos_lots where (kg=0)<>(pieces=0) or kg<0 or pieces<0
 union all
 select 'menu_resep_belum_lengkap',p.id::text,p.name
 from public.md_pos_products p left join public.md_pos_recipes r on r.output_id=p.id
 where p.item_type='recipe' group by p.id,p.name having count(r.id)<>1
 union all
 select 'resep_tanpa_bahan',r.id::text,r.name
 from public.md_pos_recipes r where not exists(select 1 from public.md_pos_recipe_items i where i.recipe_id=r.id)
 union all
 select 'biaya_belum_diketahui',id::text,'Order lunas; biaya belum lengkap'
 from public.md_pos_order_runs where payment_status='paid' and status='paid' and cost is null
 union all
 select 'stok_kedaluwarsa',id::text,'Sisa '||qty||' '||unit||'; kedaluwarsa '||expiry
 from public.md_pos_unit_lots where qty>0 and expiry<(now() at time zone 'Asia/Jakarta')::date
 union all
 select 'jejak_stok_tanpa_lot',j.id::text,'Lot '||j.lot_id
 from public.md_pos_stock_journal j where not exists(select 1 from public.md_pos_lots l where l.id=j.lot_id)
 and not exists(select 1 from public.md_pos_unit_lots l where l.id=j.lot_id)
)
select issue,record_id,detail from findings order by issue,record_id;

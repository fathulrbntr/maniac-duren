-- MANIAC DUREN: 15 durian + masing-masing 4 produk turunan = 75 master produk.
-- Jalankan SELURUH file di Supabase > SQL Editor dengan role postgres.
-- Target: skema yang diaudit pada 8 Oktober 2026 (harga produk boleh NULL).
-- Harga belum diketahui tetap NULL, bukan 0/Rp1. Stok tidak ditambahkan.
-- Tidak mengganti aturan database, data lama, atau alur Olah Reject.
-- Produk turunan diberi nama spesifik jenis durian. Ini belum membuat pemetaan
-- otomatis di form Olah Reject; form patch 027 masih menggunakan produk umum.
-- Jejak supplier/batch dicatat saat transaksi pengolahan, bukan saat impor master.
-- Jalankan ulang tanpa duplikat. Konflik membatalkan seluruh impor.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select pg_catalog.pg_advisory_xact_lock(71031, 1102);
lock table public.md_pos_products in share row exclusive mode;

create temporary table md_durian_import_varieties (
  urutan integer primary key,
  kode text unique not null,
  nama text unique not null
) on commit drop;

insert into md_durian_import_varieties (urutan, kode, nama) values
  (1,  'MONTHONG',     'Monthong'),
  (2,  'BAWOR',        'Bawor'),
  (3,  'MK-FRESH',     'Musang King Fresh'),
  (4,  'MK-NITROGEN',  'Musang King Nitrogen'),
  (5,  'BT-FRESH',     'Black Thorn Fresh'),
  (6,  'BT-NITROGEN',  'Black Thorn Nitrogen'),
  (7,  'SUPER-TEMBAGA','Super Tembaga'),
  (8,  'CUMASI',       'Cumasi'),
  (9,  'MASMUAR',      'Masmuar'),
  (10, 'MIMANG',       'Mimang'),
  (11, 'PETRUK',       'Petruk'),
  (12, 'MATAHARI',     'Matahari'),
  (13, 'LOKAL-MENTEGA','Lokal Mentega'),
  (14, 'LOKAL-SUPER',  'Lokal Super'),
  (15, 'LOKAL-PREMIUM','Lokal Premium');

create temporary table md_durian_import_input (
  urutan integer primary key,
  jenis_durian text not null,
  bentuk text not null,
  sku text unique not null,
  name text unique not null,
  variant text not null,
  item_type text not null,
  stock_unit text not null,
  category text not null
) on commit drop;

insert into md_durian_import_input
select
  (v.urutan - 1) * 5 + f.urutan,
  'Durian ' || v.nama,
  f.bentuk,
  'MD-' || v.kode || '-' || f.kode,
  f.awalan || v.nama || f.akhiran,
  f.variant, f.item_type, f.stock_unit, f.category
from pg_temp.md_durian_import_varieties v
cross join (values
  (1, 'Durian utuh',  'BUAH',  'Durian ',        '',        '',       'direct',   'kg_butir', 'Buah'),
  (2, 'Durpas 500 gr','DP500', 'Durpas ',        ' 500 gr', '500 gr', 'finished', 'pcs',      'Olahan Duren'),
  (3, 'Durpas 1 kg',  'DP1KG', 'Durpas ',        ' 1 kg',   '1 kg',   'finished', 'pcs',      'Olahan Duren'),
  (4, 'Coral',        'CORAL', 'Coral ',         '',        '',       'finished', 'kg',       'Olahan Duren'),
  (5, 'Daging durian','DAGING','Daging Durian ', '',        '',       'finished', 'kg',       'Olahan Duren')
) f(urutan, bentuk, kode, awalan, akhiran, variant, item_type, stock_unit, category);

create temporary table md_durian_import_result (
  urutan integer primary key,
  product_id uuid not null,
  status text not null
) on commit drop;

do $import$
declare
  r record;
  existing_ids uuid[];
  existing public.md_pos_products%rowtype;
  product_id uuid;
  normalized_name text;
begin
  for r in select * from pg_temp.md_durian_import_input order by urutan loop
    normalized_name := lower(regexp_replace(btrim(r.name), '[[:space:]]+', ' ', 'g'));
    select array_agg(p.id) into existing_ids
    from public.md_pos_products p
    where lower(btrim(p.sku)) = lower(r.sku)
       or lower(regexp_replace(btrim(p.name), '[[:space:]]+', ' ', 'g')) = normalized_name;

    if coalesce(cardinality(existing_ids), 0) > 1 then
      raise exception 'Impor dibatalkan: nama/SKU "%" cocok dengan beberapa produk. Periksa Master Barang.', r.name;
    elsif coalesce(cardinality(existing_ids), 0) = 1 then
      select * into strict existing from public.md_pos_products where id = existing_ids[1];
      if lower(regexp_replace(btrim(existing.name), '[[:space:]]+', ' ', 'g')) is distinct from normalized_name
         or existing.item_type is distinct from r.item_type
         or existing.stock_unit is distinct from r.stock_unit
         or existing.category is distinct from r.category
         or (btrim(coalesce(existing.variant, '')) <> ''
             and lower(btrim(existing.variant)) <> lower(r.variant)) then
        raise exception 'Impor dibatalkan: "%" berbenturan dengan "%" (SKU %, jenis %, satuan %, kategori %, varian %). Data lama tidak diubah.',
          r.name, existing.name, existing.sku, existing.item_type, existing.stock_unit, existing.category, existing.variant;
      end if;
      insert into pg_temp.md_durian_import_result values (r.urutan, existing.id, 'Sudah ada; tidak diubah');
    else
      product_id := gen_random_uuid();
      -- Impor metadata tanpa harga. Semua CHECK/FK/UNIQUE tetap diberlakukan.
      -- Tidak memanggil mutasi penjualan atau membuat batch stok.
      begin
        insert into public.md_pos_products (
          id, sku, name, variant, item_type, stock_unit, category,
          price_kg, price_piece, sale_price, buy_price, barcode, photo
        ) values (
          product_id, r.sku, r.name, r.variant, r.item_type, r.stock_unit, r.category,
          null, null, null, null, '', ''
        );
      exception when check_violation or not_null_violation then
        raise exception 'Impor dibatalkan pada "%": skema menolak metadata tanpa harga atau jenis/satuan ini. Seluruh impor dibatalkan. Detail: %', r.name, SQLERRM;
      end;
      insert into pg_temp.md_durian_import_result values (r.urutan, product_id, 'Ditambahkan');
    end if;
  end loop;
end
$import$;

-- Satu hasil ringkas. Field jenis_durian/bentuk adalah pengelompokan laporan impor.
-- Tidak menambahkan kolom atau hubungan baru pada tabel produk.
select
  count(*) as total_produk,
  count(*) filter (where i.bentuk = 'Durian utuh') as durian_utuh,
  count(*) filter (where i.bentuk <> 'Durian utuh') as produk_turunan,
  count(*) filter (where r.status = 'Ditambahkan') as ditambahkan,
  count(*) filter (where r.status <> 'Ditambahkan') as sudah_ada,
  jsonb_agg(jsonb_build_object(
    'jenis_durian', i.jenis_durian, 'bentuk', i.bentuk,
    'produk', p.name, 'sku', p.sku, 'variant', p.variant,
    'satuan', case p.stock_unit when 'kg_butir' then 'kg + butir' else p.stock_unit end,
    'status', r.status
  ) order by r.urutan) as rincian
from pg_temp.md_durian_import_result r
join pg_temp.md_durian_import_input i on i.urutan = r.urutan
join public.md_pos_products p on p.id = r.product_id;

commit;

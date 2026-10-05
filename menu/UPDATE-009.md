# Maniac Duren POS — struktur operasional terpadu

Versi ini menambahkan alur operasional untuk buah, kitchen, dessert, biaya, dan karyawan.

## Urutan kerja toko

1. **Karyawan & cabang** — buat data karyawan, pilih role dan cabang, lalu hubungkan akun login.
2. **Master produk** — bedakan `Buah`, `Bahan baku pembelian`, `Bahan produksi sendiri`, `Menu resep`, dan `Produk jadi`.
3. **Barang masuk** — pilih supplier, timbang kg dan hitung butir, isi total modal pembelian termasuk ongkos masuk. Akun penerima tersimpan otomatis.
4. **Sortir buah** — pecah satu penerimaan menjadi `Matang / siap jual`, `Belum matang`, dan `Reject`. Total kg dan butir hasil sortir harus sama dengan sisa penerimaan.
5. **Olah reject** — pilih reject dan hasil olahan. Modal reject dipindahkan ke hasil menurut berat hasil agar tidak dihitung sebagai kerugian dua kali. Reject yang tidak dapat dimanfaatkan masuk sebagai waste.
6. **Produksi kitchen** — buat cendol, jelly, ketan, mutiara, dan bahan lain berdasarkan resep. Bahan dipotong saat produksi dicatat.
7. **Pesanan** — kasir membuat pesanan buah, dessert, dan produk supplier. Pesanan antre belum memotong stok.
8. **Kitchen** — tekan `Mulai buat`; resep memotong bahan FIFO. Jika salah buat atau pesanan dibatalkan setelah dibuat, catatannya menjadi waste.
9. **Bayar** — setelah kitchen menandai `Siap`, kasir menerima pembayaran dan transaksi masuk laporan penjualan.
10. **Audit** — gunakan Jejak Stok untuk melihat penerimaan, supplier, lot, orang yang melakukan tindakan, hasil olahan, dan pemakaian bahan.

## Role

- `Owner`: semua cabang, seluruh menu, karyawan, biaya, dan pembatalan.
- `Manager`: operasional, master data, laporan, biaya, dan pembatalan di cabang yang ditugaskan.
- `Kasir`: pesanan, kasir buah, pembayaran, dan absensi.
- `Kitchen`: produksi bahan, mulai/selesai pesanan, olah reject, waste, dan jejak stok.
- `Gudang`: penerimaan, sortir, transfer, waste, dan jejak stok.

Role dapat diberi permission tambahan. Pembatasan role dan cabang diperiksa di database, bukan hanya di tampilan.

## Biaya dan laba

Total modal pada penerimaan menjadi biaya per kg/satuan. Modal diteruskan ke hasil produksi dan hasil olahan reject. Laporan menampilkan omzet, biaya bahan yang diketahui, waste/penyusutan, serta laba kotor. Jika transaksi lama belum mempunyai modal, laporan menandainya sebagai `Belum diketahui`; nilainya tidak dianggap nol.

Laba kotor belum memasukkan gaji, sewa, listrik, pajak, dan biaya operasional umum.

## Memasang database

### Database baru

Jalankan `database/pos.sql` satu kali di SQL Editor Supabase.

### Database yang sudah memakai versi sebelumnya

Jalankan `database/009-integrated-operations.sql` satu kali setelah migration sebelumnya. Jangan menjalankan migration ini dua kali.

### Environment variable untuk pembuatan akun

Tambahkan pada Vercel sebagai secret:

```text
POS_SUPABASE_SERVICE_ROLE_KEY=...
```

Secret ini hanya dipakai endpoint server `/api/pos-employee`; jangan masukkan ke kode browser atau `POS_SUPABASE_PUBLISHABLE_KEY`.

## Pengujian lokal

```bash
npm run test
npm run test:db
BROWSER_EXECUTABLE=/path/to/chromium npm run test:browser
```

## Jika muncul error `md_pos_catalog_valid`

Migration terbaru membuat constraint katalog sebagai `NOT VALID`, sehingga baris produk lama tidak menghalangi instalasi. Baris baru tetap diperiksa oleh constraint. Setelah data lama dirapikan, constraint dapat divalidasi manual dengan:

```sql
alter table public.md_pos_products validate constraint md_pos_catalog_valid;
```

Jika perintah validasi masih gagal, cari produk lama yang perlu diperbaiki dengan:

```sql
select id, sku, name, category, item_type, stock_unit, price_kg, price_piece, sale_price
from public.md_pos_products
where not (
  item_type in ('direct','raw','prep','recipe','finished')
  and stock_unit in ('kg_butir','kg','g','ml','pcs','porsi')
);
```

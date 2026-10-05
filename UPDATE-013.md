# Update 013 — Kitchen hanya untuk menu yang perlu dibuat

## Pasang setelah update 012
1. Ekstrak ZIP ke folder utama proyek, pilih Replace.
2. Supabase → SQL Editor: jalankan seluruh `database/013-kitchen-recipes-only.sql`.
3. Commit/push, tunggu deploy Vercel selesai, lalu Ctrl + Shift + R pada kasir dan kitchen.

Jangan reset database. `database/pos.sql` hanya untuk instalasi baru. Pada database aktif yang sudah memakai 012, cukup jalankan migration 013.

## Alur baru
- **Buah dan produk siap jual:** pilih → bayar → selesai. Stok langsung dipotong saat pembayaran disimpan. Tidak ada tiket maupun notifikasi kitchen.
- **Menu resep yang dibuat setelah dipesan:** pilih → bayar → antre kitchen → mulai dibuat (bahan dipotong) → siap → diserahkan.
- **Pesanan campuran:** satu pembayaran dan satu struk lengkap. Stok buah/produk siap jual langsung dipotong saat bayar. Kitchen hanya melihat baris menu resep; stok produk siap jual tidak dipotong lagi saat kitchen mulai membuat.
- Jenis `recipe` berarti menu yang dibuat sesuai pesanan. Buah, `direct`, dan `finished` mengikuti alur siap jual. Bahan `raw` dan `prep` tetap tidak dijual di POS.
- Kasir tetap dapat melihat seluruh isi pesanan, termasuk buah dan produk siap jual.

## Pesanan lama yang sudah terlanjur masuk antrean
- Pesanan buah/produk siap jual lama tidak ditampilkan lagi di kitchen.
- Di Kasir & pesanan, klik **Selesaikan di kasir** untuk pesanan siap jual yang sudah lunas tetapi belum selesai, termasuk contoh antrean buah pada screenshot.
- Stok yang belum dipotong akan dipotong sekali. Jika sudah dipotong pada proses sebelumnya, tidak dipotong lagi.
- Pesanan campuran lama tetap menyimpan jejak stok sebelumnya. Item yang belum terpotong diselesaikan sekali saat proses pesanan berjalan; tidak ada pemotongan massal otomatis oleh migration.
- Pesanan lama yang belum lunas mengikuti alur baru ketika dibayar.

## Pembatalan dan biaya
Omzet tetap dicatat sekali saat bayar. Biaya produk siap jual tersedia saat checkout; total biaya pesanan campuran lengkap setelah kitchen memakai bahan. Jika pesanan campuran dibatalkan sebelum kitchen mulai, cadangan bahan dessert dilepas. Produk siap jual yang stoknya sudah keluar tidak otomatis dikembalikan; nilainya dicatat sebagai waste bersama reversal pembayaran. Pengembalian fisik barang belum memiliki alur retur tersendiri.

## Pengujian
- `npm test`
- `npm run test:kitchen` — termasuk tes baru pesanan siap jual/campuran, stok, HPP, retry, pembatalan dan penyelesaian pesanan lama.
- `npm run test:operations`
- `npm run test:kitchen:browser` — dua sesi kasir/kitchen dengan backend simulasi, termasuk item campuran dan transaksi siap jual tanpa tiket kitchen.

Database diuji memakai PGlite pada instalasi baru dan upgrade. Deploy dan SQL produksi belum diterapkan dari sesi ini.

```bash
git status
git add pos/app.js pos/index.html pos/operations-ui.mjs pos/retry.mjs database/013-kitchen-recipes-only.sql database/pos.sql scripts/build-database.mjs package.json tests/kitchen-orders.test.mjs tests/direct-orders.test.mjs tests/operations.test.mjs tests/kitchen-browser.cjs UPDATE-013.md
git commit -m "fix: route only made-to-order items to kitchen"
git push
```

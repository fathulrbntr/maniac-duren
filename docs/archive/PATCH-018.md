# Patch 018 — Pencatatan timbang barang masuk

## Pemasangan
1. Ekstrak ZIP ini ke folder proyek Maniac Duren, timpa file dengan nama yang sama.
2. Database yang sudah berjalan: buka Supabase → SQL Editor, salin seluruh isi `database/migrations/018-receipt-weighing-log.sql`, lalu Run. Tidak perlu reset dan tidak perlu menjalankan ulang `database/pos.sql`.
3. Push perubahan, tunggu deployment Vercel selesai, kemudian muat ulang POS dengan Ctrl+F5.

Untuk database baru saja gunakan `database/pos.sql`. Build SQL diperbaiki agar urutan fungsi dan wrapper tetap benar. File SQL lama dalam ZIP sumber tidak dapat dipasang dari nol karena susunan fungsi terputus.

## Penggunaan
Stok & barang masuk → Barang masuk → pilih tanggal, store, produk, supplier, total harga barang dan ongkir → Catat penimbangan.

Isi berat dan butir dalam satu baris, klik Tambah timbang. Ulangi untuk setiap timbang. Edit atau hapus baris jika keliru. Klik Selesai menghitung untuk kembali ke ringkasan; langkah ini belum menambah stok.

Setelah seluruh barang selesai diturunkan, klik Penurunan selesai · masukkan ke stok lalu konfirmasi. Seluruh berat, butir dan riwayat timbang disimpan sebagai satu penerimaan. Buah masuk dalam kondisi belum disortir sesuai alur yang sudah ada.

Harga barang/kg = total harga barang ÷ total kg.
Harga barang/butir = total harga barang ÷ total butir.
Modal/kg = (harga barang + ongkir) ÷ total kg.
Modal/butir = (harga barang + ongkir) ÷ total butir.

Contoh: harga barang Rp1.000.000, ongkir Rp200.000, hasil 20 kg / 8 butir. Harga barang: Rp50.000/kg dan Rp125.000/butir. Modal termasuk ongkir: Rp60.000/kg dan Rp150.000/butir. Perhitungan tersimpan memakai presisi database, tampilan rupiah mengikuti format POS.

Riwayat timbang dapat dibuka dari Detail stok atau Rincian asal barang. Koreksi baris tersedia selama belum finalisasi. Setelah finalisasi, riwayat hanya dibaca agar tidak mengubah stok dan modal yang sudah dipakai transaksi lain. Pencatatan sebelum finalisasi berada di form yang sedang terbuka; jangan tutup atau muat ulang halaman sebelum menyimpan.

## Validasi
Lulus: uji perhitungan, validasi baris, konfirmasi akhir, histori, koreksi, payload form, rollback, retry/idempotensi, pemasangan baru, upgrade 017→018, menjalankan migration ulang, serta regresi stok, produksi, pesanan, biaya, hak akses dan absensi.
Alur form diuji dengan DOM lokal. Preview visual Chromium belum diuji karena browser pengujian gagal diunduh. Belum menjalankan query ke Supabase operasional.

## Terminal Git Bash
```bash
git status
git add pos/app.js pos/index.html pos/inventory-ui.mjs pos/pos.css pos/receipt-weighing.mjs database/migrations/018-receipt-weighing-log.sql database/sections/operations/receipt-weighing.sql database/sections/operations/employee-accounts.sql database/pos.sql database/migrations/README.md scripts/build-database.mjs package.json tests/operations.test.mjs tests/receipt-weighing.test.mjs PATCH-018.md
git commit -m "Add paired weighing log and confirm completed unloading"
git push origin main
```

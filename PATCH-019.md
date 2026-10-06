# Patch 019 — Timbang terbaru di atas, format uang dan stok tanpa sortir

Patch ini melanjutkan patch 018 yang sudah terpasang.

## Pemasangan
1. Ekstrak isi ZIP ke folder proyek, timpa file yang sama.
2. Supabase → SQL Editor → jalankan SELURUH isi `database/migrations/019-direct-stock-no-sorting.sql`.
3. Push perubahan ke GitHub, tunggu deployment, kemudian Ctrl+F5 di halaman POS.
Tidak perlu reset database atau menjalankan ulang `database/pos.sql` pada database aktif.

## Perubahan
- Timbang yang paling baru muncul paling atas, baik saat menginput maupun ketika melihat riwayat yang sudah tersimpan. Nomor timbang tetap mengikuti urutan pencatatan; tombol edit/hapus tetap menunjuk baris yang tepat.
- Kolom harga jual, harga beli, total pembelian, ongkir, modal, filter harga dan uang diterima otomatis memakai pemisah ribuan, contoh `1.000.000`. Desimal dapat memakai koma, contoh `85.000,50`. Data yang dipakai perhitungan dan dikirim ke server tetap angka mentah.
- Format harga juga diterapkan pada halaman Kelola Menu.
- Menu dan form Sortir dihapus; aksi sortir melalui API juga dinonaktifkan.
- Setelah konfirmasi penurunan selesai, barang masuk langsung siap jual. Stok lama dengan status belum disortir dipindahkan menjadi siap jual, tanpa mengubah berat, butir, modal atau riwayat timbang. Stok lama dengan status belum matang/reject tetap pada kondisi sebelumnya.
- Olah reject dapat mengambil stok buah yang tersedia tanpa tahap sortir; pencatatan waste dan asal stok tetap berjalan.

## Verifikasi
Lulus pengujian perhitungan, riwayat terbaru di atas, koreksi, format uang dan nilai angka mentah, validasi harga, perubahan kolom dinamis, pembayaran/form, konfirmasi penerimaan, penjualan langsung tanpa sortir, pengolahan dari stok siap jual, upgrade dan pengulangan migration, serta regresi stok, pesanan, biaya, hak akses dan absensi.
Alur UI diuji dengan DOM lokal. Preview visual browser dan database Supabase operasional belum diuji.

```bash
git status
git add pos menu/kelola.html database scripts package.json tests PATCH-019.md
git commit -m "Format money inputs and receive stock without sorting"
git push origin main
```

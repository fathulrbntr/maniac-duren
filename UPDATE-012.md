# Update 012 — Bayar dahulu, lalu kitchen

## Pasang pada proyek yang sudah menerima 010 dan 011
1. Ekstrak ZIP ini ke folder utama proyek dan pilih Replace. ZIP hanya berisi file baru/berubah.
2. Supabase → SQL Editor → jalankan seluruh `database/012-pay-first-kitchen.sql`.
3. Commit/push perubahan, tunggu deploy Vercel Ready, lalu Ctrl + Shift + R pada perangkat kasir dan kitchen.

Database aktif hanya menjalankan migration **012**. Jangan reset database dan jangan menjalankan `database/pos.sql`; file gabungan itu hanya untuk instalasi baru. Jangan menjalankan ulang migration lama setelah 012.

## Cara menggunakan
1. Kasir memilih menu dan mengisi meja/nama/catatan.
2. Klik **Bayar sekarang**. Pilih Tunai, QRIS, atau Transfer; isi uang diterima untuk tunai. Kembalian muncul otomatis.
3. Setelah pembayaran benar-benar diterima, klik **Konfirmasi bayar & kirim kitchen**.
4. Pembayaran, pesanan, dan cadangan bahan disimpan dalam satu transaksi database. Bila stok kurang, semuanya ditolak tanpa menyimpan transaksi sebagian.
5. Pesanan muncul **Lunas · Antre** di kasir dan masuk Antrean Kitchen, dengan pembaruan sekitar 5 detik saat halaman terbuka. Klik **Aktifkan suara** pada perangkat kitchen bila diperlukan.
6. Kitchen klik **Mulai buat** untuk memotong bahan fisik, lalu **Selesai / siap**.
7. Setelah diberikan ke customer, kasir klik **Sudah diserahkan**. Pesanan keluar dari antrean aktif, riwayat dan struk tetap tersedia.

Tunai/QRIS/transfer dicatat manual; tidak ada koneksi payment gateway atau verifikasi pembayaran bank otomatis. Non-tunai harus sama dengan total.

## Stok, laporan, dan pembatalan
- Menu yang bahannya kurang tetap tidak bisa dijual. Stok prep tidak otomatis dibuat dari bahan mentah.
- Omzet muncul saat pembayaran, tanpa menunggu kitchen selesai. HPP aktual dilengkapi setelah bahan dipakai; sebelumnya biaya ditandai belum lengkap.
- Pesanan lunas hanya dicatat sekali meskipun permintaan yang sama dikirim ulang.
- Pembatalan pesanan lunas memerlukan permission pembatalan, alasan, dan konfirmasi uang sudah dikembalikan manual. Sistem mencatat reversal sebesar total pesanan.
- Batal saat antre: cadangan dilepas, stok fisik tetap. Batal setelah mulai dibuat: bahan tidak kembali dan dicatat sebagai waste.
- Riwayat lama tetap utuh. Pesanan lama belum lunas dapat dibayar lewat tombol **Bayar sekarang** di daftar kasir atau dibatalkan. Pesanan belum lunas tidak diproses kitchen. Cadangan antrean lama tetap berlaku sampai dibayar/dibatalkan.
- Status pembayaran dipisah sebagai `payment_status`; `status` menyimpan tahap operasional. Nilai lama `status=paid` dipertahankan sebagai pesanan selesai/diserahkan untuk kompatibilitas riwayat.

## Pengujian
- `npm test`
- `npm run test:kitchen`
- `npm run test:operations`
- `npm run test:kitchen:browser`

Keempat perintah pengujian di atas lolos: database memakai PGlite (fresh/upgrade), browser memakai backend simulasi dua sesi kasir/kitchen, termasuk viewport desktop/mobile.

Deploy Vercel dan SQL produksi tetap perlu diterapkan pengguna; pengujian lokal tidak mengubah database produksi.

```bash
git status
git add pos/app.js pos/index.html pos/operations-ui.mjs pos/retry.mjs database/012-pay-first-kitchen.sql database/pos.sql scripts/build-database.mjs tests/kitchen-orders.test.mjs tests/kitchen-browser.cjs tests/operations.test.mjs tests/retry.test.mjs UPDATE-012.md
git commit -m "fix: collect payment before kitchen queue"
git push
```

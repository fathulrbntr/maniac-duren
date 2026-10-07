# Menjalankan POS Maniac Duren

Untuk update ZIP ini, ikuti **PATCH-028.md**. Antarmuka login memakai akun karyawan; tidak tersedia tombol demo.

## Database yang sudah berjalan

Jika sudah sampai migration 020, jalankan `database/migrations/021-offline-pos.sql` melalui Supabase SQL Editor. Jangan menjalankan instalasi penuh / reset pada database operasional.

## Instalasi baru

Jalankan `database/pos.sql` pada database kosong. Siapkan akun owner di Supabase Authentication lalu tautkan akun itu ke tabel staff dan karyawan owner. Akun operasional berikutnya dikelola melalui menu Karyawan & akses. Akses berdasarkan role, izin dan cabang yang ditugaskan.

## Konfigurasi Vercel

Endpoint `/api/pos-config`, `/api/pos-login`, dan `/api/pos-employee` memerlukan:

- `POS_SUPABASE_URL`
- `POS_SUPABASE_PUBLISHABLE_KEY`
- `POS_SUPABASE_SERVICE_ROLE_KEY` — server saja, untuk login/kelola akun; jangan taruh di file frontend.

Konfigurasi pada deployment lama tetap dipakai. Tidak ada key atau password baru dalam patch. Live Server hanya melayani file statis; endpoint login Vercel memerlukan Vercel atau lingkungan fungsi yang sesuai.

## Perangkat kasir

Buka `https://maniacduren.com/pos/`, login saat online, tunggu aset/data tersimpan, lalu install lewat Chrome/Edge. Token sesi tersimpan pada perangkat agar reload offline dapat memulihkan kasir. Logout menghapus sesi aktif dan hanya dapat dilakukan setelah pengiriman transaksi selesai.

Jaga status sinkronisasi sebelum mengganti perangkat/profil browser. Data lokal terpisah per backend dan akun. Satu tab POS aktif per profil browser.

Penjualan durian tetap memakai berat aktual dan butir. Produk supplier memakai satuan stoknya. Menu resep mencadangkan bahan ketika dibayar dan diproses kitchen setelah tersinkron. Pembayaran QRIS/Transfer adalah pencatatan manual. Cetak struk menggunakan print browser.

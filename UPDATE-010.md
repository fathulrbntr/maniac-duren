# Update 010 — Toko, ikon menu, dan login

## Cara memasang
1. Buka Supabase → SQL Editor → New query.
2. Salin seluruh isi `database/010-store-name.sql`, lalu klik Run. Database harus sudah memakai upgrade 009.
3. Salin isi ZIP ke folder utama proyek dan pilih Replace. Struktur `pos/`, `database/`, dan `tests/` harus menyatu dengan folder yang sudah ada.
4. Commit dan push perubahan, tunggu deployment Vercel berstatus Ready, lalu tekan Ctrl + Shift + R pada halaman POS.

Database aktif cukup menjalankan **010-store-name.sql**. `database/pos.sql` merupakan hasil build untuk instalasi baru; tidak perlu dijalankan ulang pada database aktif.

## Perubahan
- Dropdown toko berada di sidebar, tepat di bawah logo, dan tetap tersedia di layar kecil.
- Menu Store → Edit toko menyediakan nama toko dan lokasi. Sesudah disimpan, nama pada dropdown langsung diperbarui; ID toko dan hubungan stok/transaksi tetap sama.
- Setiap menu memiliki ikon SVG tersendiri.
- Login menampilkan akses akun; tombol dan keterangan demo dihapus.

## Pemeriksaan
- `npm test`
- `node tests/store-settings.test.mjs` (memerlukan dependensi PGlite dari package.json).
- Pengujian browser dengan data uji: login, posisi dropdown, edit nama, pindah toko, logout, serta ukuran 1440, 780, dan 390 px.

# Aturan kerja Maniac Duren

Baca `README.md`, `docs/STRUKTUR-PROYEK.md`, dan `docs/PENGEMBANGAN.md`
sebelum mengubah kode. Panduan aktif adalah audit 111; `docs/archive/` hanya
riwayat. Pertahankan perubahan lokal pengguna yang belum di-commit.

## Penempatan dan kepemilikan kode

- Proyek memakai HTML/ES modules langsung, tanpa bundler. URL file adalah kontrak.
  Jangan memindahkan seluruh `pos/` atau mengganti URL tanpa memperbarui konsumen.
- Perbaiki modul fitur yang sudah ada. Jangan menambah `app-new.js`, `fix.js`,
  `patch-111.js`, salinan `*-final`, atau monkey patch global.
- `pos/app.js` menghubungkan sesi, navigasi, render, dan konteks fitur. Aturan
  bisnis/perhitungan tetap di modul fitur; HTML dan event di `*-ui.mjs`.
- Rute mutasi aktif ada di `pos/data/mutations.mjs`; semua mutasi UI melewati
  `ctx.mutate`. Jangan membuat jalur fetch transaksi kedua atau ID baru saat retry.
- API server berada di `api/` dan tetap CommonJS. Kode browser tidak mengimpor API,
  SQL, fixture, script pengembangan, atau kredensial server.
- Utilitas lintas halaman di `shared/` tidak bergantung pada aplikasi POS/menu.
- CSS fitur ada di file CSS fitur; token bersama di `pos/ui-tokens.css`.
  Jangan menumpuk override global untuk menutupi masalah satu komponen.
- Tes ada di `tests/`; helper tes di `tests/helpers/`; helper tooling di
  `scripts/lib/`. Petunjuk aktif di `docs/`, versi lama di `docs/archive/`.
- Fitur baru yang terdiri dari banyak file boleh memakai
  `pos/features/<nama-fitur>/` dengan satu entry point. Cari pemilik aturan yang
  sudah ada dahulu; jangan menyalin logika lama ke folder baru.

## Kontrak yang wajib dipertahankan

- Barcode adalah string, termasuk seluruh nol di depan; batch/supplier/lokasi
  divalidasi oleh backend. Jangan mengubah label menjadi angka.
- Retry memakai ID operasi yang sama. Jangan menganggap timeout berarti gagal
  tersimpan atau menghapus transaksi pending untuk melewati error.
- Respons sesi lama tidak boleh menimpa login baru. Mode demo tidak boleh menulis
  ke produksi. Hak akses UI bukan pengganti otorisasi database.
- Impor memakai URL relatif/root yang konsisten tanpa versi query berbeda untuk
  modul yang sama. Hindari dependensi melingkar dan import kembali ke `app.js`.
- Ikuti `database/README.md`. Jangan menghapus wrapper SQL historis, mengedit
  migrasi terpasang untuk merapikan, atau menjalankan reset saat memasang audit.
  Bila membuat migrasi baru, uji pada fixture lokal dan catat urutan pemasangannya.
- Dependensi harus berupa versi pasti di manifest dan lockfile; jangan memasukkan
  link ke folder sementara di mesin pengembang.

## Validasi dan penyerahan

1. Reproduksi bug, buat perubahan terfokus, dan tambahkan tes regresi untuk perilaku
   yang berisiko. Jangan mengganti assertion hanya agar tes lulus.
2. Jalankan `npm run verify`. Untuk perubahan UI/alur, jalankan juga
   `npm run test:browser` setelah memasang Chromium Playwright.
3. Kegagalan menjalankan browser harus dilaporkan sebagai belum teruji, bukan lulus.
   Untuk navigasi, targetkan `#pos-navigation [data-view=...]` atau
   `.system-dock [data-view=...]` secara eksplisit. Kedua area berbagi tujuan menu;
   `nav [data-view=...]` bisa cocok dengan dua tombol. Jangan memakai `.first()`
   untuk menyembunyikan selector ambigu. Buka sidebar melalui helper tes sebelum
   menggunakan pilihan outlet yang tersembunyi saat sidebar ringkas.
   Buka panel `Meja, member & diskon` melalui `openCheckoutOptions` dari
   `tests/helpers/browser-checkout.mjs` sebelum mengisi field checkout opsional.
   Panggil lagi setelah checkout atau navigasi merender ulang halaman.
   Setelah `goto`/`reload`, tunggu form login atau shell aplikasi selesai tampil
   sebelum memeriksa sesi. `count()`/`isVisible()` langsung bukan penanda startup.
4. Perbarui peta modul/panduan bila kontrak berubah. Ringkas perubahan, hasil tes,
   serta batas verifikasi produksi/perangkat.
5. Jangan menyertakan `.git`, `.env*`, `node_modules`, `test-results`,
   `playwright-report`, atau `maniac-foto-*` dalam ZIP untuk dibagikan.

Panduan ini tidak mengizinkan reset database atau deployment produksi otomatis.

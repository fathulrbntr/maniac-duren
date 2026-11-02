# Maniac Duren

Website pelanggan (`/`), katalog menu (`/menu/`), dan POS (`/pos/`). Audit 089 merapikan kode, tampilan, pemeriksaan otomatis, dan dokumentasi di atas sumber ZIP yang diberikan.

## Mulai dari sini

| Kebutuhan | Buka |
|---|---|
| Memasang patch audit dan perintah Git | [Panduan patch 089](docs/PASANG-PATCH-089.md) |
| Mencari file untuk mengubah fitur | [Peta struktur proyek](docs/STRUKTUR-PROYEK.md) |
| Memahami alur operasional | [Alur pengguna](docs/ALUR-PENGGUNA.md) |
| Melihat temuan dan batas pengujian | [Hasil audit](docs/HASIL-AUDIT.md) |
| Memeriksa urutan fitur SQL | [Panduan database](database/README.md) |
| Mencari petunjuk patch terdahulu | [Arsip](docs/archive/) |

## Struktur utama

- `index.html`, `style.css`, `script.js`, `assets/`: halaman publik.
- `menu/`: katalog pelanggan, editor lokal, dan data menu.
- `pos/`: aplikasi POS dengan modul ES berdasarkan fitur.
- `api/`: endpoint server Vercel untuk konfigurasi, login, dan akun karyawan.
- `database/`: SQL dasar, patch fitur, dan pemeriksaan data.
- `tests/`, `scripts/`, `docs/`: pengujian, alat pengelolaan, dan panduan.

Tidak ada build frontend. Konfigurasi server Vercel memakai `POS_SUPABASE_URL`, `POS_SUPABASE_PUBLISHABLE_KEY`, dan `POS_SUPABASE_SERVICE_ROLE_KEY`. Kunci service role hanya berada di server; jangan masukkan ke kode browser. Editor menu tidak menyinkronkan data POS secara otomatis.

## Pengujian lokal

Diuji dengan Node.js 24.22.1. Instal dependensi dengan lockfile:

```bash
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

`npm test` menjalankan semua berkas `*.test.mjs`, termasuk SQL lokal. `npm run test:unit` dan `npm run test:db` menjalankan subset. `npm run test:browser` menyiapkan fixture sendiri lalu memeriksa alur dan tampilan melalui Chromium. Browser yang sudah terpasang dapat dipilih lewat `BROWSER_EXECUTABLE`. Hasil sementara disimpan di `test-results/`, yang tidak masuk Git/deployment.

Pengujian memakai PGlite dan respons jaringan lokal, tanpa kredensial produksi. Tidak menguji printer/timbangan fisik atau koneksi layanan eksternal.

## Mengelola berkas

`npm run project:tidy:check` menampilkan petunjuk lama yang akan diarsipkan. `npm run project:tidy` memindahkannya ke `docs/archive/`; jika isi tujuan berbeda, operasi dihentikan. Kode, SQL, dan foto tidak dihapus oleh perintah ini.

`npm run db:build` hanya membangun SQL fondasi historis. `database/pos.sql` belum mencakup seluruh patch fitur terbaru. Audit 089 tidak memerlukan SQL baru; jangan mengulang SQL dasar, reset, atau rollback pada database aktif untuk memasang audit ini.

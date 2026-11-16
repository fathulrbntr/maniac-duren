# Maniac Duren

Website pelanggan (`/`), katalog (`/menu/`), dan POS (`/pos/`). Versi audit 111, 16 November 2026, melanjutkan kode audit 110 dalam ZIP yang diberikan.

## Mulai dari sini

| Kebutuhan                                   | Panduan                                                         |
| ------------------------------------------- | --------------------------------------------------------------- |
| Memasang hasil audit ke proyek lama         | [PASANG-AUDIT-111.md](docs/PASANG-AUDIT-111.md)                 |
| Hasil audit, perubahan, dan batas pengujian | [HASIL-AUDIT.md](docs/HASIL-AUDIT.md)                           |
| Peta kode dan folder                        | [STRUKTUR-PROYEK.md](docs/STRUKTUR-PROYEK.md)                   |
| Aturan coding untuk pembaruan berikutnya    | [AGENTS.md](AGENTS.md), [PENGEMBANGAN.md](docs/PENGEMBANGAN.md) |
| Urutan database                             | [README database](database/README.md)                           |
| Instruksi patch terdahulu                   | [Arsip](docs/archive/)                                          |

## Pemeriksaan lokal

Gunakan Node.js 24 LTS atau Node.js >=22.13.0. Versi dependensi dikunci di `package-lock.json`.

```bash
npm ci
npm run verify
```

`verify` menjalankan pemeriksaan sintaks/aset, ESLint, format, unit test, simulasi UI, dan database PGlite. Semua memakai data fixture lokal. Untuk memeriksa perubahan format, gunakan `npm run format:check`; untuk merapikan, `npm run format`.

```bash
npx playwright install chromium
npm run test:browser
```

Browser suite mencakup halaman publik, kasir, laporan, dokumen, CRM, penerimaan, karyawan, tema/responsivitas, serta alur gudang. Gunakan `BROWSER_EXECUTABLE` bila memakai Chromium yang sudah terpasang. Hasil sementara berada di `test-results/` dan tidak ikut deployment. Kegagalan peluncuran browser berarti suite browser belum diuji, bukan lulus.

## Konfigurasi

Tidak ada build frontend. Vercel menggunakan `POS_SUPABASE_URL`, `POS_SUPABASE_PUBLISHABLE_KEY`, dan `POS_SUPABASE_SERVICE_ROLE_KEY`. Service role hanya dipakai endpoint server. Audit ini tidak memerlukan SQL baru atau reset database.

Foto katalog publik berada di `menu/images/`, dengan referensi di `menu/menu.json`. Editor menu menyimpan draf di browser dan mengekspor JSON; tidak otomatis menyinkronkan master POS.

`npm run db:build` hanya membangun fondasi historis SQL. Ikuti panduan database untuk memahami patch lanjutan. Jangan menjalankan fondasi atau script reset untuk memasang audit ini.

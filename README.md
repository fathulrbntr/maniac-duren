# Maniac Duren — hasil audit alur, update 07

Website customer di `/`, menu di `/menu/`, POS di `/pos/`.
Paket ini berdasarkan ZIP proyek yang dikirim, bukan versi website lama.

**Database yang sudah sampai update 06:** jalankan hanya `database/007-flow-audit.sql` dengan nama query **update_07_flow_audit**. Setelah berhasil, deploy kode paket ini. Jangan menjalankan ulang migration 001–006 atau `pos.sql` pada database aktif.

**Database baru/kosong:** gunakan `database/pos.sql`, lalu ikuti pendaftaran staff dan konfigurasi di `POS-SETUP.md`. File ini sudah mencakup update 01–07. Jangan menjalankan migration lama lagi sesudahnya.

- Panduan pemasangan: [UPDATE.md](UPDATE.md)
- Alur singkat pengguna: [docs/ALUR-PENGGUNA.md](docs/ALUR-PENGGUNA.md)
- Temuan, perbaikan dan batas pengujian: [docs/HASIL-AUDIT.md](docs/HASIL-AUDIT.md)

## Pengujian lokal

```bash
npm ci
npm test
npm run test:db
npx playwright install chromium
npm run test:browser
```

Uji database menggunakan PostgreSQL lokal dalam PGlite dengan fixture autentikasi. Tidak menyambung database operasional. Uji browser memakai server lokal dan mode demo. Untuk browser yang sudah tersedia, gunakan environment variable `BROWSER_EXECUTABLE`.

`npm run db:build` membangun ulang instalasi baru dari arsip awal dan migration bernomor. Ubah SQL melalui migration baru; jangan mengedit hasil generate saja.

Tidak ada build frontend yang diperlukan. Dependensi pengujian, SQL, arsip dan dokumentasi dikecualikan dari deployment melalui `.vercelignore`.

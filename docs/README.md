# Maniac Duren — hasil audit alur, update 08

Website customer di `/`, menu di `/menu/`, POS di `/pos/`.
Paket ini berdasarkan ZIP proyek yang dikirim, bukan versi website lama.

**Database baru/kosong:** gunakan `database/pos.sql`. Struktur sumber SQL dikelompokkan di `database/sections/`; jangan menjalankan bagian-bagiannya satu per satu.

**Database produksi yang sudah berjalan:** gunakan migration perubahan terbaru yang memang belum terpasang. Jangan mengulang `database/pos.sql` pada database aktif.

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

`npm run db:build` membangun ulang instalasi baru dari bagian bernama di `database/sections/`. Ubah bagian sumbernya, lalu bangun ulang `database/pos.sql`.

Tidak ada build frontend yang diperlukan. Dependensi pengujian, SQL, arsip dan dokumentasi dikecualikan dari deployment melalui `.vercelignore`.

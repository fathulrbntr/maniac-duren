# Maniac Duren

Website customer: `/`. Menu: `/menu/`. Operasional dan kasir: `/pos/`.

Panduan update terbaru: **[PATCH-028.md](PATCH-028.md)**. PWA memakai database lokal IndexedDB untuk antrean penjualan dan sinkronisasi ke Supabase. Data operasional lama tetap disimpan.

Database yang sudah berjalan sampai migration 020: jalankan `database/migrations/021-offline-pos.sql` sekali. Database kosong: `database/pos.sql`. Jangan jalankan reset atau instalasi baru pada database aktif.

## Pengembangan

Frontend tidak memerlukan bundler. Setelah mengubah aset POS, jalankan `npm run pwa:build` agar service worker memakai versi aset baru. Setelah mengubah SQL sumber, jalankan `npm run db:build`.

```bash
npm ci
npm run test:unit
npm run test:db
npm run test:offline
npm run test:receipts
npm run test:employees
npx playwright install chromium
npm run test:browser
npm run test:offline:browser
```

Uji memakai fixture lokal dan PGlite, tidak mengubah database operasional. Jika Chromium sudah tersedia, isi `BROWSER_EXECUTABLE` dengan lokasi executable.

`database/sections/` adalah sumber SQL. `database/pos.sql` adalah hasil build untuk instalasi baru. Migration diperlukan untuk database aktif. File tersebut mempunyai tujuan berbeda; jangan menghapus definisi wrapper versi lama karena fungsi aktif masih memanggilnya.

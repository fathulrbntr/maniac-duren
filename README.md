# Maniac Duren

Website pelanggan: `/`. Katalog: `/menu/`. Operasional: `/pos/`.

Pembaruan terbaru: `UPDATE-029.md`.
Frontend HTML/CSS/JavaScript modular; Supabase menyimpan data operasional.
Kasir versi ini memerlukan koneksi internet. Modul antrean offline tersedia dalam sumber, tetapi belum diintegrasikan dengan sesi dan layar kasir.

## Pengembangan

```bash
npm ci
npm run test:unit
npm run test:kitchen
npm run test:batches
npm run test:receipts
npm run test:offline
npm run test:offline:db
npm run db:build
npm run pwa:build
```

`database/sections/` sumber SQL; `database/pos.sql` untuk instalasi baru saja.
Database aktif yang sudah memiliki batch tracking: jalankan `database/migrations/022-offline-batch-compat.sql` tanpa reset.
Jangan menghapus wrapper fungsi versi lama. Jangan menjalankan ulang migration offline 021 setelah batch tracking.

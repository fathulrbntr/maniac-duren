# Update 018 — Sinkronisasi master resep & produksi bahan

- Master Resep memakai kartu dan toolbar yang konsisten dengan UI Stok.
- Setiap resep menampilkan hasil per batch, rincian bahan, versi, dan status kesiapan berdasarkan stok store aktif.
- Produksi bahan memakai alur yang sama: pilih resep, cek stok otomatis, simpan bahan keluar dan hasil masuk stok.
- Riwayat produksi memakai kartu, pencarian, filter aktif/dibatalkan, dan tombol pembatalan yang sudah ada.
- Navigasi cepat tersedia antara Master Resep, Produksi bahan, dan Stok.
- Form transaksi, endpoint, idempotensi, dan skema database tidak diubah.

Verifikasi:

- `node --check pos/production-ui.mjs`
- `npm test`
- `BROWSER_EXECUTABLE=... node tests/browser.mjs`

## Git

```bash
git add pos/production-ui.mjs pos/app.js pos/pos.css UPDATE-018.md
git commit -m "Sync recipe master and material production UI"
git push origin main
```

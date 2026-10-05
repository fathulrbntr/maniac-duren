# Update 017 — penyelarasan UI dan mode Light/Dark

Patch ini menimpa file yang sudah ada dari ZIP sebelumnya. Tidak menambah nama file project baru.

Perubahan:

- Halaman karyawan, laporan, master data, waste, produksi, resep, supplier, store, dan halaman operasional lain memakai warna, radius, border, panel, tombol, tabel, status, dan spacing yang selaras dengan Kasir, Stock, dan Kitchen.
- Palet utama memakai aksen hijau Maniac Duren, surface terang, teks hijau gelap, dan status hijau/kuning/merah yang konsisten.
- Tambah tombol Light/Dark pada login dan header POS.
- Tema mengikuti preferensi sistem saat pertama kali membuka POS.
- Pilihan tema tersimpan di browser dan tetap aktif setelah refresh.
- Theme preference antar-tab ikut tersinkron.
- Tema tidak menghapus input form atau draft pesanan ketika diganti.
- Layout diuji pada desktop dan mobile tanpa horizontal overflow.
- Blank-screen guard tetap tersedia pada bootstrap POS jika modul gagal dimuat.

Tidak ada migration SQL baru.

Validasi:

```bash
npm ci
npm test
npm run test:browser
```

Browser test memerlukan Chromium Playwright atau `BROWSER_EXECUTABLE` yang mengarah ke Chromium.

```bash
git add pos/app.js pos/index.html pos/pos.css pos/inventory.css pos/catalog-table.css pos/employees.css pos/operations-ui.mjs tests/browser.mjs UPDATE-017.md
 git commit -m "Align POS UI and add light dark themes"
git push
```

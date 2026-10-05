# Update 014 — Tampilan Stock & Product

Pasang setelah Update 013. Ekstrak ZIP ke folder utama proyek dan pilih Replace. Tidak ada migration SQL; tidak perlu mengubah Supabase.

- Tema gelap dengan aksen hijau, panel filter kiri, kartu produk horizontal dan foto mengikuti referensi.
- Pilihan daftar / grid, pencarian nama/SKU/barcode/varian, filter jenis item, kategori, ketersediaan, kedaluwarsa, rentang harga jual, serta urutan nama/harga.
- Product: foto, nama, SKU, varian, stok fisik, jenis item, harga jual dan harga beli referensi; tombol tiga titik membuka edit produk.
- Stock: stok fisik dan stok tersedia setelah cadangan, tanggal, kondisi buah serta kedaluwarsa. Menu resep tidak ditampilkan sebagai barang fisik.
- Tombol panah pada Stock membuka detail lot/penerimaan dan asal supplier. Rincian penerimaan lengkap serta riwayat tetap dapat dibuka di bawah daftar.
- Tombol tambah produk, barang masuk dan transfer tetap memakai form serta validasi yang sudah ada.
- Stok siap pakai bukan batas stok minimum. Belum tersedia berarti tidak tersedia untuk dipakai/dijual saat ini. Tidak menambahkan status aktif/draft atau harga grosir yang belum ada di data proyek.
- Harga minimum/maksimum untuk buah menggunakan harga per kg; produk lainnya memakai harga jual per satuan. Bahan internal tidak masuk hasil filter harga jual.
- Filter tidak mengubah data. Tema diterapkan hanya pada halaman Stock dan Product. Alur pembayaran, kitchen, stok dan database tetap sama.

Validasi: npm test lolos; pemeriksaan Chromium dengan data simulasi desktop/mobile, pencarian barcode, filter, daftar/grid, edit/tambah produk, detail lot dan dialog barang masuk lolos tanpa error JavaScript. Tampilan telah diperiksa pada screenshot. Belum dideploy ke produksi.

Setelah push, tunggu deploy Vercel selesai lalu tekan Ctrl + Shift + R.

```bash
git status
git add pos/app.js pos/index.html pos/catalog-ui.mjs pos/inventory-ui.mjs pos/inventory.css UPDATE-014.md
git commit -m "style: redesign stock and product inventory UI"
git push
```

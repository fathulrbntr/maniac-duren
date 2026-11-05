# Patch 095 — UI dan urutan kerja Maniac Duren

Patch ini merapikan tampilan POS yang sudah ada: navigasi, penerimaan, kasir, kitchen, laporan, master barang, dialog, serta komponen bersama pada halaman lainnya.

## Dasar pemasangan

- Dibuat dari sistem sampai patch 093. Patch 094 tidak perlu dipasang terlebih dahulu; pengelompokan menu sudah disertakan di sini.
- ZIP berisi file yang berubah dan font pendukung, bukan seluruh proyek.
- Tidak ada SQL atau migrasi database baru. Database tetap memerlukan pembaruan sebelumnya yang sudah digunakan sistem Anda.
- Belum diterapkan ke website produksi. Pasang file dan push ke repository proyek Anda untuk menjalankan proses deployment yang biasa digunakan.

## Urutan menu

| Bagian | Isi |
| --- | --- |
| Ringkasan | Dashboard |
| 01 · Gudang & Penerimaan | Stok & Penerimaan, Master Barang, Supplier |
| 02 · Pelayanan & Kasir | Shift Kasir, Kasir / POS |
| 03 · Kitchen | Kitchen Display, Produksi & Persiapan, Master Resep |
| 04 · Laporan & Administrasi | Laporan, Admin Dokumen |
| Tukang Potong | Reject & Waste |
| Pengelolaan | Member, Diskon, Karyawan, Outlet |
| Pengaturan | Metode Pembayaran, Printer & Scanner |
| Karyawan & Panduan | Absensi, Panduan |

Menu tetap mengikuti hak akses karyawan. Navigasi urutan kerja di bagian atas juga mengikuti izin pengguna.

## Perubahan tampilan

- Satu keluarga font Open Sans, disertakan dalam proyek agar tidak bergantung pada layanan font eksternal.
- Skala huruf tetap: isi 14 px, label 13 px, judul halaman 24 px. Pada ponsel, judul 22 px dan kolom input 16 px agar mudah dibaca.
- Tombol/form utama tinggi 44 px; tombol pembayaran 48 px. Kontrol ringkas, seperti tambah/kurang jumlah, menggunakan ukuran tersendiri yang konsisten.
- Warna hijau, warna netral, garis, kartu, ikon, dan status diselaraskan pada mode terang maupun gelap.
- Popup memiliki jarak kolom yang konsisten, tombol tutup 44 × 44 px, dan tombol tindakan yang tetap terjangkau ketika form digulir.
- Kartu produk menggunakan ukuran huruf tetap. Pada kartu yang sempit, tombol dipindah ke baris tersendiri agar angka harga tidak terpotong.
- Filter stok/master tetap di kiri pada desktop. Pilihan tampilan tiga dan enam kartu tetap tersedia; tampilan enam kartu menggunakan gulir horizontal di area hasil jika layar tidak cukup lebar.
- Pada ponsel, menu menjadi sidebar, form menyesuaikan lebar layar, dan tabel lebar digulir di dalam area tabel.

## Alur pada layar

1. **Penerimaan barang:** identitas pengiriman → rincian nota dan catatan timbang aktual per produk → periksa modal → selesaikan penerimaan.
2. **Kasir:** buka shift → scan barcode durian → tambahkan pesanan lain → periksa meja, catatan, dan total → bayar.
3. **Kitchen:** pesanan menu yang memerlukan proses kitchen mengikuti mekanisme setelah pembayaran yang sudah ada; tampil dalam kelompok statusnya.
4. **Laporan:** akses penjualan dan pergerakan stok melalui kelompok Laporan & Administrasi.

### Batas perubahan

Patch ini mengatur UI dan penyajian alur yang sudah tersedia. Penerimaan masih menggunakan input berat dan butir secara manual pada form timbang. Scan barcode satu per satu untuk penerimaan, pencocokan kg/butir aktual dengan nota, dan pelacakan khusus waiter untuk pengantaran durian ke meja belum ditambahkan dalam patch ini. Scan barcode pada kasir menggunakan fungsi yang sudah ada.

## Cara memasang

1. Simpan perubahan lokal Anda terlebih dahulu, misalnya dengan commit. Buat cadangan proyek bila diperlukan.
2. Ekstrak ZIP ke folder utama proyek Maniac Duren, yaitu folder yang berisi `pos`, `scripts`, dan `tests`.
3. Izinkan penimpaan file yang sama. Pastikan tidak terbentuk folder proyek bertingkat di dalam proyek.
4. Jalankan pemeriksaan ini dari terminal di folder utama proyek:

```bash
node scripts/check-project.mjs
node --test tests/sidebar.test.mjs tests/cashier-ui.test.mjs tests/product-dialog-ui.test.mjs tests/receipt-shipment.test.mjs
```

5. Periksa perubahan dan simpan ke Git:

```bash
git status --short
git add --pathspec-from-file=PATCH-095-FILES.txt
git diff --cached --stat
git commit -m "Unify POS interface and operational navigation"
git push origin main
```

Perintah staging hanya memasukkan path yang tercantum dalam patch. Jika sudah ada file lain yang masuk staging sebelum langkah ini, file tersebut tetap masuk commit; periksa keluaran `git diff --cached --stat`.

6. Setelah deployment selesai, lakukan refresh penuh (Ctrl + Shift + R). Buka Stok & Penerimaan, Kasir / POS, Kitchen, dan Laporan untuk memeriksa tampilan pada outlet Anda.

## Pemeriksaan yang dilakukan

- Membuka 20 halaman melalui navigasi pada preview desktop dan ponsel menggunakan data contoh terisolasi. Tidak ditemukan overflow horizontal pada halaman utama saat pemeriksaan tersebut.
- Memeriksa tampilan mode terang dan gelap, dialog penerimaan, popup produk, tombol, kartu, serta harga pada kartu sempit.
- Pemeriksaan proyek lulus: sintaks, import/aset lokal, identitas modul, menu/stylesheet duplikat, dan konsistensi berkas SQL hasil build.
- Pengujian yang lulus mencakup sidebar/hak akses, kasir/pembayaran, dialog penjualan buah, produk/varian, penerimaan multiproduk, laporan, dashboard/stok, navigasi, serta isolasi mode demo.
- Pengujian integrasi database `receipt-weighing.test.mjs` tidak dijalankan sampai selesai karena dependensi `@electric-sql/pglite` tidak tersedia di lingkungan pemeriksaan. Tidak ada perubahan SQL pada patch ini.
- Preview menggunakan data contoh, bukan database produksi atau perangkat timbangan, scanner, dan printer di outlet.


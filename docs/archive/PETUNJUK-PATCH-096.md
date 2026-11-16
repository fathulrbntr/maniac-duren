# Patch 096 — UI charcoal dengan aksen hijau

Dibuat dari `maniac-duren(9).zip` yang Anda kirim. ZIP patch hanya berisi file yang berubah; ekstrak ke folder utama proyek yang berisi folder `pos`, `scripts`, dan `tests`.

## Tampilan baru

- Tema charcoal netral dengan aksen hijau pada tombol utama, menu aktif, grafik, dan indikator.
- Sidebar ringkas dengan pengelompokan divisi dan hak akses yang sudah ada. Dock sistem tetap tersedia.
- Font lokal Open Sans, ukuran kontrol, warna panel, garis, dan jarak antarkomponen selaras.
- Dashboard: enam kartu ringkasan pada desktop lebar, grafik garis omzet, lima produk teratas, komposisi pembayaran, ketersediaan produk, rincian keuangan, dan enam transaksi lunas terbaru.
- Seluruh ringkasan transaksi memakai sumber laporan yang sama dan mengikuti filter outlet/periode. Ketersediaan produk dan nilai aset adalah posisi stok saat ini. Panel keuangan/stok mengikuti hak akses akun.
- Filter kategori dan pengurutan pada tab stok dashboard dihubungkan ke fungsi data yang sudah tersedia. Kondisi kosong ditampilkan sesuai kategori yang dipilih.
- Pada ponsel, kartu menjadi dua kolom, panel bertumpuk, sidebar dapat dibuka/tutup, dan tabel digulir di dalam panel.

Tema gelap menjadi default jika browser belum memiliki pilihan tema. Pilihan tema yang sudah tersimpan tetap dihormati. Jika tampilan masih terang, klik ikon matahari/bulan di kanan atas untuk beralih. Mode terang tetap tersedia.

## Pemasangan

1. Simpan pekerjaan lokal sebelum menimpa file, misalnya dengan commit.
2. Ekstrak isi ZIP ke folder utama proyek dan izinkan penimpaan file yang sama. Jangan membuat folder proyek bertingkat.
3. Buka terminal di folder utama proyek. Perintah berikut dapat dipakai di Git Bash maupun PowerShell:

```bash
node scripts/check-project.mjs
node --test tests/dashboard-reference.test.mjs tests/dashboard.test.mjs tests/dashboard-stock.test.mjs tests/dashboard-app.test.mjs tests/dashboard-report.test.mjs tests/sidebar.test.mjs tests/cashier-ui.test.mjs tests/product-dialog-ui.test.mjs tests/receipt-shipment.test.mjs
```

4. Jika pemeriksaan lulus, periksa perubahan lalu commit dan push:

```bash
git status --short
git add --pathspec-from-file=PATCH-096-FILES.txt
git diff --cached --stat
git commit -m "Refresh Maniac Duren UI with charcoal and green theme"
git push origin main
```

Daftar staging dibatasi pada file patch. File lain yang sudah berada di staging sebelumnya tetap ada; periksa `git diff --cached --stat` sebelum commit.

5. Setelah deployment selesai, lakukan refresh penuh dengan **Ctrl + Shift + R**. Periksa dashboard, master barang, stok, kasir, kitchen, dan laporan.

Tidak ada SQL atau migrasi database baru. Alur pembayaran, pemotongan stok, penerimaan, dan kitchen tetap menggunakan implementasi yang sudah ada. Patch belum dipasang ke website produksi.

## Hasil pemeriksaan

- **26 pengujian lulus**: sumber data dashboard, outlet/periode, izin tampilan, transaksi gratis/batal, kondisi kosong, demo, cetak laporan, filter stok, sidebar, kasir, varian produk, serta penerimaan multiproduk.
- Pemeriksaan proyek lulus: sintaks, aset/import lokal, identitas modul, menu/stylesheet duplikat, dan konsistensi SQL hasil build.
- Preview browser menggunakan data contoh terisolasi; tidak mengakses database produksi.
- Dashboard, master barang, stok/penerimaan, kasir, kitchen, laporan, dokumen, dan karyawan diperiksa pada desktop dan bingkai ponsel 390 px. Tidak ditemukan pelebaran halaman horizontal pada halaman yang diperiksa.
- Popup tambah barang tidak melampaui lebar dialog di desktop maupun ponsel. Mode terang, mode gelap, menu ponsel, dan filter stok juga diperiksa.
- Koneksi database produksi serta perangkat scanner, timbangan, dan printer fisik tidak diuji pada perubahan tampilan ini.

Data contoh dan alat preview tidak disertakan dalam patch.

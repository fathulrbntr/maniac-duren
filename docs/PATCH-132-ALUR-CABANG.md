# Patch 132 · Penerimaan supplier dan mutasi antarcabang

## Cara kerja

1. Di **Back Office → Nota supplier**, pilih cabang penerima, supplier, nomor nota dan barang. Masukkan nilai pembelian, jumlah pada nota dan ongkir.
2. Di cabang yang dipilih, buka **Stok & Penerimaan → Terima dari supplier**. Pilih nota, timbang dan scan label setiap buah. Untuk barang nonbuah, masukkan jumlah aktual per jenis. Selesaikan penerimaan untuk menambah stok cabang.
3. Di **Back Office → Transfer Stok**, pilih **Buat pengiriman** lalu tentukan lokasi asal, toko tujuan, dan nama karyawan pengirim. Cari barang dengan nama atau SKU, lalu scan setiap buah atau isi jumlah barang satuan. Gunakan **Tambah barang** untuk mencampur beberapa SKU dalam satu surat jalan. Form menampilkan stok tersedia di cabang asal dan mengalokasikan barang satuan dari batch terlama (FIFO). Kirim dan cetak surat jalan. Barang keluar dari stok tersedia dan tercatat dalam perjalanan.
4. Di cabang tujuan, buka **Terima dari cabang**. Sejak patch 136, pindai ulang setiap barcode buah pada surat jalan. Untuk barang satuan, isi jumlah fisik per batch. Kiriman tetap dalam perjalanan sampai semua barcode cocok, jumlah barang satuan sesuai, dan cabang tujuan mengonfirmasi penerimaan.

Contoh: Cikarang menerima 100 buah dari supplier dan mengirim 30 ke Harapan Indah. Saat dikirim, Cikarang memiliki 70 buah tersedia dan 30 dalam perjalanan. Sesudah konfirmasi, Harapan Indah memiliki 30 buah tersedia. Mutasi mempunyai satu surat jalan, tagihan Rp0, dan mempertahankan supplier, batch asal serta modal barang. Nota pembelian awal tetap terkait dengan cabang penerima.

Pembayaran nota supplier dan ongkir untuk penerimaan baru menggunakan saldo PT Retail. Dokumen distribusi lama dapat ditelusuri dan diselesaikan. Bila masih ada stok gudang lama, Back Office memilih gudang sebagai lokasi asal di **Transfer Stok**. Pilih tujuan sesuai lokasi fisik barang. Riwayat dan saldo lama tetap dapat ditelusuri.

## Pemasangan setelah patch 131

1. Ekstrak isi ZIP ke folder proyek Maniac Duren.
2. Terapkan `database/branch-stock-132.sql` di Supabase SQL Editor, atau jalankan migrasi bernama `20261127090000_branch_stock_132.sql` melalui alur migrasi proyek. Pilih salah satu. Migrasi dapat dijalankan ulang dan tidak memerlukan reset data.
3. Untuk memeriksa, melakukan commit, lalu push perubahan aplikasi dari PowerShell, jalankan `.\scripts\windows\push-patch-132.cmd` dari folder proyek. Skrip memerlukan dependensi proyek dan Chromium untuk pengujian browser.
4. Setelah versi aplikasi terbit, muat ulang POS. Petugas penerima supplier memerlukan akses stok pada cabangnya. Setelah memasang pembaruan 133, admin Back Office atau owner menerbitkan transfer dan petugas penerima mengonfirmasi di cabang tujuan.

Uji database dan tampilan khusus alur ini tersedia di `tests/branch-stock-db.test.mjs` dan `tests/branch-stock-ui.test.mjs`. Jalankan seluruh pemeriksaan dengan `npm run verify` dan `npm run test:browser`.

# Struktur SQL Maniac Duren

`pos.sql` adalah satu-satunya file yang dijalankan untuk database Supabase baru.
Isinya dibangun dari `sections/` sesuai kelompok fitur:

- `base.sql`: tabel inti POS dan keamanan dasar
- `master-contact.sql`: store, supplier, dan akses staff
- `product-catalog.sql`: produk, kategori, satuan, dan harga
- `recipes-production.sql`: resep, bahan baku, dan produksi
- `product-details.sql`: detail produk dan penyesuaian stok
- `waste-processing.sql`: waste dan hasil olahan
- `waste-evidence.sql`: bukti foto dan riwayat waste
- `flow-audit.sql`: pembacaan riwayat dan audit alur
- `waste-output-proof.sql`: bukti per hasil olahan serta nama pengolah
- `operations/`: order-stock-kitchen, pay-first, kitchen, dan akun karyawan

File di `sections/` adalah sumber build, bukan query yang ditempel satu per satu
ke Supabase. Jalankan `npm run db:build` setelah mengubah bagian yang relevan.

Untuk database produksi yang sudah berjalan, jangan mengulang `pos.sql` tanpa backup.
Perubahan aplikasi dikelola dari sumber `sections/operations/` lalu `pos.sql` dibangun ulang.

## Kontak darurat dan rekening karyawan (070)

Untuk database aktif, jalankan seluruh `database/employee-details-070.sql` satu kali
di Supabase SQL Editor, lalu perbarui halaman POS. Aman dijalankan ulang tanpa reset.
Form Tambah/Edit karyawan dan Detail & rekap menampilkan nama serta nomor kontak
darurat, nama bank, nama pemilik rekening, dan nomor rekening. Semua kolom opsional.
Nomor rekening disimpan sebagai teks agar nol di depan tidak hilang.
Untuk instalasi baru, jalankan patch ini setelah `pos.sql` dan patch fitur sebelumnya.

## Laporan dan Admin Dokumen (071)

Database aktif: jalankan seluruh `database/reports-admin-071.sql` melalui SQL Editor.
Patch memerlukan profil toko 064 dan aman dijalankan ulang. Tidak menghapus data,
tidak mengulang instalasi `pos.sql`, dan tidak mengubah penjualan/penerimaan lama.
Patch 070 tetap disertakan untuk kontak darurat/rekening karyawan bila belum dipasang.

Satu menu Laporan menggantikan pintu masuk laporan terpisah. Sumber laporan adalah
penjualan lunas, penerimaan, jurnal stok, biaya dan pengeluaran; dokumen admin
bukan sumber omzet atau stok tambahan. Laporan batch lama tetap tersedia sebagai tab.

Admin Dokumen menyimpan draft, nomor otomatis saat terbit, salinan kop surat,
baris transaksi, versi dan riwayat. Penomoran memakai `MD/JENIS/YYYYMM/000001`
dengan penghitung database yang dikunci per transaksi. Nomor batal tidak dipakai ulang.
PO dapat dipenuhi beberapa pembelian sampai jumlah pesanan habis. Pembelian baru
menggunakan penerimaan yang sudah ada dalam satu transaksi atomik, dengan ongkir
satu kiriman dibagi menurut nilai barang. Dokumen dari penerimaan lama tidak menambah
stok lagi. Invoice dan DO penjualan memakai transaksi POS yang sudah lunas.
DO transfer baru mendukung buah kg/butir dan stok satuan; dua sisi stok dijurnal.
Transfer bahan diblokir saat ada antrean lunas di toko asal untuk menjaga cadangan.
Dokumen pembelian dan transfer baru yang sudah diposting tidak dapat dibatalkan
sebagai jalan pintas menghapus stok; koreksi fisik memakai alur stok yang tersedia.

Akses memakai permission yang sudah ada: `reports`, `trace`, `finance`, `stock`,
dan pembatasan toko. PO/pembelian/invoice memerlukan finance; penerimaan pembelian
juga memerlukan stock. DO memerlukan stock, dan DO penjualan memerlukan akses
penjualan/reports. Kop surat hanya dapat diubah owner. DO tidak menyimpan harga.

Ekspor XLSX dibuat lokal tanpa CDN dan menyimpan masukan teks sebagai teks, bukan
formula. PDF menggunakan cetakan A4 dengan tujuan Simpan sebagai PDF. Batch memakai
filter tanggal penerimaan dan riwayat sepanjang umur batch; laporan lain memakai
periode transaksi. Semua toko berarti semua toko yang diizinkan untuk akun tersebut.

Validasi fitur: `node --test tests/reports.test.mjs tests/sidebar.test.mjs tests/retry.test.mjs`
dan `node tests/reports-admin-sql.test.mjs`. Uji SQL memakai PGlite lokal, bukan database
produksi. Jalankan uji SQL dahulu lalu `node tests/reports-admin-browser.mjs` dan
`node tests/reports-app-smoke.mjs`; sesuaikan BROWSER_EXECUTABLE jika diperlukan.
Tes login-startup lama mengharapkan posLoginTiming yang tidak ada pada baseline 070;
tes itu sudah gagal pada baseline. Startup aktual diverifikasi oleh browser smoke test.

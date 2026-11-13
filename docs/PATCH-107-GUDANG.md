# Patch 107 — Gudang PT. Altara Rasa Nusantara

Pembaruan berdasarkan arsip `maniac-duren.zip` yang dikirim pada percakapan ini. Paket patch hanya berisi file baru dan file yang berubah. Tidak berisi database produksi, kredensial, `node_modules`, atau direktori Git.

## Koreksi SQL 107 — 13 November 2026

SQL versi awal melewatkan `waste` pada constraint jenis lot. Sistem lama memakai jenis ini untuk hasil olahan reject, termasuk riwayat dengan stok nol. Versi ini mengizinkan `purchase`, `opening`, `production`, `waste`, dan `transfer`; tidak mengubah jenis, jumlah, atau riwayat lot.

Jika pemasangan sebelumnya berhenti dengan `23514` pada `md_pos_unit_lots_kind_check`, timpa file `database/warehouse-flow-107.sql` dengan versi ini lalu jalankan **seluruh isi file** di SQL Editor. Jangan menjalankan kembali salinan SQL 107 versi lama. Tidak perlu menghapus stok atau mengganti jenis `waste` menjadi jenis lain. Tes regresi memuat lot historis sebelum migrasi dan memeriksa produksi olahan reject setelah migrasi.

## Keputusan alur

- Admin menetapkan harga transfer khusus, terpisah dari modal supplier dan harga jual pelanggan.
- Modal persediaan toko mengikuti nilai invoice transfer. Modal supplier tetap tersimpan dan laporan batch pusat mengikuti asal barang.
- Penerimaan toko harus lengkap. Scan boleh dicicil dan tersimpan di server, tetapi seluruh kiriman tetap dalam perjalanan sampai konfirmasi lengkap.
- Satu barcode tracking 26 digit mewakili satu buah. Identitas, supplier, batch asal, berat label, lokasi, dan status mengikuti buah tersebut.

## Pembagian area dan role

| Area / role | Pekerjaan |
| --- | --- |
| Owner | Seluruh area, karyawan dan akun, pengaturan pembayaran/diskon |
| Admin Back Office | Nota supplier dan modal, harga jual dan harga transfer, master, laporan, invoice, surat jalan, pencatatan pelunasan |
| Gudang | Memilih nota admin, scan penerimaan, stok gudang, reject, scan pengiriman, cetak dokumen |
| Manager Toko | Operasional toko sesuai penugasan; harga master dan keuangan pusat dikunci |
| Kasir | Buka/tutup kasir, penerimaan kiriman lengkap, scan penjualan, pembayaran dan struk |
| Waitress | Nomor meja, status pesanan yang sudah dibayar, menandai pesanan siap yang sudah diantar |
| Kitchen | Antrean pesanan setelah pembayaran, produksi dan reject sesuai akses |
| Tukang Potong | Scan pemeriksaan buah dan nomor meja, reject, jejak buah; pembayaran dilakukan kasir |
| Staff | Absensi; akses operasional mengikuti penugasan owner |

Admin memiliki cakupan semua lokasi. Role lain dibatasi daftar lokasi karyawan. Pengelolaan karyawan tetap khusus owner. Manager lama sekarang dianggap Manager Toko: jika petugas tersebut sebenarnya admin pusat, owner perlu mengganti role ke Admin Back Office.

## Alur harian

1. Back office → Master Barang: pastikan kode PLU, satuan, harga jual, dan pemetaan produk benar.
2. Back office → Harga Transfer: atur harga untuk setiap produk yang akan dikirim, per kg/butir atau satuan produk.
3. Back office → Nota Supplier: pilih supplier, nomor nota, tanggal penerimaan, total biaya masing-masing produk dan ongkir bersama. Nota ini untuk durian utuh.
4. Gudang → Nota Supplier → Scan penerimaan: pilih nota, scan label setiap buah, periksa total, lalu selesaikan penerimaan. Modal dan produk dari nota tidak dapat diubah petugas gudang.
5. Gudang → Pengiriman & Tagihan: pilih toko dan pengantar, scan buah dari batch mana pun yang tersedia di gudang. Supplier/batch diambil dari barcode, bukan dipilih bebas. Untuk bahan/produk satuan, pilih lot dan jumlah.
6. Terbitkan invoice dan kiriman. Stok gudang berkurang, status buah menjadi Dalam perjalanan, stok toko tetap. Buka kiriman untuk mencetak invoice dan surat jalan A4 atau menyimpan PDF lewat dialog cetak browser.
7. Toko → Penerimaan Kiriman: cari nomor surat jalan/invoice, buka kiriman, scan ulang setiap buah. Barcode yang tidak tercantum ditolak. Bahan satuan diperiksa berdasarkan jumlah fisik.
8. Konfirmasi hanya setelah semua barcode dan jumlah sesuai. Seluruh kiriman masuk stok toko sekaligus. Kasir bisa menjual barcode yang sudah diterima.
9. Back office mencatat pembayaran invoice berdasarkan nominal dan referensi pembayaran. Ini pencatatan tagihan internal, bukan integrasi transfer bank dan bukan faktur pajak.

Barang satuan/bahan masuk melalui menu stok gudang oleh admin; toko tidak mengisi modal. Nota supplier berpemandu scan digunakan untuk buah. Harga jual ditetapkan secara global pada Master Barang. Harga transfer yang berubah tidak mengubah invoice yang telah terbit.

## Tracking dan laporan

Contoh penerimaan 100 kg, transfer 20 kg, reject 10 kg:

| Posisi | Sebelum kiriman diterima | Setelah diterima lengkap |
| --- | ---: | ---: |
| Gudang — siap | 70 kg | 70 kg |
| Gudang — reject | 10 kg | 10 kg |
| Dalam perjalanan ke toko | 20 kg | 0 kg |
| Toko — siap | 0 kg | 20 kg |
| Total berat buah asal | 100 kg | 100 kg |

Laporan → Batch Supplier → Telusuri menampilkan lokasi/status, jejak per buah, stok turunan, dan transaksi. Excel/PDF laporan memakai data lokasi yang sama. Berat pada tabel barcode adalah berat label asal. Buah yang sudah diolah berstatus Diolah; berat hasil olahan dan penyusutannya dijelaskan pada bagian stok turunan/proses, bukan dihitung lagi sebagai buah siap.

Modal terjual toko mengikuti transfer; laporan batch pusat mengatribusikan modal supplier sepanjang rantai olahan dan transfer. Transfer internal tidak dihitung sebagai penjualan retail pelanggan. Laporan posisi memerlukan akun pusat untuk melihat seluruh lokasi; akun toko menampilkan cakupan yang diizinkan.

## Pemasangan

1. Simpan salinan kode yang sedang digunakan dan cadangan database sesuai prosedur Anda. Pilih waktu di luar aktivitas kasir/gudang.
2. Ekstrak isi ZIP patch ke **root proyek** yang memiliki `package.json`, `pos/`, `api/`, dan `database/`. Timpa file sesuai foldernya. Jangan mengekstrak ke dalam `pos/`.
3. Jalankan pemeriksaan dari root proyek:

```powershell
npm ci
npm test
npm run check
```

4. Pastikan database sebelumnya sudah memakai rangkaian fitur sampai `fruit-batch-strict-scan-106.sql`. Di Supabase SQL Editor, jalankan **hanya** file `database/warehouse-flow-107.sql` dari patch ini. File ini menambah struktur dan aturan tanpa menghapus data transaksi. Jika prasyarat belum tersedia, SQL berhenti; pasang prasyarat yang belum ada, jangan menjalankan reset.
5. Unggah kode API dan POS bersama. Dengan Git, setelah memeriksa `git status --short` dan memastikan tidak ada perubahan lain yang ikut terunggah:

```powershell
git status --short
git add api/pos-employee.js package.json pos/app.js pos/batch-report-ui.mjs pos/batch-report.mjs pos/documents-ui.mjs pos/employees-ui.mjs pos/index.html pos/inventory-ui.mjs pos/navigation.mjs pos/receipt-weighing.mjs pos/reports.mjs pos/retry.mjs pos/scale-label.mjs pos/stock-demo.mjs pos/system-dock.mjs pos/warehouse-flow.mjs pos/warehouse-ui.mjs pos/warehouse.css pos/workspaces.mjs database/warehouse-flow-107.sql scripts/test.mjs tests/employees-attendance.test.mjs tests/pos-category-errors.test.mjs tests/stock-demo-isolation.test.mjs tests/helpers/warehouse-db.mjs tests/warehouse-flow-db.test.mjs tests/warehouse-legacy-kinds-db.test.mjs tests/warehouse-flow-ui.test.mjs tests/warehouse-browser.mjs docs/PATCH-107-GUDANG.md docs/AUDIT-107.md
git commit -m "Add central warehouse, barcode shipment receiving and transfer invoices"
git push origin main
```

Gunakan branch deployment yang benar bila proyek Anda tidak memakai `main`. Setelah deployment selesai, tutup/buka kembali POS. Fitur area baru aktif ketika respons database sudah memuat versi gudang 107.

6. Login owner. Di menu Store, lengkapi alamat dan nomor telepon gudang baru **PT. Altara Rasa Nusantara** untuk kop invoice/surat jalan. Gudang dibuat sebagai lokasi tersendiri; toko lama tidak diubah menjadi gudang.
7. Atur role dan lokasi karyawan, lalu isi harga transfer. Uji satu nota kecil, satu kiriman, satu penerimaan dan satu penjualan sebelum penggunaan harian.

Tidak ada perintah SQL reset, pembersihan transaksi atau pemindahan massal stok lama dalam patch ini. Jangan menjalankan ulang migrasi lama 105/106 setelah 107 karena definisi fungsi lama dapat menimpa pembatasan baru.

## Stok lama dan selisih kiriman

- Stok lama tetap di lokasi asal. Patch tidak menganggap semua stok toko sebagai stok gudang.
- Stok lama tanpa identitas harus diperiksa fisik oleh admin: Back office → Nota Supplier → Registrasi barcode stok lama. Total berat dan butir label harus **tepat sama** dengan sisa stok yang belum terdaftar. Registrasi tidak menambah stok. Barcode yang pernah terdaftar tidak dapat ditautkan ke batch lain.
- Barcode EAN-13 produk/berat tidak cukup untuk membedakan tiap buah. Gunakan format tracking 26 digit dari konfigurasi label 101–106; setiap buah harus mendapat identitas berbeda.
- Kiriman kurang, salah barcode, atau belum lengkap tetap berstatus Dalam perjalanan. Toko tidak boleh mengonfirmasi jumlah buatan. Lengkapi barang sesuai surat jalan dahulu.
- Admin dapat membatalkan kiriman hanya ketika belum dibayar, belum ada scan penerimaan, dan seluruh barang secara fisik kembali ke gudang. Setelah scan sebagian, penyelesaiannya adalah melengkapi penerimaan; fitur retur/selisih setelah scan belum disertakan.
- Tidak ada alur transfer toko-ke-toko, retur toko-ke-gudang, atau penerimaan parsial pada patch ini. Nota supplier yang tersimpan tidak memiliki tombol edit pada versi ini; periksa nomor, biaya dan produknya sebelum disimpan.

## Pengujian dan batas pemeriksaan

`npm test` menjalankan tes kode, formulir, dan PostgreSQL lokal terisolasi; tidak menghubungi database produksi. `npm run test:warehouse` menjalankan kasus khusus gudang.

Pemeriksaan browser otomatis lengkap disediakan untuk komputer yang dapat menjalankan Chromium:

```powershell
npx playwright install chromium
npm run test:warehouse:browser
```

Tes browser menggunakan data dan respons lokal, bukan akun produksi. Pemeriksaan browser/visual belum berhasil dijalankan di lingkungan pengerjaan ini karena izin proses dan pembukaan halaman lokal dibatasi. Tata letak, hasil cetak printer fisik, scanner fisik, koneksi Supabase produksi, deployment Vercel, dan kecepatan jaringan lapangan masih perlu uji penerimaan.

Mode demo POS lama tetap tersedia, tetapi transaksi gudang baru tidak disimulasikan di mode itu dan tidak dikirim ke database dari demo. Pengujian gudang dilakukan dengan tes terisolasi di atas atau lingkungan staging.

Rollback kode saja tidak cukup setelah transaksi gudang berjalan. Jangan menimpa SQL dengan versi lama atau menghapus tabel baru untuk mencoba rollback: stok Dalam perjalanan perlu direkonsiliasi terlebih dahulu.

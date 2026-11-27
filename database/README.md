# Struktur dan urutan SQL Maniac Duren

**Audit 110 tidak menambah migrasi SQL dan tidak memerlukan reset database.** `pos.sql` adalah fondasi historis, bukan instalasi lengkap fitur POS terbaru. `npm run db:build` hanya membangun ulang fondasi dari bagian yang terdaftar dalam `scripts/build-database.mjs`; `npm run check` memastikan hasilnya tidak menyimpang.

## Database aktif

Periksa patch yang sudah terpasang sebelum mempertimbangkan perubahan schema. `check-feature-chain.sql` menyediakan pemeriksaan baca-saja atas penanda versi dan keberadaan RPC. Penanda versi saja tidak membuktikan bahwa definisi fungsi belum tertimpa; hasil `pos_read()` pada sesi sah juga perlu sesuai fitur frontend.

Jangan menjalankan kembali `pos.sql`, `upgrade.sql`, `rollback-027-compat.sql`, `reset-pos.sql`, atau `clear-operations.sql` untuk memasang patch audit. `upgrade.sql` dan bagian di `sections/operations/` mencakup jalur historis. Reset/clear menghapus data operasional dan bukan alat perapian file.

## Rantai fitur yang diuji lokal

Tabel ini menjelaskan dependensi, bukan perintah untuk mengulang semua SQL pada database aktif. Beberapa patch membungkus `pos_read`, `pos_mutate`, dan `pos_mutate_027` dengan mengganti nama implementasi sebelumnya. Mengulang patch lama setelah patch lebih baru dapat menimpa pintu masuk fitur terbaru meskipun tabelnya masih ada.

| Urutan | Berkas / prasyarat | Tujuan |
|---|---|---|
| Dasar | `pos.sql` | Tabel dan operasi dasar; sudah memuat kompatibilitas 027 |
| 041 | `compress-pos-photos.sql` | Foto terpisah dari pembacaan utama |
| Master | Master durian dan turunannya, dengan harga yang valid | Prasyarat relasi reject |
| 043 | `link-durian-reject.sql` | Hubungan produk durian dan hasil olahan |
| 045 | `product-variants.sql` | Metadata/penyimpanan varian |
| 052 | `pos-menu-categories.sql` | Kategori kasir |
| 054 | `pos-cashier-controls.sql` | Diskon, persetujuan, dan pembatalan |
| 060 | `product-single-variant.sql` | Produk dengan satu varian |
| 063 | `reject-flow-063.sql` | Reject, olahan, waste, dan jurnal |
| 064 | `store-receipt-064.sql` | Profil toko/header struk |
| 070 | `employee-details-070.sql` | Rincian karyawan |
| 071 | `reports-admin-071.sql` | Laporan dan dokumen admin |
| 077 | `product-buy-piece-077.sql` | Harga beli per butir |
| 082 | `receipt-shipment-082.sql` | Biaya/penerimaan satu kiriman |
| 083 | `cashier-shifts-083.sql` | Shift dan rekonsiliasi kas |
| 084 | `payment-methods-084.sql` | Pengaturan metode pembayaran |
| 085 | `crm-loyalty-085.sql` | Member dan poin |
| 092 | `cash-deposits-092.sql` | Setoran tunai kasir, bukti bank, dan saldo cash per outlet |

Patch 092 dipasang setelah rantai fitur sampai 085. Dashboard 091 dan dock 090 tidak memiliki SQL tambahan. Jangan mengulang SQL lama sesudah 092. Panduan pemasangan dan definisi saldo ada di `docs/PASANG-PATCH-092.md`. `tests/cash-deposits-db.test.mjs` menguji rantai lengkap, tanggal/identitas dari server, batas saldo, hak akses, bukti, retry, pembatalan, dan pemasangan ulang 092.

`seeds/import-durian-dan-turunan.sql` adalah bahan seed historis, bukan installer siap jalan: baris buah memiliki harga `null`, sementara fondasi mensyaratkan harga positif. Harga nyata perlu ditentukan sebelum dipakai untuk instalasi baru. Pengujian mengisi harga contoh hanya dalam database fixture; audit tidak mengubah harga produk operasional.

## Sumber dan pengujian

`sections/` adalah sumber SQL fondasi; `migrations/` menyimpan migrasi historis 017–019; berkas bernomor fitur di direktori ini adalah patch lanjutan. Jangan menyatukan fungsi hanya berdasarkan kesamaan nama karena urutan wrapper merupakan bagian dari kontraknya.

`npm run test:db` menjalankan pengujian PGlite terisolasi. `tests/crm-db.test.mjs` memasang rantai fitur lengkap lalu memeriksa bahwa profil toko, karyawan, dokumen, biaya produk, shift, pembayaran, dan CRM tetap terbaca bersama. Pengujiannya mencakup transaksi member, invoice tanpa penjualan ganda, poin, retry, diskon, refund, hak akses, serta grant RPC. Tes fitur lain memeriksa penerimaan, stok, resep, produksi, reject, laporan, dan kompatibilitas versi lama.

Fixture autentikasi lokal tidak menggantikan pemeriksaan konfigurasi Supabase, JWT, hosting, dan data akun produksi.

## Fitur setelah 092

| Urutan | Sumber | Peran |
|---|---|---|
| 101 | `fruit-tracking-101.sql` | Identitas barcode per buah dan jejak batch |
| 102 | `fruit-barcode-mapping-102.sql` | Alat pemetaan barcode; bukan installer wajib otomatis |
| 103 | `../supabase/migrations/20261108022503_wireless_customer_display.sql` | Pairing tablet dan payload layar pelanggan |
| 105 | `fruit-stock-barcode-105.sql` | Transfer/reject berdasarkan buah berbarcode |
| 106 | `fruit-batch-strict-scan-106.sql` | Barcode wajib sesuai batch asal |
| 107 | `warehouse-flow-107.sql` | Gudang, outlet, surat jalan, penerimaan, peran divisi |
| 109 | `reset-operasional-109.sql` | Alat penghapusan operasional, **bukan langkah instalasi** |
| 112 | `supplier-notes-112.sql` | Detail nota supplier, pembayaran nota/ongkir terpisah, koreksi owner |

Patch 108 hanya mengubah tampilan lokasi. Rantai fondasi sampai 107 dan wireless 103 diuji bersama secara lokal. Berkas 105/106 di `database/` memiliki salinan dengan identitas migrasi CLI di `supabase/migrations/`; keduanya dipertahankan dan diperiksa identik oleh `npm run check`. Menghapus riwayat migrasi dapat mengganggu database yang telah memakai CLI.

`.vercelignore` mengecualikan **kedua** folder SQL. Gunakan salah satu jalur pemasangan yang sesuai riwayat database; jangan menjalankan ulang kedua salinan atau patch lama untuk merapikan kode.

Patch 112 dipasang setelah 107; patch 109 tidak diperlukan. Baca `docs/PATCH-112-NOTA-SUPPLIER.md`. Salinan CLI `supabase/migrations/20261116112253_supplier_note_payments_112.sql` identik dengan sumber 112 dan ikut diperiksa oleh `npm run check`. Gunakan satu jalur instalasi sesuai riwayat proyek.

Patch **114** (`warehouse-workflow-114.sql`) dipasang **setelah 112**. Patch ini
menambah kg/butir nota supplier, sesi scan yang tersimpan, penguncian/pembukaan ulang,
reservasi barcode, transfer dengan harga per dokumen dan invoice wholesale dengan
pembayaran terpisah. Tidak menjalankan reset. Salinan CLI
`supabase/migrations/20261116130125_warehouse_receiving_wholesale_114.sql` identik
serta diperiksa oleh `npm run check`. Baca
`docs/PATCH-114-PENERIMAAN-WHOLESALE.md`; gunakan salah satu jalur pemasangan.

Tabel baru di schema `md_supply` memakai RLS dan tidak memberi akses langsung pada
`anon`/`authenticated`. Mutasi masuk melalui `pos_warehouse_mutate` yang memeriksa
akun aktif, izin, lokasi, revisi, identitas operasi dan status barcode. Helper serta
wrapper lama tidak boleh diberi grant RPC. Perubahan harga supplier tetap khusus
owner. Invoice wholesale mempunyai ledger sendiri; hanya baris penjualan dengan
relasi `wholesale_order_id` yang dikecualikan dari guard pembayaran/shift kasir.
Guard POS biasa tetap aktif. Jangan memasang ulang migrasi lama setelah 114.

### Pembelian melalui nota supplier (122)

Pasang `database/supplier-stock-122.sql` setelah patch 114 dan 119 melalui SQL Editor. Untuk proyek yang memakai migrasi CLI, salinannya adalah `supabase/migrations/20261123180000_supplier_stock_122.sql`. Pilih satu jalur pemasangan. Muat ulang POS setelah frontend terbaru tersedia.

Back Office membuka nota dan memasukkan total beli setiap produk serta ongkir bersama. Gudang memilih nota, memindai buah dan mencatat jumlah fisik barang satuan beserta kedaluwarsa bila ada. Penyelesaian penerimaan membukukan seluruh baris dalam satu transaksi. Setiap baris membuat batch tersendiri yang terhubung ke nota dan supplier.

Nota buah membagi ongkir menurut berat aktual. Jika nota memuat barang satuan, ongkir dibagi menurut proporsi nilai beli setiap baris. Modal per satuan adalah (total beli baris + alokasi ongkir) dibagi jumlah aktual. Untuk buah, jumlah aktual menggunakan kg hasil scan. Detail nota juga menampilkan modal rata-rata per butir.

Harga jual dikelola di Master Barang. Bila dokumen sumber keliru, koreksi nota oleh owner menghitung ulang modal batch. Stok historis tetap memakai riwayat yang sudah tercatat. Transfer, produksi, dan olahan reject merujuk batch sumber.

### Harga jual per cabang (123)

Setelah patch 122, jalankan `database/branch-sale-prices-123.sql` di SQL Editor Supabase atau gunakan migrasi CLI `20261123190000_branch_sale_prices_123.sql`. Pasang frontend patch 123 dan muat ulang POS.

Di **Back Office → Harga Jual**, pilih cabang toko dan produk atau varian. Buah memiliki harga per kg dan per butir. Produk kemasan dan menu resep menggunakan satuan jual masing-masing. Cabang mengikuti harga Master Barang sampai admin atau owner menyimpan harga khusus. Opsi **Ikuti Master Barang** mengembalikan cabang ke harga dasar untuk produk tersebut.

Kasir memvalidasi harga cabang saat transaksi disimpan. Jika harga berubah selama pesanan masih di keranjang, perbarui kasir lalu masukkan kembali produk yang terpengaruh. Transaksi yang sudah tersimpan menyimpan harga saat penjualan. Harga pengiriman dan wholesale tetap di dokumen pengiriman.

### Batch untuk transaksi barang keluar (126)

Ekstrak patch ke folder proyek Maniac Duren. Setelah SQL 123, jalankan
`database/outbound-batches-126.sql` di SQL Editor Supabase, atau pasang salinan
CLI `20261126160000_outbound_batches_126.sql` melalui alur migrasi proyek.
Gunakan satu jalur. Dari PowerShell di folder proyek, jalankan
`.\scripts\windows\push-patch-126.cmd` untuk pengujian, commit, dan push.
Muat ulang POS setelah frontend terpasang.

Di Back Office → Pengiriman & Tagihan → Transaksi barang keluar, pilih produk
dan batch asal. Nomor nota, supplier, tanggal, dan kode membedakan batch.
Modal per kg mengikuti biaya stok batch gudang. Modal rata-rata per butir
menggunakan berat dan jumlah awal penerimaannya. Harga khusus per kg atau per
butir diisi per baris. Untuk mengirim produk yang sama dari dua batch, tambahkan
baris kedua. Gudang melihat batch dan memindai barcode sesuai dokumen.

Dokumen lama dapat dilanjutkan dengan harga yang sudah tersimpan. Saat mengedit
draf lama, batch yang sudah dipindai mendapat baris masing-masing. Pilih batch
untuk produk yang belum dipindai. Harga transfer pada invoice tetap menjadi
dasar modal barang yang diterima toko.

### Arus kas Toko, PT Retail, dan PT Distribusi (127)

Dari proyek yang sudah memakai patch 126, ekstrak berkas patch 127. Di SQL Editor
Supabase jalankan `database/cash-flow-127.sql`. Jika memakai migrasi CLI, gunakan
`20261126220000_cash_flow_127.sql` melalui jalur migrasi proyek. Pilih satu jalur.
Untuk pengujian, commit dan push dari folder proyek Windows jalankan
`.\scripts\windows\push-patch-127.cmd` di PowerShell. Muat ulang POS setelah frontend terpasang.

Buka **Back Office → Laporan → Arus kas** dengan akun owner atau admin keuangan.
Filter **Semua toko** mencakup wholesale, supplier, serta operasional gudang.
Filter satu cabang menunjukkan transaksi cabang tersebut dan pembayaran nota terkait.
Excel dan PDF pada tab ini mengikuti tanggal serta pilihan cabang yang sama.

- **Toko** mencatat penjualan tunai dan nontunai, refund menurut tanggal pengembalian,
  pengeluaran yang dibayar toko, dan setoran ke PT Retail. Uang kas adalah saldo
  kumulatif transaksi tunai POS, di luar uang awal kembalian. Pengeluaran tunai
  dengan sumber Toko juga mengurangi batas setoran yang dapat disimpan.
- **PT Retail** menerima setoran toko, membayar nota gudang, serta membayar biaya
  cabang seperti listrik, sewa, dan gaji. Pengeluaran dicatat sekali untuk cabang
  yang mendapat manfaat dengan pilihan **Dibayar oleh → PT Retail**.
- **PT Distribusi** menerima pembayaran nota toko dan wholesale, lalu membayar
  supplier dan ongkir. Pembayaran cicilan masuk sesuai tanggal bayar. Nilai nota
  terbit dan sisa piutang ditampilkan terpisah dari arus uang. Penjualan wholesale
  yang juga tercatat saat pengiriman tidak menambah penerimaan untuk kedua kalinya.

Setoran dan pembayaran antar-PT memakai catatan yang sama di kedua sisi.
Pembatalan setoran, pengeluaran, atau pembayaran supplier membalik nilai pada
tanggal koreksi. Untuk biaya lama, buka **Laporan → Pengeluaran → Tentukan sumber dana**.
Klasifikasi ini mengalokasikan pembayaran pada tanggal pengeluaran aslinya.

### Pengeluaran toko dari kasir (128)

Setelah patch 127, jalankan `database/cashier-expenses-128.sql` di SQL Editor Supabase.
Untuk alur migrasi CLI gunakan `20261126230000_cashier_expenses_128.sql` sebagai gantinya.
Ekstrak patch ke folder utama proyek, jalankan `.\scripts\windows\push-patch-128.cmd`
di PowerShell dari folder tersebut, lalu muat ulang POS setelah frontend terpasang.

Di **Toko → Kasir → Pengeluaran Toko**, isi kategori, nominal, cara bayar, dan keterangan.
Nomor bukti opsional. Toko mengikuti cabang aktif, sumber dana selalu toko, dan tanggal
mengikuti saat pencatatan di WIB. Kasir dapat melihat 20 pengeluaran terakhir yang ia
catat dari dana cabang itu. Koreksi dilakukan dari menu Pengeluaran di Back Office.

Tunai mengurangi kas toko dan saldo yang dapat disetor. Apabila kasir membuka shift di
cabang itu, pengeluaran tunai juga mengurangi kas yang seharusnya ada di laci saat tutup.
Di luar shift, pengeluaran tunai tetap tercatat pada toko. Transfer dan QRIS tercatat sebagai
pengeluaran nontunai. Pembatalan memperbarui shift yang masih buka. Rekap shift yang sudah
ditutup menyimpan hasil perhitungan saat penutupan.

### Transfer nonbuah 131

Setelah patch 130, jalankan `database/outbound-units-131.sql` atau migrasi
`20261126234500_outbound_units_131.sql`. Perubahan menambahkan reservasi jumlah
stok per batch ke alur pengiriman toko. Dokumen lama tetap mengikuti rincian
dan status yang sudah tersimpan.

### Penerimaan supplier cabang dan mutasi 132

Setelah patch 131, jalankan `database/branch-stock-132.sql` atau migrasi
`20261127090000_branch_stock_132.sql`. Nota baru menunjuk cabang penerima dan stok
masuk saat penerimaan selesai. Mutasi cabang menerbitkan surat jalan, membawa modal
batch, dan menambah stok tujuan setelah jumlah fisik cocok. Pembayaran supplier
untuk nota cabang masuk arus kas Retail. Lihat
[petunjuk patch 132](../docs/PATCH-132-ALUR-CABANG.md).

Patch **133** (`office-stock-transfers-133.sql`) dipasang setelah 132. RPC pengiriman
antarcabang mewajibkan akses Back Office. Ketentuan ini juga berlaku saat mengirim
dokumen transfer lama. Penerimaan supplier dan konfirmasi kiriman di toko tetap
menggunakan izin lokasi masing-masing. Gunakan migrasi CLI terkait atau SQL ini sekali,
tanpa reset maupun perubahan data stok.

Patch **134** (`supplier-note-cancel-134.sql`) menambahkan pembatalan nota supplier sebelum stok dibukukan. Pasang setelah 133 melalui migrasi CLI terkait atau SQL ini. Nomor nota dapat dipakai kembali untuk supplier yang sama setelah pembatalan. Riwayat pembatalan menyimpan nota asal, alasan, petugas, waktu dan draf penerimaan.

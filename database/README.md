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

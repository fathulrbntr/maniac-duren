# Struktur dan urutan SQL Maniac Duren

**Audit 089 tidak menambah migrasi SQL dan tidak memerlukan reset database.** `pos.sql` adalah fondasi historis, bukan instalasi lengkap fitur POS terbaru. `npm run db:build` hanya membangun ulang fondasi dari bagian yang terdaftar dalam `scripts/build-database.mjs`; `npm run check` memastikan hasilnya tidak menyimpang.

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

# Hasil audit patch 028

Sumber: ZIP `maniac-duren(4).zip`. Perubahan ini disiapkan lokal; belum diterapkan ke Vercel atau Supabase produksi.

## Temuan dan perbaikan

| Temuan | Perbaikan |
|---|---|
| Kasir bergantung pada respons server | IndexedDB menyimpan pembayaran dan antrean sebelum UI menyatakan sukses |
| Reload menghapus sesi | Sesi dipulihkan dari perangkat, refresh token disimpan kembali; logout membersihkan sesi aktif |
| Retry lama hanya satu transaksi | Outbox berurutan dengan status, identitas perangkat/akun/store, timestamp dan resep |
| Respons hilang dapat membuat hasil transaksi tidak pasti | Endpoint `pos_sync_order` mencocokkan seluruh payload dan menyimpan ACK atomik dengan stok/order/jurnal |
| Stok lokal tidak mencadangkan transaksi offline | Seluruh kebutuhan produk/bahan antrean mengurangi ketersediaan lokal |
| Dua tab berpotensi memakai saldo yang sama | Web Lock satu terminal per profil browser dan lock per akun untuk penulisan/sinkronisasi |
| Tidak ada cache aplikasi offline | Service worker menyimpan aset POS; API, token dan respons transaksi tidak masuk Cache Storage |
| Barcode ada di master tetapi belum menjadi input kasir | Pencocokan persis barcode/SKU lewat Enter, termasuk nol di depan; duplikasi ditolak |
| Beberapa jumlah tidak valid lolos pemeriksaan awal | Jumlah harus finite/positif, pcs/porsi/butir bulat; lot harus cocok dengan produk |
| Pemilihan durian baru bisa membawa satuan lama dan harga KG | Satuan/harga disetel bersama dan supplier diambil dari lot |
| Total JavaScript pecahan berpotensi berbeda dengan NUMERIC SQL | Aritmetika desimal untuk perkalian dan penjumlahan total; berat tidak dibulatkan |
| Panduan lama menyebut demo, login ulang setiap reload, atau tidak perlu SQL | Panduan pemasangan disatukan pada PATCH-028.md, setup dan README diperbarui |
| Dokumen patch lama menumpuk | Script pembersihan terbatas pada PATCH-018.md sampai PATCH-027.md |

## Pengujian yang lulus

- `npm run test:unit`: 10 hasil uji termasuk katalog/stok, FIFO produksi, waste, retry, ketersediaan, uang, cadangan offline dan total desimal.
- `npm run test:db`: database fresh dan upgrade; otorisasi, rollback, transaksi, perpindahan stok, produksi, waste dan jurnal biaya.
- `npm run test:offline`: validasi/pencadangan lokal serta SQL fresh/upgrade; migration 021 dijalankan ulang, replay tanpa duplikasi, payload berbeda, stok kurang, perubahan resep, antrean kitchen dan akses cabang. Query audit data juga dijalankan pada fixture.
- `npm run test:receipts`: kiriman beberapa produk, harga nota masing-masing, satu ongkir, retry, duplikasi produk, rollback, nol ongkir dan pembagian biaya tanpa selisih.
- `npm run test:employees`: profil/foto, username/telepon, akses privat akun, rate limit, reset password, absensi dan jadwal.
- `npm run test:browser`: smoke test seluruh halaman POS desktop/mobile dan tema terang/gelap, form karyawan/foto, login serta halaman website/menu.
- `npm run test:offline:browser`: Chromium dengan HTTP server lokal, IndexedDB dan service worker sungguhan; jaringan dimatikan. Meliputi barcode, dua pembayaran offline, reload, cetak struk lokal, pencegahan logout dan dua tab, reconnect, commit dengan respons putus, konflik/retry, sesi kedaluwarsa dan login ulang, penolakan penyimpanan penuh serta lebar mobile.
- Sintaks file JavaScript yang diubah diperiksa. Manifest service worker dibangun dari seluruh aset POS.

Browser memakai backend fixture; SQL diuji dengan PostgreSQL PGlite. Kedua lapisan diuji terpisah. Database produksi, perangkat scanner/timbangan/printer, pemasangan Android/iOS/Windows dan deployment Vercel belum diuji langsung.

## Cleaning data

ZIP berisi source, bukan salinan isi database aktif. Tidak ada penghapusan / penggabungan otomatis data operasional. `database/audit-data.sql` menampilkan kandidat masalah tanpa mengubah data: duplikasi barcode/SKU, saldo buah tidak seimbang, resep kosong/ganda, biaya belum diketahui, stok kedaluwarsa dan journal tanpa lot.

Duplikasi definisi fungsi SQL versi lama dipertahankan: wrapper aktif masih memanggilnya. Menghapusnya sebagai “kode ganda” akan memutus alur database. `pos.sql` merupakan hasil build; `sections` adalah sumber; `migrations` untuk update database yang sudah berjalan.

## Batas fitur

Sinkronisasi berjalan saat aplikasi terbuka. Kitchen di perangkat berbeda membutuhkan koneksi untuk menerima order. Akses/master/stok global tetap diverifikasi server. Konflik antarkasir offline atau perubahan resep ditahan untuk pemeriksaan, tidak dihilangkan otomatis. Format barcode timbangan dinamis masih perlu konfigurasi alat. Cetak menggunakan driver/dialog browser. QRIS/transfer diverifikasi manual.

Referensi API browser: [Service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers), [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB).

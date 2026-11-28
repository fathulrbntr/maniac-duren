# Peta struktur proyek

Panduan aktif audit 111: aturan pelaksanaan berada di `../AGENTS.md` dan
`PENGEMBANGAN.md`. Penambahan fitur harus mengikuti pemilik modul di tabel ini.

Mulai dari tabel berikut ketika mencari kode. Modul fitur tetap menggunakan lokasinya agar URL impor, cache, dan tautan yang sudah ada tidak rusak.

## Peta file menurut pekerjaan

| Yang ingin diubah                             | File utama                                                                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Tampilan/isi halaman publik                   | `index.html`, `style.css`, `script.js`, `assets/`                                                                          |
| Katalog pelanggan dan editor menu             | `menu/index.html`, `menu/kelola.html`, berkas JS/CSS/JSON di `menu/`, foto mandiri di `menu/images/`                       |
| Startup, sesi, navigasi, pengiriman transaksi | `pos/app.js`, `pos/data/mutations.mjs`, `pos/session.mjs`, `pos/retry.mjs`                                                 |
| Kelompok menu dan sidebar                     | `pos/navigation.mjs`, `pos/sidebar.mjs`                                                                                    |
| Token warna dan aturan UI bersama             | `pos/ui-tokens.css`, `pos/ui-system.css`, `pos/workspace-ui.css`                                                           |
| Produk, kartu katalog, varian                 | `pos/catalog.mjs`, `pos/product-dialog.mjs`, `pos/product-variants.mjs`                                                    |
| Kasir, keranjang, pembayaran transaksi        | `pos/operations-ui.mjs`, `pos/cashier*.mjs`, `pos/cashier.css`                                                             |
| Buka/tutup kasir, riwayat shift               | `pos/cashier-shifts*.mjs`, `pos/cashier-shifts.css`                                                                        |
| Pengaturan metode pembayaran                  | `pos/payment-methods*.mjs`, `pos/payment-methods.css`                                                                      |
| Stok masuk dan produksi                       | `pos/inventory-ui.mjs`, `pos/core.mjs`, `pos/production*.mjs`, `pos/inventory.css`                                         |
| Reject, olahan, dan analisis batch            | `pos/reject*.mjs`, `pos/batch*.mjs`, `pos/reject-flow.css`                                                                 |
| Dokumen admin dan laporan                     | `pos/documents*.mjs`, `pos/reports*.mjs`, `pos/reports-admin.css`                                                          |
| CRM, member, aturan poin                      | `pos/crm*.mjs`, `pos/crm.css`                                                                                              |
| Karyawan dan absensi                          | `pos/employees*.mjs`, `pos/employees.css`                                                                                  |
| Profil toko dan cetak                         | `pos/store-settings*.mjs`, `pos/receipt*.mjs`                                                                              |
| Printer, timbangan, dan barcode               | `pos/devices-ui.mjs`, `pos/device-settings.mjs`, `pos/receipt-weighing.mjs`, `pos/barcode-scanner.mjs`, `scripts/windows/` |
| Latihan tanpa menulis produksi                | `pos/stock-demo*.mjs`, `pos/documents-demo.mjs`                                                                            |
| Instalasi PWA dan pemulihan                   | `pos/pwa.mjs`, `pos/sw.js`, `pos-recover.html`, `pos-recovery.mjs`                                                         |
| Endpoint backend                              | `api/pos-config.js`, `api/pos-login.js`, `api/pos-employee.js`                                                             |
| Rantai schema/RPC                             | `database/README.md`, `database/*.sql`                                                                                     |

Akhiran `-ui.mjs` umumnya memuat HTML dan event form; modul tanpa `-ui` memuat perhitungan, payload, atau aturan fitur. `pos/app.js` menghubungkan modul tersebut. Cari nama aksi, misalnya `order_create`, untuk menelusuri form → handler → RPC → SQL → pengujian.

Konfirmasi tindakan di POS dan pengelola menu menggunakan `shared/confirmation.mjs` dan `shared/confirmation.css`. Tunggu hasil `confirmAction` sebelum menyimpan perubahan. Untuk pembatalan yang memerlukan alasan, gunakan `requestReason`.

Pintasan di dock bawah mengikuti halaman yang boleh dibuka dari sidebar. Pilihan **Atur dock** tersimpan di perangkat untuk setiap akun dan area kerja melalui `pos/system-dock.mjs`. Tombol **Pindai** di tengah selalu membuka detail barang. Izinkan kamera belakang dan sejajarkan barcode dengan garis, gunakan pemindai USB/Bluetooth, atau ketik barcode/SKU. Hasil mengikuti lokasi dan hak akses aktif. Membaca label tidak mengubah stok atau keranjang. Kamera berhenti setelah kode terbaca, saat dialog ditutup, atau saat POS masuk latar belakang.

Beranda POS (`pos/home-ui.mjs`, `pos/home.css`) memuat ringkasan operasional langsung setelah login dan saat berganti area kerja. Kartu utama memuat profil pengguna aktif. Back Office keuangan melihat saldo tersedia PT. Altara Rasa Nusantara, omzet yang belum disetor, sisa tagihan barang dari nota supplier cabang, dan omzet hari ini (WIB). Ongkir memiliki pencatatan tersendiri. **Akses cepat** selalu tampil tepat setelah kartu utama. Rincian setoran cabang dan tombol riwayat berada di bagian **Perlu ditindaklanjuti** bersama antrean operasional. POS menggunakan saldo setoran kumulatif dari server. Saldo negatif ditandai untuk diperiksa, dan data yang belum lengkap ditampilkan sebagai “Belum tersedia”. Toko melihat omzet hari ini (WIB) serta kewajiban setor lokasi aktif. Setoran yang dicatat setelah dana masuk ke rekening PT mengurangi kewajiban cabang. Tombol **Lihat omzet** membuka bagian **Penjualan** dengan pilihan lokasi dan periode. Pilihan Dashboard lama di dock mengarah ke Beranda.

Dashboard Back Office dan toko menggunakan ringkasan di `pos/dashboard-ui.mjs`.
`pos/warehouse-ui.mjs` melengkapinya dengan tindak lanjut, saldo, dan pintasan sesuai area kerja.
Back Office dapat memilih semua lokasi atau satu cabang. Dashboard toko mengikuti cabang aktif.
Saat POS dibuka atau dimuat ulang, sesi yang masih aktif membuka Beranda dengan area kerja dan lokasi tersimpan. Tombol Kembali membawa pengguna ke Beranda. Dari Beranda, dua kali Kembali dalam 2,5 detik keluar dari POS dengan sesi tetap tersimpan. Navigasi perangkat dan browser ditangani di `pos/back-navigation.mjs`.

## Aturan perubahan berikutnya

1. Pakai URL impor relatif yang sama untuk modul yang sama, tanpa versi query berbeda-beda. Browser menganggap `file.mjs?v=1` dan `file.mjs?v=2` sebagai dua modul berbeda, termasuk state di dalamnya.
2. Tambahkan menu melalui `navigation.mjs`, judul/renderer/binder di `app.js`, lalu periksa akses dan tampilan HP. Hindari membuat pintu masuk kedua yang melewati pemeriksaan hak akses.
3. Letakkan CSS fitur di berkas fiturnya. Aturan input generik di `ui-system.css` menggunakan spesifisitas rendah agar tidak menimpa pencarian atau kontrol khusus. Pertahankan urutan stylesheet dalam `pos/index.html` saat tidak mengubah kontrak cascade.
4. Perubahan UI ditempatkan dekat modul fiturnya; aturan saldo, transaksi, dan hak akses tetap ditegakkan SQL. Uji pengiriman ulang dan pembatalan untuk perubahan mutasi.
5. SQL patch lama menggunakan rantai wrapper. Jangan menghapus definisi bernama sama atau mengulang patch lama di atas patch baru untuk 'merapikan' SQL.
6. Panduan yang berlaku berada di `docs/`; petunjuk versi lama berada di `docs/archive/`. Berkas foto cadangan tetap lokal dan dikecualikan dari deployment.

Modul offline/page-cache dan batch lama dipisahkan ke `tests/legacy/`, tidak lagi berada di folder aplikasi aktif. SQL historis dipertahankan untuk pengujian dan kompatibilitas. Aplikasi aktif memakai mode web online; PWA hanya menyediakan instalasi, bukan antrean transaksi offline. Jangan mengaktifkan modul lama hanya karena file tersebut masih ada.

## Pemeriksaan sebelum commit

Jalankan `npm run check`, `npm test`, lalu `npm run test:browser` untuk perubahan UI/alur. `check` memeriksa sintaks, tujuan impor/aset HTML lokal, identitas impor POS, duplikasi menu/stylesheet, dan kecocokan SQL fondasi dengan sumbernya. Script ini tidak membuktikan seluruh URL dinamis valid; pengujian browser melengkapi pemeriksaan tersebut.

## Peta tambahan audit 110

- `pos/data/mutations.mjs`: satu dispatcher endpoint penyimpanan, termasuk penggabungan hasil scan gudang.
- `pos/supplier-notes.mjs`, `pos/supplier-notes-ui.mjs`: saldo nota/ongkir, detail nota, pembayaran, serta koreksi owner melalui RPC gudang; aturan akses dan audit ada di `database/supplier-notes-112.sql`.
- `pos/supplier-note-proof.mjs` menangani kamera, pilihan berkas, pratinjau dan pembacaan foto dari detail nota. Patch 137 memberikan nomor nota di server serta menyimpan foto terpisah dari data sinkronisasi POS.
- `pos/warehouse-*.mjs`, `pos/workspaces.mjs`: gudang, branch outlet, pengiriman, dan ruang kerja per divisi.
- `pos/customer-display-*.mjs`, `api/pos-display.js`: layar pelanggan lokal/wireless.
- `assets/logo.png`: sumber logo bersama untuk website dan POS; ikon PWA tetap terpisah sesuai ukuran.
- `tests/legacy/`: modul historis yang hanya dibutuhkan tes.
- `docs/audit/`: ringkasan validasi audit ini.
- `eslint.config.mjs`, `.prettierrc.json`: aturan kesalahan kode dan format konsisten.

Nama dan lokasi modul fitur aktif dipertahankan agar URL impor dan integrasi lama tetap kompatibel. Kode sudah diformat konsisten; fungsi/import yang tidak terpakai dibuang. Petunjuk patch root yang lama dipindahkan ke `docs/archive/`.

## Tambahan audit 111

- `scripts/check-architecture.mjs`: entry point pemeriksaan batas kode, siklus,
  kontrak export/import, identitas URL, dan lockfile. Dipanggil otomatis oleh `check`.
- `scripts/lib/architecture.mjs`: parser dan fungsi pemeriksaan yang diuji melalui
  fixture, tidak diimpor aplikasi browser.
- `tests/architecture.test.mjs`: contoh struktur benar dan contoh kerusakan yang
  wajib ditolak pemeriksa.
- `tests/retry-order.test.mjs`: jaminan payload yang sama tetap memakai ID yang
  sama ketika urutan properti objek berubah; pending dari versi lama tetap terbaca.
- `tests/session.test.mjs`: mencakup refresh token akun lama dan login akun baru
  yang saling tumpang tindih.
- `docs/archive/HASIL-AUDIT-110.md`: hasil pemeriksaan sebelumnya; hasil terbaru
  ada di `HASIL-AUDIT.md`.

Belum ada migrasi massal ke folder `pos/features/`. Folder tersebut adalah pilihan
untuk fitur baru yang memerlukan beberapa file, bukan tempat menyalin modul lama.

## Penerimaan & wholesale 114

- `pos/progress-ui.mjs` dan `pos/progress.css` menyamakan badge, tombol pembuka, dan warna tahap operasional. Setiap fitur menentukan tahap dari data prosesnya.
- `pos/warehouse-workflow.mjs` memiliki aksi sesi, selisih nota/aktual, saldo invoice
  dan penyimpanan operasi pending per akun/dokumen. Jangan membuat jalur stok kedua.
- `pos/receiving-session-ui.mjs` memiliki UI penerimaan dan kontrol pembukaan ulang.
- `pos/outbound-ui.mjs` memiliki UI penyiapan, harga per dokumen dan pembayaran keluar.
- `pos/supply-session-ui.mjs` membagi utilitas formulir/pemulihan di kedua fitur.
- `pos/warehouse-flow.mjs` mendaftarkan aksi pada dispatcher yang sudah ada dan
  menggabungkan respons delta; `app.js` hanya meneruskan ruang kerja/konteks.
- `database/warehouse-workflow-114.sql` memiliki otorisasi, sesi, reservasi barcode,
  koreksi stok serta invoice wholesale; dipasang setelah 112 tanpa reset.
- `tests/warehouse-workflow-{db,ui}.test.mjs` menguji aturan server/model/handler.
  `tests/warehouse-workflow-browser.mjs` menguji aplikasi asli dengan SQL fixture.
- Baca `docs/PATCH-114-PENERIMAAN-WHOLESALE.md` untuk alur dan pemasangan PowerShell.

## Tabel dan ringkasan invoice 115

- `pos/warehouse-workflow.mjs`: pengelompokan invoice, tanggal WIB, rentang periode,
  status pembayaran, ringkasan nominal, serta filter per akun/ruang kerja/lokasi.
- `pos/outbound-ui.mjs`: tiga tabel, filter, ringkasan, dan delegasi tombol detail.
  `pos/warehouse-ui.mjs` tetap menjadi penghubung ke binder fitur yang sama.
- `pos/warehouse.css`: tata letak filter, ringkasan, dan tabel responsif.
- `tests/outbound-invoices.test.mjs`: aturan perhitungan dan interaksi DOM.
  `tests/outbound-invoices-browser.mjs`: aplikasi asli, reload, tema, dan lebar layar.
  Fixture bersama berada di `tests/helpers/outbound-invoices-fixture.mjs`.
- Patch ini memakai data dan otorisasi patch 114; tidak menambah jalur mutasi atau
  migrasi SQL. Panduan pemasangan dan commit/push: `docs/PATCH-115-INVOICE-FILTER.md`.

## Supplier dan input POS 116

- `pos/supplier-ui.mjs`: form tambah supplier bersama dan pilihan tambah dari dropdown.
  Dipasang oleh factory modal `app.js`; dropdown stok produk dinamis dipasang oleh
  `product-dialog.mjs`. Mutasi tetap `master` melalui `ctx.mutate`, dengan ID tetap
  saat retry. Form induk tetap terpasang selama supplier disimpan.
- `pos/money-input.mjs`: formatter seluruh input `type=number`, termasuk input
  tanpa nama dan kolom dinamis. Tampilan memakai titik ribuan dan koma desimal;
  `.value`, `.valueAsNumber` dan `FormData` tetap memakai angka tanpa pemisah ribuan.
  Pertahankan atribut `min`, `max`, `step`, `required` untuk validasi.
- `pos/barcode-scanner.mjs`: persiapan penggantian isi dan pemulihan fokus kolom
  barcode. Barcode tetap string dan mempertahankan nol depan. Handler stok tetap
  berada pada modul penerimaan, pengiriman, reject, kasir, dan pemeriksaan buah.
- `tests/{money-input,barcode-input,supplier-quick-add}.test.mjs`: regresi nilai,
  retry, pembatalan form, scan, dan hak akses. `tests/input-fields-browser.mjs`
  memeriksa perilaku native input, FormData, dialog bertingkat dan fokus.
- Pemasangan: `docs/PATCH-116-SUPPLIER-INPUT-BARCODE.md`.

## Tampilan Food POS Dark 117

- `pos/ui-tokens.css`: font Barlow lokal, palet dark/coral, tema terang dan token
  bersama. Lisensi font berada di `pos/assets/fonts/barlow/OFL.txt`.
- `pos/workspace-ui.css`, `pos/ui-system.css`: navigasi ikon, panel, tabel, form dan
  dialog semua modul. Tata letak khusus tetap dimiliki CSS fiturnya.
- `pos/pos-menu.css`, `pos/cashier.css`: kartu foto bundar, kategori bergaris,
  keranjang dan pembayaran, responsif untuk desktop/tablet/ponsel.
- `pos/warehouse.css`: gudang, nota dan invoice memakai token bersama, termasuk
  badge status dan perpindahan area kerja. Tidak lagi memakai palet olive terpisah.
- `pos/customer-display.html`/`.css`: layar pelanggan memakai token/font yang sama;
  bidang QR tetap putih. Tidak ada perubahan protokol pairing atau pembayaran.
- `pos/index.html`, `pos/manifest.webmanifest`: tema awal dark untuk sesi tanpa
  pilihan tersimpan. Pilihan light/dark pengguna tetap dihormati.
- Patch kumulatif terhadap 115 ini mencakup supplier/input/barcode 116 dan koreksi
  tes 116A. Pemasangan: `docs/PATCH-117-UI-FOOD-POS.md`.

## Audit sidebar dan browser 117B

- `pos/sidebar.mjs`: sinkronisasi breakpoint sebelum toggle, tanpa menutup kembali
  menu yang baru dibuka ketika event media datang terlambat.
- `tests/helpers/browser-sidebar.mjs`: tunggu status controller sesuai viewport
  sebelum memilih toggle; dipakai audit UI, gudang, invoice dan suite lain.
- `tests/ui-audit-browser.mjs`: dialog aktif, 20 menu fixture, tujuh langkah ukuran
  layar termasuk 900/901 px dan kembali ke desktop, serta dua tema.
- `scripts/lib/browser-suite.mjs`: eksekusi suite independen, prasyarat fixture,
  log tiap suite dan ringkasan JSON. `scripts/test-browser.mjs` tetap entry point.

## Koreksi transisi sidebar 117C

- Helper sidebar menggunakan `aria-expanded` setelah sinkronisasi breakpoint,
  sehingga animasi penutupan tidak salah dianggap panel terbuka.
- `tests/sidebar.test.mjs`: regresi picker masih terlihat pada panel tertutup/inert,
  pergantian breakpoint dua arah dan pemanggilan helper berulang.
- `tests/ui-audit-browser.mjs`: menunggu halaman tujuan yang benar serta menyimpan
  konteks kegagalan ke `test-results/ui-audit/failure.json` dan `failure.png`.
- Pemasangan dan batas pengujian: `docs/PATCH-117C-SIDEBAR-TRANSITION.md`.

## Barcode penerimaan 118

- `pos/receiving-session-ui.mjs`: daftar barcode tersimpan selalu tampil saat
  pembukaan dialog dan pembaruan hasil scan, tanpa panel yang dapat terlipat.
- `tests/warehouse-workflow-browser.mjs`: memeriksa barcode terlihat setelah
  scan berturut-turut dan setelah reload penerimaan.
- Pemasangan: `docs/PATCH-118-BARCODE-TERBUKA.md`.
- `tests/sidebar.test.mjs` dan `tests/browser-runner.test.mjs`: regresi media event
  terlambat, idempotensi membuka menu, agregasi kegagalan dan prasyarat fixture.

## Tampilan POS dan menu pelanggan (patch 124)

Palet POS mengikuti `style.css` dan `menu/menu.css`. Font DM Sans dan Manrope
beserta lisensinya berada di `pos/assets/fonts/`. Warna untuk kedua tema dan
skala teks dikelola di `pos/ui-tokens.css`. Halaman kasir memakai
`pos/pos-menu.css` untuk kartu dan `pos/cashier.css` untuk kategori dan checkout.
POS memakai tema terang saat belum ada pilihan tersimpan.

## Batch transaksi barang keluar (126)

Pilihan batch dan modal gudang ditampilkan di `pos/outbound-ui.mjs`.
`pos/warehouse-workflow.mjs` menyaring barcode siap kirim dan memulihkan baris draf lama.
`database/outbound-batches-126.sql` mengikat harga dokumen, scan dan baris invoice ke
batch sumber. Urutan pemasangan tersedia di `database/README.md`.

## Arus kas (127)

`database/cash-flow-127.sql` mengelompokkan pergerakan uang berdasarkan tanggal,
menjaga hak akses keuangan dan menyesuaikan saldo setoran toko.
`pos/cash-flow.mjs` menyusun angka Toko, PT. Altara Rasa Nusantara, PT Distribusi dan piutang
untuk tampilan, Excel, dan PDF. Filter dan form sumber dana menggunakan
`pos/reports-ui.mjs` serta rute mutasi POS yang sama dengan laporan lainnya.

## Pengeluaran toko dari kasir (128)

`pos/store-expenses-ui.mjs` memuat halaman input kasir dan kolom pengeluaran bersama
untuk Back Office. `database/cashier-expenses-128.sql` menggunakan pencatatan pengeluaran
yang sama dengan laporan arus kas, membatasi akses per cabang, dan menghubungkan
pengeluaran tunai ke shift milik kasir bila terbuka.

## Sidebar Toko (129)

Di ruang kerja **Toko**, Dashboard berada di atas. Stok & Penerimaan memuat Penerimaan Barang,
Inventory, dan Reject. Kasir memuat POS, Penjualan, Pengeluaran Toko, dan Shift Kasir.
Kitchen memuat Kitchen Display dan Produksi. Menu Pelayanan Meja dan Pemeriksaan Buah
berada di divisi masing-masing. Laporan berada di Manajemen Toko.

`pos/workspaces.mjs` mengatur urutan dan judul menu cabang. `pos/navigation.mjs`
merender menu yang diizinkan. `pos/operations-ui.mjs` menampilkan Penjualan untuk
cabang aktif dan periode yang dipilih. Kasir melihat transaksi lunas miliknya.
Akun dengan akses laporan dapat melihat transaksi lunas seluruh kasir di cabang itu.

Ekstrak patch 129 di folder utama proyek setelah patch 128, kemudian jalankan
`.\scripts\windows\push-patch-129.cmd` dari PowerShell. Patch ini hanya mengubah
aplikasi dan tes. Skema database tetap menggunakan patch 128.

### Patch 130 · Kas kecil dan administrasi Back Office

Pasang setelah patch 129. Jalankan `database/petty-cash-130.sql` di Supabase SQL Editor,
atau gunakan migrasi bernomor yang sama melalui alur migrasi proyek. Muat ulang POS
sesudah SQL dan frontend terpasang.

- Absensi tersedia langsung di sidebar Toko, Gudang dan Back Office. Admin Back Office
  mengelola CRM, master barang dan akun operasional. Akun owner dan admin pusat dikelola owner.
- Dokumen manual lama dapat dibuka melalui **Laporan → Arsip dokumen**. Nota supplier
  menjadi dasar penerimaan dan batch gudang. Invoice dan surat jalan pengiriman
  dibuat melalui **Pengiriman & Tagihan**. Riwayat pelanggan dan poin berada di CRM.
  Tab pelanggan yang sebelumnya bersumber dari invoice manual telah disembunyikan.
- Kasir mengajukan dana awal atau reimbursement melalui **Pengeluaran Toko**.
  Saldo petty cash awal tiap cabang Rp0. Back Office mencatat pencairan aktual
  melalui **Keuangan PT. Altara Rasa Nusantara**. Pencairan mendebit saldo setoran dan menambah
  kas kecil cabang. Pengeluaran kasir mengurangi petty cash saat disimpan.
- Biaya rutin cabang seperti gaji, sewa dan listrik dibayar dari saldo PT. Altara Rasa Nusantara di
  Back Office. Pencairan reimburse merupakan perpindahan dana. Biaya toko sudah
  tercatat pada transaksi pengeluaran. Transaksi historis mempertahankan sumber dana awal.
- Ekstrak patch di folder proyek dan jalankan `.\scripts\windows\push-patch-130.cmd`
  dari PowerShell untuk verifikasi, commit dan push.

### Patch 131 · Transfer barang nonbuah ke toko

Back Office dapat memasukkan buah dan barang nonbuah dalam satu dokumen
**Pengiriman & Tagihan → Transaksi barang keluar → Transfer ke toko Maniac Duren**.
Pilih produk dan batch gudang. Form menampilkan modal dan sisa batch. Untuk nonbuah,
isi jumlah kirim dan harga per satuan stok. Dokumen aktif mencadangkan jumlah itu.

Gudang memindai barcode buah dan memasukkan jumlah fisik nonbuah per batch saat
menyelesaikan penyiapan. Setelah invoice dan surat jalan terbit, konfirmasi kirim
mengurangi stok gudang. Toko memeriksa setiap baris saat penerimaan lengkap.
Batch tujuan menyimpan referensi batch asal, supplier, kedaluwarsa, modal supplier,
dan harga transfer sebagai modal toko.

Pasang setelah patch 130. Jalankan `database/outbound-units-131.sql` di Supabase SQL Editor
atau gunakan migrasi yang sesuai. Ekstrak ZIP di folder proyek. Untuk verifikasi, commit,
dan push dari PowerShell, jalankan `.\scripts\windows\push-patch-131.cmd`.

### Penerimaan langsung di cabang dan mutasi 132

`pos/receiving-session-ui.mjs` menampilkan nota untuk cabang penerima. Pada baris barang satuan, **Isi jumlah diterima** membuka kolom jumlah aktual. Setelah disimpan, angka tampil di samping tombol **Ubah jumlah**. Tombol **Selesai** aktif setelah setiap jenis barang satuan memiliki jumlah aktual dan setiap jenis buah memiliki hasil scan.
`pos/warehouse-ui.mjs` menghubungkan pembukaan nota, pemilihan barang kiriman
dan pemeriksaan barang di tujuan. Sejak patch 136, toko tujuan memindai setiap label buah dan mencatat jumlah barang satuan per batch. `pos/branch-dispatch-ui.mjs` memuat
form transfer cabang dengan pengirim dari data karyawan dan pencarian SKU.
`pos/warehouse-flow.mjs` menangani alokasi FIFO barang satuan,
barcode, rincian batch dan dokumen cetak. `database/branch-stock-132.sql`
menerapkan otorisasi, mutasi stok dan pembayaran supplier cabang di server.
Lihat [alur dan pemasangan patch 132](PATCH-132-ALUR-CABANG.md).

### Harga modal dan transfer Back Office 133

Menu **Harga Modal** menampilkan semua SKU Master Barang, termasuk bahan, produk resep, dan SKU yang belum memiliki batch.
Cari nama atau SKU di seluruh cabang, atau filter satu cabang. Gunakan **Lihat batch** untuk melihat lokasi dan nota asal.
`pos/cost-prices.mjs` mengelompokkan batch per SKU dan lokasi. Halaman menampilkan rentang modal jika nilai batch yang masih bersisa berbeda.
Saat stok habis, halaman menandai modal batch terakhir. SKU tanpa batch menampilkan **Belum tersedia**. Harga modal dihitung dari batch dan hanya ditampilkan di halaman ini.
Koreksi memakai tindakan owner pada nota supplier. Admin dan owner memilih lokasi asal di **Back Office → Transfer Stok**.
`database/office-stock-transfers-133.sql` membatasi pengiriman antarlokasi, termasuk pengiriman dokumen transfer lama.
Cabang tujuan tetap mengonfirmasi penerimaan berdasarkan surat jalan.

### Inventory Back Office

**Data & administrasi → Inventory** menampilkan saldo fisik dan kiriman aktif untuk semua lokasi atau satu lokasi. Kiriman masuk ke kolom dalam perjalanan di lokasi tujuan sampai cabang mengonfirmasi penerimaan. Total mencakup stok di lokasi dan dalam perjalanan satu kali, dengan satuan terpisah.
`pos/office-inventory.mjs` menggunakan saldo batch, surat jalan dan jurnal stok. **Lihat jejak** menampilkan posisi dan mutasi per SKU, termasuk batch dan nomor dokumen yang tersedia. Scan atau ketik barcode untuk membuka riwayat satu buah.

### Pembatalan nota supplier

Di **Back Office → Nota Supplier → Buka nota → Batalkan nota**, petugas memasukkan alasan. Nota yang belum dibukukan dan tanpa pembayaran aktif masuk ke **Nota dibatalkan**. Pembatalan menyimpan draf penerimaan dan melepaskan reservasi barcode. Kas, persediaan dan jurnal transaksi dibukukan melalui alur operasional masing-masing. RPC memeriksa ulang revisi nota dan sesi saat transaksi disimpan.

### Penjualan buah di POS

Klik kartu buah lalu scan atau ketik nomor barcode pada label. Scan label langsung di kolom kasir juga memasukkan buah ke pesanan. Setiap label terdaftar menentukan SKU, batch, supplier, dan berat satu butir. POS memakai harga jual per kg cabang aktif dan membukukan penjualan saat pembayaran.

### Back Office pusat

Back Office menampilkan seluruh cabang yang tersedia untuk akun pusat. Pilihan **Lokasi aktif** ada di ruang kerja operasional. Kembali ke **Toko** memulihkan cabang operasional yang dipilih. Filter lokasi di Harga Jual, Harga Modal, Inventory dan Laporan hanya berlaku pada halaman tersebut.

Di **Transfer Stok**, daftar surat jalan menampilkan asal dan tujuan. Saat membuat pengiriman, pilih lokasi asal dan toko tujuan pada formulir. Barcode buah, saldo dan alokasi FIFO diperiksa terhadap lokasi asal. Saat membuka nota supplier, pilih cabang penerima. Metode pembayaran dan jam kerja juga menetapkan cabang pada halaman masing-masing.

`pos/branch-notes-ui.mjs` menangani nota estimasi Back Office, penyiapan toko asal, perbandingan aktual, penerbitan surat jalan, dan konfirmasi pengiriman. `database/branch-transfer-notes-135.sql` mengunci barang saat progres disimpan atau diajukan, serta membukukan stok saat dikirim melalui mutasi batch yang sudah ada. Toko tujuan memakai menu **Terima dari cabang** untuk mengonfirmasi penerimaan.

## Alur kerja antar divisi dan laporan

| Tahap                    | Penanggung jawab dan serah terima                                                                                                                                          | Bukti untuk pemeriksaan                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Pembelian dan penerimaan | Back Office membuka nota untuk cabang. Petugas penerimaan mencatat jumlah aktual per barang dan memindai setiap buah sebelum menyelesaikan penerimaan.                     | Nota supplier, batch, barcode dan jurnal stok masuk. Pembayaran barang dan ongkir mengikuti tanggal pembayaran masing-masing. |
| Transfer                 | Back Office meminta jumlah estimasi. Toko asal menyiapkan jumlah aktual. Back Office menyetujui aktual dan menerbitkan surat jalan. Toko asal mengonfirmasi keberangkatan. | Nota mencatat permintaan dan persetujuan. Laporan Pengiriman memasukkan satu baris per kiriman setelah barang berangkat.      |
| Terima kiriman           | Toko tujuan memindai kembali setiap buah dan mencocokkan barang satuan per batch dengan surat jalan.                                                                       | Status diterima lengkap dan jurnal masuk tujuan. Filter cabang di Pengiriman mencakup asal maupun tujuan.                     |
| Penjualan dan pelayanan  | Tukang potong memeriksa buah. Kasir memindai barang dan mencatat pembayaran. Menu resep yang lunas masuk dapur. Saat pesanan siap, petugas mencatat penyerahan.            | Log kasir, struk dan rincian harian pada Ringkasan penjualan. Void dan refund mengikuti transaksi asal.                       |
| Reject dan olahan        | Petugas mencatat batch dan alasan. Kitchen mencatat hasil olah atau waste.                                                                                                 | Mutasi stok dan jejak Batch supplier memperlihatkan penandaan, pemakaian dan hasil olahan.                                    |
| Kas dan biaya            | Kasir mencatat setoran dan pengeluaran petty cash. Back Office menangani pengisian dana dan biaya operasional PT.                                                          | Laporan Arus kas, Pengeluaran dan HPP & Hasil memakai sumber serta tanggal masing-masing.                                     |

Di menu **Laporan**, pilih tanggal pada **Ringkasan** untuk melihat transaksi penyusun omzet hari itu. Pada **Pengiriman**, rentang tanggal mengikuti waktu keberangkatan dalam WIB dan status menunjukkan kondisi terakhir. Cari nomor nota, surat jalan atau nama cabang untuk rekonsiliasi. Pada **Batch supplier**, tanggal menyaring penerimaan, sedangkan hasil mencakup umur batch. Ekspor Ringkasan memuat laporan standar sesuai izin. Ekspor bagian lain mengikuti laporan dan filter aktif.

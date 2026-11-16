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

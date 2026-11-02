# Peta struktur proyek

Mulai dari tabel berikut ketika mencari kode. Modul fitur tetap menggunakan lokasinya agar URL impor, cache, dan tautan yang sudah ada tidak rusak.

## Peta file menurut pekerjaan

| Yang ingin diubah | File utama |
|---|---|
| Tampilan/isi halaman publik | `index.html`, `style.css`, `script.js`, `assets/` |
| Katalog pelanggan dan editor menu | `menu/index.html`, `menu/kelola.html`, berkas JS/CSS/JSON di `menu/` |
| Startup, sesi, navigasi, pengiriman transaksi | `pos/app.js`, `pos/session.mjs`, `pos/retry.mjs` |
| Kelompok menu dan sidebar | `pos/navigation.mjs`, `pos/sidebar.mjs` |
| Token warna dan aturan UI bersama | `pos/ui-tokens.css`, `pos/ui-system.css`, `pos/workspace-ui.css` |
| Produk, kartu katalog, varian | `pos/catalog.mjs`, `pos/product-dialog.mjs`, `pos/product-variants.mjs` |
| Kasir, keranjang, pembayaran transaksi | `pos/operations-ui.mjs`, `pos/cashier*.mjs`, `pos/cashier.css` |
| Buka/tutup kasir, riwayat shift | `pos/cashier-shifts*.mjs`, `pos/cashier-shifts.css` |
| Pengaturan metode pembayaran | `pos/payment-methods*.mjs`, `pos/payment-methods.css` |
| Stok masuk dan produksi | `pos/inventory-ui.mjs`, `pos/core.mjs`, `pos/production*.mjs`, `pos/inventory.css` |
| Reject, olahan, dan analisis batch | `pos/reject*.mjs`, `pos/batch*.mjs`, `pos/reject-flow.css` |
| Dokumen admin dan laporan | `pos/documents*.mjs`, `pos/reports*.mjs`, `pos/reports-admin.css` |
| CRM, member, aturan poin | `pos/crm*.mjs`, `pos/crm.css` |
| Karyawan dan absensi | `pos/employees*.mjs`, `pos/employees.css` |
| Profil toko dan cetak | `pos/store-settings*.mjs`, `pos/receipt*.mjs` |
| Printer, timbangan, dan barcode | `pos/devices-ui.mjs`, `pos/device-settings.mjs`, `pos/receipt-weighing.mjs`, `pos/barcode-scanner.mjs`, `scripts/windows/` |
| Latihan tanpa menulis produksi | `pos/stock-demo*.mjs`, `pos/documents-demo.mjs` |
| Instalasi PWA dan pemulihan | `pos/pwa.mjs`, `pos/sw.js`, `pos-recover.html`, `pos-recovery.mjs` |
| Endpoint backend | `api/pos-config.js`, `api/pos-login.js`, `api/pos-employee.js` |
| Rantai schema/RPC | `database/README.md`, `database/*.sql` |

Akhiran `-ui.mjs` umumnya memuat HTML dan event form; modul tanpa `-ui` memuat perhitungan, payload, atau aturan fitur. `pos/app.js` menghubungkan modul tersebut. Cari nama aksi, misalnya `order_create`, untuk menelusuri form → handler → RPC → SQL → pengujian.

## Aturan perubahan berikutnya

1. Pakai URL impor relatif yang sama untuk modul yang sama, tanpa versi query berbeda-beda. Browser menganggap `file.mjs?v=1` dan `file.mjs?v=2` sebagai dua modul berbeda, termasuk state di dalamnya.
2. Tambahkan menu melalui `navigation.mjs`, judul/renderer/binder di `app.js`, lalu periksa akses dan tampilan HP. Hindari membuat pintu masuk kedua yang melewati pemeriksaan hak akses.
3. Letakkan CSS fitur di berkas fiturnya. Aturan input generik di `ui-system.css` menggunakan spesifisitas rendah agar tidak menimpa pencarian atau kontrol khusus. Pertahankan urutan stylesheet dalam `pos/index.html` saat tidak mengubah kontrak cascade.
4. Perubahan UI ditempatkan dekat modul fiturnya; aturan saldo, transaksi, dan hak akses tetap ditegakkan SQL. Uji pengiriman ulang dan pembatalan untuk perubahan mutasi.
5. SQL patch lama menggunakan rantai wrapper. Jangan menghapus definisi bernama sama atau mengulang patch lama di atas patch baru untuk 'merapikan' SQL.
6. Panduan yang berlaku berada di `docs/`; petunjuk versi lama berada di `docs/archive/`. Berkas foto cadangan tetap lokal dan dikecualikan dari deployment.

Modul offline/page-cache dan bagian SQL historis masih dipertahankan untuk kompatibilitas/pengujian. Aplikasi aktif memakai mode web online; PWA hanya menyediakan instalasi, bukan antrean transaksi offline. Jangan mengaktifkan modul lama hanya karena file tersebut masih ada.

## Pemeriksaan sebelum commit

Jalankan `npm run check`, `npm test`, lalu `npm run test:browser` untuk perubahan UI/alur. `check` memeriksa sintaks, tujuan impor/aset HTML lokal, identitas impor POS, duplikasi menu/stylesheet, dan kecocokan SQL fondasi dengan sumbernya. Script ini tidak membuktikan seluruh URL dinamis valid; pengujian browser melengkapi pemeriksaan tersebut.

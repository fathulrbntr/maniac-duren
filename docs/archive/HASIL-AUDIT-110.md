# Hasil audit 110 — 15 November 2026

Sumber: `maniac-duren(1).zip` yang dilampirkan. Pekerjaan dilakukan pada salinan proyek, tanpa koneksi atau perubahan ke database produksi dan tanpa commit/push/deploy.

## Perbaikan terkonfirmasi

| Temuan                                                                                             | Perbaikan                                            | Verifikasi                                                                            |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Body JSON `null` pada API karyawan menyebabkan destructuring error sebelum blok penanganan error   | Tolak body bukan object dan array dengan HTTP 400    | Tes malformed body; tidak menghubungi Supabase                                        |
| Pergantian pasangan tablet saat sesi lama masih ditutup dapat mengaktifkan kembali permintaan lama | Nomor generasi diperiksa setelah remote stop selesai | Tes dua start berurutan dan stop saat cleanup tertunda                                |
| Dispatcher mutasi POS memakai ternary bertingkat panjang                                           | Pusatkan rute di `pos/data/mutations.mjs`            | Endpoint, bentuk payload, ID retry, delta scan, error kategori, dan isolasi mode demo |
| Dua tes startup masih mencari label “Data toko” sebelum patch 108                                  | Cocokkan identitas section branch pada HTML aktual   | Login, refresh, logout, pindah halaman/outlet tetap diuji                             |
| File ES module POS berada di package tanpa deklarasi jenis modul                                   | Tambahkan `pos/package.json` dengan `type: module`   | Modul POS dan API CommonJS tetap terpisah                                             |
| Folder `supabase/` belum masuk daftar pengecualian deployment                                      | Tambahkan ke `.vercelignore`                         | Pemeriksaan wajib pengecualian deployment                                             |

## Perapian

- Format JavaScript, CSS, HTML, JSON konfigurasi, tes, dan dokumentasi aktif diseragamkan dengan Prettier. SQL/vendor tidak diformat ulang.
- Import dan fungsi/variabel produksi yang tidak digunakan dihapus. Import `app.js` dikelompokkan di bagian atas.
- Ketergantungan global editor foto dibuat eksplisit melalui elemen DOM dan event input. Temuan awal lint pada `say`, `form`, dan `preview` adalah ketergantungan antar-classic-script, **bukan bukti runtime bug** pada urutan script semula.
- Lima modul yang tidak dijangkau entry point aplikasi aktif dipindahkan ke `tests/legacy/`. Tes kompatibilitas tetap dipertahankan; modul lama tidak ikut deployment.
- 22 petunjuk/inventaris patch di root dipindahkan ke `docs/archive/`. Log hasil tes lama yang bisa dibuat ulang dibuang dengan daftar hash.
- Duplikat `pos/logo.png` dihapus; website dan POS memakai `assets/logo.png`. Ikon PWA berukuran khusus tetap ada.
- 15 foto base64 dalam katalog diekstrak ke `menu/images/` **tanpa mengubah byte foto**. Semua 23 produk, harga, deskripsi, dan field selain URL foto diverifikasi tetap sama. `menu.json`: 4.150.635 → 8.972 byte, turun sekitar 99,8%. Foto tetap perlu diunduh saat ditampilkan; perubahan ini mengurangi payload JSON, bukan menghilangkan transfer gambar.
- ZIP keluaran tidak membawa `.git`, dependensi `node_modules`, database/hasil tes sementara, atau cadangan foto karyawan `maniac-foto-*`. Cadangan asli tidak dihapus dari sumber pengguna.
- Manifest staging dan cleanup diperbarui. Cleanup menolak file yang sudah berubah dan jalur yang keluar dari proyek.

## Pemeriksaan

- Sintaks, impor dan aset lokal, URL modul tunggal, menu/stylesheet duplikat, aset CSS/foto katalog, hasil build SQL fondasi, serta kesamaan dua salinan migrasi CLI.
- ESLint untuk kode aplikasi/API: tanpa error atau warning.
- Format: konsisten dengan konfigurasi proyek.
- Simulasi pemasangan dari ZIP asli, penimpaan file baru, lalu cleanup menghasilkan 541 file yang identik dengan paket rilis. Cleanup kedua tidak mengubah apa pun.
- Unit, simulasi DOM, dan PGlite: 170 tes lulus, 0 gagal. Termasuk stok/batch/barcode, gudang/transfer, pembayaran, kasir, kitchen, reject, laporan, CRM, sesi, retry, mode demo, dan API.
- Rantai fitur gudang 107 dan wireless diuji bersama. Tidak ditemukan RPC `SECURITY DEFINER` yang bisa dipanggil `anon` pada fixture lengkap; seluruh fungsi privileged yang diperiksa memiliki `search_path` tetap. Akses langsung tabel pairing ditolak dan RPC viewer tetap khusus server.
- `npm audit`: 0 kerentanan yang dilaporkan registry pada lockfile saat pemeriksaan. Ini bukan jaminan tidak ada bug aplikasi.

## Batas pengujian

Chromium tidak dapat diluncurkan di lingkungan audit: `socket() failed: Operation not permitted`. Karena itu suite Playwright, render visual, dan operasi browser nyata **belum terverifikasi pada audit ini**. Tes DOM dan SQL lokal sudah dijalankan; tidak menggantikan pemeriksaan browser.

Tidak menguji data/hak akses akun produksi, konfigurasi hosting/Supabase nyata, perangkat scanner/timbangan, printer fisik, atau tablet asli. Lakukan tes staging dan perangkat sebelum produksi. Tidak ada reset database atau migrasi baru untuk audit ini. Kesesuaian data produksi tetap perlu diperiksa secara terpisah.

## Mengapa SQL tidak digabung sembarangan

`pos_read`, `pos_mutate`, dan wrapper versi lama membentuk rantai kompatibilitas. Nama yang berulang tidak otomatis berarti kode duplikat yang aman dihapus. Fondasi dan patch yang masih diperlukan tes dipertahankan. Dua salinan SQL 105/106 memiliki riwayat migrasi CLI yang sudah ada; `npm run check` mencegah isinya berbeda.

Panduan hak akses yang dipakai saat memeriksa fixture: [Supabase Database Functions](https://supabase.com/docs/guides/database/functions). Pemeriksaan ini berlaku pada schema fixture dari ZIP, bukan audit proyek Supabase yang sedang live.

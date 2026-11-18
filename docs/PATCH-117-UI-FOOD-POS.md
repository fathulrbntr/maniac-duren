# Patch 117 — UI Food POS Dark

Pembaruan tampilan seluruh POS Maniac Duren dengan gaya Food POS Dark: latar
biru gelap, panel gelap, aksen coral, navigasi ikon, foto produk bundar,
kategori bergaris, keranjang di kanan dan formulir yang seragam.

## Isi dan cakupan

- Kasir, dashboard, data master, gudang, nota supplier, invoice/tagihan, laporan,
  dokumen, kitchen, reject, karyawan, absensi, CRM dan pengaturan memakai token
  warna, font Barlow lokal, tombol, tabel dan dialog bersama.
- Layar pelanggan mengikuti tema dark yang sama; QR pembayaran tetap memiliki
  bidang putih agar terbaca. Protokol pairing/pembayaran tidak berubah.
- Desktop menggunakan rail ikon. Sidebar lengkap masih bisa dibuka untuk nama
  menu dan lokasi. Di ponsel, sidebar menjadi panel dan dock tetap tersedia.
- Tema awal dark jika belum ada pilihan tersimpan. Preferensi light/dark yang
  sudah tersimpan tetap dipakai; gunakan tombol tema untuk beralih ke dark.
- Paket ini kumulatif terhadap sumber setelah patch 115: termasuk semua file
  supplier, format angka dan barcode dari patch 116 serta koreksi tes 116A.
  Jika patch 116 sudah dipasang, file yang sama boleh ditimpa dari paket ini.
- Tidak ada SQL baru, reset data, perubahan hak akses, perhitungan harga, atau
  jalur penyimpanan transaksi. Nama, foto produk dan data tetap milik aplikasi.

## Pemasangan

1. Tutup proses tes yang lama. Simpan pekerjaan lokal sebelum menimpa file.
2. Ekstrak **isi** ZIP ke `D:\PROJECT\MANIAC DUREN\maniac-duren` dan pilih
   Replace/Timpa file. Folder `pos`, `tests`, `scripts`, `docs` harus langsung
   berada di root proyek, bukan di subfolder bernama ZIP.
3. Pastikan `docs/PATCH-117-UI-FOOD-POS.md` dan
   `pos/assets/fonts/barlow/Barlow-Regular.ttf` ada di proyek aktif.
4. Jalankan PowerShell di bawah. Jika browser sudah terpasang, instalasi ulang
   tidak diperlukan. Jika Playwright meminta Chromium, jalankan
   `npx.cmd playwright install chromium`, lalu ulangi tes.

```powershell
cd "D:\PROJECT\MANIAC DUREN\maniac-duren"
$ErrorActionPreference = "Stop"

if (!(Test-Path ".\docs\PATCH-117-UI-FOOD-POS.md")) {
    throw "Patch 117 belum diekstrak ke folder proyek aktif."
}
if (!(Select-String -Path ".\tests\input-fields-browser.mjs" -SimpleMatch "const rawValue" -Quiet)) {
    throw "Tes input masih versi lama. Ekstrak ulang patch 117 dan timpa file."
}

git status --short
npm.cmd run verify
if ($LASTEXITCODE -ne 0) { throw "Verifikasi gagal. Periksa log." }

npm.cmd run test:browser
if ($LASTEXITCODE -ne 0) { throw "Tes browser gagal. Periksa log." }

node scripts/stage-patch-117.mjs
if ($LASTEXITCODE -ne 0) { throw "Stage patch gagal." }

git diff --cached --stat
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "Periksa diff sebelum commit." }

git commit -m "Apply Food POS dark UI across Maniac Duren POS"
if ($LASTEXITCODE -ne 0) { throw "Commit gagal." }
git push
if ($LASTEXITCODE -ne 0) { throw "Push gagal." }
```

Script stage hanya menambahkan file dalam paket, termasuk file 116/116A yang
belum di-commit. File log `browser-error-116.txt` tidak ikut di-stage. File lain
yang sebelumnya sudah di-stage oleh pengguna tetap berada di staging area;
periksa ringkasan diff sebelum commit.

Setelah deployment dari push selesai, lakukan hard refresh dengan Ctrl+F5.
Jika tema masih terang, tekan tombol tema; pilihan tersimpan memang dipertahankan.

## Perbaikan tes input

Kesalahan lama `actual '150.000' / expected '150000'` berasal dari assertion
browser. `inputValue()` membaca tampilan native, sedangkan getter `.value`
aplikasi di page realm mengembalikan nilai mentah. Tes kini memeriksa keduanya
secara terpisah: tampilan `150.000`, nilai aplikasi `150000`, valueAsNumber, dan
payload FormData. Formatter ribuan tidak dinonaktifkan untuk meloloskan tes.

## Validasi dan batasnya

- `npm run verify`: pemeriksaan arsitektur/sintaks/aset, ESLint, format, serta
  186 tes unit, simulasi DOM dan SQL fixture lulus.
- Pratinjau browser memakai aplikasi asli dan data fixture lokal: login, ganti
  area kerja, semua kelompok navigasi back office/toko, tema terang/gelap,
  ukuran ponsel 360/390, tablet 1024 dan desktop. Halaman yang diperiksa tidak
  mengalami overflow horizontal; tabel lebar tetap dapat digulir di dalam panel.
- Dialog nota pada 390 px: ribuan, desimal, penghilangan nol awal, dialog tambah
  supplier bertingkat, dan pembatalan form diperiksa. Scan berikutnya setelah
  kode tak dikenal menggantikan isi lama dan tetap mempertahankan nol awal.
- Rangkaian `npm run test:browser` penuh belum dapat dijalankan di lingkungan
  pembuat paket: Chromium gagal diluncurkan dengan `socket() failed: Operation
not permitted`. Pemeriksaan pratinjau di atas tidak menggantikan seluruh suite.
  Jalankan suite tersebut di Windows sebelum commit/push.
- Belum menguji database produksi, printer, scanner fisik atau tablet nyata.

## Acuan desain dan aset

Acuan pengguna:
https://www.figma.com/design/57QBJn6bhrx8mBac2s2h4E/Food-POS-Dark---Tablet-Device--Community-?node-id=232-8953

Food POS Dark — Tablet Device, Yahya Amirudin. Implementasi ulang gaya visual
untuk alur Maniac Duren, menggunakan kode serta aset produk aplikasi sendiri.
Pratinjau publik yang dapat dibaca:
https://ui4free.com/uikit/food-pos-dark---tablet-device-figma.htm

Koneksi Figma dikonfirmasi berhasil, tetapi alat pembaca frame belum tersedia
pada sesi implementasi, dan kanvas browser tidak dapat berjalan karena WebGL.
Karena itu ukuran/layer node 232:8953 belum diverifikasi langsung; paket ini
mengikuti pratinjau publik desain tersebut, bukan klaim identik per piksel.

Font Barlow: Google Fonts, SIL Open Font License. File font dilayani lokal,
tanpa permintaan Google Fonts saat kasir berjalan. Lisensi disertakan di
`pos/assets/fonts/barlow/OFL.txt`.

# Patch 117B — audit sidebar dan tes browser

Paket terpadu berdasarkan sumber setelah patch 115. Berisi UI 117, supplier/input/
barcode 116, koreksi 116A/117A, serta perbaikan dan audit berikut. Timpa file dari
paket ini pada proyek yang sudah memakai 117 atau 117A.

## Temuan dan perbaikan

1. Dialog lama masih dapat berada dalam DOM setelah `close()`. Audit UI dan
   tes gudang memilih dialog yang masih `open`; audit membedakan dialog produk
   dan penerimaan serta memilih tombol Tutup secara spesifik.
2. Pada perpindahan desktop ke mobile, `panel.inert` dapat masih berisi keadaan
   desktop. Audit kini memakai helper sidebar bersama, bukan pemeriksaan inert
   satu kali untuk memutuskan apakah menu harus dibuka.
3. Pada perpindahan mobile ke desktop, ukuran baru dapat menyembunyikan toggle
   header ketika sidebar sudah penuh. Helper menunggu dua frame render sebelum
   membaca keterlihatan picker lokasi. Tidak memakai force-click atau sleep tetap.
4. Controller aplikasi sebelumnya menutup menu pada setiap event media. Tes regresi
   memunculkan kasus klik buka setelah breakpoint berubah tetapi sebelum event
   tersebut dikirim: menu baru terbuka lalu tertutup lagi. Controller sekarang
   menerapkan transisi sekali sebelum toggle dan mempertahankan pilihan pengguna
   ketika event media terlambat tiba.
5. Runner lama berhenti pada kegagalan pertama. Runner sekarang tetap menjalankan
   suite independen, menyimpan log setiap suite dan menampilkan semua kegagalan
   dalam satu ringkasan. Suite yang membutuhkan fixture gagal ditandai `blocked`.
   Exit code tetap gagal jika ada `failed` atau `blocked`; commit tidak diteruskan.

Penelusuran selector dan urutan tes mencakup seluruh 18 entri dalam
`scripts/test-browser.mjs`, termasuk website publik, gudang, workflow dan invoice
setelah audit UI. Assertions nilai,
hak akses, pembayaran, stok, overflow dan jumlah data tetap dipertahankan.
Selector `.first()` untuk koleksi seperti baris transaksi tidak diganti secara
massal; pemilihan dialog yang ambigu diperbaiki pada alur terkait.

## Pengujian dan batas verifikasi

- Tes regresi sidebar benar-benar gagal sebelum perbaikan controller, lalu lulus.
- Tes runner memakai proses Node nyata untuk memeriksa kegagalan awal/akhir,
  suite independen, fixture gagal, log, ringkasan dan jalur seluruh suite lulus.
- `npm run verify` lulus: arsitektur, sintaks, lint, format dan 187 tes unit/DOM/SQL.
- Pratinjau aplikasi asli dengan data fixture: 20 menu pada 1600, 1024, 900, 901,
  390 dan 360 px, masing-masing tema terang/gelap. Seluruh tujuan navigasi dapat
  dibuka dan tidak ditemukan overflow halaman. Dialog produk dan penerimaan juga
  diperiksa pada enam ukuran dan dua tema tersebut, termasuk tombol tutup aktif.
- `npm run test:browser` dicoba untuk seluruh 18 suite di lingkungan pembuat
  paket: satu suite SQL lulus, 17 suite browser gagal saat peluncuran Chromium
  karena `socket() failed: Operation not permitted`. Ini bukan kelulusan browser.
  Pratinjau browser tidak menggantikan seluruh assertions Playwright, PDF, unduhan,
  atau alur database browser. Jalankan rangkaian penuh di Windows sebelum push.
- Log Windows sebelumnya membuktikan 186 tes dan suite sampai batch-profit lulus
  sebelum perbaikan ini. Hasil tersebut tidak dipakai untuk mengklaim suite sisanya
  atau keseluruhan revisi baru sudah lulus.

## Pemasangan dan commit/push

Ekstrak isi ZIP ke `D:\PROJECT\MANIAC DUREN\maniac-duren` dan pilih Timpa file.
Folder `pos`, `tests`, `scripts` dan `docs` berada langsung di root proyek.
Tidak memerlukan instalasi dependensi baru atau perubahan SQL.

```powershell
cd "D:\PROJECT\MANIAC DUREN\maniac-duren"
$ErrorActionPreference = "Stop"

if (!(Test-Path ".\docs\PATCH-117B-AUDIT-BROWSER.md")) {
    throw "Patch 117B belum diekstrak ke folder proyek aktif."
}

git status --short
npm.cmd run verify
if ($LASTEXITCODE -ne 0) { throw "Verifikasi gagal." }

npm.cmd run test:browser
if ($LASTEXITCODE -ne 0) {
    throw "Tes browser gagal. Semua hasil ada di test-results\browser-suite\summary.json dan log per suite."
}

node scripts/stage-patch-117b.mjs
if ($LASTEXITCODE -ne 0) { throw "Stage patch gagal." }
git diff --cached --stat
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "Periksa diff sebelum commit." }
git commit -m "Apply Food POS UI and fix responsive navigation browser checks"
if ($LASTEXITCODE -ne 0) { throw "Commit gagal." }
git push
if ($LASTEXITCODE -ne 0) { throw "Push gagal." }
```

Jika ada kegagalan, runner melanjutkan suite independen sampai selesai. Lihat
ringkasan `test-results/browser-suite/summary.json` dan file `.log` yang disebutkan
di akhir terminal. Semua file hasil tes dikecualikan dari daftar stage patch.
File lain yang sebelumnya telah di-stage tetap ada; periksa ringkasan sebelum commit.

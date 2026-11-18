# Patch 117C — tes navigasi saat sidebar sedang menutup

Paket kumulatif terhadap 115, termasuk perubahan 116, 117, 117A dan 117B.
Ekstrak isi ZIP ke folder proyek aktif dan timpa file yang sesuai.

## Penyebab yang berhasil direproduksi

Ketika desktop dengan sidebar terbuka berubah menjadi layar 900 px, controller
menetapkan panel tertutup/inert. Transisi CSS masih mempertahankan
`visibility: visible` saat panel bergeser keluar. Helper 117B hanya menunggu dua
frame kemudian membaca keterlihatan picker lokasi. Akibatnya helper bisa
melewatkan tombol pembuka, lalu Playwright menunggu tombol Dashboard stabil
sampai panel akhirnya tersembunyi. Ini sesuai urutan error yang dilaporkan.

Observasi browser pada aplikasi fixture menunjukkan setelah dua frame:
`width=900`, `mobileOpen=false`, `aria-expanded=false`, `inert=true`, tetapi
`visibility=visible`. Setelah transisi selesai, panel menjadi tersembunyi.
Regresi unit untuk kondisi tersebut gagal dengan helper 117B.

Nomor baris klik 134 dan pemanggilan 143 sama pada 117A dan 117B. Nomor baris
tersebut tidak membuktikan bahwa file pengguna masih versi lama.

## Perubahan

- Helper menunggu status controller sesuai breakpoint, kemudian membaca
  `aria-expanded` untuk menentukan apakah sidebar perlu dibuka.
- Tes tetap menggunakan klik biasa; assertion, animasi, dan batas timeout tetap
  dipertahankan. Tidak ada `force: true` atau suite yang dilewati.
- Audit memastikan halaman tujuan benar-benar aktif setelah klik.
- Log menampilkan `UI audit 117C`, tema dan ukuran layar. Jika gagal, konteks
  lengkap disimpan di `test-results/ui-audit/failure.json` serta screenshot.

## Verifikasi dan batas

`npm run verify` lulus: pemeriksaan struktur, ESLint, Prettier dan seluruh
187 tes, tanpa kegagalan. Regresi sidebar gagal dengan helper lama dan lulus
setelah perbaikan. Navigasi terfokus melalui browser preview juga berhasil pada
900/901 px, 390/360 px dan kembali ke 1600 px, mencakup tema terang/gelap.
Preview memakai data fixture, tanpa koneksi database produksi.

Playwright CLI di lingkungan penyusun tidak dapat meluncurkan Chromium karena
`socket() failed: Operation not permitted`. Runner sudah dicoba seluruhnya:
satu suite SQL lulus, 17 suite yang membutuhkan browser berhenti saat peluncuran.
Pengamatan preview dan unit test
bukan pengganti hasil 18 suite Playwright di Windows. Jangan menyebut suite
browser sudah lulus sebelum perintah berikut selesai tanpa error.

## PowerShell: uji lalu commit dan push

```powershell
cd "D:\PROJECT\MANIAC DUREN\maniac-duren"
$ErrorActionPreference = "Stop"

if (!(Select-String -LiteralPath ".\tests\ui-audit-browser.mjs" -SimpleMatch "UI audit 117C" -Quiet)) {
    throw "File audit 117C belum terpasang di folder ini."
}

git status --short
node tests/ui-audit-browser.mjs
if ($LASTEXITCODE -ne 0) { throw "Audit UI gagal. Periksa test-results\ui-audit\failure.json." }

npm.cmd run verify
if ($LASTEXITCODE -ne 0) { throw "Verifikasi gagal." }
npm.cmd run test:browser
if ($LASTEXITCODE -ne 0) { throw "Tes browser gagal. Periksa test-results\browser-suite\summary.json." }

node scripts/stage-patch-117c.mjs
if ($LASTEXITCODE -ne 0) { throw "Stage patch gagal." }
git diff --cached --stat
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "Diff belum bersih." }

git commit -m "Fix POS sidebar audit during closing transitions"
if ($LASTEXITCODE -ne 0) { throw "Commit gagal." }
git push
if ($LASTEXITCODE -ne 0) { throw "Push gagal." }
```

Jika audit masih gagal, kirim isi `test-results/ui-audit/failure.json` dan log
suite yang gagal. File tersebut memuat konteks yang tidak ada pada log timeout
lama. Log/screenshot sementara tidak termasuk daftar file yang di-stage.

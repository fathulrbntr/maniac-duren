# Patch 118 — daftar barcode penerimaan selalu terbuka

Daftar **Barcode tersimpan** pada dialog penerimaan menjadi bagian tetap,
bukan panel yang dapat terlipat. Barcode langsung terlihat saat dialog dibuka,
setelah scan berhasil, setelah jeda/lanjutkan, dan saat membuka ulang penerimaan.
Jumlah dan tabel diperbarui setelah server mengonfirmasi penyimpanan; fokus
tetap kembali ke kolom scan untuk barcode berikutnya.

Perubahan tampilan berada di `pos/receiving-session-ui.mjs`. Tidak diperlukan
migrasi SQL. Jalur penyimpanan, pemeriksaan barcode, dan identitas retry tetap
menggunakan alur yang ada. Patch ini tidak mengubah kecepatan jaringan/server.

Paket kumulatif mencakup perbaikan sidebar 117C beserta patch 116–117 sebelumnya.
Ekstrak isi ZIP ke folder proyek aktif dan timpa file yang sesuai.

## Pengujian

Tes workflow UI/model lulus. Tes browser workflow diperkuat untuk memeriksa
barcode terlihat setelah masing-masing dari tiga scan dan setelah reload.
Hasil verifikasi penuh dicatat sebelum penyerahan. Chromium Playwright di
lingkungan penyusun diblokir `socket() failed: Operation not permitted`;
suite browser perlu dijalankan di komputer pengguna sebelum commit/push.

## PowerShell

```powershell
cd "D:\PROJECT\MANIAC DUREN\maniac-duren"
$ErrorActionPreference = "Stop"

git status --short
npm.cmd run verify
if ($LASTEXITCODE -ne 0) { throw "Verifikasi gagal." }
npm.cmd run test:browser
if ($LASTEXITCODE -ne 0) { throw "Tes browser gagal. Periksa test-results\browser-suite\summary.json." }

node scripts/stage-patch-118.mjs
if ($LASTEXITCODE -ne 0) { throw "Stage patch gagal." }
git diff --cached --stat
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "Diff belum bersih." }

git commit -m "Keep saved receiving barcodes visible after every scan"
if ($LASTEXITCODE -ne 0) { throw "Commit gagal." }
git push
if ($LASTEXITCODE -ne 0) { throw "Push gagal." }
```

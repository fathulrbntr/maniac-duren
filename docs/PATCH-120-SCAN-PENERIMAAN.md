# Patch 120 · Scan penerimaan supplier

Di dialog **Penerimaan**, barcode yang baru tersimpan muncul di baris paling atas tabel **Barcode tersimpan**. Urutan yang sama tampil saat petugas melanjutkan penimbangan atau membuka kembali nota.

Pesan scanner tampil tepat di bawah kolom **Scan barcode buah**. Setelah **Enter** atau **Simpan scan**, petugas melihat status penyimpanan. Konfirmasi menyebutkan barcode setelah server merespons. Jika label ditolak, alasannya muncul di tempat yang sama dan kolom siap menerima scan berikutnya.

## Pasang

Ekstrak isi ZIP ke folder proyek yang sudah menggunakan patch 119. Pastikan folder `pos`, `tests`, dan `docs` dari ZIP menyatu dengan folder yang sudah ada. Patch ini cukup dipasang melalui pembaruan kode POS.

## PowerShell untuk verifikasi, commit, dan push

Jalankan setelah mengekstrak ZIP. Tes browser memakai Chromium dari Playwright. Jika Chromium belum terpasang, jalankan `npx.cmd playwright install chromium` sekali.

```powershell
Set-Location -LiteralPath "D:\PROJECT\MANIAC DUREN\maniac-duren"
$ErrorActionPreference = "Stop"
$patchFiles = @(
  "pos/receiving-session-ui.mjs"
  "tests/warehouse-workflow-ui.test.mjs"
  "tests/warehouse-workflow-db.test.mjs"
  "tests/warehouse-workflow-browser.mjs"
  "docs/PATCH-120-SCAN-PENERIMAAN.md"
)

git status --short
npm.cmd run verify
if ($LASTEXITCODE -ne 0) { throw "Verifikasi proyek gagal." }
npm.cmd run test:browser
if ($LASTEXITCODE -ne 0) { throw "Tes browser gagal. Periksa test-results/browser-suite/summary.json." }

git add -- $patchFiles
if ($LASTEXITCODE -ne 0) { throw "Git add gagal." }
git diff --cached --stat -- $patchFiles
git diff --cached --check -- $patchFiles
if ($LASTEXITCODE -ne 0) { throw "Periksa diff patch 120." }
git commit --only -m "Show newest receiving scans first and feedback below the scanner" -- $patchFiles
if ($LASTEXITCODE -ne 0) { throw "Commit gagal." }
git push
if ($LASTEXITCODE -ne 0) { throw "Push gagal." }
```

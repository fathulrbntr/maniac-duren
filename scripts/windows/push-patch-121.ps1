# Jalankan dari PowerShell setelah mengekstrak patch 121 ke folder proyek.
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath (Join-Path $PSScriptRoot "..\..")
$patchFiles = @(
  "pos/dashboard-data.mjs"
  "pos/warehouse-ui.mjs"
  "pos/warehouse.css"
  "tests/location-fruit-stock.test.mjs"
  "scripts/windows/push-patch-121.ps1"
)

git status --short
if ($LASTEXITCODE -ne 0) { throw "Folder proyek Git tidak ditemukan." }
npm.cmd run verify
if ($LASTEXITCODE -ne 0) { throw "Verifikasi proyek gagal." }
npm.cmd run test:browser
if ($LASTEXITCODE -ne 0) { throw "Tes browser gagal. Periksa test-results/browser-suite/summary.json." }
git add -- $patchFiles
if ($LASTEXITCODE -ne 0) { throw "Git add gagal." }
git diff --cached --stat -- $patchFiles
git diff --cached --check -- $patchFiles
if ($LASTEXITCODE -ne 0) { throw "Periksa diff patch 121." }
git commit --only -m "Show fruit sales and reject processing totals by location" -- $patchFiles
if ($LASTEXITCODE -ne 0) { throw "Commit gagal. Periksa git status." }
git push
if ($LASTEXITCODE -ne 0) { throw "Push gagal. Commit tersimpan lokal." }

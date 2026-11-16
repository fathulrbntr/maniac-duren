# Memasang audit 110

ZIP berisi proyek lengkap, bukan hanya patch. Database produksi tidak diubah oleh audit ini; tidak ada SQL tambahan yang perlu dijalankan.

## Proyek yang sudah ada

1. Simpan cadangan atau commit pekerjaan lokal terlebih dahulu.
2. Ekstrak ZIP ke folder sementara. Salin **isi** folder `maniac-duren` ke folder proyek Anda dan timpa file yang sama. Jangan menyalin folder proyek ke dalam dirinya sendiri.
3. Jalankan perintah berikut dari PowerShell di folder proyek. Sesuaikan lokasi bila berbeda.

```powershell
Set-Location "D:\PROJECT\MANIAC DUREN\maniac-duren"
node scripts/apply-audit-cleanup.mjs --check
if ($LASTEXITCODE -ne 0) { throw "Pratinjau cleanup gagal. Periksa file yang disebutkan." }
node scripts/apply-audit-cleanup.mjs
if ($LASTEXITCODE -ne 0) { throw "Cleanup gagal. Tidak dilanjutkan." }
npm ci
if ($LASTEXITCODE -ne 0) { throw "Instalasi dependensi gagal." }
npm run verify
if ($LASTEXITCODE -ne 0) { throw "Pemeriksaan gagal. Jangan deploy dahulu." }
```

Cleanup memindahkan petunjuk lama dan menghapus hanya file usang/duplikat yang hash-nya sama dengan sumber audit. Bila file lama sudah Anda ubah, script berhenti sebelum menghapus apa pun. Periksa perbedaan file tersebut; jangan memaksa menghapus versi yang lebih baru.

`node_modules`, `.git`, hasil tes, dan cadangan `maniac-foto-*` tidak ada dalam ZIP hasil. `.git`, `.env`, konfigurasi Vercel lokal, dan cadangan foto yang sudah ada di komputer tidak dihapus oleh cleanup. `npm ci` membangun ulang dependensi pengembangan dari lockfile.

## Pengujian browser dan operasional

```powershell
npx playwright install chromium
npm run test:browser
```

Setelah tes lulus, uji di lingkungan staging: login/refresh, pindah outlet/gudang, buka shift, scan barcode, bayar/cetak, transfer dan penerimaan, reject, kitchen, serta pairing tablet. Tes di audit memakai data fixture, bukan akun atau data produksi.

## Meninjau perubahan Git

```powershell
node scripts/stage-audit.mjs
git diff --cached --stat
git status --short
```

`stage-audit.mjs` hanya men-stage path dalam manifest audit; tidak commit atau push. Tinjau hasil sebelum commit/push melalui alur deployment Anda. Jangan menjalankan reset, rollback, atau seluruh SQL lama untuk memasang audit.

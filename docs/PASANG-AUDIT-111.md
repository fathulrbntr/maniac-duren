# Memasang audit 111

Paket ini adalah source proyek lengkap, berdasarkan ZIP Anda yang sudah berisi
audit 110. Tidak ada migrasi SQL baru dan tidak perlu reset database.

## Menyalin source

1. Simpan cadangan folder kerja atau commit perubahan lokal terlebih dahulu.
2. Ekstrak ZIP ke folder sementara. Salin **isi** folder `maniac-duren` ke folder
   proyek, bukan memasukkan folder itu ke dalam folder proyek sekali lagi.
3. Timpa file yang sama hanya jika source lokal masih sesuai ZIP yang dikirim
   untuk audit ini. Bila ada pekerjaan lebih baru, bandingkan dan gabungkan
   perubahannya dahulu. Daftar perubahan audit 111 ada di `docs/audit/changes-111.json`.

`.git`, `.env`, `node_modules`, hasil tes, serta cadangan foto tidak disertakan
dalam paket. File-file lokal itu tidak dihapus oleh proses menyalin source.

## Memeriksa di PowerShell

```powershell
Set-Location "D:\PROJECT\MANIAC DUREN\maniac-duren"
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw "Instalasi dependensi gagal." }
npm.cmd run verify
if ($LASTEXITCODE -ne 0) { throw "Verifikasi gagal. Jangan deploy dahulu." }
npx.cmd playwright install chromium
if ($LASTEXITCODE -ne 0) { throw "Instalasi browser gagal." }
npm.cmd run test:browser
if ($LASTEXITCODE -ne 0) { throw "Tes browser gagal. Periksa log." }
```

Tes browser gudang kini memakai browser Playwright pada Windows maupun Linux.
Hapus override `BROWSER_EXECUTABLE` yang tidak valid bila pernah diatur manual.

Tidak ada file runtime lama yang perlu dihapus untuk perubahan 110 → 111.
Jika pemasangan audit 110 sebelumnya belum menyelesaikan pemindahan file usang,
ikuti bagian cleanup di `PASANG-AUDIT-110.md`; script tersebut memeriksa hash dan
berhenti jika sumber lama sudah berubah. Jangan menjalankan reset/rollback SQL.

## Meninjau dan menyimpan perubahan

```powershell
git status --short
node scripts/stage-audit.mjs
if ($LASTEXITCODE -ne 0) { throw "Staging audit gagal." }
git diff --cached --stat
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "Periksa whitespace pada diff." }
```

Manifest staging bersifat kumulatif dari audit 110 dan 111 agar perubahan audit
110 yang belum di-commit tetap tercakup. Periksa seluruh staging sebelum membuat
commit. Script tidak commit, push, atau deploy secara otomatis.

Sebelum dipakai operasional, uji login/refresh dan ganti akun, transaksi saat
koneksi terputus, buka/tutup kasir, barcode/batch, transfer/penerimaan, kitchen,
printer, serta pairing tablet pada lingkungan staging dan perangkat Anda.

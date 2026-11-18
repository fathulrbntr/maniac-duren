# Patch 119 · Penerimaan outlet dengan beberapa batch buah

Saat outlet mengonfirmasi satu surat jalan yang berisi dua batch buah atau lebih, fungsi penerimaan lama mengubah status barcode batch pertama menjadi tersedia. Ketika memproses batch kedua, fungsi memeriksa lagi seluruh surat jalan dan menganggap perubahan yang baru dibuatnya sebagai konflik. Database membatalkan konfirmasi. Scan yang telah berhasil dicatat di server tetap tersimpan.

Patch ini memeriksa dan mengunci semua barcode kiriman satu kali sebelum memindahkan stok. Jika ada barcode dengan status atau ID transfer yang berbeda, pesan menampilkan nomor barcode yang perlu diperiksa.

## Memasang dan melanjutkan penerimaan

1. Ekstrak ZIP ke folder proyek Maniac Duren. Paket ini berisi perubahan untuk alur penerimaan setelah patch 118.
2. Pilih proyek Supabase yang digunakan POS. Di SQL Editor, buat query baru, salin seluruh isi `database/transfer-receive-119.sql`, lalu klik **Run**. File dengan isi yang sama di folder `supabase/migrations` tersedia untuk pemasangan melalui jalur migrasi proyek. Cukup gunakan salah satu cara.
3. Setelah query berhasil, buka kembali surat jalan yang sama di POS outlet. Periksa **Barcode cocok**. Jika jumlahnya lengkap, centang pemeriksaan dan tekan **Konfirmasi penerimaan lengkap**. Jika masih ada selisih, scan hanya label yang masih ditandai belum dipindai.
4. Pastikan status surat jalan sudah diterima. Jika muncul pesan yang menyebut satu barcode, cocokkan riwayat barcode itu dengan surat jalannya sebelum melanjutkan.

## PowerShell untuk pengujian, commit dan push

Jalankan dari komputer proyek setelah ekstraksi. Migrasi di Supabase diperlukan agar POS langsung menggunakan perbaikan.

```powershell
Set-Location -LiteralPath "D:\PROJECT\MANIAC DUREN\maniac-duren"
$ErrorActionPreference = "Stop"
$patchFiles = @(
  "database/transfer-receive-119.sql"
  "supabase/migrations/20261118143000_transfer_receive_119.sql"
  "tests/warehouse-workflow-db.test.mjs"
  "docs/PATCH-119-PENERIMAAN.md"
)

git status --short
node tests/warehouse-workflow-db.test.mjs
if ($LASTEXITCODE -ne 0) { throw "Tes penerimaan gagal." }

git add -- $patchFiles
if ($LASTEXITCODE -ne 0) { throw "Git add gagal." }
git diff --cached --stat -- $patchFiles
git diff --cached --check -- $patchFiles
if ($LASTEXITCODE -ne 0) { throw "Periksa diff patch 119." }

git commit --only -m "Fix outlet receipt validation across multiple fruit lots" -- $patchFiles
if ($LASTEXITCODE -ne 0) { throw "Commit gagal." }
git push
if ($LASTEXITCODE -ne 0) { throw "Push gagal." }
```

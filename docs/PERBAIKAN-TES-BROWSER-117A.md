# Perbaikan tes browser 117A

Pasang setelah patch UI 117. Paket ini hanya berisi koreksi tes, script stage,
dan panduan pemasangan.

## Penyebab dan perbaikan

Log pengguna menunjukkan 186 tes lulus, lalu tes browser input, laporan, shift,
pembayaran, CRM, penerimaan, karyawan, reject dan batch lulus. Audit UI berhenti
di `tests/ui-audit-browser.mjs` karena `locator("dialog")` menemukan dua dialog.

Saat memilih Durian utuh, aplikasi memanggil `close()` pada dialog Barang masuk
lalu langsung membuka Penerimaan barang. Atribut `open` segera hilang dari dialog
lama, tetapi event `close` yang menghapus elemen tersebut berjalan kemudian.
Selama perpindahan itu, dua elemen dialog dapat berada dalam DOM.

Tes sekarang memilih dialog berdasarkan jenisnya dan atribut `open`:

- Produk: `dialog.product-entry-modal[open]`.
- Penerimaan: `dialog.receipt-shipment-dialog[open]`.
- Pilihan Durian utuh: `dialog[open] #receive-durian`.

Tes menunggu dialog terlihat sebelum mengukur lebar. Tombol tutup dipilih dengan
nama aksesibel `Tutup` di dalam dialog yang tepat, kemudian tes menunggu dialog
tidak aktif. Pemilihan `.first()` dihapus; pemeriksaan overflow tetap berlaku untuk
kedua dialog, empat lebar layar dan dua tema. Tidak ada tes yang dilewati.

## Pemasangan dan commit/push

Ekstrak isi ZIP ke `D:\PROJECT\MANIAC DUREN\maniac-duren`, pilih Timpa file.
Folder `tests`, `scripts`, dan `docs` harus langsung berada di root proyek.

```powershell
cd "D:\PROJECT\MANIAC DUREN\maniac-duren"
$ErrorActionPreference = "Stop"

if (!(Test-Path ".\docs\PERBAIKAN-TES-BROWSER-117A.md")) {
    throw "Patch 117A belum diekstrak ke folder proyek aktif."
}

git status --short
npm.cmd run verify
if ($LASTEXITCODE -ne 0) { throw "Verifikasi gagal." }

npm.cmd run test:browser
if ($LASTEXITCODE -ne 0) { throw "Tes browser gagal. Periksa log." }

node scripts/stage-patch-117a.mjs
if ($LASTEXITCODE -ne 0) { throw "Stage patch gagal." }

git diff --cached --stat
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "Periksa diff sebelum commit." }

git commit -m "Apply Food POS UI and fix active dialog browser audit"
if ($LASTEXITCODE -ne 0) { throw "Commit gagal." }
git push
if ($LASTEXITCODE -ne 0) { throw "Push gagal." }
```

Script stage menjalankan daftar file patch 117, lalu menambahkan tiga file 117A.
Perubahan UI 117 yang belum di-commit ikut masuk. File log tidak ditambahkan.
File lain yang sebelumnya sudah di-stage tetap berada di staging area; periksa
ringkasan diff sebelum commit.

## Validasi

- Format, sintaks dan ESLint diperiksa; `npm run verify` dijalankan pada paket akhir.
- Pratinjau browser aplikasi asli dengan data fixture: empat siklus buka/tutup
  dialog produk dan penerimaan, mencakup tema terang dan gelap. Selector aktif
  cocok tepat satu dialog/tombol Tutup dan pengukuran lebar lulus.
- Menjalankan `node tests/ui-audit-browser.mjs` langsung di lingkungan pembuat
  paket terhambat peluncuran Chromium: socket tidak diizinkan. Karena itu rangkaian
  Playwright penuh setelah perubahan belum dinyatakan lulus. Jalankan perintah
  Windows di atas sebelum commit/push; pratinjau tidak menggantikan suite penuh.
- Kode aplikasi, data, transaksi dan database tidak diubah oleh patch ini.

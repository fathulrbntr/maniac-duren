# Patch 116 — Supplier, format angka, dan scan barcode

Dasar: source audit 111 dan patch 112–115 yang tersedia, termasuk invoice filter 115.
Paket hanya berisi file baru/berubah. Tidak memerlukan SQL atau reset database.

## Perubahan

1. Dropdown supplier pada form memiliki **+ Tambah supplier baru** untuk akun
   dengan akses Master. Form berisi nama, telepon, dan alamat. Setelah berhasil,
   supplier langsung terpilih; nomor nota, tanggal, ongkir dan rincian produk tetap
   tersimpan di form yang sama. Pembatalan atau kegagalan simpan mempertahankan
   supplier sebelumnya. Nota pertama dapat dibuat ketika daftar supplier masih kosong.
2. Semua input angka POS, termasuk harga, modal, ongkir, nominal pembayaran,
   setoran, berat, jumlah, poin, dan baris dinamis, memakai pemisah ribuan Indonesia.
   Contoh `100000000` tampil `100.000.000`; `1456156,565` tampil `1.456.156,565`.
   Gunakan **koma untuk desimal**. Titik pada input dibaca sebagai pemisah ribuan.
3. Nol berlebih di depan dibuang, misalnya `000150000` menjadi `150.000`.
   Nol tunggal tetap valid untuk nilai nol; `0,125` tetap pecahan. Harga awal `0`
   terseleksi saat difokuskan/diklik agar langsung tergantikan ketika diketik.
4. Kolom scan menyeleksi label sebelumnya agar input berikutnya mengganti isinya.
   Setelah berhasil, kolom yang bersifat pencatatan dikosongkan atau dirender ulang
   dan siap menerima label berikutnya. Setelah ditolak, kode terseleksi untuk
   diganti tanpa menghapus manual. Berlaku pada kasir, uji scanner, timbang,
   penerimaan, penyiapan/penerimaan kiriman, transfer, reject, pemeriksaan buah,
   barcode master, dan barcode varian. Selesaikan popup pilihan buah bila dibuka;
   tunggu konfirmasi penyimpanan server pada penerimaan/pengiriman.

Nomor barcode, telepon, nota, SKU, meja, tanggal, dan identitas teks tidak diberi
pemisah ribuan. Nol depan barcode tetap utuh. Textarea registrasi banyak barcode
mempertahankan daftar per baris. Angka yang dikirim ke perhitungan/server tetap
angka kanonik; contoh tampilan `1.250,5` menghasilkan nilai `1250.5`.

Jalur mutasi, otorisasi database, pengecekan batch/supplier/lokasi, serta identitas
operasi saat retry tetap dipakai. Form tambah supplier memakai jalur master yang sama.

## Pasang

1. Ekstrak isi ZIP ke `D:\PROJECT\MANIAC DUREN\maniac-duren`, sesuai struktur
   `pos`, `scripts`, `tests`, dan `docs` di dalam paket.
2. Gunakan source yang sudah sampai patch 115. File lengkap di paket akan mengganti
   file dengan nama yang sama; simpan perubahan lokal yang belum tergabung dahulu.
3. Jalankan pemeriksaan dan commit/push berikut di PowerShell.

```powershell
cd "D:\PROJECT\MANIAC DUREN\maniac-duren"
git status --short

npm.cmd run verify
if ($LASTEXITCODE -ne 0) { throw "Verifikasi gagal. Periksa error sebelum commit." }

npx.cmd playwright install chromium
if ($LASTEXITCODE -ne 0) { throw "Instalasi Chromium gagal." }
npm.cmd run test:browser
if ($LASTEXITCODE -ne 0) { throw "Tes browser belum lulus. Periksa log sebelum commit." }

node scripts/stage-patch-116.mjs
if ($LASTEXITCODE -ne 0) { throw "Stage patch 116 gagal." }
git diff --cached --stat
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "Periksa diff sebelum commit." }

git commit -m "Add supplier quick entry and improve numeric inputs and barcode scanning"
if ($LASTEXITCODE -ne 0) { throw "Commit gagal." }
git push
if ($LASTEXITCODE -ne 0) { throw "Push gagal. Periksa koneksi dan remote." }
```

`stage-patch-116.mjs` hanya melakukan stage terhadap daftar file patch ini.
Periksa diff staged sebelum commit. Script tidak melakukan commit/push sendiri.
Setelah deployment selesai, muat ulang POS ketika tidak ada form atau pembayaran
belum selesai.

## Pengujian

- Pemeriksaan struktur/sintaks/import, lint, format, serta suite unit/DOM/SQL lokal:
  **lulus melalui `npm run verify`: 186 tes lulus, 0 gagal**.
- Regresi khusus mencakup supplier baru, batal, koneksi gagal/retry dengan ID sama,
  pengiriman ganda, hak akses, angka pecahan, nol depan, dan fokus barcode.
- Simulasi DOM tambahan memeriksa pengetikan berturut-turut, cursor, field dinamis,
  `min/max/step/required`, handler FormData, reset, dan pengecualian identitas teks.
- **Browser belum terverifikasi di lingkungan pembuat patch.** Perintah
  `npm run test:browser` sudah dicoba, tetapi Chromium gagal diluncurkan karena
  pembatasan socket sistem (`Operation not permitted`). Jalankan suite browser
  melalui perintah di atas pada komputer pengembang.
- Database produksi dan scanner fisik belum diuji/dijalankan. Uji pemasangan pada
  akun yang berwenang, termasuk dua label berurutan dan label yang ditolak.

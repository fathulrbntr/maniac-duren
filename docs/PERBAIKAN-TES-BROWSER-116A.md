# Koreksi 116A — Pembacaan nilai input pada tes browser

Pasang setelah patch 116. Paket koreksi ini berisi tiga file: tes browser input,
script stage patch 116 yang diperbarui, dan panduan ini. Kode aplikasi POS dan
SQL tidak diubah oleh koreksi ini.

## Penyebab

Tes sebelumnya membandingkan `locator.inputValue()` dengan nilai mentah `150000`.
Playwright membaca nilai DOM native pada konteks terisolasi, sehingga yang terbaca
adalah tampilan `150.000`. Getter `.value` yang dipasang formatter POS berjalan
di konteks halaman aplikasi dan mengembalikan nilai mentah `150000`.

Koreksi menggunakan `locator.evaluate((el) => el.value)` untuk membaca kontrak
nilai aplikasi. Nilai tampilan tetap diperiksa terpisah. Empat lokasi diperbaiki:
input harga, berat, jumlah butir, serta harga di nota setelah supplier disimpan.
Tes juga memeriksa `.valueAsNumber` dan tetap memeriksa payload `FormData`.

Penutupan popup supplier kini ditunggu sampai elemennya dilepas sebelum tes
membuka popup berikutnya, sesuai perilaku event `close` pada dialog native.

Error assertion yang dilaporkan bukan indikasi bahwa Node.js harus diganti.
Pemisah ribuan `150.000` adalah tampilan yang memang diinginkan.

## Pasang dan uji

Ekstrak isi ZIP ke root proyek sehingga `tests/input-fields-browser.mjs` dan
`scripts/stage-patch-116.mjs` tertimpa versi koreksi. Jangan membuat folder proyek
bersarang. Jika ingin memeriksa tes yang sebelumnya gagal saja, jalankan:

```powershell
cd "D:\PROJECT\MANIAC DUREN\maniac-duren"
node tests/input-fields-browser.mjs
```

Untuk pemeriksaan lengkap dan commit/push:

```powershell
cd "D:\PROJECT\MANIAC DUREN\maniac-duren"
git status --short

npm.cmd run verify
if ($LASTEXITCODE -ne 0) { throw "Verifikasi gagal." }
npm.cmd run test:browser
if ($LASTEXITCODE -ne 0) { throw "Tes browser gagal. Periksa error sebelum commit." }

node scripts/stage-patch-116.mjs
if ($LASTEXITCODE -ne 0) { throw "Stage patch gagal." }
git diff --cached --stat
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "Periksa diff sebelum commit." }

git commit -m "Fix browser checks for formatted POS inputs"
if ($LASTEXITCODE -ne 0) { throw "Commit gagal." }
git push
if ($LASTEXITCODE -ne 0) { throw "Push gagal." }
```

Script stage tetap mencakup seluruh file patch 116 beserta panduan koreksi ini,
sehingga dapat dipakai jika patch 116 belum sempat di-commit. File yang sudah
sama dengan commit terakhir tidak menghasilkan perubahan baru.

## Validasi dan batas

- Sintaks, arsitektur, lint, format, dan suite unit/DOM/SQL diperiksa melalui
  `npm run verify`: **186 tes lulus, 0 gagal**.
- Simulasi DOM memeriksa bahwa nilai tampilan memakai titik ribuan, getter
  aplikasi memakai angka mentah, dan handler FormData mempertahankan payload.
- Tes browser input sudah dicoba ulang, tetapi Chromium pada lingkungan pembuat
  patch masih gagal diluncurkan karena pembatasan socket sistem. Hasil browser
  koreksi ini belum dinyatakan lulus; jalankan pada komputer pengembang melalui
  perintah di atas.

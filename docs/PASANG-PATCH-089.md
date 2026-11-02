# Pasang patch audit 089

Paket ini berisi file yang berubah/ditambahkan terhadap ZIP sumber, bukan seluruh proyek. SQL operasi tidak diubah. Tidak perlu menjalankan query Supabase untuk patch ini.

## Pemasangan

1. Simpan cadangan checkout Anda. Jika sudah ada perubahan setelah ZIP sumber dikirim, bandingkan sebelum menimpa file yang sama.
2. Ekstrak isi patch ke root proyek Maniac Duren, yaitu folder yang berisi `package.json` dan `pos/`. Setujui penggantian file yang sesuai.
3. Jalankan perintah berikut dari root proyek. Pembersihan hanya mengarsipkan 46 petunjuk lama dan menghapus satu file statistik Git tidak sengaja jika hash-nya persis cocok. File yang berubah atau arsip yang berbenturan membuat proses berhenti.

```bash
node scripts/apply-audit-cleanup.mjs --check
node scripts/apply-audit-cleanup.mjs
npm ci
npm run check
npm test
```

Untuk pemeriksaan browser:

```bash
npx playwright install chromium
npm run test:browser
```

Jika browser terpasang di lokasi khusus, isi environment variable `BROWSER_EXECUTABLE`. Jangan memakai lokasi browser milik lingkungan audit di komputer Anda.

## Git

Script staging hanya memilih path dalam manifest patch; script tidak membuat commit atau push. Periksa juga perubahan lain yang mungkin sudah berada di staging sebelum menjalankannya.

```bash
git status --short
node scripts/stage-audit.mjs
git diff --cached --stat
git diff --cached --check
git commit -m "Audit POS, fix UI conflicts and organize project files"
git push origin HEAD
```

`git push origin HEAD` mengirim branch yang sedang aktif; periksa branch tersebut sesuai alur deployment Anda. Audit ini sendiri belum melakukan commit, push, atau deploy.

Setelah deployment, refresh POS. Periksa login, buka kasir, satu transaksi yang memang diperlukan, struk, serta tutup kasir menggunakan akun/perangkat yang biasa digunakan. Data demo tidak boleh digunakan sebagai bukti bahwa printer, timbangan, atau koneksi produksi sudah berfungsi.

## Isi patch

`scripts/audit-patch-files.json` mencatat file yang berubah dan path lama yang dipindahkan/dihapus. File aplikasi tetap di lokasi yang sama, sedangkan dokumentasi historis berada di `docs/archive/`. Foto cadangan tetap lokal dan tidak masuk deployment. Berkas perintah cetak Windows yang sudah berbeda pada ZIP sumber tidak diubah oleh audit.

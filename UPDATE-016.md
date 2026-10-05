# Perbaikan 016 — audit blank screen, login, dan akun

Paket ini menimpa file yang sudah ada di ZIP maniac-duren(2).zip. Tidak menambah nama file project baru. Tidak mengubah data produksi secara otomatis.

## Pemasangan

1. Ekstrak isi patch ke folder project yang berisi package.json. Pilih Replace/Overwrite.
2. Di Supabase SQL Editor, jalankan seluruh isi `database/016-employee-accounts.sql` dari patch ini. Jalankan ulang meskipun 016 lama sudah pernah dijalankan. File perbaikan aman diulang, tidak mereset stok, karyawan, atau transaksi.
3. Jangan menjalankan ulang `database/pos.sql` pada database aktif. File tersebut untuk instalasi baru.
4. Pastikan Production di Vercel memiliki POS_SUPABASE_URL, POS_SUPABASE_PUBLISHABLE_KEY, dan POS_SUPABASE_SERVICE_ROLE_KEY. Secret hanya dipakai server.
5. Push dan tunggu deployment Ready. Buka /pos/ lalu tekan Ctrl+Shift+R. Login awal boleh memakai email akun yang sudah ada; username/nomor telepon harus sesuai data karyawan yang terhubung dan aktif.

## Temuan dan perbaikan

- Penyebab blank screen: tanda kurung tidak lengkap pada handler login app.js. Browser gagal membaca seluruh modul. Diperbaiki, dan bootstrap sekarang menampilkan pesan jika modul gagal dimuat.
- Handler login lama juga mengirim Promise sebagai body request dan melakukan pertukaran token ganda. Diganti dengan satu permintaan ke endpoint server.
- Lookup login lama memakai role anon sementara fungsi hanya mengizinkan authenticated. Lookup kini dibatasi untuk service_role, dengan pertukaran password di server. Email hasil lookup tidak dikirim ke browser.
- Pencocokan nomor telepon kosong dapat salah memilih karyawan. Pencarian sekarang memisahkan nomor telepon, username, dan email; normalisasi 08/+62; akun ganda/ambigu ditolak. Nomor telepon dan username tidak boleh dipakai karyawan lain.
- Pembatasan percobaan login tersimpan di database: 10 per identifier dan 60 per IP dalam 15 menit. Password tidak disimpan di tabel tersebut.
- Reset password memakai ID akun yang benar-benar terhubung, termasuk karyawan nonaktif. Hanya owner dapat memakai endpoint pengelolaan akun. Akun yang belum terhubung tidak diperlakukan sebagai reset.
- Permintaan ulang employee_save tidak menimpa username/foto yang telah diubah kemudian. Foto profil divalidasi, tidak dimasukkan ke event payload, dan dapat dihapus.
- Fungsi database internal versi sebelumnya tidak bisa dipanggil langsung oleh client untuk melewati validasi.
- Detail karyawan menampilkan foto dan username. Email akun terhubung dibuat readonly agar form tidak menjanjikan perubahan yang tidak disimpan.
- Menghapus cabang UI karyawan/absensi lama yang tidak lagi digunakan; memakai modul UI yang sama secara konsisten.
- Memperbarui tes browser lama yang masih mencari tombol demo dan input email lama.

## Pengujian lokal

Lolos: parsing seluruh JavaScript/JSON dan referensi impor POS; unit test produk, produksi, waste, retry; database fresh/upgrade; pengaturan toko; kitchen/direct/mixed orders, pembayaran awal dan stok sekali; absensi pertama/terakhir dan jadwal snapshot; username, nomor telepon, profile retry, hak akses RPC, target akun dan rate limit; API login/create/reset dengan respons Auth simulasi; browser login gagal/berhasil, semua menu POS desktop/mobile, foto profil, reset password, pagination/filter; website dan halaman menu dimuat tanpa error JavaScript.

Upgrade diuji memakai SQL asli dari ZIP pengguna kemudian SQL 016 yang diperbaiki, termasuk eksekusi ulang. Supabase Auth/Vercel produksi belum diuji langsung karena tidak ada koneksi kredensial produksi. Hasil audit mencakup skenario di atas, bukan jaminan tidak ada bug pada setiap kemungkinan data/perangkat.

```bash
npm ci
npm test
npm run test:db
npm run test:kitchen
npm run test:employees
npm run test:browser
npm run test:kitchen:browser
npm run test:employees:browser
```

Browser test memerlukan Chromium Playwright (`npx playwright install chromium`) atau BROWSER_EXECUTABLE yang mengarah ke executable Chromium.

```bash
git add api/pos-login.js api/pos-employee.js pos/app.js pos/index.html pos/operations-ui.mjs pos/employees-ui.mjs database/016-employee-accounts.sql database/pos.sql package.json tests UPDATE-016.md
git commit -m "Fix POS blank screen, login and employee account validation"
git push
```

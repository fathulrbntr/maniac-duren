# Patch 020 — Password saat tambah karyawan

Melanjutkan patch 019. Tidak memerlukan query SQL baru.

## Pemasangan
Ekstrak isi ZIP ke folder proyek dan timpa file yang sama. Push ke GitHub, tunggu deployment Vercel selesai, lalu Ctrl+F5 pada POS.

## Penggunaan
Karyawan → Tambah karyawan → isi data, email, cabang dan role → isi Password awal (12–128 karakter) → Simpan.

Jika Password awal diisi, email wajib diisi dan status harus Aktif. Data karyawan disimpan terlebih dahulu, kemudian akun login dibuat. Password kosong berarti hanya menyimpan data karyawan. Tombol Tampilkan password memudahkan pemeriksaan isian. Kolom ini juga tersedia ketika mengedit karyawan yang belum mempunyai akun login.

Karyawan dapat login memakai username, nomor telepon atau email yang tercatat, beserta password yang dibuat. Untuk karyawan yang sudah mempunyai akun, gunakan tombol Ubah password yang sudah tersedia.

Jika data berhasil disimpan tetapi pembuatan akun gagal, form menampilkan alasan kegagalan. Tombol Coba lagi hanya mengulang pembuatan akun, tanpa menggandakan data karyawan. Isian data dikunci setelah tersimpan; isian password masih bisa diperbaiki.

Password hanya dikirim ke endpoint pembuatan akun, tidak dimasukkan ke payload data karyawan, event, atau draft penyimpanan ulang.

## Konfigurasi pembuatan akun
Pembuatan akun memakai endpoint server `/api/pos-employee` yang sudah ada. Bila muncul pesan Konfigurasi akun belum lengkap, buka Vercel → Settings → Environment Variables dan pastikan `POS_SUPABASE_URL`, `POS_SUPABASE_PUBLISHABLE_KEY`, dan `POS_SUPABASE_SERVICE_ROLE_KEY` sudah diisi, lalu redeploy. Service-role key hanya dipasang di konfigurasi server Vercel; jangan ditaruh dalam file frontend.

## Validasi
Lulus pengujian database karyawan/absensi dan endpoint akun. Alur form diuji dengan DOM lokal: data tanpa akun, pembuatan akun saat Simpan, validasi email/status/password, tampil/sembunyi password, pencegahan submit ganda, kegagalan sebagian dan percobaan ulang tanpa duplikasi.
Pengujian browser ditambah untuk alur baru; preview browser dan pembuatan akun pada Supabase operasional belum dijalankan.

```bash
git status
git add pos/app.js pos/index.html pos/operations-ui.mjs pos/employees-ui.mjs tests/browser.mjs PATCH-020.md
git commit -m "Create employee login account from employee form"
git push origin main
```

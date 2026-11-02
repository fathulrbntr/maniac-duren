# Patch 022 — UI karyawan sesuai referensi

Melanjutkan patch 021. Ekstrak ZIP dan timpa file yang sama, push ke GitHub, tunggu deployment selesai, lalu Ctrl+F5. Tidak perlu SQL baru.

## Perubahan
- Kartu karyawan: nama besar di kiri, username dan role di bawahnya, foto portrait di kanan. Edit berbentuk ikon biru di kiri bawah, diikuti status aktif/nonaktif. Tombol titik tiga menyediakan Detail & rekap serta Buat akun/Ubah password.
- Judul dan breadcrumb atas yang berulang di semua tab dihilangkan sesuai catatan pada gambar referensi. Toolbar database/tema tetap tersedia.
- Tombol Keluar diubah menjadi Logout dan dipindahkan ke sidebar tepat di bawah profil akun, dengan aksen merah.
- Kotak background putih logo dihilangkan melalui CSS. File logo aslinya sudah transparan, sehingga detail logo tetap sama.
- Background elemen foto dibuat transparan. Upload PNG tetap PNG dan WebP tetap WebP sehingga alpha tidak hilang akibat konversi JPEG. Foto memakai object-fit contain agar cutout tidak terpotong.

Foto yang sudah tersimpan sebagai JPEG dari proses upload lama perlu diunggah ulang dari PNG/WebP aslinya. Mengubah CSS tidak dapat memulihkan alpha yang sudah hilang dari file JPEG.

## Validasi
Lulus pemeriksaan sintaks, DOM kartu/aksi, posisi Logout, judul atas dihilangkan, format upload PNG/WebP dipertahankan, serta regresi form karyawan, akun dan database absensi. Pengujian browser diperbarui mengikuti struktur baru. Preview visual browser belum dijalankan.

```bash
git status
git add pos/app.js pos/index.html pos/pos.css pos/employees-ui.mjs pos/employees.css pos/operations-ui.mjs tests/browser.mjs PATCH-022.md
git commit -m "Restyle employee cards and preserve transparent photos"
git push origin main
```

# Patch 021 — Profil login, password 6 karakter dan akses Owner

Melanjutkan patch 020. Timpa file dari ZIP, push ke GitHub, tunggu deployment selesai dan Ctrl+F5. Tidak perlu query SQL baru.

- Foto, nama dan role akun login tampil di sidebar di atas Toko Aktif. Jika belum ada foto profil, avatar memakai inisial nama. Foto mengikuti Foto profil pada data karyawan.
- Minimum password menjadi 6 karakter, maksimum tetap 128. Berlaku untuk password awal di Tambah/Edit Karyawan, Buat akun dan Ubah password. Validasi endpoint server juga diperbarui.
- Saat memilih Owner, pilihan cabang dan tambahan hak akses disembunyikan. Owner otomatis memiliki akses penuh ke semua toko dan fitur lewat pemeriksaan server yang sudah ada. Jika kembali memilih role lain, pilihan cabang dan permission muncul kembali.

Lulus pengujian profil (foto/nama/role/inisial/escaping), alur form Owner dan pengiriman permission, password 6 diterima dan 5 ditolak, pembuatan/reset akun, serta regresi database karyawan/absensi. Alur form diuji dengan DOM lokal; preview browser visual belum dijalankan.

Jika Supabase project memakai minimum password lebih tinggi dari 6, sesuaikan Minimum password length ke 6 pada pengaturan Authentication Supabase agar server autentikasi mengikuti minimum yang sama.

```bash
git status
git add pos/app.js pos/index.html pos/pos.css pos/employees-ui.mjs pos/operations-ui.mjs api/pos-employee.js tests/browser.mjs tests/employees-attendance.test.mjs PATCH-021.md
git commit -m "Show logged-in profile and simplify owner access"
git push origin main
```

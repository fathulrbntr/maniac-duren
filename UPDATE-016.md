# Update 016 — akun karyawan dan login

Terapkan setelah update 015. Jalankan `database/016-employee-accounts.sql` di Supabase SQL Editor, kemudian deploy file API dan POS dari patch ini. Tidak perlu reset database.

Perubahan:

- Tambah username unik untuk setiap karyawan.
- Login menerima username, email, atau nomor telepon.
- Foto profil karyawan tampil di kartu dan dapat diganti dari form karyawan.
- Owner dapat membuat akun dan mengubah password akun karyawan yang sudah terhubung.
- Password dikirim melalui endpoint server dengan service role; service role tidak pernah dikirim ke browser.
- Username dan foto profil tersimpan di data karyawan. Foto KTP tetap memakai akses owner khusus.

Environment Vercel yang diperlukan tetap:
`POS_SUPABASE_URL`, `POS_SUPABASE_PUBLISHABLE_KEY`, `POS_SUPABASE_SERVICE_ROLE_KEY`.

```bash
git add api/pos-login.js api/pos-employee.js pos/app.js pos/index.html pos/operations-ui.mjs pos/employees-ui.mjs pos/employees.css database/016-employee-accounts.sql database/pos.sql scripts/build-database.mjs UPDATE-016.md
git commit -m "Add employee accounts and username login"
git push
```

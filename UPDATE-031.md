# Login 031

Jalankan database/migrations/023-login-fast.sql di Supabase terlebih dahulu, lalu ganti file ZIP dan deploy. Migration aman diulang; tidak reset data. Endpoint login baru memerlukan fungsi pos_login_prepare.

Dua pemeriksaan pembatasan dan pencarian akun menggunakan satu permintaan Supabase (sebelumnya tiga). Keduanya tetap wajib lolos. Indeks ditambahkan untuk email/telepon aktif dan pembersihan percobaan lama. Konfigurasi publik diminta sejak HTML dibuka, bersamaan pemuatan modul. Tulisan Memuat POS dihapus dan diganti indikator visual.

Kecepatan produksi belum diukur; autentikasi Supabase dan pemuatan data outlet masih memerlukan respons server.

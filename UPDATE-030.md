# Perbaikan login 030

Ganti file sesuai ZIP. Tidak memerlukan SQL baru.
Dua pemeriksaan pembatasan login dijalankan bersamaan; kedua batas tetap harus lolos sebelum pencarian akun dan autentikasi. Tombol menampilkan Memeriksa akun lalu Memuat data outlet. Login memiliki batas waktu 60 detik; permintaan Supabase 30 detik. Pesan timeout mengizinkan pengguna mencoba kembali. Waktu aktual tetap bergantung jaringan, server dan ukuran data POS; belum diukur pada produksi.

Deploy lewat Git dan Ctrl+Shift+R setelah deployment selesai.

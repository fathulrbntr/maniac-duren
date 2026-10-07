# Login ringan 032

Jalankan database/migrations/024-login-bootstrap.sql sebelum deploy frontend ini. Jika belum memasang versi 031, jalankan 023-login-fast.sql dahulu.

Login mengambil profil akun sendiri, hak akses, dan daftar outlet melalui pos_bootstrap tanpa membaca stok/jurnal/seluruh riwayat. Halaman awal menampilkan pilihan pekerjaan. Data lengkap diambil saat menu pertama dibuka; kegagalan tetap di halaman awal dan bisa dicoba kembali. Polling tidak berjalan sebelum data lengkap tersedia. Perubahan tidak menggunakan saldo cache untuk transaksi.

Batas: setelah membuka menu pertama, pos_read tetap mengambil data lengkap; pemisahan data tiap menu/pagination belum dilakukan. Ini mempercepat tahap login, tidak menjanjikan seluruh menu lebih cepat. Waktu produksi belum diukur. Tidak mereset data.

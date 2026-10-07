# Database migrations

Untuk database yang **sudah berjalan**, jangan menjalankan `database/pos.sql` ulang. Jalankan migration yang belum terpasang melalui SQL Editor.

Migration terbaru:

- `017-receipt-cost-breakdown.sql` — menerima input timbang parsial (`12+5+8`), menghitung butir parsial, serta memisahkan harga pembelian dan ongkir.

Untuk database baru/reset, gunakan `database/pos.sql` yang sudah di-build dari source sections.

- `018-receipt-weighing-log.sql` — catatan berat + butir per timbang, riwayat dan konfirmasi penurunan selesai; biaya penerimaan dihitung konsisten. Jalankan pada database aktif 016/017 tanpa reset data.

- `019-direct-stock-no-sorting.sql` — setelah 018: penerimaan buah langsung siap jual, stok belum disortir dibuka dan fitur sortir dinonaktifkan. Riwayat stok lama tetap tersimpan.

020-multi-product-receipt.sql: jalankan setelah 019 untuk satu kiriman berisi beberapa produk dengan satu ongkir. Aman dijalankan ulang; tidak mereset stok.

021-batch-tracking.sql: setelah 020. Intake stocker, rekonsiliasi PO/nota admin, reject harian, penyusutan kulit/biji, modal hasil olahan, campuran supplier dan Admin pusat. Baca UPDATE-021.md. Aman dijalankan ulang; tanpa reset data.

022-offline-batch-compat.sql: setelah 021-batch-tracking. Memisahkan wrapper baca offline dari wrapper batch dan meneruskan kedua kelompok metadata. Aman diulang. Database yang sudah menjalankan 021-offline-pos tetap dapat memakai 022. Jangan jalankan ulang 021-offline-pos setelah 022. Nomor 21 di md_pos_schema_versions adalah batch tracking, bukan bukti frontend offline aktif.

023-login-fast.sql: menggabungkan dua pembatasan login dan pencarian akun dalam satu RPC khusus service_role, menambahkan indeks pencarian. Tidak mengubah stok. Jalankan sebelum deploy endpoint login terbaru.

024-login-bootstrap.sql: profil akun aktif, hak akses, outlet yang diizinkan. Tidak memanggil pos_read lengkap. Jalankan sebelum deploy frontend 032.

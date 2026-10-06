# Database migrations

Untuk database yang **sudah berjalan**, jangan menjalankan `database/pos.sql` ulang. Jalankan migration yang belum terpasang melalui SQL Editor.

Migration terbaru:

- `017-receipt-cost-breakdown.sql` — menerima input timbang parsial (`12+5+8`), menghitung butir parsial, serta memisahkan harga pembelian dan ongkir.

Untuk database baru/reset, gunakan `database/pos.sql` yang sudah di-build dari source sections.

- `018-receipt-weighing-log.sql` — catatan berat + butir per timbang, riwayat dan konfirmasi penurunan selesai; biaya penerimaan dihitung konsisten. Jalankan pada database aktif 016/017 tanpa reset data.

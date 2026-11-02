# Patch 023 — Kartu karyawan

Terapkan setelah patch 022. Timpa file sesuai folder di ZIP, lalu refresh browser dengan Ctrl+F5. Tidak ada perubahan SQL.

- Ikon edit dihapus; klik kartu membuka edit karyawan. Enter/Spasi juga didukung.
- Efek hover mengikuti kartu kasir dan menghormati reduced motion.
- Menu Detail & rekap / Ubah password tidak memicu edit kartu.
- Popup rekap maksimal 680px dan password 420px, dengan tampilan selaras serta ukuran responsif.

Validasi: tes API/database karyawan, tes DOM penyimpanan akun, dan tes DOM klik/keyboard/menu/password berhasil.

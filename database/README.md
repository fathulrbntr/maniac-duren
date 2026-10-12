# Struktur SQL Maniac Duren

`pos.sql` adalah satu-satunya file yang dijalankan untuk database Supabase baru.
Isinya dibangun dari `sections/` sesuai kelompok fitur:

- `base.sql`: tabel inti POS dan keamanan dasar
- `master-contact.sql`: store, supplier, dan akses staff
- `product-catalog.sql`: produk, kategori, satuan, dan harga
- `recipes-production.sql`: resep, bahan baku, dan produksi
- `product-details.sql`: detail produk dan penyesuaian stok
- `waste-processing.sql`: waste dan hasil olahan
- `waste-evidence.sql`: bukti foto dan riwayat waste
- `flow-audit.sql`: pembacaan riwayat dan audit alur
- `waste-output-proof.sql`: bukti per hasil olahan serta nama pengolah
- `operations/`: order-stock-kitchen, pay-first, kitchen, dan akun karyawan

File di `sections/` adalah sumber build, bukan query yang ditempel satu per satu
ke Supabase. Jalankan `npm run db:build` setelah mengubah bagian yang relevan.

Untuk database produksi yang sudah berjalan, jangan mengulang `pos.sql` tanpa backup.
Perubahan aplikasi dikelola dari sumber `sections/operations/` lalu `pos.sql` dibangun ulang.

## Kontak darurat dan rekening karyawan (070)

Untuk database aktif, jalankan seluruh `database/employee-details-070.sql` satu kali
di Supabase SQL Editor, lalu perbarui halaman POS. Aman dijalankan ulang tanpa reset.
Form Tambah/Edit karyawan dan Detail & rekap menampilkan nama serta nomor kontak
darurat, nama bank, nama pemilik rekening, dan nomor rekening. Semua kolom opsional.
Nomor rekening disimpan sebagai teks agar nol di depan tidak hilang.
Untuk instalasi baru, jalankan patch ini setelah `pos.sql` dan patch fitur sebelumnya.

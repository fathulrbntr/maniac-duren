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

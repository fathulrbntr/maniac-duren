# Pembaruan 029

Ekstrak ZIP ke folder proyek dan ganti file yang sama.

Sidebar dikelompokkan menurut alur kerja, hak akses dipusatkan dalam satu pemetaan, judul outlet/resep/laporan lama diperjelas. Header dan akun tetap, menu tengah menggulir. Form reject menampilkan pilihan produk hasil dan petunjuk master yang belum tersedia; harga jual tidak dibuat otomatis.

Di Supabase SQL Editor, jalankan seluruh database/migrations/022-offline-batch-compat.sql. Tidak mereset stok/transaksi. Wrapper pos_read_offline_base menyimpan pembacaan batch dan menambahkan metadata offline. Jangan jalankan ulang 021-offline-pos.sql sesudahnya. Database baru menggunakan database/pos.sql.

Kasir offline penuh belum aktif di frontend. Modul offline memerlukan integrasi sesi, antrean, indikator konflik dan pengujian perangkat sebelum dipakai.

Master yang perlu diisi melalui Produk & bahan:
- Durpas 500 gr dan Durpas 1 kg: produk jadi hasil produksi, pcs, kategori Olahan Duren, harga jual aktual, stok awal 0.
- Coral: bahan produksi sendiri, kg, tanpa harga jual, stok awal 0.
- Cendol/Ketan yang dibuat outlet: ubah jenis ke bahan produksi sendiri dan lengkapi resep bahan; jangan menambah saldo duplikat.

Deploy melalui Git, lalu Ctrl+Shift+R. Pembaruan ini belum diterapkan ke web/database produksi oleh asisten.

# Hasil audit — 4 Oktober 2026

Acuan: ZIP full stack yang dikirim pengguna. Pemeriksaan mencakup kode website customer, katalog/menu, API konfigurasi, modul POS, SQL migration, dan alur stok. Pengujian yang dicantumkan di bawah dilakukan lokal; tidak mengakses akun Supabase/Vercel operasional.

## Temuan dan perbaikan

| Temuan | Perbaikan |
|---|---|
| Instalasi `pos.sql` lama belum mencakup fitur terbaru | Bootstrap terbaru dibuat dari arsip awal + migration, menyertakan definisi fungsi terakhir; diuji instalasi baru dan upgrade |
| Create Product mudah tertukar dengan tambah master produk | Menu dinamai Produksi, navigasi dibagi tiga kelompok |
| Waste bisa dimasukkan dari dua form | Jalur input waste dipusatkan; riwayat lama dipertahankan |
| Penerimaan bahan muncul terpisah dari penerimaan durian | Satu tombol Barang masuk dengan pilihan jenis barang |
| Tanggal waste diketik tanpa panduan penerimaan | Pilihan tanggal berasal dari saldo batch store aktif |
| Form dapat ditinggalkan setelah diisi | Konfirmasi form transaksi/produksi/waste dan popup; filter pencarian tidak ikut memunculkan konfirmasi |
| Simpan ulang setelah koneksi putus dapat membuat ID baru | Penyimpanan ID/payload retry per akun/tab, rekonsiliasi dengan riwayat, snapshot payload agar tidak berubah saat keranjang diedit |
| Beberapa kontrol yang awalnya nonaktif bisa kembali aktif setelah simpan | Status disabled setiap kontrol dipulihkan sesuai keadaan awal |
| Permintaan refresh token bersamaan bisa saling bertabrakan | Refresh token dijalankan satu kali untuk permintaan bersamaan |
| Stok transfer tujuan memakai tanggal pembelian di asal | Transfer baru memakai tanggal transfer; supplier dan sumber batch tetap tersimpan |
| Foto waste ikut terbawa setiap `pos_read`/hasil mutasi | Daftar mengirim penanda foto; endpoint staff mengambil foto saat Lihat bukti diklik |
| Header desktop berpotensi terpotong | Tinggi fleksibel dan lebar selector store dibatasi |
| Kode banyak berbentuk satu baris | Modul POS, API dan skrip menu diformat; navigasi dan retry dipisahkan ke modul kecil |
| Arsip, SQL dan file kamera mentah ikut menjadi aset deployment | `.vercelignore` mengecualikan berkas nonoperasional |

Perubahan tanggal transfer berlaku untuk transfer yang dibuat setelah update; data historis tidak ditulis ulang. Pengelompokan menu tidak menghapus Product, Store, Supplier, Master Resep, produksi, waste, bukti, atau riwayat pembatalan.

## Bukti pengujian

- `npm test`: empat berkas uji lulus. Mencakup metadata/foto produk, penyesuaian dan penghapusan, FIFO, resep bertingkat, tanggal/store/kedaluwarsa, kekurangan bahan, duplikasi simpan, pembatalan, waste total, keseimbangan berat, bukti, dan retry.
- `npm run test:db`: SQL PostgreSQL lokal lulus untuk instalasi baru dan urutan upgrade 000–007. Mencakup akses staff/helper, penjualan butir dengan kg aktual, rollback pembayaran kurang, idempotensi, tanggal transfer, waste/bukti setelah dibatalkan, resep, produksi dan pemulihan bahan.
- `npm run test:browser`: Chromium lulus untuk semua halaman navigasi, form produk/bahan, penerimaan, resep, produksi/batal, jual per butir, penjagaan form, upload foto, lihat bukti, waste/batal. Pemeriksaan overflow halaman dilakukan pada lebar 1440 dan 390 piksel; tabel lebar memakai scroll di dalam panel.
- Website customer dan menu tidak dibangun ulang. Kode menu ditelaah/diformat; integrasi eksternal seperti WhatsApp, peta, TikTok dan konfigurasi hosting tidak diuji secara langsung.

## Kebutuhan yang belum tercakup pada implementasi saat ini

1. **Kasir produk satuan:** penjualan dessert/minuman/olahan belum tersedia. Ini prioritas berikutnya untuk menyelesaikan alur hasil produksi → stok produk jadi → penjualan.
2. **HPP/laba:** harga beli saat ini referensi master, bukan biaya aktual per penerimaan atau HPP resep. Laporan omzet bukan laporan laba.
3. **Menu customer:** editor `/menu/kelola.html` menyimpan draft lokal lalu mengekspor `menu.json`; belum sinkron otomatis dengan produk POS.
4. **Hak akses:** seluruh staff terdaftar dapat mengakses semua store. Belum ada pemisahan owner/kasir per cabang.
5. **Skala data:** `pos_read` masih membaca seluruh riwayat dan foto master produk. Foto waste sekarang dimuat terpisah, tetapi pagination/filter server dan penyimpanan foto di object storage tetap tahap berikutnya jika data membesar.
6. **Penyesuaian stok:** pengurangan kg/butir menggunakan FIFO terpisah, tidak memilih batch fisik. Untuk koreksi operasional gunakan pembatalan transaksi asal bila tersedia; penyesuaian saldo bukan pengganti pelacakan batch.
7. **Browser recovery:** sessionStorage terbatas dan dapat dinonaktifkan. Payload foto besar bisa gagal dipersistenkan, meski ID retry masih tersedia selama tab aktif. Riwayat server perlu diperiksa setelah tab hilang sebelum membuat transaksi pengganti.

Tidak ada klaim bebas bug atau validasi atas konfigurasi akun produksi. Paket ini belum di-push, di-deploy, atau dijalankan terhadap database operasional.

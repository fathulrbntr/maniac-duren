# Alur pengguna Maniac Duren

Pilih toko aktif dan pastikan akun memiliki hak akses yang sesuai. Menu yang terlihat mengikuti hak akses. Mode demo dipakai untuk latihan; keluar dari demo sebelum mencatat kegiatan sebenarnya.

## Urutan kerja harian

1. **Persiapan:** periksa toko, produk/varian, supplier, resep, akun karyawan, metode pembayaran, serta printer/timbangan bila dipakai.
2. **Barang masuk:** catat penerimaan sekali melalui Stok. Durian mencatat kg dan butir; produk satuan mengikuti satuan master. Catat biaya kiriman melalui alur penerimaan yang tersedia.
3. **Produksi/reject:** gunakan Produksi untuk membuat hasil resep; gunakan alur Reject untuk mencatat reject, mengolah hasil aktual, atau kerugian. Hasil yang sudah terbentuk tidak dicatat ulang sebagai penerimaan.
4. **Buka kasir:** buka shift untuk akun dan toko aktif, isi modal awal. Penjualan memerlukan shift aktif. Tombol contoh dokumen demo juga meminta shift demo dibuka terlebih dahulu.
5. **Penjualan:** pilih barang/varian dan jumlah; untuk buah pilih cara jual kg/butir serta berat aktual. Pilih member bila ada. Periksa harga, diskon yang disetujui, metode bayar, dan nominal sebelum menyimpan. Pembayaran nontunai mengikuti konfirmasi yang diminta layar.
6. **Struk/dapur:** cetak atau buka kembali struk transaksi yang berhasil. Pesanan yang membutuhkan dapur mengikuti antrean dapur. Kegagalan cetak tidak berarti penjualan perlu dibuat ulang.
7. **Tutup kasir:** periksa transaksi, pengembalian, kas aktual, dan selisih shift. Laporan memuat aktivitas sesuai filter toko/periode dan akses akun.

## Fungsi menu

| Kelompok | Menu | Fungsi |
|---|---|---|
| Utama | Dashboard | Ringkasan kinerja dan pintasan |
| Utama | Kasir | Keranjang, member, pembayaran, struk |
| Utama | Shift kasir | Buka/tutup dan rekonsiliasi shift |
| Utama | Dapur | Menangani antrean pesanan |
| Inventory | Product | Master, varian, harga, foto, dan pengaturan produk |
| Inventory | Stok | Penerimaan, saldo, dan riwayat stok |
| Inventory | Reject | Catat reject, olahan, waste, dan riwayat batch |
| Produksi | Resep | Kebutuhan bahan dan hasil resep |
| Produksi | Produksi | Pemakaian bahan dan hasil aktual |
| Laporan & Administrasi | Laporan | Penjualan, biaya, stok, batch, dan ekspor |
| Laporan & Administrasi | Admin Dokumen | PO, pembelian, invoice, surat jalan, kop surat |
| Manajemen | CRM | Member, persetujuan komunikasi, dan aturan poin |
| Manajemen | Diskon | Pengaturan diskon dan kontrol persetujuan |
| Manajemen | Karyawan | Akun, peran, akses toko, serta profil |
| Manajemen | Absensi | Kehadiran dan jadwal kerja |
| Manajemen | Toko | Profil toko dan identitas struk |
| Manajemen | Supplier | Master supplier |
| Pengaturan | Pembayaran | Metode yang aktif per toko |
| Pengaturan | Perangkat | Printer, timbangan, dan perangkat kasir |
| Bantuan | Panduan | Petunjuk dalam aplikasi |

## Menjaga pencatatan tetap konsisten

- Jangan memasukkan stok awal yang sama melalui produk dan penerimaan sekaligus.
- Invoice dari penjualan mengambil transaksi yang sudah ada, bukan membuat penjualan baru. Dokumen pembelian baru dapat menambah stok; salinan penerimaan lama tidak boleh menambah stok lagi.
- Pembatalan penjualan mengikuti persetujuan, alasan, dan konfirmasi refund. Pembalikan poin dan stok mengikuti transaksi asal; periksa hasilnya sebelum mencoba ulang.
- Koreksi produksi/reject hanya boleh dilakukan sesuai saldo yang masih tersedia. Penyesuaian fisik bukan pengganti pembatalan transaksi asal.
- Saat koneksi terputus, gunakan proses coba lagi dengan payload yang sama. Jika tab tertutup, periksa riwayat sebelum membuat transaksi pengganti.
- `/menu/kelola.html` menyimpan draft menu lokal dan mengekspor JSON. Perubahan menu pelanggan belum otomatis mengikuti master POS.

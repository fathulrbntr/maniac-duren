# Alur pengguna Maniac Duren

Pilih **store aktif** sebelum transaksi. Master produk/resep/supplier berlaku bersama; stok dan aktivitas mengikuti store. Laporan mempunyai filter store sendiri.

| Menu | Kapan digunakan | Dampak ke stok |
|---|---|---|
| Product | Daftarkan nama, SKU, jenis, satuan, foto dan harga | Tidak berubah, kecuali opsi stok awal/penyesuaian dipilih |
| Store / Supplier | Daftarkan cabang, lokasi dan kontak supplier | Tidak berubah |
| Master Resep | Tentukan bahan dan hasil untuk satu kali resep | Tidak berubah |
| Stok & barang masuk | Terima pembelian atau catat saldo awal | Tambah stok penerimaan |
| Produksi | Buat cendol, creamer atau menu harian berdasarkan resep | Kurangi bahan, tambah hasil aktual |
| Waste & Olahan | Catat durian reject yang diolah atau waste total | Kurangi batch durian, tambah hasil olahan jika ada |
| Kasir | Catat penjualan durian utuh per kg/butir | Kurangi kg aktual dan jumlah butir |
| Laporan penjualan | Lihat omzet dan berat durian yang terjual | Tidak berubah |

## Setup awal satu kali

Daftarkan store dan supplier. Di Product, masukkan empat kategori jual: Buah, Dessert, Minuman, Olahan Duren. Bahan pembelian dan bahan produksi sendiri dibedakan lewat jenis item, bukan dipaksakan menjadi kategori jual.

Daftarkan tepung sebagai bahan baku pembelian (g), susu sebagai bahan baku pembelian (ml), cendol sebagai bahan produksi sendiri (g), dan creamer sebagai bahan produksi sendiri (ml). Daftarkan dessert sebagai menu dengan resep (porsi). Buat resep cendol, resep creamer, kemudian resep dessert yang menggunakan stok cendol dan creamer.

Catat stok awal **satu kali**. Jangan memasukkan jumlah yang sama melalui tambah produk dan barang masuk sekaligus.

## Kegiatan harian

**Barang datang:** Stok & barang masuk → Barang masuk → pilih jenis → tanggal, supplier, produk, jumlah → Simpan. Durian wajib mencatat kg dan butir; bahan mengikuti satuan master.

**Membuat bahan/menu:** Produksi → pilih resep → jumlah kali resep → periksa kebutuhan dan ketersediaan bahan → isi hasil aktual → Simpan. Tepung dipotong saat membuat cendol. Saat membuat dessert, yang dipotong adalah cendol siap pakai; tepung tidak dipotong lagi. Hasil produksi tidak dicatat ulang sebagai barang masuk.

**Mengolah reject:** Waste & Olahan → tanggal barang masuk → produk → batch/supplier → kg dan butir → jumlah hasil Durpas 500 gr, Durpas 1 kg, Coral → foto opsional → alasan → Simpan. Dua penerimaan pada tanggal sama tetap dibedakan berdasarkan batch/supplier. Durpas dihitung per kemasan, Coral per kg; hasil total tidak boleh melebihi kg input. Nol semua berarti waste total dan memerlukan konfirmasi.

**Menjual durian:** Kasir → produk dan batch asal → cara jual kg/butir → timbang berat aktual dan isi butir → pembayaran → Simpan. Contoh: 2 butir seharga Rp100.000/butir dengan berat 5 kg menghasilkan omzet Rp200.000 dan mengurangi stok 5 kg serta 2 butir. Laporan dapat menampilkan omzet per butir beserta kg yang dipakai.

## Koreksi dan batas fungsi

- Salah penjualan: buka struk, batalkan dengan alasan; stok asal dipulihkan dan omzet aktif berkurang.
- Salah waste: Hapus, isi alasan, konfirmasi. Stok hasil ditarik dan durian dikembalikan ke batch asal. Riwayat/foto tetap terlihat. Diblokir jika saldo hasil sudah digunakan.
- Salah produksi: batalkan dengan alasan selama saldo hasil belum digunakan. Bahan kembali ke batch asal.
- Selisih hitung fisik: Edit Product → Sesuaikan stok fisik → jumlah akhir dan alasan. Ini bukan pencatatan pembelian atau produksi. Penyesuaian FIFO tidak menyediakan pilihan batch tertentu.
- Master produk hanya dapat dihapus jika belum mempunyai riwayat/pemakaian.
- Transfer/pemakaian dapur hanya mengurangi/memindahkan stok durian. Untuk membuat hasil dengan resep gunakan Produksi; untuk reject dengan hasil gunakan Waste & Olahan.

**Kasir produk satuan sudah tersedia:** produk siap jual memotong stok saat bayar; menu resep masuk kitchen setelah pembayaran. Bahan raw/prep tidak dijual langsung.

## Status offline

Kasir frontend versi ini memerlukan internet. Fungsi sinkronisasi tersedia di database, tetapi antrean perangkat dan pemulihan sesi belum terhubung ke app.js. Jangan mengandalkan transaksi offline sebelum integrasi frontend selesai.

## Penerimaan dan reject

Stocker mencatat nota, timbang aktual termasuk reject dan butir. Admin menetapkan nilai nota, PO dan ongkir; stok baru dapat dijual/diolah setelah modal final. Ongkir mengikuti proporsi kg aktual. Reject harian dipisahkan dari batch asal dengan modal yang sama.
Pengolahan menghasilkan durpas dan coral berbiji; kulit dan isi rusak dicatat terpisah. Coral diolah lagi dengan penyusutan biji. Buat produk Durpas 500 gr dan Durpas 1 kg sebagai finished/pcs dengan harga jual aktual, Coral sebagai prep/kg tanpa harga jual. Stok awal 0.

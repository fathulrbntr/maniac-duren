# Audit modul operasional — patch 107

Sumber: arsip `maniac-duren.zip` yang diberikan pengguna. Audit difokuskan pada penerimaan, persediaan, barcode, transfer, laporan batch, harga, dan akses divisi. Tidak ada koneksi atau perubahan database produksi maupun deployment situs saat pengerjaan.

| Temuan | Perbaikan |
| --- | --- |
| SQL 107 awal menghilangkan jenis `waste` yang masih digunakan data dan proses lama | Pertahankan seluruh jenis lama dan tambahkan `transfer`; validasi semua baris tanpa menghapus atau mengubah datanya |
| Transfer lama langsung menambah stok tujuan tanpa scan penerima | Pisahkan pengiriman, stok Dalam perjalanan, scan penerimaan, dan konfirmasi lengkap atomik |
| Dokumen DO/PUR lama dapat menjadi jalur pemindahan stok di luar alur baru | Blokir jenis dokumen stok tersebut di server dan arahkan ke penerimaan/pengiriman gudang |
| Akses manager/master memungkinkan pengelolaan harga di toko | Admin Back Office/Owner menguasai master dan keuangan pusat; Manager Toko dibatasi operasional lokasi |
| Barang datang bisa diarahkan ke outlet biasa | Penerimaan baru diwajibkan di lokasi warehouse, dengan nota biaya admin untuk petugas gudang |
| Manual fruit stock dan jalur timbang nontracking berisiko melepas jejak per buah | Wajib barcode tracking; koreksi stok buah manual ditolak; sediakan rekonsiliasi identitas stok lama tanpa menambah kuantitas |
| Harga transfer, biaya supplier dan harga retail belum dibedakan | Master harga transfer dan snapshot invoice; unit cost toko dari nilai invoice; biaya supplier dan asal batch dipertahankan |
| Persediaan dalam perjalanan bisa terlihat seperti selisih batch | Tambah posisi transit pada laporan, detail lokasi/status barcode, dan ekspor lokasi |
| Penggolongan jurnal baru belum ada pada laporan stok | Transfer keluar/masuk dan pembatalan digolongkan sesuai arah; transfer bukan penjualan retail |
| Markup transfer dapat mengurangi alokasi omzet olahan ke supplier dalam laporan pusat | Alokasi memakai biaya sumber sepanjang rantai bahan/olahan, bukan markup transfer internal |
| Metadata kepemilikan akun pending memakai user metadata yang dapat diubah pengguna | API akun dan pemeriksaan target memakai app metadata yang dikelola server; akun yang sudah tertaut tetap memakai user_id yang tersimpan |
| Scan penerimaan berulang berpotensi mengunduh seluruh snapshot POS | Respons scan berupa delta barcode dan ID event; reload tetap membaca kondisi server |
| Pengiriman ulang setelah jaringan putus dapat membuat transaksi ganda | ID operasi tetap, payload/actor diverifikasi, jurnal atomik, serta rekonsiliasi retry |

## Bukti uji

- Baseline sebelum perubahan: 161 tes lulus.
- Suite sebelum koreksi constraint: 163 tes lulus, 0 gagal; pemeriksaan proyek lulus untuk 283 file sumber. Fixture saat itu belum memuat lot hasil reject sebelum pemasangan, sehingga kasus data lama ini terlewat.
- Koreksi menambahkan tes migrasi dengan lot `waste` aktif maupun habis, penolakan jenis tidak valid, pemasangan ulang, serta pengolahan reject melalui RPC setelah SQL 107.
- Kasus database gudang: nota admin, penerimaan barcode wajib, harga terkunci, kiriman satu dan banyak batch, stock transit, salah nomor surat jalan, salah barcode, salah toko, scan sebagian, penerimaan lengkap, invoice tidak berubah saat harga berubah, pembayaran terbatas sisa tagihan, pembatalan, barang satuan, dan pemasangan ulang SQL.
- Kasus 100 kg: 70 kg siap di gudang, 10 kg reject, 20 kg diterima toko. Sebelum konfirmasi, 20 kg tercatat Dalam perjalanan.
- Kasus modal: supplier Rp41.000/kg, transfer Rp60.000/kg. Penerimaan toko memakai Rp60.000/kg dan mempertahankan biaya supplier Rp41.000/kg; penjualan 2 kg memakai HPP toko Rp120.000.
- Kasus formulir: scan duplikat/asing, data tujuan/pengantar, penghapusan bahan sebelum kirim, pemulihan kegagalan jaringan, pilihan harga, nota supplier, pemeriksaan potong, pelayanan waitress, pembatasan menu, serta escaping dokumen cetak.
- Kasus keamanan: RPC internal dan tabel privat tidak bisa dibaca role anon/authenticated secara langsung; toko tidak dapat menetapkan harga; izin finance/master lama tidak mengembalikan akses manager; user metadata tidak bisa mengklaim akun karyawan pending.
- Pemeriksaan sintaks, impor/aset lokal, navigasi/style ganda, serta konsistensi build SQL dijalankan melalui `npm run check`.

Catatan: tes formulir memakai adapter DOM tanpa rendering. Tes database memakai PostgreSQL lokal PGlite dan data buatan. Ini tidak membuktikan kondisi data, kinerja, jaringan, atau konfigurasi keamanan deployment produksi.

## Batas dan pekerjaan lanjutan yang belum tercakup

- Browser lengkap dan verifikasi visual/cetak belum dijalankan karena pembatasan lingkungan; skrip uji disertakan.
- Pembacaan awal POS masih menggunakan snapshot data utama dari arsitektur lama. Pengurangan respons per scan tidak menyelesaikan seluruh kemungkinan egress tinggi. Tidak dilakukan pengukuran egress Supabase aktual.
- Nota supplier pending belum dapat diedit; kiriman yang telah dipindai sebagian harus dilengkapi. Retur/selisih kiriman dan penerimaan parsial belum diimplementasikan.
- Tidak ada reset data, migrasi otomatis seluruh stok toko menjadi gudang, atau pendaftaran otomatis barcode historis.
- Tagihan transfer adalah pencatatan internal. Tidak terhubung otomatis ke pembayaran bank, QRIS, EDC atau sistem pajak.

Akun yang sudah tertaut tetap berfungsi. Akun lama yang sempat dibuat tetapi belum tertaut dan hanya mempunyai user metadata harus diperiksa owner; patch tidak mengklaim atau menautkannya otomatis.

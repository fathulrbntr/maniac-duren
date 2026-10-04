# Update 07 — alur ringkas dan audit stok

## Cara memasang pada proyek yang sudah berjalan

1. Ekstrak paket dan salin isinya ke folder repository Maniac Duren yang Anda gunakan. Pertahankan konfigurasi lokal dan folder Git repository tersebut.
2. Di Supabase SQL Editor, buat query bernama **update_07_flow_audit**. Tempel seluruh isi `database/007-flow-audit.sql`, lalu Run. Ini untuk database yang sudah menjalankan update 01–06.
3. Buat query berikutnya bernama **update_08_waste_output_proof**. Tempel seluruh isi `database/008-waste-output-proof.sql`, lalu Run. Update ini menambahkan nama pengolah dan bukti foto per hasil olahan.
4. Setelah SQL berhasil, commit dan push perubahan kode ke repository Vercel yang sama. Migration mempertahankan tabel, transaksi, stok, dan foto yang sudah ada.
5. Sesudah deployment selesai, muat ulang `/pos/` dan login. Cek store aktif, saldo stok, riwayat waste dan tombol Lihat bukti.

**Jangan menjalankan `database/pos.sql` atau mengulang migration lama pada database aktif.** `pos.sql` khusus instalasi baru dan sudah memuat versi terbaru. Jika migration 06 belum pernah dijalankan, jalankan migration yang belum terpasang secara urut sebelum 07, lalu 08.

## Perubahan yang terlihat

- Navigasi dikelompokkan: Operasional, Laporan, Master data.
- `Create Product` dinamai **Produksi** untuk membedakannya dari tambah master produk.
- Barang masuk berada di satu pintu: pilih durian utuh atau bahan/produk satuan.
- Waste hanya dicatat di **Waste & Olahan**. Transfer/pemakaian tidak lagi menawarkan input waste kedua. Riwayat waste lama masih terlihat.
- Hasil olahan ditampilkan sebagai tiga kartu ringkas: Durpas 500 gr, Durpas 1 kg, dan Coral. Masing-masing hanya meminta jumlah dan bukti foto.
- Tanggal barang masuk memakai kalender. Tanggal waste otomatis mengikuti hari ini dan tidak dapat diedit. Nama pengolah wajib diisi.
- Tanggal masuk waste dipilih dari penerimaan yang mempunyai saldo di store aktif.
- Konfirmasi saat meninggalkan form berisi data, dan sebelum mencatat waste total tanpa hasil olahan.
- Bukti waste diambil ketika dibuka; foto tidak dikirim ulang bersama seluruh stok pada setiap transaksi.
- Tombol/form dikunci selama penyimpanan; pengiriman ulang memakai ID yang sama saat hasil koneksi belum pasti.
- Tanggal tersedia stok transfer baru mengikuti tanggal transfer di store tujuan.

## Jika koneksi terputus ketika simpan

Kirim ulang data yang sama, atau buka tombol **Periksa / kirim ulang** yang muncul setelah halaman dirender/dibuka lagi. Sistem memeriksa apakah ID transaksi sudah tersimpan sebelum menawarkan pengiriman ulang. Jangan mencatat transaksi pengganti dengan data berbeda sebelum status transaksi lama jelas.

Pemulihan mencakup penjualan, durian masuk, transfer/pemakaian, bahan masuk, produksi, dan waste. Identitas permintaan disimpan per akun dalam tab browser. Bila penyimpanan browser penuh/nonaktif—terutama karena bukti foto besar—pemulihan setelah tab ditutup tidak dapat dijamin; periksa riwayat transaksi sebelum membuat pengganti.

## Terminal

Jalankan dari folder repository yang sudah terhubung ke GitHub, sesudah menyalin paket dan menjalankan SQL:

```bash
git status --short
git diff --stat
git add pos api database menu scripts tests docs package.json package-lock.json .gitignore .vercelignore README.md POS-SETUP.md UPDATE.md UPDATE.txt
git commit -m "Rapikan alur POS dan perbaiki konsistensi stok"
git push
```

Belum ada perubahan yang dikirim langsung ke Supabase, GitHub atau Vercel oleh proses audit ini.

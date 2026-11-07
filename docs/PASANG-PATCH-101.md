# Patch 101 — barcode unik per buah

Paket ini memperbarui sumber POS Maniac Duren yang sudah sampai patch 100. Berisi file yang berubah, satu migrasi tambahan, dan pengujian. Belum dipasang ke website atau database produksi.

## Pasang

1. Ekstrak isi ZIP ke root proyek `maniac-duren`, sejajar folder `pos` dan `database`. Timpa file dengan nama sama. Jika proyek Anda belum sampai patch 100, pasang patch 100 lebih dahulu.
2. Buka SQL Editor di Supabase milik proyek ini. Jalankan **hanya** `database/fruit-tracking-101.sql`. Fitur penerimaan 082, kasir 083, pembayaran 084, CRM 085, dan setoran 092 harus sudah ada. Migrasi ini menambah tabel tracking dan mempertahankan rangkaian fungsi yang terpasang; dapat dijalankan ulang. Jangan menjalankan ulang `database/pos.sql` untuk pemasangan patch ini.
3. Dari terminal di folder proyek, jalankan:

```bash
npm test
npm run check
git add pos database/fruit-tracking-101.sql tests/tracking-barcode.test.mjs tests/fruit-tracking-db.test.mjs docs/PASANG-PATCH-101.md
git commit -m "Integrate unique scale barcodes with fruit inventory"
git push origin main
```

4. Setelah deployment selesai, muat ulang POS (Ctrl+Shift+R). Jika muncul pesan pembaruan tracking belum terpasang, periksa bahwa SQL dijalankan di proyek Supabase yang sama dengan POS.

## Pemetaan Master Barang

Pada **Monthong** (atau varian Monthong yang benar):

| Kolom | Isi |
| --- | --- |
| Barcode | `0001` |
| Satuan stok | Kg + butir |
| Harga jual/kg | Samakan dengan timbangan, misalnya Rp90.000 |
| Harga jual/butir | Isi jika penjualan per butir digunakan |

Kode `0001` harus sesuai Item Code di timbangan dan hanya digunakan oleh satu produk/varian. Simpan sebagai teks agar nol di awal tetap ada. Jangan memasukkan keseluruhan barcode 26 digit ke Master Barang. Produk lain memakai Item Code miliknya sendiri.

## Alur penggunaan

1. Buka **Barang masuk → Catat timbang aktual**. Isi supplier, tanggal barang masuk, nomor nota, harga nota setiap produk, dan ongkir.
2. Pilih Monthong, buka pencatatan timbang, lalu scan label satu per satu. Setiap barcode baru menambah satu butir dengan berat sesuai label. Scan ulang label yang sama ditolak. Dua label berbeda dengan berat sama tetap dihitung sebagai dua buah.
3. Konfirmasi penurunan barang selesai dan simpan penerimaan. Baru saat itu stok dan identitas buah masuk database. Modal tetap dihitung dari harga nota dan ongkir dibagi aktual penerimaan.
4. Di kasir, scan label yang sama. Sistem memilih produk, batch, supplier, dan tanggal penerimaan otomatis. Pilih per kg/per butir lalu Enter untuk menambah ke pesanan. Stok turun setelah transaksi berhasil disimpan, bukan saat scan ke keranjang.
5. Untuk transfer, reject, pengolahan reject, atau waste buah: scan seluruh buah yang akan ditangani dari satu batch. Berat dan butir mengikuti label. Pengolahan dan waste tetap memakai foto bukti serta hasil aktual seperti sebelumnya.
6. Di **Laporan → Batch supplier → Telusuri**, bagian **Jejak per buah** menampilkan barcode, berat, status, outlet, dan riwayat kegiatan.

Label baru yang belum dicatat sebagai penerimaan akan ditolak di kasir. Stok lama tidak otomatis dihubungkan ke label baru berdasarkan berat; ini menghindari penggandaan stok. Jangan memasukkan ulang stok lama sebagai penerimaan baru hanya agar barcode aktif. Jika ingin menghubungkan label ke stok lama, diperlukan proses penetapan label tersendiri yang belum termasuk patch ini.

## Format mesin pertama

Contoh dari hasil scan:

`92010711260000680001000228`

| Posisi digit | Nilai contoh | Arti |
| --- | --- | --- |
| 1–2 | `92` | Awalan tracking |
| 3–4 | `01` | ID timbangan |
| 5–10 | `071126` | Tanggal label DDMMYY: 7 November 2026 |
| 11–16 | `000068` | Nomor urut cetak |
| 17–20 | `0001` | Item Code produk |
| 21–26 | `000228` | Berat 228 gram / 0,228 kg |

Format tetap Code128, 26 digit, tanpa menambah digit pemeriksa ke teks scan. Harga diambil dari Master Barang POS; label ini memuat berat, bukan harga. Tanggal label berbeda fungsi dari tanggal penerimaan supplier: asal batch mengikuti penerimaan yang tersimpan.

Kombinasi mesin + tanggal + nomor urut tidak boleh dipakai ulang untuk buah lain. Label yang tercetak ulang dengan nomor urut baru adalah identitas baru; operator tetap harus memastikan satu buah tidak diterima dua kali memakai dua label berbeda. Mesin kedua belum diatur dalam pekerjaan ini. Saat digunakan nanti, ID mesin harus berbeda.

## Perilaku dan batasan

- Label EAN-13 lama berawalan `21` tetap didukung untuk alur lama, tanpa klaim identitas unik per buah.
- Jangan mencampur catatan manual/label lama dengan label tracking dalam satu baris produk penerimaan.
- Barcode disimpan sebagai teks; berat tracking tidak dapat diedit menjadi berbeda dari label.
- Berat valid lebih dari 0 sampai 30 kg. Tanggal tidak valid, barcode terpotong, pemetaan produk ganda, dan ketidaksesuaian batch ditolak.
- Database memeriksa duplikasi dan status dalam transaksi atomik. Pengiriman ulang permintaan yang sama tidak menggandakan stok, penjualan, atau riwayat.
- Buah yang sudah terjual, dibuang, diolah, atau berada di outlet lain tidak dapat dijual ulang sebagai stok tersedia.
- Pembatalan mengikuti aturan persetujuan POS. Buah kembali tersedia hanya jika transaksi membatalkan dengan pengembalian stok. Pembatalan pengolahan harus berurutan dari proses terakhir.
- Penyusutan parsial atau penggantian berat pada label tracking belum ditambahkan. Untuk batch tracking, form waste menangani buah utuh berdasarkan label; opsi penyusutan parsial dinonaktifkan.
- Data demo terisolasi dari transaksi nyata dan mendukung penerimaan/penjualan/retur/transfer serta riwayat barcode.

## Verifikasi

Seluruh 155 berkas pengujian otomatis lulus, termasuk dua pengujian baru. Pengujian database memakai PostgreSQL melalui PGlite dengan rangkaian migrasi POS yang ada: penerimaan, label ganda, pengiriman ulang, transaksi gagal, penjualan/retur, transfer, reject/waste dan pembatalannya, pembatasan akses, serta pemasangan ulang migrasi.

Pemeriksaan browser lokal menggunakan data simulasi mengonfirmasi batch/supplier otomatis, berat 0,228 kg dan 1 butir, subtotal Rp20.520 pada harga Rp90.000/kg, penolakan scan ganda, dua label menjadi 0,456 kg/2 butir, dan kunci jumlah pada waste.

Belum diuji terhadap database produksi, deployment Vercel, atau scanner fisik dari lingkungan ini. Hasil scan fisik yang diberikan pengguna menjadi contoh pengujian parser.

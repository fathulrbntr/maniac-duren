# Update 021 — Penerimaan, reject, olahan dan laporan supplier

## Cara memasang pada proyek yang sudah berjalan

1. Ekstrak ZIP patch ke folder proyek Maniac Duren. Gabungkan folder dan ganti file dengan nama yang sama. ZIP hanya memuat file yang ditambah/diubah; jangan hapus file proyek lainnya.
2. Supabase → SQL Editor → New query. Buka `database/migrations/021-batch-tracking.sql` di VS Code, salin SELURUH isi file, lalu Run. Prasyarat: migration 020 sudah terpasang. Migration 021 aman dijalankan ulang dan tidak mereset transaksi.
3. Push perubahan dan setelah deployment selesai buka ulang web dengan Ctrl+Shift+R.
4. Owner membuka Karyawan untuk menetapkan Admin pusat, Stocker atau Kitchen. Admin pusat mengakses seluruh outlet tanpa harus diberi role Owner.

Database yang sudah berjalan hanya memakai migration 021. `database/pos.sql` adalah installer lengkap untuk database BARU; jangan menjalankannya pada database aktif. Tidak ada kredensial atau koneksi database produksi yang diubah dalam patch ini.

## Alur penerimaan

Stocker → Stok & barang masuk → Barang masuk → Durian utuh.

- Isi tanggal, supplier, outlet dan nomor nota/surat jalan sebagai identitas kiriman.
- Tambahkan setiap jenis durian sekali dalam kiriman tersebut.
- Catat timbang keranjang berulang. Berat bersih = berat timbangan − berat keranjang (tare). Tare 0 jika timbangan sudah di-zero-kan.
- Berat dan butir aktual mencakup buah reject. Kolom reject adalah BAGIAN dari jumlah aktual, bukan tambahan jumlah datang.
- Kiriman disimpan sebagai stok menunggu modal; reject langsung dipisahkan ke lot turunan.

Admin pusat → Stok & barang masuk → Penerimaan & reject harian → Cocokkan PO / nota.

- Lengkapi kg/butir PO, total tagihan setiap jenis buah, serta ongkir bersama.
- Ongkir setiap jenis = ongkir kiriman × berat aktual jenis / total berat aktual seluruh kiriman, termasuk reject. Alokasi terakhir menampung sisa pembagian numerik sehingga total ongkir tepat.
- Total modal per jenis = tagihan nota jenis tersebut + bagian ongkir.
- Modal/kg = total modal per jenis / berat aktual diterima, termasuk reject. Jika tagihan tetap untuk 1 ton dan aktual 850 kg, tagihan dibagi 850 kg.
- Selisih PO − aktual disimpan untuk report; tidak menjadi stok. Sebab selisih tidak disimpulkan otomatis sebagai hilang atau susut.
- Modal ditetapkan sekali sebelum penjualan/pengolahan/transfer. Jika ada kredit supplier, gunakan nilai tagihan neto yang sudah disepakati sebelum finalisasi.
- Ini rekonsiliasi angka PO/nota pada penerimaan. Pembuatan dokumen PO/DO lengkap belum ditambahkan dalam tahap ini.

Harga jual tetap diatur melalui master produk dan dimasukkan ke timbangan seperti sebelumnya. Penimbangan barcode satu per satu tidak menambah stok kedua kali. Kasir tetap memilih batch asal; patch tidak mengasumsikan barcode timbangan unik dan tidak menambahkan koneksi otomatis ke timbangan.

## Reject selama penyimpanan/penjualan

Stocker → Penerimaan & reject harian → Pisahkan reject.

Pilih batch fisik yang sesuai dengan tanggal, supplier dan nota. Catat berat buah utuh, butir, alasan dan penyebab (saat datang / rasa-kualitas / terlalu matang / lainnya). Stok jual berkurang, stok reject untuk kitchen bertambah dengan modal dan asal supplier yang sama. Reject tidak langsung dihitung sebagai kerugian mutlak.

## Kitchen: dua tahap pengolahan

### Tahap 1: buah reject utuh → durian kupas dan coral

Olah reject → pilih tanggal masuk, produk dan batch reject yang sudah memiliki modal.

Catat kg/butir yang diproses, hasil kupas 500 gr/1 kg, coral berbiji, kulit dibuang dan isi rusak. Neraca wajib:

`buah utuh = kupas berbiji + coral berbiji + kulit + isi rusak`

Jika ada hasil yang bisa dimanfaatkan, satu proses mencatat kupas dan coral sekaligus. Seluruh hasil 0 hanya untuk barang yang tidak bisa dimanfaatkan. Foto input dan foto setiap hasil positif tetap mengikuti validasi bukti yang sudah ada. Petugas berasal dari akun login.

Kulit normal ikut membentuk modal hasil; isi rusak dicatat sebagai waste. Nilai modal dan biaya bersama dialokasikan ke hasil layak serta waste isi menurut berat setelah kulit dikeluarkan. Sisa nilai untuk hasil layak dibagi menurut berat kupas/coral. Biaya kemasan khusus ditambahkan hanya ke hasil terkait. Modal tidak menjadi Rp0.

### Tahap 2: coral berbiji → daging durian / es durian

Olah reject → Olah coral.

Pilih satu atau beberapa batch coral. Catat pemakaian masing-masing, biji, isi rusak, dan daging bersih yang dialokasikan ke setiap hasil. Neraca wajib:

`coral berbiji = daging bersih untuk seluruh hasil + biji + isi rusak`

Untuk es durian, kolom daging bersih tidak termasuk air/gula/bahan tambahan. Jumlah produk akhir mengikuti satuan produk master (pcs/kg/g/ml). Modal coral dan biaya bersama diteruskan ke hasil; biaya bahan tambahan/kemasan khusus ditambahkan per hasil. Semua batch/supplier sumber tetap terlacak jika coral dicampur.

Master Coral menjadi bahan produksi internal. Master Daging Durian yang sebelumnya bertipe bahan pembelian dipindah menjadi bahan produksi; resep dan lot lama tetap menggunakan ID yang sama. Jika belum ada produk hasil, buat Daging Durian sebagai bahan produksi dan Es Durian sebagai produk jadi siap jual, dengan satuan/harga sesuai operasional.

Pada form Olah coral, biaya bahan tambahan dicatat dalam rupiah; stok bahan tambahan belum otomatis dipotong dari form ini. Untuk produksi berbasis resep dengan pemotongan semua bahan, gunakan fitur Produksi bahan yang sudah ada. Rincian resep es durian dapat disinkronkan setelah komposisinya ditentukan.

Pembatalan olahan hanya boleh dilakukan jika stok hasil utuh dan belum digunakan atau dicadangkan. Pembatalan mengembalikan input, menarik hasil dan membalik nilai waste. Izin pembatalan tetap terpisah dari akses admin pusat.

## Laporan

Jejak stok → Laporan batch & supplier → pilih supplier dan batch.

- PO, aktual dan selisih kg/butir, termasuk persentase selisih berat.
- Modal aktual, reject awal/harian, alasan dan tanggalnya.
- Stok buah dan seluruh stok olahan turunannya.
- Hasil pengolahan, persentase hasil, kulit, biji dan waste isi rusak per tahap.
- Penjualan terkait batch dan modal transaksi.
- Status selesai hanya saat buah dan semua hasil turunannya 0.
- Unduh CSV rincian penerimaan, proses, penyusutan, stok dan penjualan.

Untuk campuran batch, penjualan dialokasikan menurut kontribusi berat buah asal. Tabel proses dan nilai sisa lot campuran menampilkan proses/lot lengkap dan diberi keterangan; jangan menjumlahkannya lintas laporan batch sebagai nilai terpisah. Ini laporan kontribusi batch, bukan klaim laba bersih perusahaan.

Data lama tetap dipertahankan. PO, kulit/biji atau modal yang dahulu tidak dicatat tidak ditebak atau diisi nol. Rincian lengkap berlaku pada proses baru yang memakai alur ini.

## Verifikasi

Lulus: pengujian database instalasi baru/upgrade, migration berulang, intake aktual, reject saat datang/harian, ongkir, modal aktual, dua tahap pengolahan, campuran dua supplier, konservasi biaya, penjualan, penutupan stok, transaksi atomik, retry, pembatalan dan pembatasan akses. Regresi kasir/kitchen, employee/API, timbang, serta unit test lama juga dijalankan.

Struktur HTML form dan sintaks modul diperiksa. Pengujian visual/interaksi browser belum dilakukan karena Chromium tidak tersedia dan unduh browser gagal. Belum diterapkan ke Supabase/Vercel produksi.

## Git Bash

```bash
git status
git add .
git commit -m "Sempurnakan penerimaan batch, reject dan tracking olahan supplier"
git push
```

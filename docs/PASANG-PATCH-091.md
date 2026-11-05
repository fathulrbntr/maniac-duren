# Patch 091 — Cetak laporan dashboard, profit, kerugian, dan nilai aset

Tombol **Cetak laporan A4** pada dashboard membuka laporan dengan susunan tabel seperti referensi: penjualan per kategori, pembayaran, transaksi tunai, diskon, loyalitas, pembatalan, produk terlaris, serta laba/rugi. Ditambahkan kartu profit/rugi bersih, kerugian stok/waste, dan estimasi nilai aset persediaan.

Dasar patch: `maniac-duren(8).zip` + patch 089, 089a, dan dock 090. Paket hanya berisi file yang berubah. Belum diterapkan ke website produksi.

## Pasang

1. Ekstrak isi ZIP ke folder utama proyek yang berisi `package.json`, lalu ganti file yang sama. Pertahankan perubahan yang lebih baru jika ada pada file tersebut.
2. Tidak perlu SQL, pengaturan Supabase, atau dependency baru.
3. Dari terminal di folder proyek, jalankan:

```text
node scripts/check-project.mjs
node --test tests/dashboard-report.test.mjs tests/dashboard.test.mjs tests/dashboard-app.test.mjs tests/reports.test.mjs tests/batch-profit.test.mjs
```

4. Setelah pemeriksaan berhasil, jalankan Git berikut. Berlaku untuk PowerShell dan Git Bash:

```text
git add pos/app.js pos/index.html pos/dashboard-ui.mjs pos/dashboard.css
git add pos/dashboard-report.mjs pos/dashboard-print.mjs tests/dashboard-report.test.mjs docs/PASANG-PATCH-091.md
git commit -m "Add dashboard A4 report with profit losses and stock assets"
git push origin main
```

5. Setelah Vercel selesai deploy, muat ulang POS. Pilih **Dashboard → toko → periode → Cetak laporan A4 → Cetak / Simpan PDF**. Gunakan A4 portrait, skala 100%, dan matikan header/footer bawaan browser bila ingin tampilan bersih.

## Isi dan cara menghitung

| Bagian | Perhitungan / cakupan |
| --- | --- |
| Pendapatan | Transaksi lunas aktif setelah diskon; mengikuti tanggal pembayaran dan toko yang dipilih. |
| HPP | Snapshot konsumsi stok setiap baris pesanan. Penjualan buah lama menggunakan modal lot asal, sesuai laporan yang sudah ada. |
| Laba kotor | Pendapatan − HPP. |
| Kerugian stok / waste | Jurnal kehilangan modal sesuai tanggal kejadian. Koreksi waste negatif tetap diperhitungkan. |
| Profit / rugi bersih tercatat | Pendapatan − HPP − waste − pengeluaran operasional aktif. Nilai negatif berarti rugi. |
| Estimasi nilai aset persediaan | Jumlah fisik stok saat ini × modal per satuan setiap lot. Termasuk buah, olahan, bahan baku, bahan produksi, dan reject yang masih tersedia. |
| Transaksi tunai | Pembayaran masuk dan refund dari riwayat shift berdasarkan waktu aktivitas WIB. Selisih kas berasal dari shift yang ditutup pada periode terpilih. |

- Aset pada laporan ini berarti **persediaan yang tersedia sekarang**. Belum mencakup kas, rekening bank, piutang, bangunan, kendaraan, atau alat. Nilai aset tidak mengikuti tanggal historis filter penjualan.
- Buah dinilai dari kg; jumlah butir tidak ditambahkan lagi sebagai nilai kedua. Produk resep tidak dihitung sebagai stok fisik. Stok hasil produksi dinilai menggunakan modal keseluruhan produk, bukan dijumlahkan ulang dari setiap batch asal.
- Pembelian dan ongkir yang sudah menjadi modal tidak dikurangkan lagi setelah HPP. Reject yang masih bisa diolah tetap persediaan. Kulit/susut proses yang sudah diserap modal hasil tidak dipotong lagi sebagai waste.
- Profit hanya berdasarkan biaya yang tercatat. Pajak, biaya kirim pelanggan, deposit, dan penyusutan aset tetap belum dirinci oleh model transaksi saat ini. Selisih kas ditampilkan sebagai informasi; belum otomatis dibebankan sebagai biaya.
- Transaksi batal dikeluarkan dari penjualan pada tanggal penjualan asal, mengikuti laporan POS yang sudah ada. Pembatalan ditampilkan terpisah menurut tanggal void; refund tidak dipotong dua kali. Ini berbeda dari laporan arus kas berdasarkan tanggal uang berpindah.
- Dine In memakai nomor meja; Take Away memakai transaksi tanpa meja; metode GoFood / GrabFood / ShopeeFood dikelompokkan Delivery. Transaksi lama tanpa penanda tetap tampil sebagai belum terklasifikasi. Kategori mengikuti master saat laporan dibuat.
- Poin diperoleh memakai snapshot transaksi; penukaran poin/item gratis belum tersedia. Nomor rekening historis belum tersimpan pada transaksi sehingga dicetak sebagai tanda “—”.
- Modal/biaya tidak lengkap ditampilkan **Belum lengkap**, bukan dianggap nol. Data kas gagal dimuat diberi keterangan; laporan lain tetap dapat dicetak. Seluruh halaman mode demo diberi penanda DEMO.
- Data keuangan hanya tampil untuk akun dengan akses `finance`. Tombol cetak mengikuti akses `reports`. Cakupan semua toko tetap dibatasi outlet yang dapat diakses akun.

## Verifikasi

- 30 pengujian lulus: perhitungan profit/HPP/waste/aset, modal nol dan belum lengkap, satuan campuran, void, filter toko/tanggal, pagination kas, hak akses, keamanan teks, popup cetak, dashboard, serta pemulihan sesi/demo.
- Pemeriksaan proyek lulus untuk sintaks, import/aset lokal, identitas modul, duplikasi menu/style, dan konsistensi SQL yang sudah ada.
- Pratinjau browser diperiksa menggunakan data contoh: dashboard desktop, ponsel lebar 390 px, popup laporan, dan tabel laba/rugi/aset. Tiga bagian utama dimulai pada halaman terpisah; rincian panjang dapat melanjutkan ke halaman tambahan. Header tabel berulang dan baris tabel tidak dipotong di tengah.
- Belum diuji dengan data produksi atau printer fisik pengguna.

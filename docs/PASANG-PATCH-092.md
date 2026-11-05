# Patch 092 — Setoran tunai kasir

Paket ini melanjutkan patch dashboard 091. Hanya berisi file yang berubah/baru; belum diterapkan ke website produksi. Pasang patch 091 lebih dahulu. Tidak perlu dependency baru atau reset database.

## Pemasangan

1. Simpan perubahan lokal yang masih dikerjakan. Ekstrak isi ZIP ke folder utama proyek, sejajar `package.json`, lalu gabungkan/ganti file yang sama. Jangan menimpa perubahan yang lebih baru tanpa digabungkan.
2. Di Supabase SQL Editor, jalankan **hanya** `database/cash-deposits-092.sql`. Prasyaratnya rangkaian SQL sampai `crm-loyalty-085.sql`, termasuk shift 083 dan pembayaran 084. Skrip 092 boleh dijalankan ulang dan tidak menghapus transaksi lama. Jangan menjalankan ulang `pos.sql`, SQL reset, atau patch lama.
3. Jalankan pemeriksaan dari terminal pada folder proyek:

```text
node scripts/check-project.mjs
node --test tests/cash-deposits.test.mjs tests/cash-deposits-db.test.mjs tests/dashboard-app.test.mjs tests/cashier-ui.test.mjs
```

Tes database memakai PGlite lokal, tidak terhubung ke database produksi. Bila dependency belum tersedia, jalankan `npm ci` lebih dahulu.

4. Setelah pemeriksaan berhasil, jalankan (PowerShell maupun Git Bash):

```text
git add pos/app.js pos/index.html pos/dashboard-ui.mjs pos/cashier-shifts-ui.mjs pos/stock-demo.mjs pos/retry.mjs pos/photo-compression.mjs
git add pos/cash-deposits.mjs pos/cash-deposits-ui.mjs pos/cash-deposits.css
git add database/cash-deposits-092.sql database/README.md database/check-feature-chain.sql
git add tests/cash-deposits.test.mjs tests/cash-deposits-db.test.mjs docs/PASANG-PATCH-092.md
git commit -m "Add cashier cash deposits with bank receipts and dashboard balances"
git push origin main
```

5. Tunggu deployment Vercel, lalu muat ulang POS. Tombol muncul jika SQL 092 sudah aktif. Tanpa SQL tersebut, dashboard memberi keterangan fitur belum aktif.

## Cara menggunakan

- Pilih outlet, lalu klik **Setoran tunai** pada area kasir/Shift Kasir atau Dashboard → Transaksi.
- Popup menampilkan tanggal setor otomatis WIB dan nama kasir yang login. Tanggal tidak bisa diedit; server kembali menetapkan tanggal saat penyimpanan, termasuk bila melewati tengah malam.
- Isi nominal Rupiah bulat, bank tujuan, dan unggah bukti struk JPG/PNG/WebP maksimal 2 MB. Gambar dipersiapkan untuk menjaga keterbacaan dan mengurangi ukuran; periksa pratinjaunya sebelum menyimpan.
- Setelah disimpan, cash belum disetor berkurang dan cash sudah disetor bertambah. Lihat kembali struk melalui **Riwayat setoran → Lihat bukti**. Riwayat memiliki filter tanggal dan halaman.
- Kasir dapat mencatat untuk outlet yang dapat diakses. Akun dengan akses laporan dapat melihat riwayat; pengelola keuangan/owner dapat membatalkan pencatatan yang keliru dengan alasan. Bukti, nominal awal, kasir, waktu, dan alasan pembatalan tetap tersimpan. Pembatalan catatan tidak menarik uang dari bank.
- Fitur juga tersedia di mode demo dengan data terpisah; tidak mengirim setoran/bukti demo ke database asli.

## Arti saldo dashboard

| Angka | Perhitungan |
| --- | --- |
| Cash belum disetor | Total penjualan tunai lunas aktif setelah diskon/refund − setoran aktif yang tercatat. |
| Cash sudah disetor | Jumlah seluruh setoran aktif yang tercatat, berdasarkan struk yang diunggah. |

Saldo bersifat **akumulatif per outlet** dan tidak dibatasi tanggal filter penjualan. Pilihan semua toko menjumlahkan outlet yang dapat diakses; pilih satu outlet untuk mencatat setoran. Saldo dihitung ulang setelah transaksi/refund/setoran atau saat data diperbarui. Halaman pada perangkat lain perlu diperbarui untuk melihat perubahan terbaru.

Uang dibayar pelanggan yang kembali sebagai kembalian, modal awal laci, QRIS, transfer, kartu, dan petty cash tidak masuk saldo ini. Setoran adalah perpindahan kas dan tidak mengubah omzet/profit. Untuk uang dari laci aktif, lakukan penghitungan/tutup kasir sebelum mencatat setoran; laporan tutup shift tetap merekam hasil penghitungan saat shift ditutup.

**Saat pertama dipasang**, penjualan tunai historis yang masih tersimpan ikut dihitung. Setoran lama di luar aplikasi tidak dapat diketahui otomatis dan belum mengurangi saldo. Cocokkan saldo awal dengan catatan bank sebelum dipakai sebagai acuan kas fisik; jangan memasukkan setoran lama sebagai setoran hari ini. Fitur ini tidak menyediakan tanggal mundur/import setoran historis.

Refund setelah uang sudah disetor dapat membuat saldo negatif. Aplikasi menampilkan angka dan peringatan tersebut agar selisih bisa ditelusuri. Angka bukan saldo rekening bank aktual dan bukti unggahan tidak diverifikasi otomatis ke bank.

## Pengujian

Pengujian lokal mencakup validasi nominal/bukti, tanggal WIB dan identitas server, pemisahan outlet, akses bukti, batas saldo, pengiriman ulang tanpa duplikasi, dua setoran yang bersaing memakai saldo, refund, pembatalan dengan audit, paging/filter, mode demo, dan kompatibilitas rantai SQL sampai 085. Popup, upload struk, perubahan saldo, dan riwayat juga diperiksa pada tampilan browser dengan data contoh. Konfigurasi Supabase/JWT dan deployment produksi perlu mengikuti konfigurasi proyek yang sudah aktif.

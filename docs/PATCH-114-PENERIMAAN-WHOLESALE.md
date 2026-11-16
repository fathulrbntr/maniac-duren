# Patch 114 — penerimaan supplier & pengiriman berbarcode

Patch ini melanjutkan 112/113 pada proyek Maniac Duren. Kode dan migrasi disiapkan sebagai patch; belum dipasang ke Supabase produksi, belum di-push ke GitHub, dan belum di-deploy.

## Alur yang diterapkan

| Tahap                 | Back Office                                                                                                                   | Gudang / toko                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Buka nota supplier    | Supplier, nomor, tanggal, produk, kg dan butir pada nota, total harga, ongkir                                                 | Melihat data operasional tanpa modal/harga/pembayaran                                              |
| Penerimaan            | Memantau nota dan hasil scan                                                                                                  | Timbang setiap buah, scan barcode; produk dan berat mengikuti label                                |
| Jeda / lanjut         | Memantau progres                                                                                                              | Setiap scan berhasil tersimpan di server; tutup halaman lalu buka nota yang sama untuk melanjutkan |
| Selesai menerima      | Melihat selisih kg/butir dan persentase penyusutan, modal/kg dan modal/butir                                                  | Konfirmasi selesai; stok dari hasil scan; sesi terkunci                                            |
| Koreksi               | Koreksi berat/butir nota dengan alasan; buka ulang penerimaan dengan alasan. Harga dan ongkir tetap khusus owner              | Setelah dibuka, perbaiki daftar scan lalu selesaikan kembali                                       |
| Buka transaksi keluar | Pilih transfer ke toko atau wholesale, tujuan/pembeli, harga khusus per produk per kg/butir, pembayaran langsung atau pending | Dokumen muncul untuk disiapkan                                                                     |
| Siapkan barang        | Menunggu hasil scan                                                                                                           | Scan barcode dari stok gudang, boleh tutup dan lanjut, lalu Selesai scan penyiapan                 |
| Terbitkan dokumen     | Periksa harga dan total aktual, terbitkan invoice serta surat jalan; konfirmasi uang benar-benar diterima jika langsung bayar | Harga dan barcode terkunci setelah terbit; gudang hanya melihat surat jalan                        |
| Kirim                 | Pantau pengiriman dan tagihan                                                                                                 | Konfirmasi barang dikirim; barcode keluar dari stok gudang                                         |
| Terima transfer toko  | Pantau dokumen                                                                                                                | Toko scan ulang semua barcode sesuai surat jalan, lalu konfirmasi lengkap agar stok masuk          |
| Bayar kemudian        | Catat pembayaran di detail invoice; mendukung sebagian sampai lunas                                                           | Pembayaran tidak mengulangi perpindahan stok                                                       |

Alur baru ini menggunakan label tracking buah **26 digit** dengan satu identitas unik untuk setiap buah. Kode produk pada label harus dipetakan ke tepat satu produk buah di Master Barang. Berat sama tidak berarti barcode sama: nomor urut dan mesin tetap membedakan identitasnya. Jangan mengubah barcode menjadi angka atau memakai ulang label yang telah dibatalkan.

Ruang kerja Back Office menangani harga dan dokumen. Akun owner yang memilih ruang kerja Gudang juga mendapat tampilan operasional tanpa formulir harga; masuk kembali ke Back Office untuk mengedit. Pembatasan akun gudang juga berlaku pada respons server, bukan hanya kolom tampilan.

## Selisih, modal, dan koreksi

- Berat dan butir nota disimpan **per produk**, terpisah dari hasil scan. Nota lama tidak diisi angka perkiraan: tampil “Belum dicatat” sampai Back Office mengisinya.
- Selisih = nilai nota − hasil scan. Positif berarti kurang; negatif berarti lebih.
- Penyusutan berat = `(kg nota − kg aktual) / kg nota × 100%`. Contoh: nota 1.000 kg, aktual 850 kg → susut 150 kg / 15%. Jika aktual melebihi nota, layar menyebut **kelebihan**, bukan penyusutan positif.
- Persentase baru final setelah penerimaan selesai. Saat jeda atau dibuka ulang, hasil scan adalah progres, belum hasil final.
- Stok dan modal aktual memakai hasil scan. Total harga pembelian tetap sesuai nota; ongkir dibagi proporsional terhadap kg aktual. Modal/butir adalah rata-rata biaya per buah, termasuk ongkir.
- Pembayaran nota supplier dan pembayaran ongkir tetap dua catatan terpisah dari patch 112.
- Pembukaan kembali tidak membuat penerimaan kedua. Penambahan/penghapusan scan mengoreksi batch asal dengan jurnal perubahan. Payload penerimaan lama dan dokumen transfer yang sudah terbit tetap tersimpan.
- Barcode yang sudah ditransfer, terjual atau diproses tidak dapat dihapus dari penerimaan. Batch yang sedang disiapkan untuk pengiriman harus dilepas dari penyiapan dahulu sebelum penerimaannya dibuka kembali. Selama penerimaan dibuka ulang, transaksi baru pada buah terkait diblokir sampai selesai.
- Harga dokumen keluar boleh disesuaikan di Back Office sebelum terbit. Sesudah terbit, harga dan daftar barang dikunci. Dokumen belum dikirim dan belum dibayar dapat dibatalkan dengan alasan.

## Pembayaran dan laporan

Status pengiriman dan pembayaran berdiri sendiri. `Pending payment` tetap dapat dikirim setelah dokumen disetujui Back Office. `Langsung bayar` memerlukan konfirmasi tanggal, metode, referensi dan uang diterima pada saat penerbitan.

Transfer toko hanya memindahkan stok; tidak membuat penjualan wholesale. Penjualan wholesale dicatat **sekali saat barang dikirim**, dengan invoice/barcode yang sama, termasuk piutang yang belum lunas. Pembayaran berikutnya memperbarui saldo invoice tanpa menambah omzet lagi. Riwayat pembayaran aktual ada di detail invoice. Nilai laporan penjualan bukan saldo kas diterima. Transaksi wholesale tidak masuk shift kasir toko dan tidak dapat di-void melalui kasir.

## Penyimpanan scan

Scan yang sudah dikonfirmasi tersimpan di server. Satu operasi yang masih menunggu respons juga disimpan di perangkat, terpisah per akun dan dokumen. Bila jendela tertutup saat respons terputus, buka dokumen yang sama, pilih **Perbarui status**, lalu **Kirim ulang** bila masih diperlukan. ID operasi tetap sama, sehingga pengiriman ulang tidak menggandakan stok.

Tunggu konfirmasi tersimpan sebelum scan buah berikutnya. Fitur ini memerlukan koneksi; bukan penerimaan massal offline. Input yang baru diketik tetapi belum dikirim bukan scan tersimpan. Pengguna lain yang mengubah sesi akan memicu pesan “Sesi berubah”; perbarui sebelum melanjutkan.

## Pemasangan pada Windows PowerShell

1. Pastikan proyek sudah memakai patch 112 dan 113. Simpan pekerjaan lokal terlebih dahulu. Selesaikan penerimaan versi lama yang belum dikirim ke server sebelum mengganti alur; draft lama tidak otomatis menjadi sesi baru.
2. Ekstrak ZIP ini **langsung ke** `D:\PROJECT\MANIAC DUREN\maniac-duren`, gabungkan folder yang sama, dan timpa hanya file patch. ZIP ini bukan proyek lengkap dan tidak menyertakan dependensi.
3. Uji pada lingkungan uji dahulu. Pada database yang telah memasang 112, jalankan **seluruh** isi `database/warehouse-workflow-114.sql` melalui SQL Editor. Tidak ada reset data. Jangan memasang ulang 107/112 di atas 114.
4. Bila proyek menggunakan riwayat migrasi CLI, gunakan salinan `supabase/migrations/20261116130125_warehouse_receiving_wholesale_114.sql` sesuai riwayat proyek. Sumber dan salinan identik; gunakan satu jalur pemasangan, bukan keduanya. Patch 113 tidak memerlukan SQL baru.
5. Jalankan blok berikut di **PowerShell**, termasuk `& { ... }`. Tidak memakai sintaks Git Bash dan tidak perlu mengubah Execution Policy.

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location 'D:\PROJECT\MANIAC DUREN\maniac-duren' -ErrorAction Stop

    npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Instalasi dependensi gagal.' }

    npm.cmd run verify
    if ($LASTEXITCODE -ne 0) { throw 'Verifikasi gagal. Periksa error pertama.' }

    npx.cmd playwright install chromium
    if ($LASTEXITCODE -ne 0) { throw 'Instalasi browser gagal.' }

    npm.cmd run test:browser
    if ($LASTEXITCODE -ne 0) { throw 'Tes browser gagal. Periksa error pertama.' }

    git status --short
}
```

Tes browser khusus alur baru:

```powershell
node .\tests\warehouse-workflow-browser.mjs
```

Setelah tes dan pemeriksaan akun gudang/Back Office berhasil, perubahan siap ditinjau untuk commit dan deployment. Blok di atas **tidak melakukan commit, push, atau deploy**. Kode frontend dan SQL 114 perlu terpasang bersama agar tidak ada pengguna versi lama mencoba jalur penerimaan yang sudah dikunci.

## Berkas dan batas verifikasi

- `warehouse-workflow.mjs`: aksi, perbandingan nota/aktual, saldo invoice, penyimpanan operasi belum pasti.
- `receiving-session-ui.mjs`: progres penerimaan, jeda/lanjut, kontrol pembukaan kembali dan perbandingan.
- `outbound-ui.mjs`: dokumen transfer/wholesale, harga per transaksi, scan, penerbitan, pengiriman dan pembayaran.
- `supply-session-ui.mjs`: formulir dan pemulihan operasi bersama. Semua penyimpanan tetap melalui `ctx.mutate` dan dispatcher yang sudah ada.
- `warehouse-flow.mjs`, `warehouse-ui.mjs`, `supplier-notes-ui.mjs`, `app.js`: integrasi fitur, respons delta, navigasi dan cetak dokumen.
- `warehouse-workflow-114.sql`: transaksi atomik, hak akses, sesi, reservasi barcode, jurnal dan ledger pembayaran.

Validasi lokal mencakup pemasangan berulang, peran/lokasi, hak akses helper/RLS, retry, stok/jurnal, harga per dokumen, pembayaran terpisah, dan pengujian handler UI. Pengujian browser penuh disertakan dalam `test:browser`; hasil eksekusi lingkungan pengerjaan dicatat pada catatan validasi di bawah. Fixture PGlite tidak menggantikan Supabase/JWT produksi atau pengujian scanner/timbangan fisik.

### Catatan validasi lingkungan pengerjaan

- `npm run verify`: 183 tes lulus, termasuk tes SQL, model/handler UI, sintaks,
  lint, format, batas modul dan identitas migrasi.
- Respons scan hanya mengirim perubahan barcode; daftar lengkap dimuat saat membuka
  sesi/refresh, untuk mengurangi transfer data saat menerima banyak buah.
- `npm run test:browser` sudah dicoba tetapi belum lulus: Chromium Playwright belum
  tersedia dan unduhan browser gagal. Percobaan memakai Chromium sistem berhenti
  pada `socket() failed: Operation not permitted` sebelum UI dijalankan. Tes
  browser baru harus dijalankan di Windows melalui perintah di atas.
- `supabase db lint` lokal belum dapat berjalan karena stack PostgreSQL Supabase
  lokal tidak tersedia di port 54322. Migrasi dieksekusi dan diuji ulang pada PGlite;
  pemeriksaan grant helper serta RLS turut masuk tes. Tidak ada koneksi/perubahan
  database produksi atau klaim bahwa advisor produksi sudah lulus.

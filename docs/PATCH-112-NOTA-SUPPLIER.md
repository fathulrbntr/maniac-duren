# Patch 112 — Nota supplier, pembayaran, dan koreksi owner

Nota supplier dapat dibuka kembali, termasuk setelah barang selesai diterima.
Pembayaran **harga nota** dan **ongkir** memiliki saldo, tanggal, metode, dan
riwayat masing-masing. Keduanya dapat dibayar pada tanggal berbeda atau dicicil.

## Cara menggunakan

1. Buka **Nota Supplier → Buka nota** pada nota yang dimaksud.
2. Pilih **Catat pembayaran nota** atau **Catat pembayaran ongkir**. Isi jumlah,
   tanggal pembayaran sebenarnya, metode, dan referensi, lalu simpan.
3. Untuk membetulkan harga, login menggunakan akun **owner**, buka nota, lalu pilih
   **Koreksi harga & ongkir · Owner**. Masukkan **total harga per produk**, bukan
   harga per kg, ongkir yang benar, alasan, dan centang persetujuan owner.
4. Periksa saldo dan riwayat koreksi. Nilai sebelum/sesudah serta identitas owner
   tersimpan. Pembayaran salah catat dapat dibatalkan oleh owner dengan alasan;
   catatan aslinya tetap terlihat sebagai dibatalkan.

| Kondisi                                                   | Status            |
| --------------------------------------------------------- | ----------------- |
| Nota baru, belum dibayar                                  | Belum dibayar     |
| Ada pembayaran tetapi belum penuh                         | Sebagian          |
| Pembayaran sama dengan tagihan                            | Lunas             |
| Harga diturunkan hingga kurang dari pembayaran sebelumnya | Lebih bayar       |
| Ongkir nol                                                | Tidak ada tagihan |
| Nota sebelum patch, riwayat belum diisi                   | Belum dicatat     |

Nota lama **tidak diasumsikan belum dibayar**. Catat pembayaran yang memang telah
terjadi, atau gunakan **Tandai belum dibayar** setelah memeriksa catatan usaha.
Pembayaran yang dicatat tidak boleh melebihi sisa tagihan. Status lebih bayar dapat
muncul setelah koreksi nilai; selisih perlu diselesaikan dengan supplier/kurir.
Pembatalan catatan hanya membetulkan pencatatan, bukan melakukan refund bank.

## Hak akses dan perhitungan

- Admin dengan akses back office dan finance dapat mencatat pembayaran. Petugas
  gudang dapat melihat nota sesuai lokasi yang diizinkan.
- Koreksi harga/ongkir dan pembatalan catatan pembayaran wajib menggunakan akun
  owner aktif. Pemeriksaan dilakukan juga di database. Patch ini memakai
  persetujuan langsung dari akun owner, bukan antrean permintaan persetujuan admin.
- Koreksi hanya mengubah total harga produk dan ongkir. Identitas supplier,
  produk, berat, jumlah buah, barcode, serta penerimaan tetap mengikuti nota asal.
- Sebelum penerimaan, nilai terbaru dipakai saat scan penerimaan disimpan. Sesudah
  penerimaan, modal batch dan stok turunan dihitung ulang dari asal bahannya;
  ongkir dibagi menurut berat aktual diterima. Perhitungan mencakup olahan dan
  bahan campuran yang memiliki jejak asal.
- Modal supplier pada barang yang ditransfer ikut dikoreksi. Harga transfer pada
  invoice/surat jalan yang sudah diterbitkan tetap. Laporan batch supplier
  mengikuti biaya asal yang terkoreksi.
- HPP penjualan/waste dan jurnal transaksi terdahulu tetap merupakan snapshot
  saat transaksi. Patch ini tidak melakukan restatement laba historis seluruh
  laporan. Struk, nominal penjualan, dokumen, dan permintaan penerimaan asli tidak
  ditulis ulang. Transaksi berikutnya memakai modal stok yang berlaku.
- Pembayaran nota/ongkir merupakan pencatatan pelunasan tagihan, bukan expense
  tambahan; tidak menggandakan pembelian menjadi biaya operasional atau setoran
  tunai kasir. Tidak terhubung otomatis dengan rekening/EDC.
- Setiap perubahan memakai ID operasi, revisi nota, penguncian transaksi, dan
  audit. Kirim ulang operasi yang sama tidak mencatat dua kali. Jika nota berubah
  dari perangkat lain, tutup detail, pilih **Perbarui**, lalu buka ulang.
- Mode demo tidak menulis pembayaran/koreksi. Jika SQL 112 belum terpasang,
  detail masih bisa dilihat tetapi aksi baru tidak diaktifkan.

## Pemasangan pada proyek yang sudah memakai gudang 107 dan audit 111

1. Ekstrak ZIP ke root proyek `D:\PROJECT\MANIAC DUREN\maniac-duren` sesuai folder
   di dalam ZIP. Isinya hanya file yang ditambahkan/diubah untuk patch ini.
2. Jalankan isi **`database/supplier-notes-112.sql`** melalui SQL Editor proyek
   Supabase yang digunakan POS. Patch ini membutuhkan gudang 107 dan tidak
   menghapus data. Jangan menjalankan reset 109 atau mengulang seluruh SQL lama.
3. Bagi proyek yang riwayat migrasinya dikelola CLI, tersedia salinan identik
   `supabase/migrations/20261116112253_supplier_note_payments_112.sql`.
   Gunakan jalur migrasi yang sudah dipakai proyek; tidak perlu memasang kedua
   salinan. Periksa migrasi pending sebelum melakukan push database.
4. Jalankan pemeriksaan berikut di PowerShell. Gunakan `.cmd` agar tidak terkena
   pembatasan eksekusi `npm.ps1`.

```powershell
& {
    Set-Location "D:\PROJECT\MANIAC DUREN\maniac-duren" -ErrorAction Stop
    npm.cmd run verify
    if ($LASTEXITCODE -ne 0) { throw "Verifikasi gagal. Jangan deploy dahulu." }
    npm.cmd run test:browser
    if ($LASTEXITCODE -ne 0) { throw "Tes browser gagal. Periksa error pertama." }
    git status --short
}
```

Dependensi tidak berubah. Jika Chromium Playwright belum terpasang, jalankan
`npx.cmd playwright install chromium` terlebih dahulu. Tes fitur terfokus:

```powershell
node tests/supplier-notes-db.test.mjs
node tests/supplier-notes-ui.test.mjs
npm.cmd run test:warehouse:browser
```

Setelah pemeriksaan lulus, tinjau perubahan dan gunakan proses commit/push yang
biasa dipakai proyek. Penerapan SQL tidak menerbitkan file frontend ke Vercel.
Setelah frontend terbit, refresh POS lalu buka nota yang sudah diterima untuk
memeriksa tombol dan dua status pembayaran.

## Susunan kode

| File                                                  | Tanggung jawab                                              |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| `pos/supplier-notes.mjs`                              | Saldo desimal, status, validasi nominal, gerbang aksi UI    |
| `pos/supplier-notes-ui.mjs`                           | Detail, formulir pembayaran/koreksi, riwayat                |
| `pos/warehouse-ui.mjs`                                | Daftar nota dan penghubung tombol Buka nota                 |
| `pos/warehouse-flow.mjs`                              | Daftar aksi ke jalur mutasi gudang yang sudah ada           |
| `pos/warehouse.css`, `pos/index.html`                 | Tampilan dan versi stylesheet                               |
| `database/supplier-notes-112.sql`                     | Otorisasi server, ledger, audit, revisi, recost             |
| `supabase/migrations/*supplier_note_payments_112.sql` | Identitas migrasi CLI, salinan identik SQL                  |
| `tests/supplier-notes-*.test.mjs`                     | Regresi database dan handler UI                             |
| `tests/warehouse-browser.mjs`                         | Alur aplikasi nyata, pembayaran, koreksi, reload, responsif |
| `scripts/check-project.mjs`                           | Pemeriksaan kesamaan sumber SQL dan salinan CLI             |

## Validasi paket

Pengujian database menggunakan PGlite terisolasi, bukan database produksi.
Mencakup pemasangan ulang, nota lama/baru, pembayaran terpisah, nominal/tanggal,
akses peran, koreksi owner, pembatalan pembayaran, revisi, retry, rollback,
penerimaan setelah koreksi, modal turunan dan transfer, alokasi ongkir beberapa
produk, serta barcode/jumlah/dokumen yang tetap.

Tes UI menjalankan handler formulir sebenarnya untuk detail nota diterima,
peran, escaping, retry, revisi, submit ganda, koreksi dan pembatalan pembayaran.
Tes browser gudang diperluas untuk dua pembayaran, koreksi owner, riwayat setelah
reload, tiga lebar layar dan dua tema. `npm run verify` lulus dengan **181 tes**, tanpa kegagalan. Eksekusi
`npm run test:browser` berhenti ketika Chromium akan dibuka karena lingkungan
pengujian menolak `socket()` dengan `Operation not permitted`. Tes browser belum
terverifikasi dan harus lulus pada mesin Windows sebelum deployment. Tidak ada
SQL, perubahan data, atau deployment yang dijalankan pada produksi.

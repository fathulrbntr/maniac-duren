# Patch 100 — Catat timbang durian lewat barcode

Patch ini mengoreksi patch 099. Scan dipakai saat mencatat hasil penimbangan penerimaan durian.
Bisa dipasang langsung setelah patch 098, atau menimpa patch 099 jika sudah dipasang.

## Alur penggunaan

1. Durian datang dan ditimbang satu per satu pada timbangan barcode.
2. Timbangan mencetak label barcode.
3. Di aplikasi, klik ikon **Scan timbang durian** pada dock untuk membuka Penerimaan barang. Jalur Barang masuk → Durian utuh juga tetap tersedia.
4. Isi supplier, nomor nota, tanggal dan outlet, lalu pilih jenis durian dalam pengiriman.
5. Klik **Catat timbang aktual** dan scan label ke kolom **Scan barcode timbangan**.
6. Setiap scan mencatat berat dari label dan **1 butir** ke daftar timbang. Kolom kembali siap menerima scan berikutnya. Total kg dan butir terjumlah otomatis.
7. Setelah semua label produk tersebut tercatat, klik **Selesai menghitung**. Ulangi untuk produk lain dalam nota.
8. Lengkapi harga pada nota dan ongkir, lalu klik **Selesaikan penerimaan** dan konfirmasi. Seluruh produk baru masuk stok pada tahap ini.

Barcode tidak membuka Master Barang. Perubahan form produk dari patch 099 dikembalikan.

## Format dan perangkat

- Memakai scanner USB/Bluetooth mode keyboard, dengan Enter atau Tab sesuai Printer & Scanner. Input manual barcode dan tombol Catat barcode juga tersedia.
- Memakai format CAS POS KG yang sudah didukung sistem: `21 + kode barang 4 digit + berat gram 6 digit + digit pemeriksa`.
- Contoh: `2100010030320` → kode barang `0001`, berat **3,032 kg**, jumlah **1 butir**.
- Kolom Barcode durian di Master Barang harus sesuai kode barang 4 digit timbangan, termasuk nol di depan. Produk harus menggunakan satuan Kg + butir.
- Harga jual dan stok tersedia tidak menjadi syarat scan penerimaan. Modal tetap dihitung dari harga nota, ongkir, dan total berat aktual.

## Pemeriksaan dan koreksi

- Kode tidak dikenal, kode yang dipakai beberapa produk, label rusak, dan label untuk produk yang berbeda akan ditolak tanpa menambah catatan timbang.
- Barcode yang sama dalam catatan produk meminta konfirmasi sebelum dihitung lagi. Label memuat produk dan berat, sehingga dua durian berbeda dengan berat sama dapat mempunyai barcode identik.
- Input manual, edit, dan hapus timbang tetap tersedia. Koreksi mempertahankan barcode asal di riwayat dan ditandai Dikoreksi.
- Catatan terbaru tampil paling atas; barcode disimpan bersama riwayat timbang.
- Scanner hanya menangkap input pada kolom scan. Pemindaian tidak otomatis menyelesaikan penerimaan.
- Ikon dock tersedia untuk akun dengan akses stok.

## Instalasi

Ekstrak seluruh isi ZIP ke folder utama proyek yang berisi `pos`, `scripts`, dan `tests`. Timpa file yang sama.

Jalankan dari folder utama proyek:

```bash
node scripts/check-project.mjs
node --test tests/receipt-barcode.test.mjs tests/receipt-shipment.test.mjs tests/scale-barcode.test.mjs tests/instant-navigation.test.mjs tests/product-dialog-ui.test.mjs
```

Pengujian database menggunakan dependensi proyek yang sudah tercantum di package.json:

```bash
node --test tests/receipt-shipment-db.test.mjs
```

Setelah pemeriksaan lulus:

```bash
git status --short
git add --pathspec-from-file=PATCH-100-FILES.txt
git diff --cached --stat
git commit -m "Record incoming durian weights from scale barcodes"
git push origin main
```

Periksa daftar staging sebelum commit; file lain yang sudah masuk staging sebelumnya tetap ikut.
Setelah deployment selesai, refresh **Ctrl + Shift + R**.

## Hasil verifikasi

- Pemeriksaan proyek lulus.
- Lima pengujian terkait scanner, penerimaan, navigasi, dan form produk lulus.
- Uji database pada dua jalur instalasi lulus, termasuk penyimpanan barcode, berat, jumlah butir, serta pengiriman ulang tanpa stok ganda.
- Dua scan contoh menghasilkan 5,446 kg / 2 butir; tutup dan buka kembali Catat timbang mempertahankan catatan.
- Tampilan desktop dan ponsel 320 px diperiksa menggunakan preview terisolasi.
- Scanner fisik belum diuji; pemindaian disimulasikan dengan input keyboard.

Tidak ada SQL baru yang perlu dijalankan. Patch belum diterapkan ke website produksi.

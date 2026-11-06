# Patch 099 — Scan barcode untuk input produk

Pasang setelah patch 098. ZIP hanya memuat file yang berubah.

## Cara menggunakan

1. Klik ikon barcode di dock. Ikon tersedia untuk akun dengan akses Master Barang.
2. Form Tambah barang terbuka dengan kolom Barcode langsung aktif.
3. Scan menggunakan scanner USB/Bluetooth mode keyboard, atau ketik barcode dan tekan Enter.
4. Setelah barcode terbaca, fokus pindah ke Nama Barang. Lengkapi nama, jenis, satuan, SKU, dan harga, kemudian klik Simpan.

Barcode mengisi kode produk; nama dan harga tetap diisi melalui form. Fitur ini memakai scanner mode keyboard, belum memakai kamera HP.

## Perilaku

- Dock tetap berupa ikon tanpa tulisan, dengan ikon barcode di antara Penjualan dan Kitchen.
- Mendukung tombol akhir Enter atau Tab sesuai Pengaturan Printer & Scanner, termasuk awalan/akhiran scanner.
- Nol di depan barcode dipertahankan.
- Pada satuan Kg + butir, label CAS POS KG yang valid diubah menjadi kode barang 4 digit, misalnya `2100010030320` menjadi `0001`. Berat label tidak menjadi data master produk.
- Enter dari kolom barcode tidak menyimpan form secara otomatis. Kesalahan barcode ditampilkan untuk diperbaiki.
- Pengolahan barcode pada form berlaku juga saat Edit barang. Validasi penyimpanan produk tetap mengikuti sistem.

## Pemasangan

Ekstrak ZIP ke folder utama proyek yang berisi `pos`, `scripts`, dan `tests`, lalu timpa file yang sama.

```bash
node scripts/check-project.mjs
node --test tests/product-dialog-ui.test.mjs tests/product-buy-piece.test.mjs tests/product-variants-ui.test.mjs tests/instant-navigation.test.mjs tests/scale-barcode.test.mjs
```

Setelah pemeriksaan lulus:

```bash
git status --short
git add --pathspec-from-file=PATCH-099-FILES.txt
git diff --cached --stat
git commit -m "Add dock barcode shortcut for product entry"
git push origin main
```

Periksa daftar staging sebelum commit; file lain yang sudah masuk staging sebelumnya tetap ikut.
Setelah deployment selesai, refresh dengan Ctrl + Shift + R.

## Verifikasi

- Pemeriksaan proyek dan lima pengujian terkait form produk, varian, navigasi, serta barcode lulus.
- Pemeriksaan tambahan lulus untuk hak akses Master Barang, nol di depan, kode CAS, penolakan checksum salah, awalan/akhiran, Enter/Tab, fokus kolom, dan tidak ada penyimpanan otomatis.
- Preview desktop dan layar 320 px berhasil membuka form tambah barang dengan barcode terfokus. Scan CAS di preview menghasilkan kode `0001` dan fokus berpindah ke nama.
- Uji menggunakan data contoh dan input keyboard simulasi; perangkat scanner fisik belum diuji.

Tidak ada SQL atau migrasi database. Patch belum diterapkan ke website produksi.

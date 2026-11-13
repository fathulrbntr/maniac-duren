# Patch 108 — Branch Outlet dan Gudang

Untuk proyek yang sudah memakai patch gudang 107 beserta koreksi jenis lot `waste`.

## Perubahan

- Menu Outlet menjadi **Branch Outlet & Gudang**.
- Halaman lokasi mempunyai dua bagian terpisah: Branch Outlet untuk cabang penjualan, Gudang untuk pusat penerimaan dan distribusi. Setiap bagian menampilkan jumlah lokasi dan penanda jenis lokasi.
- Tombol **Tambah branch outlet** berada di bagian branch; tombol edit menjadi **Edit branch** dan **Edit gudang**.
- Pilihan lokasi aktif dikelompokkan menurut jenisnya dan diberi awalan Branch Outlet/Gudang. Nama lokasi di header dan footer juga menyebutkan jenisnya.
- Form edit gudang menampilkan label gudang dan menjelaskan bahwa identitas invoice/surat jalan baru mengikuti profil terbaru, sedangkan dokumen yang sudah terbit tetap memakai identitas saat pengiriman.
- Nama yang sama di dua jenis lokasi diberi penanda. Contoh pada gambar: `PT. ALTARA RASA NUSANTARA` dan `PT. Altara Rasa Nusantara` dibedakan berdasarkan tipe lokasinya, bukan kapitalisasi nama.

Pemisahan memakai field `locationType` dari patch 107. Data lama tanpa tipe gudang tetap dianggap branch sesuai perilaku database. Patch ini tidak menggabungkan dua lokasi, mengubah tipenya, menghapus lokasi, atau memindahkan stok/riwayat. Periksa nama branch yang sama dengan gudang sebelum menggantinya melalui form edit.

## Pemasangan

1. Ekstrak ZIP ke root proyek yang berisi folder `pos/`, lalu timpa file sesuai foldernya.
2. **Tidak ada SQL baru.** Tidak perlu menjalankan ulang SQL 107 untuk perubahan tampilan ini.
3. Jalankan perintah berikut dari PowerShell di root proyek:

```powershell
git status --short
git add -- pos/app.js pos/store-settings.mjs pos/store-settings.css pos/index.html docs/PATCH-108-LOKASI.md
if ($LASTEXITCODE -ne 0) { throw "Git add gagal. Periksa hasil ekstraksi patch." }
git diff --cached --stat
git commit -m "Separate branch outlets and warehouse in location management"
if ($LASTEXITCODE -ne 0) { throw "Commit belum berhasil. Periksa pesan Git." }
git push origin main
```

Sesuaikan branch jika deployment tidak memakai `main`. Tunggu deployment selesai, lalu refresh POS. Versi URL stylesheet sudah diperbarui untuk mengambil tampilan terbaru.

## Pemeriksaan

Pengujian yang dijalankan: formulir profil outlet/struk (`store-receipt-ui.test.mjs`), alur UI gudang (`warehouse-flow-ui.test.mjs`), dan navigasi aplikasi (`instant-navigation.test.mjs`), serta `npm run check`. Pengelompokan dan target ID tombol edit diperiksa memakai contoh tiga branch dan satu gudang dengan nama perusahaan yang sama.

Tidak ada pengujian visual browser atau deployment produksi pada patch ini. Pemeriksaan formulir menggunakan adapter DOM; perubahan CSS menggunakan token warna dan tipografi sistem yang sudah ada.

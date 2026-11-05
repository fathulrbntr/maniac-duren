# Patch 093 — Kategori dan urutan ringkasan stok

Melanjutkan proyek setelah patch setoran tunai 092. Paket hanya berisi file yang berubah/baru. Tidak memerlukan SQL atau dependency baru. Belum diterapkan ke website produksi.

## Perubahan

- Dashboard → Stock → Ringkasan stok memiliki tombol **Semua | Buah | Durpas | Coral | Makanan | Minuman | Dessert**.
- Daftar produk dan total kg/g/ml/pcs di dalam ringkasan mengikuti kategori dan outlet yang dipilih. Tombol aktif ditandai dengan warna berbeda.
- Pilihan urut: **Tersedia dulu** (default), **Nama A–Z**, **Nama Z–A**, **Stok terbanyak**, **Stok tersedikit**.
- Urutan jumlah dikelompokkan berdasarkan satuan, lalu jumlah terbesar/terkecil dalam satuan yang sama. Kg dan pcs tidak dibandingkan langsung. Buah tetap menampilkan jumlah butir pada rincian.
- Filter dan urutan tetap dipilih saat pindah tab atau outlet selama sesi dashboard, lalu kembali ke default saat sesi direset. Pergantian filter tidak membutuhkan pembacaan database tambahan.
- Tampilan menyesuaikan layar desktop dan ponsel; tombol kategori membungkus ke baris berikutnya bila ruang terbatas.

Kategori mengikuti keanggotaan yang sudah diatur di **Master Barang/Stok → Kelola Kategori**, sama dengan POS. Nama **Makan** maupun **Makanan** tampil sebagai **Makanan** di dashboard. Produk yang memiliki beberapa kategori dapat muncul pada kategori tersebut, tetapi tidak dihitung ganda pada pilihan Semua. Produk yang sengaja dikeluarkan dari kategori tidak dimasukkan kembali berdasarkan namanya.

Pilihan **Semua** mencakup seluruh stok fisik, termasuk bahan baku, bahan produksi, produk tanpa kategori, dan kategori tambahan. Produk resep tidak menjadi stok fisik. Jika salah satu kategori kosong, atur anggota kategorinya melalui Kelola Kategori.

Kartu Produk tersedia, Stok kosong, dan Estimasi nilai aset di atas ringkasan tetap menampilkan total **semua kategori pada outlet terpilih**, dengan keterangan yang jelas. Cetak laporan A4 tetap mencetak laporan keseluruhan sesuai outlet/periode. Ringkasan menampilkan maksimal 12 produk; daftar lengkap tersedia melalui Buka stok.

## Pasang

1. Pastikan patch 092 sudah digabungkan. Simpan perubahan lokal yang sedang dikerjakan.
2. Ekstrak isi ZIP ke folder utama proyek (sejajar `package.json`), lalu gabungkan/ganti file dengan nama yang sama. Pertahankan perubahan yang lebih baru bila ada.
3. Tidak ada SQL yang perlu dijalankan. Dari terminal folder proyek, jalankan pemeriksaan:

```text
node scripts/check-project.mjs
node --test tests/dashboard-stock.test.mjs tests/dashboard.test.mjs tests/dashboard-app.test.mjs tests/dashboard-report.test.mjs tests/shared-categories.test.mjs
```

4. Setelah berhasil, jalankan Git berikut. Berlaku di PowerShell dan Git Bash:

```text
git add pos/dashboard-data.mjs pos/dashboard-ui.mjs pos/dashboard.css pos/index.html
git add tests/dashboard-stock.test.mjs docs/PASANG-PATCH-093.md
git commit -m "Add dashboard stock category filters and sorting"
git push origin main
```

5. Setelah deployment Vercel selesai, muat ulang POS dan buka **Dashboard → Stock**.

## Validasi lokal

20 pengujian lolos, mencakup kategori bersama, produk multi-kategori/tanpa kategori, pemisahan outlet, total satuan, urutan, filter yang dihapus, pergantian tab/outlet, reset sesi, dan regresi dashboard/cetak laporan. Pemeriksaan sintaks/import/aset proyek juga lolos. Filter Durpas, urutan stok, serta tampilan desktop dan ponsel diperiksa di browser menggunakan data contoh.

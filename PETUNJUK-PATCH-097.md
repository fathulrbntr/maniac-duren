# Patch 097 — Dock alur operasional

Pasang setelah patch 096. ZIP ini hanya berisi perubahan lanjutan.

## Perubahan

- Dock lama diganti dengan: **1 Barang masuk · 2 Penjualan · 3 Kitchen · 4 Laporan**.
- Baris empat kartu alur di atas halaman dihapus, sehingga navigasi tidak tampil dua kali.
- Dock tampil di seluruh halaman POS yang sudah login, dengan menu sesuai hak akses akun. Akun tanpa akses ke empat bagian ini tidak mendapat dock kosong.
- Tampilan diringkas menjadi nomor dan nama menu, tanpa deskripsi atau panah. Halaman aktif ditandai hijau.
- Menu sidebar tetap dapat dibuka melalui tombol di header. Dashboard dan halaman lainnya tetap tersedia melalui sidebar.
- Pada halaman Shift Kasir, langkah Penjualan ditandai aktif.
- Pengaman navigasi untuk form belum disimpan dan proses sibuk tetap memakai mekanisme aplikasi yang sudah ada.

## Cara memasang

1. Simpan pekerjaan lokal Anda sebelum menimpa file.
2. Ekstrak isi ZIP ke folder utama proyek yang berisi `pos`, `scripts`, dan `tests`. Timpa file yang sama.
3. Jalankan dari terminal di folder utama proyek:

```bash
node scripts/check-project.mjs
node --test tests/sidebar.test.mjs tests/instant-navigation.test.mjs tests/dashboard.test.mjs tests/dashboard-app.test.mjs tests/dashboard-stock.test.mjs tests/dashboard-reference.test.mjs tests/cashier-ui.test.mjs
```

4. Setelah pemeriksaan lulus:

```bash
git status --short
git add --pathspec-from-file=PATCH-097-FILES.txt
git diff --cached --stat
git commit -m "Replace system dock with operational workflow shortcuts"
git push origin main
```

Periksa daftar staging sebelum commit; file lain yang sudah masuk staging sebelumnya tetap ikut.

5. Setelah deployment selesai, tekan **Ctrl + Shift + R**.

Tidak ada SQL atau migrasi database baru. Patch belum diterapkan ke website produksi.

## Pemeriksaan

- Pemeriksaan proyek lulus: sintaks, import/aset, identitas modul, navigasi/stylesheet duplikat, dan konsistensi build SQL.
- 16 pengujian terkait sidebar, perpindahan halaman, dashboard, filter stok, serta kasir lulus.
- Pemeriksaan menu sesuai hak akses untuk gudang, kasir, kitchen, laporan, dan akun tanpa akses operasional lulus.
- Keempat tombol dock membuka tujuan yang tepat dan status aktif mengikuti halaman pada preview desktop dan ponsel 320 px.
- Tidak ada baris alur lama, dock ganda, atau label dock yang melampaui tombol pada pemeriksaan terakhir.
- Preview memakai data contoh terisolasi; tidak melakukan transaksi atau mengubah database produksi.

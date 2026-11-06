# Patch 098 — Dock ikon

Pasang setelah patch 097. ZIP hanya memuat file yang berubah.

## Perubahan

- Empat tombol dock memakai ikon: kotak (Barang masuk), struk (Penjualan), panci (Kitchen), dan grafik (Laporan).
- Nomor dan tulisan di dock dihapus. Nama menu tersedia saat kursor diarahkan ke ikon dan untuk pembaca layar.
- Dock dibuat lebih ringkas; tombol 52 × 52 px dengan ikon 24 px. Menu aktif tetap beraksen hijau.
- Tujuan navigasi dan hak akses mengikuti patch 097.

## Cara memasang

1. Ekstrak isi ZIP ke folder utama proyek yang berisi `pos`, `scripts`, dan `tests`. Timpa file yang sama.
2. Jalankan dari terminal di folder utama proyek:

```bash
node scripts/check-project.mjs
node --test tests/sidebar.test.mjs tests/instant-navigation.test.mjs tests/dashboard-app.test.mjs
```

3. Setelah pemeriksaan lulus:

```bash
git status --short
git add --pathspec-from-file=PATCH-098-FILES.txt
git diff --cached --stat
git commit -m "Use icons for operational dock"
git push origin main
```

Periksa daftar staging sebelum commit; file lain yang sudah masuk staging sebelumnya tetap ikut.

4. Setelah deployment selesai, tekan **Ctrl + Shift + R**.

Tidak ada SQL atau migrasi database. Patch belum diterapkan ke website produksi.

## Pemeriksaan

- Pemeriksaan proyek dan tiga pengujian sidebar, navigasi, serta integrasi dashboard lulus.
- Pemeriksaan render memastikan empat ikon tanpa teks, label aksesibilitas, status aktif, dan penyaringan hak akses.
- Preview desktop serta ponsel 320 px sudah diperiksa; dock tetap muat dan navigasi berfungsi.
- Preview memakai data contoh terisolasi.

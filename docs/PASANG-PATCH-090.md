# Patch 090 — Dock navigasi seluruh POS

Dock Menu / Beranda / Kasir yang sebelumnya hanya muncul di dashboard sekarang berada di kerangka utama seluruh modul POS. Bentuk kapsul mengikuti referensi. Patch disiapkan dari `maniac-duren(8).zip` dengan patch audit 089 dan perbaikan Windows 089a.

## Perubahan

- Satu dock pada setiap halaman setelah login, termasuk kasir, stok, master barang, produksi, laporan, dokumen, karyawan, dan pengaturan.
- Menu membuka sidebar yang sudah ada. Beranda menuju dashboard; Kasir menuju POS. Tombol mengikuti hak akses sidebar. Akun tanpa akses dashboard/kasir mendapat pintasan yang diizinkan, seperti Laporan, Dapur, Stok, atau Absensi.
- Penanda aktif: Beranda pada dashboard, Kasir pada POS, dan Menu pada modul lainnya.
- Posisi tengah mengikuti area kerja saat sidebar desktop dibuka atau ditutup. Pada ponsel, sidebar menutup setelah memilih modul; tombol Escape mengembalikan fokus ke pembuka menu.
- Mode terang/gelap, ruang bawah konten, posisi notifikasi, dan area aman layar ponsel mengikuti dock. Dock disembunyikan saat mencetak.
- Navigasi tetap memakai pemeriksaan form belum disimpan dan proses simpan yang sudah ada.

## Pasang

1. Ekstrak isi ZIP ke folder utama proyek yang berisi `package.json`, lalu pilih Replace untuk file yang sama. ZIP hanya memuat file yang berubah; tidak memuat database atau file konfigurasi akun.
2. Tidak ada SQL atau dependency baru yang perlu dipasang.
3. Jalankan pemeriksaan berikut dari terminal di folder proyek:

```text
node scripts/check-project.mjs
node --test tests/dashboard.test.mjs tests/dashboard-app.test.mjs tests/sidebar.test.mjs
```

4. Setelah kedua pemeriksaan berhasil, jalankan perintah Git berikut. Perintah ini dapat dipakai di PowerShell maupun Git Bash:

```text
git add pos/system-dock.mjs pos/system-dock.css pos/app.js pos/sidebar.mjs
git add pos/index.html pos/dashboard-ui.mjs pos/dashboard.css pos/ui-system.css
git add tests/dashboard.test.mjs tests/dashboard-app.test.mjs docs/PASANG-PATCH-090.md
git commit -m "Make navigation dock available across POS"
git push origin main
```

5. Setelah deployment Vercel selesai, muat ulang POS. Coba Menu, Beranda, Kasir, dan salah satu modul lain.

Jika proyek sudah memiliki perubahan lebih baru pada file yang sama, gabungkan perubahan tersebut sebelum mengganti file dengan isi patch ini.

## Verifikasi yang dilakukan

- Pemeriksaan proyek lulus: sintaks, import lokal, aset, identitas modul, duplikasi navigasi/stylesheet, serta konsistensi build SQL yang sudah ada.
- Delapan pengujian dashboard, sesi, sidebar, dan navigasi lulus.
- Pemeriksaan pintasan untuk akses owner, kasir, dapur, stok, keuangan, dan akses terbatas lulus.
- Pratinjau browser dengan data uji: 20 modul masing-masing menampilkan satu dock dan penanda yang sesuai.
- Pratinjau ponsel 390 × 844: bentuk kapsul, mode terang/gelap, menu, Escape/fokus, pergantian modul, dan jarak tombol pembayaran diperiksa.

Patch ini belum diterapkan langsung ke website produksi.

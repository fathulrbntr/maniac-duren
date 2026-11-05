# Patch 094 revisi — Penataan sidebar saja

Paket ini menggantikan patch 094 sebelumnya yang belum dipasang. Dasar revisi adalah sistem sampai **patch dashboard-stock-093**.

## Isi perubahan

Hanya pengelompokan dan urutan menu sidebar yang berubah. Setiap tombol tetap membuka halaman yang sama, dengan hak akses yang sama seperti versi 093.

| Kelompok sidebar | Menu yang sudah ada |
| --- | --- |
| Ringkasan | Dashboard |
| Pelayanan & Kasir | Shift Kasir → Kasir / POS |
| Tukang Potong | Reject & Waste |
| Kitchen | Kitchen Display → Produksi & Persiapan → Master Resep |
| Gudang & Stok | Stok & Penerimaan → Master Barang → Supplier |
| Administrasi | Laporan → Admin Dokumen |
| Pengelolaan | Member & Poin → Diskon & Persetujuan → Karyawan & Akses → Outlet |
| Pengaturan | Metode Pembayaran → Printer & Scanner |
| Karyawan & Panduan | Absensi → Panduan |

Menu hanya muncul bila akun memang memiliki akses sebelumnya. Pengelompokan tidak memberikan akses baru kepada karyawan.

Versi 093 belum memiliki halaman khusus waiters. Pelayanan waiters tetap melalui koordinasi lapangan dengan kasir dan tukang potong; revisi ini tidak membuat antrean pesanan, role waiters/tukang potong, atau tahap pembayaran dan penyerahan baru.

Reject & Waste tetap satu fitur yang sama. Kitchen atau petugas lain yang sebelumnya berhak menggunakannya tetap dapat membukanya di kelompok Tukang Potong. Setoran tunai tetap tersedia dari tempatnya semula pada halaman Shift Kasir dan Dashboard; tidak dibuat halaman setoran kedua.

Proses mencicipi tetap di luar sistem. Alur POS, barcode, batch, stok, pembayaran, kitchen, reject/olahan, diskon, laporan cetak, dan setoran tetap mengikuti versi 093. Kategori serta pengurutan stok dashboard juga tetap tersedia.

## Cara pasang

1. Gunakan paket revisi ini pada proyek yang sudah sampai patch 093. **Tidak perlu memasang patch 094 lama dan tidak perlu menjalankan SQL apa pun.**
2. Ekstrak dan gabungkan tiga file di ZIP ini ke folder utama proyek:
   - `pos/navigation.mjs`
   - `tests/sidebar.test.mjs`
   - `docs/PASANG-PATCH-094-REVISI.md`
3. Dari folder utama proyek, jalankan:

```bash
node --test tests/sidebar.test.mjs
git diff --stat
git add pos/navigation.mjs tests/sidebar.test.mjs docs/PASANG-PATCH-094-REVISI.md
git commit -m "Group existing sidebar menus by division"
git push origin main
```

4. Setelah deployment selesai, muat ulang POS. Tidak perlu mengganti role karyawan atau mengatur database.

## Pemeriksaan

Susunan halaman diperiksa agar tidak ada menu hilang atau ganda. Daftar halaman yang dapat diakses tetap sama untuk seluruh kombinasi izin sidebar. Pengujian sidebar mencakup buka/tutup kelompok, navigasi, penyimpanan preferensi, serta perilaku layar kecil. File aplikasi dan database lainnya sama dengan basis 093.

Paket ini tidak memuat atau memerlukan `division-workflow-094.sql` maupun modul `service-flow` dari paket sebelumnya.

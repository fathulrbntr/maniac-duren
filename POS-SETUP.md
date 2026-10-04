> **Database:** untuk instalasi baru gunakan `database/pos.sql`. Bagian sumbernya berada di `database/sections/` dan tidak dijalankan satu per satu. Panduan alur terkini ada di `docs/ALUR-PENGGUNA.md`.

# Maniac Duren POS

Paket proyek lengkap berdasarkan ZIP yang dikirim. Website customer, galeri dan carousel dipertahankan. Untuk update database yang sudah aktif, ikuti `UPDATE.md`. Bagian instalasi di bawah ditujukan untuk database baru.

## Coba demo

Di VS Code, buka `pos/index.html` dengan Live Server. Klik **Buka mode demo**. Jika membuka root proyek, kunjungi `/pos/`. Demo tidak membutuhkan akun/database. Contoh store Depok/Jakarta dan supplier A/B bukan data operasional. Data contoh disimpan hanya di browser yang digunakan; menutup lalu membuka lagi tidak menghapusnya. Reset tersedia di halaman Product pada mode demo.

Dashboard: omzet hari ini, stok kg/butir, omzet per kg/per butir, kg yang dipakai untuk penjualan butir, grafik 7 hari dan transaksi terakhir.

Kasir: pilih store, produk dan penerimaan asal supplier. Masukkan berat hasil timbang dan jumlah butir. Pilih cara jual KG/BUTIR dan harga satuannya. Simpan pembayaran Tunai/QRIS/Transfer; cetak struk. Pilihan pembayaran adalah pencatatan manual, bukan integrasi payment gateway.

Stok: barang masuk, sisa tiap penerimaan, pemakaian dapur dan transfer store. Input waste ada di menu Waste & Olahan. ID penerimaan dibuat otomatis sehingga dua pengiriman pada tanggal yang sama tetap terpisah. Transfer mempertahankan supplier dan referensi penerimaan asal.

Laporan: filter periode/store/supplier, omzet per kg/per butir, berat kg khusus jual per butir, detail transaksi, ekspor CSV. Transaksi dibatalkan dikeluarkan dari omzet dan stok dipulihkan; riwayat tetap ada.

Master: tambah store, supplier, produk dan harga jual awal. SKU produk unik. Harga di kasir dapat diubah per transaksi. Master yang dipakai dalam riwayat tidak dihapus oleh aplikasi ini.

## Aktifkan database bersama

1. Gunakan proyek Supabase milik restoran.
2. Jalankan `database/pos.sql` di SQL Editor. Script membuat tabel terpisah berawalan `md_pos_`. Script tidak mengubah tabel menu/customer. Tidak ada transaksi/stok contoh yang dimasukkan ke database; master Durpas 500 gr, Durpas 1 kg dan Coral disiapkan tanpa saldo.
3. Buat akun email/password admin lewat Authentication. Nonaktifkan pendaftaran publik jika tidak diperlukan.
4. Daftarkan akun admin dengan SQL berikut, ganti emailnya:

```sql
insert into public.md_pos_staff(user_id)
select id from auth.users where email = 'EMAIL_ADMIN_ANDA'
on conflict do nothing;
```

Semua akun yang didaftarkan sebagai staff POS memiliki akses ke seluruh store, termasuk pembatalan, penambahan master dan transfer. Jangan daftarkan customer. Pembagian akses kasir per store belum termasuk.

5. Tambahkan Environment Variables pada proyek Vercel yang sudah digunakan website:

```text
POS_SUPABASE_URL=https://PROJECT_REF.supabase.co
POS_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Gunakan publishable key (atau legacy anon key). Jangan menggunakan secret/service-role key. Endpoint konfigurasi menolak key yang bukan publishable/anon. Password admin dimasukkan saat login, tidak ditulis di kode. Token sesi hanya berada di memori halaman; reload meminta login lagi.

6. Upload/commit paket ke repository website yang sudah terhubung ke Vercel lalu redeploy. Dengan static deployment default, buka `https://maniacduren.com/pos/`. Jika proyek punya rewrite catch-all, tempatkan aturan POS sebelum aturan tersebut di **konfigurasi yang sudah ada**, tanpa menghapus route lain:

```json
{ "source": "/pos", "destination": "/pos/index.html" }
```

Jangan mengganti keseluruhan `vercel.json` hanya dengan potongan di atas. Folder `api` harus dilayani sebagai Vercel Functions; jika proyek memiliki build framework, sesuaikan lokasi route API dengan framework tersebut. Paket ini berasal dari ZIP proyek yang diaudit pada 4 Oktober 2026. Jika repository berubah setelah ZIP tersebut dibuat, bandingkan perubahan sebelum menyalin.

7. Login. Tambahkan store, supplier, produk lalu catat stok awal sebagai penerimaan barang. Jangan memasukkan stok awal lagi sebagai pembelian kedua.
8. Uji barang masuk, satu penjualan per kg, satu penjualan per butir, pembatalan dan transfer sebelum dipakai operasional. Cocokkan hasil dengan stok fisik.

## Perhitungan

- Stok awal dan barang masuk dicatat dengan berat kg **dan** butir.
- Jual KG: omzet = berat terjual × harga per kg.
- Jual BUTIR: omzet = butir terjual × harga per butir.
- Kedua cara jual mengurangi saldo kg dan saldo butir dari penerimaan yang dipilih.
- Omzet jual per butir dan kg untuk jual per butir dihitung dari baris transaksi yang sama.
- Satu pesanan bisa berisi beberapa supplier/penerimaan; buat baris terpisah per asal barang.
- Stok yang sudah masuk keranjang belum dikunci. Saat menyimpan, database memeriksa saldo dan melakukan pengurangan dalam transaksi atomik. Jika stok dipakai kasir lain terlebih dahulu, penyimpanan ditolak.
- Database memakai tipe numeric untuk berat/harga. Tidak menggunakan konversi kg/butir tetap dan tidak memakai ROUND dalam perhitungan. Format layar membatasi tampilan berat hingga 6 desimal dan nominal 2 desimal; ini tidak membulatkan angka database.
- Store aktif di header digunakan oleh dashboard/kasir/stok. Laporan memiliki filter store sendiri dan defaultnya semua store. Gunakan **Perbarui stok** di kasir untuk mengambil perubahan kasir lain sebelum melayani transaksi.

## Cakupan versi ini

POS ini berfokus pada durian utuh dengan dua satuan. Resep dessert, konversi durian utuh menjadi daging, HPP/laba, retur sebagian dan stock opname dengan koreksi plus/minus belum termasuk. Pemakaian dapur hanya mencatat durian utuh yang keluar; tidak otomatis membuat stok daging durian.

Kode kasir dan laporan diuji dengan data contoh: total omzet 784.500, 10,5 kg/4 butir terjual; penjualan butir memakai 4,8 kg. Pengujian logika juga mencakup pembayaran/kembalian, stok tidak cukup, penyimpanan ID transaksi berulang, pembatalan dan transfer. Browser preview dan database Supabase nyata belum dapat diuji di lingkungan pengerjaan ini. Belum dipasang ke website live.

Dokumentasi koneksi: https://supabase.com/docs/guides/database/postgres/row-level-security dan https://supabase.com/docs/guides/api/securing-your-api.

## Git

Jalankan dari root repository Maniac Duren setelah file tambahan disalin:

```bash
git status
git add pos api/pos-config.js database/pos.sql POS-SETUP.md
git commit -m "add Maniac Duren POS dashboard and dual-unit stock"
git push
```

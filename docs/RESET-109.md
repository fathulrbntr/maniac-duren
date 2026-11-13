# Reset operasional Maniac Duren — 109

## Status pelaksanaan

**Sudah dijalankan pada database `maniac-duren-pos` (`zxnaufihgnrunktxfcbj`) tanggal 13 November 2026 pukul 15.33 WIB. Jangan jalankan ulang untuk memasang paket ini.**

Reset mengikuti permintaan: kosongkan data selain master barang, karyawan, dan outlet. Pemeriksaan di dalam transaksi membandingkan seluruh isi 16 tabel yang dipertahankan, termasuk harga, foto, kategori, resep, akses karyawan, profil outlet, dan pengaturannya. Pemeriksaan terpisah setelah COMMIT mengonfirmasi 48 tabel yang direset semuanya kosong.

| Data | Sebelum | Sesudah |
| --- | ---: | ---: |
| Master barang, termasuk varian | 108 | 108 |
| Karyawan | 14 | 14 |
| Outlet dan gudang | 4 | 4 |
| Kategori POS | 6 | 6 |
| Hubungan kategori–barang | 62 | 62 |
| Master resep | 2 | 2 |
| Detail bahan resep | 7 | 7 |
| Supplier | 2 | 0 |
| Batch buah | 17 | 0 |
| Batch bahan/produk satuan | 4 | 0 |
| Barcode buah operasional | 799 | 0 |
| Pesanan | 13 | 0 |
| Dokumen administrasi | 3 | 0 |
| Absensi | 6 | 0 |
| Member | 2 | 0 |
| Shift kasir | 8 | 0 |

Akun autentikasi tidak disentuh; pemeriksaan sesudah reset menunjukkan 11 akun login. Profil dan dokumen karyawan, penugasan outlet, izin, harga master, barcode master produk, foto produk, logo, alamat, dan tipe outlet/gudang tetap sama. Dua nama PT. Altara yang berbeda lokasi tidak digabung.

Stok, penerimaan, batch supplier, barcode buah per butir, reject/waste, produksi, transfer, invoice/surat jalan, penjualan, saldo/poin member, supplier, absensi, setoran/pengeluaran, shift, dan log operasional dikosongkan. Data pemasangan layar pelanggan direset. Nomor dokumen dan identity operasional dimulai kembali. Skema database, fungsi, indeks, RLS, dan versi fitur tetap tersedia.

## Setelah reset

1. Tutup dan buka ulang POS pada perangkat yang digunakan agar mengambil data terbaru; pastikan Mode demo mati saat memeriksa data asli.
2. Jangan kirim ulang draft atau transaksi tertunda dari sebelum reset.
3. Buka shift kasir baru sebelum transaksi. Pasangkan ulang layar pelanggan jika digunakan.
4. Isi supplier, penerimaan gudang, dan stok awal sesuai data baru. Harga serta master barang yang lama masih tersedia.

## Isi paket

- `database/reset-operasional-109.sql`: skrip reset yang sudah dijalankan, untuk arsip/pemeliharaan manual.
- `tests/reset-operasional-db.test.mjs`: pengujian lokal dengan database terisolasi; tidak terhubung ke produksi.
- `docs/RESET-109.md`: hasil dan petunjuk ini.

Skrip tidak dipasang sebagai migration dan tidak dijalankan otomatis oleh deployment. Ekstrak ke root proyek untuk menyimpan arsip. Tidak ada perubahan tampilan dan tidak perlu deployment agar hasil reset terlihat.

## Pemeriksaan

- Pengujian PostgreSQL lokal memakai data penerimaan barcode, transfer diterima dan dalam perjalanan, penjualan, shift, member, absensi, serta lot hasil reject.
- Berhasil mengosongkan seluruh tabel operasional yang terpasang sambil mempertahankan isi tabel master dan akun.
- Tabel aplikasi yang belum dikenal, foreign key dari aplikasi lain, dan trigger TRUNCATE menyebabkan reset dibatalkan.
- Simulasi perubahan master setelah TRUNCATE menyebabkan rollback penuh, termasuk pengembalian nomor urut dokumen.
- Pengulangan reset pada database uji dan pembacaan POS dengan owner tetap berhasil.
- `npm run check`: lulus untuk 285 source files.
- Produksi: hasil transaksi `verified`, 16 tabel dipertahankan; pemeriksaan terpisah setelah commit menunjukkan 48 tabel reset kosong.

## Menyimpan ke Git melalui PowerShell

Perintah ini hanya mengarsipkan tiga file setelah ZIP diekstrak. **Bukan perintah untuk menjalankan reset lagi.**

```powershell
git status --short
git add -- database/reset-operasional-109.sql tests/reset-operasional-db.test.mjs docs/RESET-109.md
if ($LASTEXITCODE -ne 0) { throw "Git add gagal." }
git diff --cached --stat
git commit -m "Add verified operational reset preserving products staff and locations"
if ($LASTEXITCODE -ne 0) { throw "Commit gagal. Periksa pesan Git." }
git push origin main
```

Untuk pengujian lokal ulang: `node tests/reset-operasional-db.test.mjs`. Membutuhkan dependency proyek dan helper pengujian gudang dari patch 107.

Jika suatu saat reset baru memang diperlukan, jalankan seluruh `database/reset-operasional-109.sql` melalui Supabase SQL Editor dengan sengaja setelah menghentikan input transaksi. Skrip ini menghapus data operasional secara permanen setelah commit; bukan fitur undo. Tabel baru yang belum didaftarkan akan menghentikan proses untuk ditinjau. Skrip reset lama `reset-pos.sql` dan `clear-operations.sql` memiliki cakupan berbeda dan bukan pengganti skrip ini.

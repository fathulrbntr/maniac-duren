# Update 011 — Ketersediaan menu dan Antrean Kitchen

## Pasang pada proyek versi 010
1. Ekstrak ZIP ke folder utama proyek, pilih Replace.
2. Supabase → SQL Editor: jalankan seluruh `database/011-order-stock-kitchen.sql`.
3. Commit dan push perubahan, tunggu deployment Ready, lalu Ctrl + Shift + R.
4. Karyawan kitchen masuk dengan akun role Kitchen dan akses cabang yang sesuai.
5. Buka Antrean Kitchen dan klik Aktifkan suara pada perangkat kitchen.

Database aktif hanya menjalankan 011. `database/pos.sql` adalah gabungan untuk instalasi baru; jangan menjalankannya ulang pada database aktif.

## Alur operasional
- Produk tetap terlihat, tetapi tidak bisa dipilih bila stok siap pakai kurang, kedaluwarsa, atau resep belum lengkap.
- Perhitungan mengikuti takaran dan hasil resep, cabang aktif, seluruh isi keranjang, serta cadangan pesanan antre.
- Cendol/ketan/jelly dan bahan persiapan harus sudah diproduksi dan tersedia sebagai stok. Bahan mentah tidak otomatis dianggap sebagai stok hasil persiapan.
- Kirim pesanan: stok fisik belum berkurang, kebutuhan bahan dicadangkan.
- Kitchen mendapat pesanan baru dalam pembaruan otomatis sekitar 5 detik saat layar terbuka dan koneksi aktif. Suara harus diaktifkan sekali pada sesi tersebut.
- Mulai buat: stok dipotong sesuai resep. Selesai / siap: pesanan siap diserahkan. Pembayaran tetap diproses kasir setelah siap.
- Pembatalan saat antre melepas cadangan. Pembatalan setelah mulai dibuat mengikuti pencatatan waste sebelumnya.
- Menu Kasir buah cepat diganti Antrean Kitchen. Riwayat transaksi lama tetap tersedia di laporan.
- Status antrean pada kasir diperbarui otomatis tanpa menghapus keranjang atau catatan.

Notifikasi ini membutuhkan halaman POS terbuka. Belum termasuk notifikasi push saat browser ditutup.

## Pemeriksaan
- npm test
- npm run test:kitchen
- npm run test:kitchen:browser (Playwright Chromium; BROWSER_EXECUTABLE dapat diarahkan ke Chromium lokal)

Pengujian mencakup instalasi baru dan upgrade, penolakan kelebihan stok beserta rollback, resep dan stok persiapan, reservasi, retry, pembatalan, hak akses kitchen, serta alur dua sesi browser dan layar mobile.

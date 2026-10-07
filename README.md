# Maniac Duren

Website publik dan POS kasir, stok, kitchen, laporan dan karyawan.

## Pembaruan database aktif

1. Gunakan database yang sudah memiliki versi 024 (login bootstrap).
2. Jalankan `database/upgrade.sql` di Supabase SQL Editor.
3. Ekspor backup, lalu jalankan `database/clear-operations.sql` untuk mengosongkan data operasional sesuai permintaan.
4. Deploy seluruh proyek. Login ulang dan buat master produk, supplier serta resep baru.

Reset menghapus produk, supplier, resep, penerimaan, stok, penjualan, pesanan, produksi, waste, jurnal dan throttle login. Akun Auth, karyawan, dokumen, absensi, jam kerja, hak akses, audit karyawan dan identitas outlet tetap ada agar karyawan dapat login. Skrip tidak memakai CASCADE; ketergantungan tidak dikenal akan menghentikan reset. Reset belum dijalankan di server oleh paket ini.

Instalasi baru: `database/pos.sql` hanya untuk database kosong. Folder sections adalah sumber SQL; definisi versi lama masih diperlukan oleh rantai validasi transaksi. Jangan menghapus fungsi versi lama langsung di Supabase.

## Konfigurasi

Vercel memerlukan POS_SUPABASE_URL, POS_SUPABASE_PUBLISHABLE_KEY dan POS_SUPABASE_SERVICE_ROLE_KEY. Service role hanya untuk server. API login tidak tersedia melalui Live Server statis.

## Performa

Login mengambil profil sendiri dan daftar outlet melalui pos_bootstrap. Menu kasir/kitchen serta polling mengambil stok aktif dan pesanan outlet melalui pos_read_service. Polling tidak mengirim ulang katalog/foto produk; buka ulang menu untuk memperbarui perubahan katalog. Transaksi pelayanan memakai pos_mutate_service agar respons tidak membangun seluruh laporan. Pesanan yang belum selesai tetap dibaca tanpa batas tanggal; riwayat selesai dibatasi tujuh hari di pelayanan. Laporan dan menu lainnya masih memakai pos_read lengkap; belum dipaginasi. Foto produk masih disertakan pada katalog pelayanan. Tidak ada klaim pengukuran kecepatan server produksi.

Sidebar dapat ditutup/dibuka tanpa merender ulang formulir; pilihan tersimpan di perangkat. Tema sebelumnya tetap digunakan.

## Pengembangan dan pembersihan Git

npm ci
npm test
npm run test:db
node tests/service-reset.test.mjs
npm run db:build
npm run pwa:build

Setelah menyalin paket ke repository lama, jalankan `node scripts/clean-project.mjs` untuk menghapus file patch, migration duplikat dan CSS modern yang tidak digunakan. Periksa `git diff --stat`, lalu `git add -A` untuk menyertakan penghapusan. ZIP tidak menyertakan .git, node_modules, rahasia atau file environment aktif.

## Perbaikan login 036

Kode toggle sidebar hanya dipasang setelah sidebar dirender. Versi 035 memasangnya juga di halaman login dan handler tema sehingga akses elemen null dapat menghentikan inisialisasi form. Tidak perlu menjalankan SQL atau reset untuk perbaikan ini.

Pengukuran login tersedia di Console browser sebagai POS login timing (ms): accountMs mencakup API login, profileMs mencakup pos_bootstrap, totalMs mencakup sampai tampilan siap. Field server memisahkan identity dan auth melalui Server-Timing. Nilai hanya durasi, tidak berisi identifier, password atau token. Durasi sebelum fungsi Vercel mulai tidak tercakup Server-Timing.

Uji lokal: node tests/login-startup.test.mjs dan npm run test:employees lulus. Tampilan browser dan waktu produksi belum diverifikasi.

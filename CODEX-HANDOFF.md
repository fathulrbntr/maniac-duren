# Maniac Duren POS — Catatan kelanjutan

## Sumber kerja dan kebiasaan
- Lanjutkan dari repository Maniac Duren yang sudah menerima update 010 dan 011, bukan ZIP awal yang belum diperbarui.
- Pengguna memakai GitHub + VS Code, Vercel, serta Supabase. Bahasa komunikasi: Indonesia, singkat dan langsung.
- Deliverable ZIP hanya berisi file baru/berubah, dengan path relatif proyek. Sertakan perintah Git pada akhir instruksi perubahan kode.
- Jangan reset database aktif. SQL tambahan digunakan sebagai migration; database/pos.sql hanya untuk instalasi baru.
- Perubahan website utama/carousel harus mempertahankan baseline maniac-duren-carousel-stable.

## Selesai pada update 010
Dropdown toko di bawah logo, edit nama/lokasi Store, ikon SVG tiap menu, opsi demo login dihapus.

## Selesai pada update 011
- pos/order-stock.mjs: perhitungan bahan siap pakai berdasarkan hasil/takaran resep, stok cabang, tanggal, kedaluwarsa, keranjang bersama, dan cadangan antrean.
- pos/operations-ui.mjs: kartu produk dengan keterangan stok dan tombol nonaktif; Antrean Kitchen dengan kolom Baru, Dibuat, Siap; aksi mulai/selesai serta pembaruan antrean kasir.
- pos/app.js: kitchen sebagai halaman awal role kitchen; polling setiap 5 detik; notifikasi visual dan suara opsional; pembaruan stok menjaga keranjang/catatan.
- pos/navigation.mjs: Kasir buah cepat diganti Antrean Kitchen, kasir dan kitchen mengikuti hak akses.
- database/011-order-stock-kitchen.sql: reserved JSON pada order, validasi atomik dengan advisory lock yang sama, wrapper pos_read/pos_mutate, serta penolakan overselling dari API.
- scripts/build-database.mjs menyertakan migration 011 pada fresh install. Perubahan nama Store 010 sudah tercakup oleh sections/flow-audit.sql.

## Alur yang dipertahankan
Kasir buat pesanan → queued (cadangkan bahan) → kitchen mulai (potong stok fisik) → ready → kasir bayar → paid.
Buah memakai kg dan butir aktual. Supplier/penerimaan tetap terlacak. Dessert menggunakan stok prep; stok bahan mentah tidak otomatis diubah menjadi cendol/ketan/jelly. Pembatalan setelah memasak menjadi waste, bukan pengembalian bahan.

## Verifikasi
npm test (4 suite), tests/order-stock.test.mjs, tests/kitchen-orders.test.mjs (fresh/upgrade), tests/store-settings.test.mjs, dan browser dua sesi dengan backend uji telah diperiksa. Pengujian browser baru tersedia di tests/kitchen-browser.cjs; test browser lama tests/browser.mjs masih memakai pintu masuk demo yang sudah dihapus pada 010 dan perlu diperbarui bila suite lama akan dipakai lagi.

## Batas yang perlu diketahui
- Deploy produksi dan penerapan SQL Supabase dilakukan pengguna; belum diverifikasi di produksi.
- Notifikasi berupa polling saat halaman terbuka, bukan push ketika browser ditutup. Suara memerlukan klik Aktifkan suara dan izin pemutaran browser.
- Antrean lama ikut mencadangkan bahan setelah migration. Jika bahan sudah habis/kedaluwarsa, perlu replenishment atau pembatalan sesuai kondisi riil.
- Pengeluaran stok karena waste/kerusakan dapat membuat pesanan antre kekurangan bahan; pemeriksaan server saat mulai membuat tetap menolak stok tidak cukup.
- Fungsi SQL *_v8 dan *_v10 adalah implementasi internal; akses langsung authenticated dicabut. Gunakan RPC pos_read dan pos_mutate.

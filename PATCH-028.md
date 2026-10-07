# Patch 028 — PWA, penjualan offline, auto-sync dan audit

Paket ini berisi file baru / berubah dari `maniac-duren(4).zip`. Ekstrak ke **folder utama proyek**, sejajar `package.json`, lalu timpa file yang sama. Jangan menghapus keseluruhan proyek.

## Pasang pada proyek yang sekarang

1. Ekstrak ZIP patch dan timpa file.
2. Di Supabase → SQL Editor, buka **seluruh isi** `database/migrations/021-offline-pos.sql`, lalu Run. Database harus sudah memakai migration 020. SQL 021 boleh dijalankan ulang dan tidak mereset stok / penjualan.
3. Buka terminal VS Code di folder proyek, jalankan perintah di bawah. Pembersihan hanya menghapus 10 dokumen `PATCH-018.md` sampai `PATCH-027.md` yang panduannya sudah diganti dokumen ini.
4. Tunggu deployment Vercel selesai. Buka `/pos/` saat online, login dan tunggu status sinkronisasi. Di Chrome/Edge, gunakan tombol **Install POS** bila ditampilkan; alternatifnya menu browser → Install app.
5. Uji di perangkat kasir: buka POS online, matikan internet, simpan transaksi uji, reload, lalu sambungkan internet lagi. Periksa transaksi dan stok di server. Setelah update PWA berikutnya, tutup semua jendela POS lalu buka kembali untuk memakai versi baru.

```bash
node scripts/clean-legacy-docs.mjs
npm run pwa:build
git status
git add pos database scripts tests package.json vercel.json README.md POS-SETUP.md CARA-PASANG.txt PETUNJUK.txt PATCH-028.md docs
git add -u
git commit -m "Add offline POS PWA, durable queue and safe auto-sync"
git push
```

SQL tidak dijalankan otomatis oleh Git/Vercel. Untuk database **baru dan kosong**, instal `database/pos.sql`; file itu bukan update untuk database aktif. `database/reset-pos.sql` tidak diperlukan.

## Yang berubah

- PWA dengan ikon dan cache seluruh aset POS. Login/API/transaksi tidak dimasukkan ke cache service worker.
- Transaksi dibukukan terlebih dahulu dalam IndexedDB. Antrean tetap ada setelah reload atau browser ditutup normal. Kegagalan penyimpanan perangkat membuat pembayaran tetap terbuka; aplikasi tidak mengklaim transaksi tersimpan.
- Sinkronisasi berurutan saat POS terbuka, saat koneksi pulih, dan setiap 5 detik. Setiap transaksi membawa UUID, akun, store, ID perangkat, waktu kasir dan versi resep.
- Server menyimpan catatan konfirmasi dan penjualan/stok dalam satu transaksi SQL. Respons jaringan hilang setelah commit dapat dikirim ulang dengan ID dan isi yang sama tanpa menggandakan penjualan/stok.
- Indikator Online/Offline, jumlah transaksi tertunda dan konflik. Klik indikator untuk mencoba sinkronisasi atau mengekspor antrean.
- Sesi kasir dapat dipulihkan. Jika sesi server kedaluwarsa, masuk dengan akun yang sama; antrean tetap tersimpan. Satu tab POS aktif per profil browser mencegah dua tab menjual saldo lokal yang sama.
- Pencadangan lokal mengurangi ketersediaan produk langsung dan bahan resep untuk transaksi offline selanjutnya.
- Scan barcode atau SKU yang **persis sama** dengan master produk ke kolom pencarian kasir, lalu Enter. Nol di awal barcode dipertahankan. Barcode/SKU yang cocok dengan beberapa produk ditolak dan harus diperbaiki di master.
- Validasi jumlah dan asal lot diperketat. Saat memilih durian berbeda, satuan kembali ke KG agar harga kg tidak terbawa ke pilihan per butir. Supplier tampil pada rincian buah. Total dihitung dengan aritmetika desimal agar konsisten dengan SQL tanpa membulatkan berat.
- Panduan usang tentang demo, sesi login dan pemasangan SQL diganti. Sumber SQL, hasil build dan migration tetap ada karena mempunyai fungsi berbeda.

## Batas operasional

- Login pertama dan pengambilan data pertama harus online. Gunakan origin/perangkat/browser yang sama; mode incognito, penghapusan data browser, profil baru atau uninstall yang menghapus data dapat menghilangkan antrean. Jangan hapus data sebelum semua transaksi tersinkron.
- Auto-sync berjalan **saat POS terbuka**. Jika aplikasi ditutup, antrean disinkronkan saat dibuka kembali.
- Offline melayani **penjualan baru**. Perubahan master, penerimaan, produksi, waste, refund dan status kitchen memerlukan server.
- Kitchen di perangkat lain baru menerima pesanan setelah sinkronisasi. Untuk order offline, cetak struk dan serahkan ke kitchen secara manual. Struk lokal ditandai belum tersinkron. Integrasi jaringan lokal antarperangkat belum ada.
- Saldo saat offline memakai snapshot terakhir dan transaksi lokal. Beberapa perangkat offline dapat menjual stok yang sama. Server menolak konflik; transaksi tetap tersimpan dan antrean berhenti pada konflik pertama. Periksa stok fisik/koreksi lewat akun berwenang, kemudian coba lagi. Resep atau akses yang berubah memerlukan penanganan owner; ekspor antrean untuk menelusuri transaksi. Tidak ada penghapusan konflik otomatis.
- Barcode timbangan **dinamis** belum diparse otomatis karena format prefix/PLU/berat/harga alat belum dikonfigurasi. Input berat dan butir manual tetap tersedia. Barcode produk tetap dapat digunakan.
- Cetak memakai dialog print browser dan driver perangkat. QRIS/Transfer dicatat setelah pembayaran diverifikasi secara manual; tidak ada pembayaran gateway offline.

## Audit data

`database/audit-data.sql` hanya membaca data: barcode/SKU duplikat, saldo kg/butir tidak seimbang, resep tidak lengkap, biaya belum diketahui, stok kedaluwarsa dan jejak lot yang hilang. Jalankan dari SQL Editor untuk memperoleh daftar yang perlu diperiksa. Tidak ada data produksi yang dihapus/diubah oleh file audit ini.

Pengujian lokal dan batas verifikasi tercatat di `docs/HASIL-AUDIT.md`.

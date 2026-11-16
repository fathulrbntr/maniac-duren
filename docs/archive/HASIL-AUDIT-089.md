# Hasil audit 089 — 2 November 2026

Acuan: ZIP proyek Maniac Duren yang diberikan. Audit meliputi halaman publik, menu pelanggan, aplikasi POS, alur sesi/demo, impor modul, CSS, API, SQL lokal, pengujian, dan organisasi file. Perubahan dibuat pada salinan kerja; belum ada commit, push, deployment, atau query ke database produksi.

## Temuan yang diperbaiki

| Temuan | Perbaikan dan dampak |
|---|---|
| Modul yang sama diimpor dengan versi URL berbeda oleh beberapa fitur | Impor relatif diseragamkan tanpa query versi. State modul, event listener, dan cache modul tidak terpecah menurut URL lama/baru. Header POS tetap memakai revalidasi cache. |
| Logout dapat terjadi saat JSON respons besar masih diproses | Identitas sesi diperiksa kembali setelah pembacaan JSON. Respons sesi lama tidak memulihkan workspace yang sudah logout. |
| Pembacaan dokumen live terlambat saat berpindah mode | `adminRpc` menolak hasil ketika sesi atau mode berubah. Uji regresi mencakup balapan respons dengan perpindahan demo. |
| Banner shift berada sebelum header utama | Banner dipindah ke konten workspace agar mengikuti lebar dan jarak halaman. |
| Form pembayaran panjang membuat tombol bayar jauh di bawah | Ringkasan desktop memiliki area isi yang dapat digulir dan footer pembayaran tetap terlihat; layar kecil memakai susunan satu kolom. |
| CSS input generik menimpa kontrol pencarian khusus | Spesifisitas aturan bersama diturunkan dengan `:where`, menghilangkan tampilan input bertumpuk dan menjaga aturan fitur. |
| Berpindah menu mempertahankan posisi gulir halaman sebelumnya | Navigasi mengembalikan posisi halaman ke atas. |
| Preferensi grup Pengaturan tidak ikut dipulihkan | Daftar grup sidebar disamakan dengan grup yang tersedia. |
| Contoh dokumen demo bisa dicoba tanpa shift aktif lalu gagal | Tombol dinonaktifkan sampai kasir demo dibuka; tersedia petunjuk menuju Kasir. |
| Salah ketik pada tipe produk | Label `Pruduct Olahan` diperbaiki menjadi `Product Olahan`. |
| Hero halaman publik memotong ilustrasi dan harga pada HP | Layout layar kecil diubah menjadi satu kolom; ilustrasi, harga, dan tombol tetap terlihat, dengan target tombol minimal 44 px. |
| Galeri publik memanggil 14 foto yang tidak ada | Referensi rusak dibuang. Foto yang tersedia tetap ditampilkan dengan tata letak satu foto tanpa navigasi carousel kosong. |
| Script pembersihan lama dapat menghapus kode/SQL yang masih berguna | Diganti pengarsipan terarah, pemeriksaan benturan isi, preview, serta penghapusan satu file statistik Git yang diverifikasi hash. |
| Script rollback lama masih bisa dipakai pada aplikasi terbaru | Ditambah penolakan sebelum mutasi file jika aplikasi PWA saat ini terdeteksi. |
| Panduan aktif bercampur dengan 46 petunjuk historis | Petunjuk lama dipindah ke `docs/archive/`; README, alur pengguna, peta fitur/file, dan pemasangan audit diperbarui. |
| README menyebut `pos.sql` sebagai installer fitur terbaru dan menautkan file yang hilang | Kontrak fondasi dan urutan patch SQL dijelaskan sesuai implementasi; tautan aktif diperbaiki. |
| Tes default hanya mencakup sebagian fitur dan fixture lama tidak mengikuti aturan shift | Runner mencakup seluruh `*.test.mjs`, fixture diperbarui, suite browser disusun, dan dependensi IndexedDB simulasi dilengkapi. |
| Impor/asset yang hilang mudah luput dari pemeriksaan | `npm run check` memeriksa sintaks, tujuan impor/aset HTML, identitas modul, navigasi/CSS ganda, dan build SQL dasar. |
| File cadangan dan metadata kerja berpotensi ikut deployment | `.vercelignore` mengecualikan cadangan foto, metadata Git, environment lokal, log, hasil uji, dan panduan teks. |
| Kode penghubung utama sulit dipindai | Format `app.js` dan beberapa modul inti dirapikan, tanpa memindahkan URL aplikasi; peta file mengarahkan pencarian berdasarkan fitur. |

## Verifikasi

- `npm run check`: lulus untuk 233 file sumber.
- `npm test`: 127 lulus, 0 gagal, 0 dilewati.
- `npm run test:browser`: seluruh 13 suite browser lulus, dengan fixture SQL disiapkan oleh runner.
- Matriks responsif POS: 20 menu × 4 ukuran layar × 2 tema, atau 160 kombinasi.
- Perubahan patch lolos pemeriksaan whitespace Git; staging diverifikasi menggunakan index sementara, tanpa mengubah staging asli.

Tes database berjalan di PGlite lokal dengan fixture autentikasi. Rantai fitur lengkap sampai CRM 085 dipasang bersama; uji memeriksa profil toko, detail karyawan, dokumen, harga beli, shift, pembayaran, serta poin tetap tersedia. Membuat invoice dari transaksi member tidak menjual ulang atau menambah poin kedua kali. Uji fitur juga mencakup FIFO, stok, produksi, reject, penerimaan, biaya, retry, refund, dan pembatasan akses.

Tes browser memakai halaman/modul asli dengan respons jaringan lokal. Pemeriksaan POS meliputi 20 menu, lebar 1600/1024/390/360 px, dua tema, modal, reload sesi, kesalahan runtime, asset lokal, serta identitas modul. Tabel lebar boleh memiliki scroll internal; halaman utama tidak boleh melebar keluar viewport. Halaman publik, menu, dan editor diperiksa pada lebar 1440/390/360 px dengan widget eksternal tidak tersedia.

Sebagian tes historis tetap dipertahankan sebagai tes kompatibilitas, dengan prasyarat SQL yang sesuai versinya. Perbaikan fixture tidak mengaktifkan kembali fitur offline/halaman cache lama di aplikasi aktif.

## Batas hasil dan catatan lanjutan

- Tidak ada bukti bahwa seluruh skenario produksi bebas bug. Data akun, konfigurasi Supabase/Vercel, koneksi jaringan nyata, layanan WhatsApp/TikTok/peta, printer, dan timbangan fisik belum diuji.
- Hanya satu foto galeri tersedia dalam ZIP. Foto 02–15 dapat ditambahkan kembali setelah file asli tersedia; audit tidak menggantinya dengan gambar rekaan.
- SQL operasional tidak diubah. `pos.sql` tetap fondasi historis. Seed durian lama memiliki harga buah kosong yang perlu diisi dengan harga nyata sebelum digunakan untuk instalasi baru; pengujian memakai harga contoh terisolasi.
- Editor menu pelanggan masih berbasis draft lokal/ekspor JSON dan belum sinkron otomatis dengan POS.
- Audit ini tidak membongkar semua modul lama menjadi struktur direktori baru. Lokasi URL dipertahankan; pengarsipan, format kode, dan peta fitur membuat perubahan berikutnya lebih mudah ditelusuri.
- Berkas cetak otomatis Windows yang sudah berubah di ZIP sumber dipertahankan persis dan tidak dimasukkan sebagai perubahan audit.

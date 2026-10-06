# Import Serving Menu Maniac Duren

Jalankan `database/seeds/menu-serving-seed.sql` setelah `database/pos.sql` dan setelah database memiliki akses POS.

Seed ini:
- membuat master bahan yang diperlukan serving;
- membuat produk prep Jelly Melon/Cincau;
- membuat batch recipe Jelly Melon/Cincau (4 sachet + 1.600 ml air -> 1.600 g);
- membuat recipe serving untuk menu yang harga jualnya sudah tersedia di `menu/menu.json`;
- tidak mengarang harga untuk menu yang belum memiliki harga.

Menu yang masih menunggu harga:
- Ketan Polos
- Matcha Duren
- Matcha Original
- Sop Duren Keju

Catatan: resep batch Mutiara, Krimer, Gulmer Cair, Cendol/Dawet, Es Duren, dan Ketan belum dibuat sebagai batch produksi otomatis karena data sumber belum memberikan yield aktual hasil jadi. Yield perlu ditentukan/diukur agar HPP dan pengurangan stok tidak salah.

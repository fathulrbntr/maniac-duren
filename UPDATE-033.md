# Tampilan modern POS 033

Ekstrak ZIP ke folder proyek, ganti file terkait, lalu deploy. Pasang di atas versi 032. Tidak memerlukan SQL baru.

Gaya mengikuti referensi: frame charcoal, area kerja putih, aksen lime, kartu dan tabel minimal, sidebar ikon yang bisa diperluas. Klik tombol di bawah logo untuk memperluas/ringkas menu. Tooltip dan nama aksesibel tetap tersedia. Pengaturan tersimpan di perangkat. Mengubah sidebar tidak membangun ulang form, sehingga isian tidak hilang. Di mobile nama menu tetap terlihat dan dapat digulir horizontal.

modern.css adalah lapisan desain bersama yang dimuat setelah CSS fitur: kasir, stok, produksi, reject, laporan, tim, master data, dialog, dan login. Mode light/dark didukung; akun dengan preferensi lama tetap memakai preferensinya. Pengguna baru memakai light. Foto produk memakai contain agar utuh.

Alur transaksi/data tetap sama. Versi ini tidak menerapkan migration baru. Pemeriksaan sintaks JavaScript, struktur CSS dan akses menu dilakukan; visual pada browser produksi belum diverifikasi. Setelah deployment, Ctrl+Shift+R; pilih Light untuk tampilan seperti referensi.

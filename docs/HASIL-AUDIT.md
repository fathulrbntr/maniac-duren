# Hasil audit 111 — 16 November 2026

## Tindak lanjut: sidebar sesudah perubahan viewport

Log Windows terbaru kembali meluluskan 14 tahap awal browser suite. Tes gudang
kini melewati pergantian akun dan penerimaan, lalu berhenti saat membuka menu
harga setelah viewport mobile dikembalikan ke desktop. Helper membaca status
ARIA mobile ketika CSS desktop sudah menyembunyikan tombol toggle karena
sidebar terbuka. Helper kini menggunakan keterlihatan picker lokasi sebagai
acuan. Simulasi controller dengan callback media tertunda gagal pada helper lama
dan lulus pada helper baru. Rincian ada di
[PERBAIKAN-TES-GUDANG-111.md](PERBAIKAN-TES-GUDANG-111.md).

## Tindak lanjut: pergantian akun pada tes gudang

Log Windows terbaru mengonfirmasi `verify` lulus dengan 179 tes dan 14 dari 15
tahap browser suite lulus, termasuk CRM, UI audit, dan website publik. Tahap
terakhir, gudang, berhenti saat beralih dari akun gudang ke kasir. Tes memeriksa
tombol logout segera setelah `goto`, sebelum pemulihan sesi selesai, sehingga
melewati logout dan menunggu form login yang tidak muncul.

Tes kini menunggu form login atau shell aplikasi tampil sebelum menentukan
langkah pergantian akun. Navigasi gudang juga menunggu sidebar siap setelah
reload dan memeriksa status grup menu sebelum membukanya. Rincian:
[PERBAIKAN-TES-GUDANG-111.md](PERBAIKAN-TES-GUDANG-111.md).
Verifikasi lokal sesudah perubahan lulus: 179 tes, 0 gagal. Peluncuran tes
browser gudang lokal tetap terblokir oleh pembatasan Chromium lingkungan audit.

## Tindak lanjut: panel member pada tes CRM

Log terbaru pengguna mengonfirmasi enam tahap pertama browser suite lulus,
termasuk kedua tes shift kasir dan tes metode pembayaran. Tes CRM berikutnya
menunggu input member di dalam panel checkout yang masih tertutup. Helper
`tests/helpers/browser-checkout.mjs` membuka panel melalui tombol summary;
tes CRM memakainya saat transaksi pertama, pencarian setelah pembayaran, dan
login kasir. `npm run verify` sesudah perubahan lulus dengan 179 tes, 0 gagal;
Chromium tetap terblokir saat peluncuran di lingkungan audit. Rincian:
[PERBAIKAN-TES-CRM-111.md](PERBAIKAN-TES-CRM-111.md).

## Tindak lanjut: selector sidebar dan dock

Log pengguna mengonfirmasi tiga tes laporan awal sudah lulus setelah perbaikan
sidebar. Tahap berikutnya berhenti di tes shift kasir karena
`nav [data-view=orders]` cocok dengan tombol sidebar dan dock. Sebanyak 24 selector
pada tujuh file tes diarahkan khusus ke `#pos-navigation`. Dua tes regresi baru
memeriksa bahwa kedua navigasi boleh berbagi tujuan, tetapi locator untuk aksi
tunggal harus unik. Pemeriksaan ulang `npm run verify` lulus dengan 179 tes, 0 gagal. Rincian pemasangan: [PERBAIKAN-TES-NAVIGASI-111.md](PERBAIKAN-TES-NAVIGASI-111.md).

## Tindak lanjut: timeout tes sidebar

Log pengujian pengguna menemukan tes laporan menunggu `#active-store` terlihat
ketika sidebar masih tertutup. Tes kini membuka sidebar melalui tombol UI terlebih
dahulu. Perbaikan yang sama diterapkan ke tes gudang dan pergantian outlet pada
tes pembayaran. Tidak ada perubahan kode aplikasi atau CSS. Rincian dan perintah
PowerShell terbaru: [PERBAIKAN-TES-SIDEBAR-111.md](PERBAIKAN-TES-SIDEBAR-111.md).

Source: ZIP `maniac-duren(1).zip` yang diberikan, sudah berisi audit 110.
Pemeriksaan dilakukan pada salinan lokal. Tidak ada commit, push, deployment,
reset, migrasi SQL baru, atau perubahan pada database produksi.

## Hasil utama

Dua bug perilaku berhasil direproduksi dan diperbaiki: refresh token akun lama
mengganggu sesi akun baru, serta kirim ulang data identik yang ditolak karena
urutan properti JSON berbeda. Pengujian otomatis ditambah untuk mencegah
keduanya muncul kembali.

| Temuan                                                                                                   | Perbaikan                                                                                                 | Bukti                                                                                                                        |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Promise refresh token dibagi tanpa pembatas sesi; login baru dapat menerima error milik login sebelumnya | Setiap refresh dimiliki `sessionId`; penyelesaian lama tidak menghapus refresh baru                       | Tes baru gagal sebelum perbaikan dan lulus sesudahnya; dua pemanggil sesi baru berbagi satu refresh                          |
| Signature retry memakai urutan key objek dari `JSON.stringify`                                           | Urutkan key objek secara rekursif; urutan array, isi, aksi, dan ID asli tetap dijaga                      | Payload sama dengan urutan key berbeda diterima; perubahan toko/aksi/isi ditolak; pending audit lama tetap terbaca           |
| Tes gudang memakai `/usr/bin/chromium` sebagai default                                                   | Gunakan browser bawaan Playwright, dengan override environment opsional                                   | Jalur Linux dihapus; eksekusi Windows belum tersedia di lingkungan audit                                                     |
| Lockfile memuat 19 entri extraneous dari direktori sementara audit terdahulu                             | Buang metadata tersebut dan sinkronkan manifest/lockfile; parser Espree dipin sebagai dependensi langsung | Instalasi bersih dari lockfile berhasil, pemeriksaan portabilitas lulus                                                      |
| Pemeriksa import berbasis regex menganggap kode contoh dalam string fixture sebagai import aktif         | Parse import/export JavaScript melalui AST                                                                | Kasus import asli, komentar, dan string contoh diuji; fixture baru tidak menimbulkan false positive                          |
| Import modul input uang di HTML editor menu memakai URL versi berbeda                                    | Samakan URL dengan pemakai lain                                                                           | Pemeriksaan identitas URL lintas HTML/JS lulus; ini pencegahan drift, bukan bukti dua instance sudah aktif pada satu halaman |

## Penataan untuk pembaruan berikutnya

- `AGENTS.md` menetapkan aturan kerja, kepemilikan file, kontrak transaksi, dan
  pengujian yang harus diikuti pengembang/asisten coding.
- `docs/PENGEMBANGAN.md` memetakan tempat perubahan dan langkah menelusuri
  form → mutasi → RPC → SQL → tes.
- `scripts/check-architecture.mjs` memeriksa kontrak import/export, import
  side-effect dan dinamis literal, dependensi melingkar, URL modul, nama file
  berbeda kapitalisasi, batas browser/server/fixture, dan lockfile portabel.
- Logika pemeriksa dipisahkan ke `scripts/lib/architecture.mjs`, dengan tes
  struktur valid dan struktur yang sengaja rusak.
- `npm run check` dan `npm run verify` otomatis mencakup pemeriksaan baru.
  ESLint juga menolak deklarasi/import/cabang duplikat.
- Root README dan peta struktur menunjuk audit terbaru. Hasil audit 110 disimpan
  di `docs/archive/HASIL-AUDIT-110.md`.
- Tidak ditemukan siklus pada graph modul browser yang dianalisis. Tidak dilakukan
  pemindahan massal modul lama karena lokasi file menjadi URL runtime.

## Validasi

| Pemeriksaan                        | Hasil                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| Baseline source unggahan           | 170 tes lulus                                                                  |
| Instalasi baru di folder kosong    | `npm ci --ignore-scripts --no-audit --no-fund` berhasil; 86 package terpasang  |
| Dependensi untuk pengujian akhir   | Menggunakan instalasi baru tersebut, bukan `node_modules` bawaan ZIP           |
| Struktur/sintaks/aset/build SQL    | Lulus                                                                          |
| ESLint                             | Lulus, 0 error/warning                                                         |
| Prettier                           | Lulus                                                                          |
| Unit, simulasi DOM, dan SQL PGlite | **179 lulus, 0 gagal, 0 skipped**                                              |
| Audit registry npm                 | 0 kerentanan dilaporkan pada saat pemeriksaan                                  |
| Preview cleanup audit              | 0 file historis perlu dipindah pada source unggahan                            |
| Browser Playwright                 | Terblokir saat peluncuran Chromium: `socket() failed: Operation not permitted` |

Pengujian mencakup kasir, shift, metode pembayaran, stok/batch/barcode, gudang,
transfer, kitchen, reject, laporan, CRM, sesi, retry, mode demo, dan endpoint
fixture. Tes SQL tidak menggunakan proyek Supabase produksi.

Berkas database, migrasi Supabase, dan aset gambar diperiksa dengan SHA-256 dan
identik dengan source unggahan. Aturan bisnis, harga, dan isi master tidak diubah.

## Batas dan risiko yang masih perlu diperiksa

- Playwright berhenti pada peluncuran browser pertama. Kelulusan tes DOM/SQL
  bukan pengganti verifikasi visual. Jalankan `npm run test:browser` di komputer
  Anda setelah memasang Chromium Playwright.
- Belum menguji akun/data/configuration hosting produksi, Windows secara langsung,
  printer, scanner/timbangan, dan tablet fisik.
- Parser statis hanya dapat memeriksa URL import literal. URL dinamis, seluruh
  cascade CSS, dan ketepatan aturan bisnis tetap memerlukan tes perilaku.
- Audit dependensi yang bersih bukan jaminan seluruh aplikasi bebas bug. Source
  ini menambahkan pencegahan bentrok yang terukur, bukan jaminan mutlak.

## Isi paket

ZIP lengkap berisi source dan aset yang diperlukan, panduan, script, dan tes.
`.git`, `node_modules`, file environment, hasil tes sementara, dan cadangan foto
`maniac-foto-*` tidak disertakan. Berkas pada ZIP sumber asli tidak dihapus.

Daftar perubahan relatif terhadap ZIP unggahan tersedia di
`docs/audit/changes-111.json`. Manifest staging tetap kumulatif dari audit 110
agar perubahan audit sebelumnya yang belum di-commit ikut dapat ditinjau.
Petunjuk pemasangan: `docs/PASANG-AUDIT-111.md`.

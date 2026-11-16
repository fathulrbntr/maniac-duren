# Panduan pembaruan kode

Gunakan kode sumber audit 111 sebagai dasar pembaruan berikutnya. Nomor audit
menandai paket pemeriksaan, bukan migrasi database. Aturan untuk asisten coding
dan pengembang berada di `AGENTS.md` di root proyek.

## Peta tanggung jawab

| Perubahan                               | Tempat utama                                             | Hindari                                    |
| --------------------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| Startup, login, pergantian halaman      | `pos/app.js`, `pos/session.mjs`, `pos/navigation.mjs`    | Menambah entry point POS kedua             |
| Memilih RPC dan mengolah respons mutasi | `pos/data/mutations.mjs`                                 | Fetch transaksi langsung dari komponen     |
| Retry dan rekonsiliasi                  | `pos/retry.mjs`                                          | ID baru untuk pengiriman yang belum pasti  |
| Perhitungan/validasi fitur              | Modul fitur yang sudah terdaftar di `STRUKTUR-PROYEK.md` | Menyalin rumus di UI dan laporan           |
| Tampilan dan event                      | `pos/*-ui.mjs` dan CSS fitur                             | Menambah logika fitur besar ke `app.js`    |
| Fitur baru dengan beberapa file         | `pos/features/<fitur>/` bila dibutuhkan                  | Membuat struktur paralel untuk fitur lama  |
| Backend HTTP                            | `api/`                                                   | Memasukkan service role ke browser         |
| Aturan database                         | Ikuti `database/README.md`                               | Menjalankan ulang seluruh patch historis   |
| Fungsi lintas POS/menu                  | `shared/`                                                | Mengimpor aplikasi dari shared             |
| Tes dan fixture                         | `tests/`, `tests/helpers/`                               | Fixture di folder runtime                  |
| Pemeriksaan proyek                      | `scripts/`, `scripts/lib/`                               | Script sekali pakai di root                |
| Panduan terbaru/riwayat                 | `docs/`, `docs/archive/`                                 | Dua panduan aktif yang saling bertentangan |

Folder aktif yang lama tidak dipindahkan massal karena aplikasi menyajikan modul
langsung melalui URL. Perapian dilakukan dengan menentukan pemilik logika dan
menegakkan batas impor. Bila suatu modul perlu dipindah, ubah semua import,
HTML, tes, dan referensi aset dalam perubahan yang sama, lalu verifikasi.

## Urutan mengerjakan pembaruan

1. Mulai dari sumber terbaru dan periksa `git status --short`. Simpan pekerjaan
   lokal sebelum menimpa file dari paket pembaruan.
2. Cari nama aksi/fitur yang sudah ada. Telusuri form → `ctx.mutate` → dispatcher
   → RPC → SQL → tes. Gunakan handler dan perhitungan yang sudah ada.
3. Perbarui satu jalur logika. Jika membutuhkan endpoint baru, daftarkan rute
   pada dispatcher dan uji payload, retry, hak akses, serta mode demo.
4. Untuk proses async, simpan identitas sesi/operasi sebelum `await` dan abaikan
   respons yang sudah kedaluwarsa. Jangan memakai satu promise global untuk
   operasi milik akun berbeda.
5. Jalankan verifikasi. Ubah dokumentasi yang berlaku, lalu tinjau diff sebelum
   commit. Pembaruan bisnis memerlukan pengujian staging/perangkat sesuai fitur.

## Pemeriksaan yang tersedia

```powershell
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw "Instalasi gagal." }
npm.cmd run verify
if ($LASTEXITCODE -ne 0) { throw "Verifikasi gagal. Periksa error sebelum melanjutkan." }
```

`verify` mencakup pemeriksaan struktur/sintaks/aset, lint, format, unit/simulasi DOM,
dan database fixture PGlite. `npm run check:architecture` dapat dijalankan sendiri
untuk pemeriksaan impor yang lebih cepat.

| Pemeriksaan otomatis                                          | Contoh masalah yang ditolak                            |
| ------------------------------------------------------------- | ------------------------------------------------------ |
| Resolusi impor JavaScript, termasuk side-effect dan re-export | File dihapus tetapi masih diimpor                      |
| Kecocokan named/default export                                | `import { simpan }` dari file yang tidak mengekspornya |
| Siklus dependensi                                             | A mengimpor B, B kembali mengimpor A                   |
| Identitas URL modul lintas HTML/JS                            | Satu modul dimuat dengan `?v=1` dan tanpa query        |
| Huruf besar/kecil nama file                                   | Import lolos di Windows tetapi gagal di Linux          |
| Batas kode browser                                            | UI mengimpor fixture tes atau file backend             |
| Dependensi shared                                             | Shared mengimpor aplikasi POS                          |
| Lockfile portabel                                             | Link package ke folder `/tmp` mesin lain               |
| Lint duplikasi                                                | Deklarasi, import, key, atau cabang yang bertabrakan   |

Pemeriksaan statis tidak memahami semua URL yang dibentuk saat runtime, seluruh
perilaku CSS, atau kebenaran aturan bisnis. Tambahkan tes perilaku untuk fitur yang
diubah. Kode vendor tidak dianalisis sebagai modul aplikasi.

Untuk UI/alur browser:

```powershell
npx.cmd playwright install chromium
if ($LASTEXITCODE -ne 0) { throw "Instalasi browser gagal." }
npm.cmd run test:browser
if ($LASTEXITCODE -ne 0) { throw "Tes browser gagal. Periksa log." }
```

Browser memakai instalasi Playwright. `BROWSER_EXECUTABLE` hanya untuk override
opsional ke executable yang benar-benar ada di komputer tersebut.

Tombol sidebar dan dock dapat mempunyai `data-view` yang sama. Tes yang memilih
menu sidebar harus menggunakan `#pos-navigation [data-view=...]`; tes dock memakai
`.system-dock [data-view=...]`. Selector `nav [data-view=...]` terlalu luas untuk
operasi klik tunggal. `tests/navigation-targets.test.mjs` memeriksa bentrokan ini
pada markup yang dihasilkan modul navigasi dan dock sebenarnya.

Kolom member, meja, catatan, dan diskon ada di panel `<details>` checkout yang
tertutup secara bawaan. Gunakan `openCheckoutOptions` dari
`tests/helpers/browser-checkout.mjs` sebelum mengisi kolom tersebut, termasuk
setelah pembayaran atau navigasi merender ulang checkout. Helper mengeklik
`summary` hanya jika panel tertutup dan menunggu kolom terlihat.

`page.goto()` dan `page.reload()` dapat selesai sebelum aplikasi memulihkan sesi.
Pada tes pergantian akun, tunggu `#login-form` atau `#pos-main` terlihat, lalu
logout lewat UI bila sesi lama sudah dipulihkan. Jangan memutuskan status login
berdasarkan `count()` atau `isVisible()` segera setelah navigasi. Untuk membuka
menu sesudah reload, tunggu shell/sidebar siap dan periksa atribut `open` grup
navigasinya; elemen yang belum dirender tidak berarti grupnya tertutup.

Setelah perubahan viewport, layout CSS dapat berubah sebelum callback
`matchMedia` memperbarui ARIA. Helper sidebar memeriksa keterlihatan picker
lokasi agar tidak mengeklik tombol desktop yang sudah tersembunyi ketika
sidebar terbuka.

## Berkas yang dikirim untuk audit selanjutnya

Sertakan source, aset aplikasi, `package.json`, `package-lock.json`, `AGENTS.md`,
tes, script, dan dokumentasi. Kecualikan dependensi terpasang, direktori Git,
file environment, laporan tes sementara, dan cadangan foto. Kirim revisi terbaru;
jangan menggabungkan beberapa folder `final` atau ZIP patch lama ke source aktif.

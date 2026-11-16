# Patch 115 — Tabel invoice, filter, dan ringkasan tagihan

Patch ini melanjutkan patch 114 pada halaman **Pengiriman & Tagihan**. Ekstrak isi
ZIP ke folder proyek `D:\PROJECT\MANIAC DUREN\maniac-duren`, lalu timpa file dengan
nama yang sama. Tidak ada SQL baru, migrasi ulang, reset data, atau dependensi baru.

## Perubahan

- **Sudah diterbitkan:** invoice aktif yang sudah memiliki nomor invoice.
- **Belum diterbitkan:** dokumen penyiapan dan dokumen siap terbit.
- **Dibatalkan:** seluruh dokumen batal, termasuk pembatalan sebelum nomor invoice
  diterbitkan. Nilainya tidak masuk ringkasan tagihan aktif.
- Filter invoice terbit berdasarkan tanggal awal/akhir dan status pembayaran:
  semua, lunas, atau belum lunas/sebagian. Pilihan periode: semua periode, hari ini,
  minggu ini (Senin–Minggu), bulan ini, atau rentang tanggal.
- Tiga kartu ringkasan: **Total nota aktif**, **Sudah dibayar**, dan **Sisa tagihan**.
- Tombol **Buka** tetap tersedia pada ketiga tabel. Filter bertahan saat detail
  ditutup, data diperbarui, atau halaman dimuat ulang dalam tab yang sama.
- Pilihan filter terpisah menurut akun, ruang kerja, dan lokasi. Ruang kerja gudang
  tidak menampilkan nilai invoice, status pembayaran, maupun ringkasan keuangan.
- Tabel dapat digeser mendatar pada layar kecil; kontrol filter dan kartu ringkasan
  tersusun ke bawah. Warna mengikuti tema aplikasi.

## Dasar perhitungan

Periode menggunakan **tanggal terbit invoice dalam WIB**, termasuk seluruh hari
pada tanggal awal dan akhir. Tanggal pembuatan dokumen bukan pengganti tanggal terbit.
Invoice lama tanpa tanggal terbit valid tetap terlihat pada **Semua periode**,
dengan pemberitahuan bahwa tanggalnya belum tersedia.

Ringkasan menghitung seluruh invoice aktif dalam periode, baik transfer toko maupun
wholesale. Filter pembayaran hanya menyaring tabel agar total periode tetap dapat
dibandingkan. Draft dan dokumen batal selalu dikeluarkan dari ringkasan. Kedua tabel
tersebut menampilkan semua tanggal karena filter periode khusus invoice terbit.

**Sudah dibayar** adalah pembayaran tercatat untuk invoice dalam periode terpilih,
termasuk pembayaran pada tanggal lain. Ini bukan laporan arus kas menurut tanggal
pembayaran. Contoh: invoice tanggal 16 November senilai Rp200.000, dibayar Rp50.000
pada 20 November, tetap menampilkan dibayar Rp50.000 dan sisa Rp150.000 saat periode
invoice dipilih 16 November. Pembayaran sebagian masuk filter belum lunas.

Nilai ringkasan dihitung dalam satuan sen sebelum diformat rupiah. Nilai keuangan
yang belum tersedia ditandai dan tidak disamarkan sebagai nol.

## Pemeriksaan

`npm run verify` lulus: pemeriksaan struktur, sintaks, lint, format, dan **184
pengujian tanpa kegagalan**. Pengujian baru meliputi pengelompokan eksklusif,
pembatalan sebelum/sesudah terbit, batas tanggal WIB, kalender/pergantian tahun,
pembayaran sebagian dan terlambat, angka desimal, penyimpanan filter, tombol detail,
escaping, serta penyembunyian keuangan di gudang.

Tes browser baru berada di `tests/outbound-invoices-browser.mjs` dan sudah masuk
runner `npm run test:browser`. Browser belum dapat dijalankan di lingkungan pembuat
patch: Chromium berhenti saat startup dengan `socket() failed: Operation not
permitted`. Karena itu, status tes browser belum dinyatakan lulus. Blok PowerShell
berikut menjalankan verifikasi dan seluruh tes browser sebelum commit/push.

Jika Chromium belum terpasang pada komputer Windows, jalankan
`npx.cmd playwright install chromium` terlebih dahulu.

## PowerShell: verifikasi, commit, dan push

Jalankan setelah menyalin file patch. Blok ini hanya memasukkan file patch 115
ke commit. Perubahan lain yang sudah di-stage tidak ikut commit ini. Jika salah
satu langkah gagal, langkah berikutnya dihentikan. Patch belum otomatis di-push.

```powershell
& {
    $ErrorActionPreference = "Stop"
    Set-Location "D:\PROJECT\MANIAC DUREN\maniac-duren"

    git status --short
    if ($LASTEXITCODE -ne 0) { throw "Gagal membaca status Git." }

    npm.cmd run verify
    if ($LASTEXITCODE -ne 0) { throw "Verifikasi gagal. Commit dan push dihentikan." }
    npm.cmd run test:browser
    if ($LASTEXITCODE -ne 0) { throw "Tes browser gagal. Commit dan push dihentikan." }

    $patchFiles = @(
        "docs/PATCH-115-INVOICE-FILTER.md"
        "docs/STRUKTUR-PROYEK.md"
        "pos/index.html"
        "pos/outbound-ui.mjs"
        "pos/warehouse-workflow.mjs"
        "pos/warehouse-ui.mjs"
        "pos/warehouse.css"
        "scripts/test-browser.mjs"
        "tests/helpers/outbound-invoices-fixture.mjs"
        "tests/outbound-invoices.test.mjs"
        "tests/outbound-invoices-browser.mjs"
    )

    git add -- $patchFiles
    if ($LASTEXITCODE -ne 0) { throw "Git add gagal." }
    git diff --cached --stat -- $patchFiles
    if ($LASTEXITCODE -ne 0) { throw "Gagal membaca perubahan." }
    git diff --cached --check -- $patchFiles
    if ($LASTEXITCODE -ne 0) { throw "Pemeriksaan diff gagal." }
    git commit --only -m "Separate invoice tables and add period payment summaries" -- $patchFiles
    if ($LASTEXITCODE -ne 0) { throw "Commit gagal. Push dihentikan." }
    git push origin HEAD
    if ($LASTEXITCODE -ne 0) { throw "Push gagal. Periksa pesan Git di atas." }
    git status --short
    if ($LASTEXITCODE -ne 0) { throw "Gagal membaca status akhir Git." }
}
```

Untuk menguji fitur ini secara terpisah: `node tests/outbound-invoices.test.mjs`
dan `node tests/outbound-invoices-browser.mjs`. Kedua tes menggunakan fixture;
tidak mengubah database produksi.

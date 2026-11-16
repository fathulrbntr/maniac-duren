# Perbaikan tes browser sidebar — audit 111

Gejala: `reports-app-smoke.mjs` berhenti setelah login dengan timeout menunggu
`#active-store` terlihat, meskipun elemen sudah ditemukan.

## Penyebab dan perubahan

Sidebar dimulai dalam mode ringkas (`collapsed = true`) pada sesi browser baru.
CSS memang menyembunyikan `.sidebar-store` saat mode ini aktif. Tes harus membuka
sidebar sebelum menggunakan pilihan outlet.

- Tambahkan helper `tests/helpers/browser-sidebar.mjs`: tunggu area aplikasi,
  periksa apakah picker lokasi terlihat, klik tombol sidebar hanya jika picker
  tersembunyi, kemudian tunggu picker terlihat. Sidebar yang sudah terbuka tidak
  ditutup kembali. Setelah resize, `aria-expanded` dapat tertinggal sementara
  dari layout CSS sehingga tidak digunakan sebagai satu-satunya acuan.
- Terapkan pada startup tes laporan, login tes gudang, dan pergantian outlet
  tes metode pembayaran.
- Tambahkan pemeriksaan helper terhadap controller sidebar sebenarnya pada tes
  DOM: desktop tertutup, desktop sudah terbuka, mobile, dan perpindahan mobile
  ke desktop ketika callback media belum memperbarui atribut tombol.
- Sesuaikan contoh PowerShell menjadi `npm.cmd`/`npx.cmd` agar tidak memilih
  launcher `.ps1` yang diblokir Execution Policy.

Tidak ada perubahan kode aplikasi, CSS, database, atau aturan bisnis. Timeout
tidak diperpanjang, tes tidak dilewati, dan interaksi tidak memakai `force`.

## Memasang paket perbaikan kecil

Ekstrak ZIP, lalu salin **isi** folder `maniac-duren` ke
`D:\PROJECT\MANIAC DUREN\maniac-duren` dan timpa file yang sama. Pastikan folder
helper ikut disalin. Tidak perlu memasang ulang dependensi untuk perubahan ini.

Jalankan seluruh blok berikut di PowerShell:

```powershell
& {
    $ErrorActionPreference = "Stop"
    Set-Location "D:\PROJECT\MANIAC DUREN\maniac-duren"

    npm.cmd run verify
    if ($LASTEXITCODE -ne 0) { throw "Verifikasi gagal. Periksa log." }

    npm.cmd run test:browser
    if ($LASTEXITCODE -ne 0) { throw "Tes browser gagal. Periksa error pertama." }

    Write-Host "Seluruh pemeriksaan berhasil." -ForegroundColor Green
}
```

Sesudah menyalin file, helper sidebar digunakan oleh semua tes yang sebelumnya
menunggu/mengganti outlet tanpa membuka sidebar. Paket penuh audit 111 juga
diperbarui agar unduhan berikutnya menyertakan perbaikan yang sama.

## Batas validasi

Tes DOM memeriksa perilaku controller dan helper, bukan rendering CSS asli.
Chromium masih tidak dapat diluncurkan di lingkungan pemeriksaan karena
`socket() failed: Operation not permitted`; hasil browser lengkap harus diperiksa
di komputer Anda. Kegagalan browser selanjutnya perlu ditinjau berdasarkan lognya.

Rujukan API yang diperiksa: [Playwright actionability](https://playwright.dev/docs/actionability)
dan [Page.waitForSelector](https://playwright.dev/docs/api/class-page#page-wait-for-selector).

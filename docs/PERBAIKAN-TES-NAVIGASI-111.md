# Perbaikan tes navigasi sidebar dan dock — audit 111

Log pengguna menunjukkan `reports-admin-sql.test.mjs`, `reports-admin-browser.mjs`,
dan `reports-app-smoke.mjs` sudah lulus. Kegagalan baru terjadi di
`cashier-shifts-app-browser.mjs` karena selector `nav [data-view=orders]` cocok
dengan dua tombol yang sah: menu sidebar dan pintasan dock.

## Perubahan

24 selector pada tujuh file tes diarahkan ke `#pos-navigation`. Perbaikan mencakup
tes shift kasir, CRM, metode pembayaran, batch metrics/profit, reject report, dan
tes kitchen tambahan. Strict mode tetap aktif; tidak ada penambahan `.first()`,
`force`, penundaan tetap, atau pengabaian tes untuk menutupi masalah.

`tests/navigation-targets.test.mjs` merender markup sidebar dan dock dari modul
aplikasi ke adapter DOM. Tes membuktikan selector lama dapat cocok dua kali dan
selector yang dibatasi ke masing-masing area cocok satu kali. Tes juga membaca
locator literal di file browser agar pola yang sama tidak masuk kembali. Adapter
ini memeriksa pemilihan elemen, bukan rendering atau actionability browser asli.

Aturan selector ditambahkan ke `AGENTS.md` dan panduan pengembangan. Kode aplikasi,
CSS, data bisnis, dan SQL tidak diubah. Paket kecil bersifat kumulatif: perbaikan
sidebar sebelumnya ikut disertakan. Paket penuh audit 111 juga diperbarui.

Validasi lokal: `npm run verify` lulus, **179 tes lulus, 0 gagal**. Tes regresi
locator gagal pada selector lama dan lulus sesudah perbaikan.

## Pemasangan

Ekstrak `maniac-duren-fix-tes-browser-111.zip`, lalu salin **isi** folder
`maniac-duren` ke `D:\PROJECT\MANIAC DUREN\maniac-duren` dan timpa file yang sama.
Pastikan file tes dan `tests/helpers/` ikut tersalin. Dependensi tidak berubah.

Jalankan di PowerShell. Blok ini menampilkan log asli jika pemeriksaan gagal:

```powershell
& {
    $ErrorActionPreference = "Stop"
    Set-Location "D:\PROJECT\MANIAC DUREN\maniac-duren"

    npm.cmd run verify
    if ($LASTEXITCODE -ne 0) { return }

    cmd.exe /d /c "npm.cmd run test:browser > browser-error.log 2>&1"
    $browserExitCode = $LASTEXITCODE
    Get-Content ".\browser-error.log" -Tail 120
    if ($browserExitCode -ne 0) {
        Write-Host "Tes browser belum lulus. Kirim isi browser-error.log di atas." -ForegroundColor Yellow
    } else {
        Write-Host "Seluruh tes browser berhasil." -ForegroundColor Green
    }
}
```

Pengujian Chromium di lingkungan pemeriksaan masih terblokir pada peluncuran
karena `socket() failed: Operation not permitted`. Hasil browser lengkap harus
dilihat dari komputer pengguna; kelulusan simulasi DOM bukan kelulusan Playwright.

Rujukan: [Playwright locator strictness](https://playwright.dev/docs/locators#strictness).

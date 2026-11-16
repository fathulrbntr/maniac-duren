# Perbaikan tes CRM — audit 111

Error `locator.fill` pada `[data-member-search]` terjadi karena input berada di
panel `Meja, member & diskon` yang tertutup secara bawaan. Markup aplikasi memakai
`<details class="order-options">` tanpa atribut `open`. Tes langsung mengisi
kolom sebelum membuka panel tersebut.

## Perubahan

Helper `tests/helpers/browser-checkout.mjs` membuka panel melalui klik `summary`
jika belum terbuka, kemudian menunggu kolom checkout terlihat. Tes CRM memanggil
helper pada tiga tahap: penambahan member pertama, pencarian member setelah
pembayaran, dan pemeriksaan akses member setelah login kasir. Halaman checkout
dapat dirender ulang setelah pembayaran atau navigasi sehingga panel perlu
dibuka kembali.

Kode aplikasi dan CSS tidak diubah. Pemeriksaan transaksi, poin, struk,
persetujuan promosi, dan pembatasan akses di tes CRM tetap dijalankan. Tidak ada
`force`, penambahan timeout, manipulasi atribut `open`, atau pengabaian tes.

## Pemasangan dan pengujian

Ekstrak `maniac-duren-fix-tes-browser-111.zip`, lalu salin **isi** folder
`maniac-duren` ke `D:\PROJECT\MANIAC DUREN\maniac-duren`. Timpa file yang sama
dan pastikan folder `tests/helpers/` ikut tersalin. Paket ini kumulatif, termasuk
perbaikan sidebar dan selector navigasi sebelumnya. Dependensi tidak berubah.

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
        Write-Host "Tes browser belum lulus. Kirim isi log di atas." -ForegroundColor Yellow
    } else {
        Write-Host "Seluruh tes browser berhasil." -ForegroundColor Green
    }
}
```

Validasi lokal sesudah perubahan: `npm run verify` lulus dengan **179 tes lulus,
0 gagal**. Pemeriksaan ini mencakup struktur, lint, format, unit/simulasi DOM,
dan database fixture; tidak mencakup eksekusi browser nyata.

Log pengguna sebelum perbaikan ini menunjukkan enam tahap awal browser suite
lulus. Status tersebut belum membuktikan tes CRM dan tahap setelahnya lulus.
Peluncuran Chromium di lingkungan audit terblokir oleh `socket() failed:
Operation not permitted`; hasil browser lengkap perlu diperiksa di Windows.

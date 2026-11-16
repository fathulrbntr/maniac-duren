# Perbaikan tes gudang — audit 111

## Penyebab dan perubahan

Log Windows menunjukkan 179 tes verifikasi lulus dan 14 tahap browser lulus.
Tes terakhir, `warehouse-browser.mjs`, berhenti pada login kasir setelah alur
gudang mencetak surat jalan. `page.goto()` selesai ketika aplikasi masih
memulihkan sesi. Pemeriksaan `#logout.count()` terlalu awal menghasilkan nol;
tes melewati logout, sedangkan aplikasi kemudian menampilkan sesi gudang lama.
Akibatnya input `[name=identifier]` yang ditunggu tidak muncul.

Fungsi login di tes kini menunggu salah satu tampilan akhir startup:
`#login-form` atau `#pos-main`. Jika sesi lama dipulihkan, sidebar dibuka dan
logout diklik melalui UI sebelum login sebagai peran berikutnya. Perbaikan
berlaku bagi urutan gudang → kasir → owner → waitress → cutter.

Fungsi navigasi juga menunggu shell/sidebar siap, khususnya setelah reload
penerimaan parsial. Status grup menu diperiksa lewat atribut `open` sebelum
summary diklik. Selector menu dibatasi ke `#pos-navigation`.

Log berikutnya menunjukkan pergantian akun dan penerimaan sudah terlewati,
tetapi navigasi harga berhenti setelah viewport 390 px dikembalikan ke 1440 px.
Pada desktop dengan sidebar terbuka, CSS menyembunyikan `#sidebar-toggle`.
Helper sebelumnya membaca `aria-expanded=false` dari keadaan mobile sebelum
callback perubahan media memperbaruinya, lalu mencoba mengeklik tombol yang
sudah tersembunyi.

Helper sidebar kini memeriksa keterlihatan `#active-store` setelah shell siap.
Jika picker sudah terlihat, tidak ada klik toggle. Simulasi controller pada
`tests/sidebar.test.mjs` mencakup callback media yang tertunda: kasus ini gagal
dengan helper lama dan lulus dengan helper baru. Ini pengujian controller dan
urutan helper, bukan rendering browser asli.

Perubahan hanya pada tes dan panduan pengembangan. Tidak ada penghapusan sesi
melalui localStorage, perubahan autentikasi aplikasi, tambahan timeout, atau
pengabaian assertion. Pemeriksaan penerimaan parsial, pemulihan hasil scan,
hak akses, dokumen, dan perpindahan stok tetap ada.

## Pemasangan dan pengujian

Ekstrak `maniac-duren-fix-tes-browser-111.zip`, lalu salin **isi** folder
`maniac-duren` ke `D:\PROJECT\MANIAC DUREN\maniac-duren` dan timpa file yang sama.
Paket kumulatif ini menyertakan perbaikan sidebar, navigasi, dan CRM sebelumnya.

Untuk memeriksa perbaikan terakhir terlebih dahulu, jalankan di PowerShell:

```powershell
& {
    Set-Location "D:\PROJECT\MANIAC DUREN\maniac-duren" -ErrorAction Stop
    cmd.exe /d /c "npm.cmd run test:warehouse:browser > warehouse-error.log 2>&1"
    Get-Content ".\warehouse-error.log" -Tail 120
}
```

Jika tes gudang lulus, jalankan suite lengkap sebagai pemeriksaan akhir:

```powershell
& {
    Set-Location "D:\PROJECT\MANIAC DUREN\maniac-duren" -ErrorAction Stop
    cmd.exe /d /c "npm.cmd run test:browser > browser-error.log 2>&1"
    Get-Content ".\browser-error.log" -Tail 120
}
```

Validasi lokal setelah perubahan: `npm run verify` lulus, **179 tes lulus,
0 gagal**, termasuk pemeriksaan struktur, lint, format, unit/DOM, dan SQL fixture.

Browser lokal pada lingkungan audit tetap terblokir saat peluncuran Chromium
(`socket() failed: Operation not permitted`). Kelulusan 14 tahap sebelumnya
berasal dari log Windows pengguna; kelulusan tes gudang sesudah perbaikan masih
perlu dikonfirmasi melalui eksekusi Windows tersebut.

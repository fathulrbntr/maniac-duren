# Patch 113 — Modal per kg dan per butir di nota supplier

Tambahan untuk patch nota supplier 112. Buka **Nota Supplier → Buka nota**;
bagian **Rincian produk** sekarang menampilkan **Modal/kg** dan **Modal/butir**
pada setiap produk.

| Nilai       | Perhitungan                                                             |
| ----------- | ----------------------------------------------------------------------- |
| Modal/kg    | Total modal batch (harga nota + alokasi ongkir) ÷ kg aktual diterima    |
| Modal/butir | Total modal batch (harga nota + alokasi ongkir) ÷ jumlah butir diterima |

Modal/butir adalah rata-rata biaya per buah dalam batch tersebut. Angka memakai
total modal yang sudah disimpan pada batch penerimaan, termasuk hasil koreksi
owner dari patch 112. Alokasi ongkir mengikuti perhitungan database yang sudah
ada. Sisa stok, harga jual/transfer, dan jumlah cicilan tidak menjadi pembagi atau
pengganti modal.

Contoh: harga produk Rp200.000 + alokasi ongkir Rp20.000, diterima 6 kg / 3 butir:
modal/kg Rp36.666,67 dan modal/butir Rp73.333,33. Jika owner mengoreksi total modal
menjadi Rp270.000, keduanya menjadi Rp45.000/kg dan Rp90.000/butir. Perhitungan
menggunakan presisi penuh; tampilan rupiah maksimal dua desimal.

Nota belum diterima, data modal tidak tersedia untuk akun tersebut, atau pembagi
kosong/nol menampilkan **—**. Data modal yang tidak tersedia tidak dianggap nol.
Kolom ini hanya membaca data; tidak mengirim mutasi, mengubah pembayaran, atau
mengubah hak koreksi owner.

## Pemasangan

Ekstrak ZIP ke root `D:\PROJECT\MANIAC DUREN\maniac-duren`, setelah patch 112.
Tidak ada SQL baru dan tidak perlu menjalankan ulang SQL 112. Dependensi tetap.
Paket berisi enam file baru/berubah:

- `pos/supplier-notes.mjs`: perhitungan modal satuan berdasarkan batch.
- `pos/supplier-notes-ui.mjs`: dua kolom modal dan penjelasan dasar perhitungan.
- `tests/supplier-notes-ui.test.mjs`: data kosong, nol, pecahan, sisa stok,
  pemilihan batch asal, tampilan, dan tidak adanya mutasi.
- `tests/supplier-notes-db.test.mjs`: kecocokan modal setelah koreksi owner dan
  pembagian ongkir pada nota berisi beberapa produk.
- `tests/warehouse-browser.mjs`: angka modal sebelum/sesudah koreksi dan reload,
  menggunakan alur penerimaan/transfer nyata serta variasi lebar dan tema.
- `docs/PATCH-113-MODAL-NOTA-SUPPLIER.md`: panduan ini.

## PowerShell: tes, commit perubahan nota, dan push

Blok berikut untuk terminal dengan prompt **PS**, bukan Git Bash. Skrip berhenti
sebelum commit/push apabila pengujian gagal. Tidak memasang SQL atau melakukan
perubahan pada database produksi. Daftar commit juga mencakup file prasyarat
patch 112, agar perubahan nota yang belum di-commit sebelumnya ikut tersimpan.
File prasyarat tersebut tetap berasal dari ZIP patch 112.

```powershell
& {
    Set-Location -LiteralPath "D:\PROJECT\MANIAC DUREN\maniac-duren" -ErrorAction Stop

    $patchFiles = @(
        "database/README.md",
        "database/supplier-notes-112.sql",
        "docs/PATCH-112-NOTA-SUPPLIER.md",
        "docs/STRUKTUR-PROYEK.md",
        "pos/index.html",
        "pos/warehouse-flow.mjs",
        "pos/warehouse-ui.mjs",
        "pos/warehouse.css",
        "scripts/check-project.mjs",
        "supabase/migrations/20261116112253_supplier_note_payments_112.sql",
        "pos/supplier-notes.mjs",
        "pos/supplier-notes-ui.mjs",
        "tests/supplier-notes-ui.test.mjs",
        "tests/supplier-notes-db.test.mjs",
        "tests/warehouse-browser.mjs",
        "docs/PATCH-113-MODAL-NOTA-SUPPLIER.md"
    )

    foreach ($patchFile in $patchFiles) {
        if (-not (Test-Path -LiteralPath $patchFile -PathType Leaf)) {
            throw "File belum ditemukan: $patchFile. Pastikan patch 112 dan 113 sudah diekstrak."
        }
    }

    $currentBranch = git branch --show-current
    if ($LASTEXITCODE -ne 0) { throw "Gagal membaca branch Git." }
    if ($currentBranch -ne "main") { throw "Branch aktif bukan main: $currentBranch" }

    npm.cmd run verify
    if ($LASTEXITCODE -ne 0) { throw "Verifikasi gagal. Commit dan push belum dijalankan." }
    npm.cmd run test:browser
    if ($LASTEXITCODE -ne 0) { throw "Tes browser gagal. Commit dan push belum dijalankan." }

    git add -- $patchFiles
    if ($LASTEXITCODE -ne 0) { throw "Git add gagal." }
    git diff --cached --stat -- $patchFiles
    if ($LASTEXITCODE -ne 0) { throw "Gagal membaca perubahan." }

    git diff --cached --quiet -- $patchFiles
    $diffExitCode = $LASTEXITCODE
    if ($diffExitCode -eq 1) {
        git commit --only -m "Show supplier note cost per kg and per fruit" -- $patchFiles
        if ($LASTEXITCODE -ne 0) { throw "Commit gagal. Push belum dijalankan." }
    }
    elseif ($diffExitCode -ne 0) {
        throw "Gagal memeriksa perubahan patch."
    }

    git push origin main
    if ($LASTEXITCODE -ne 0) { throw "Push gagal. Periksa pesan Git di atas." }
    git status --short
}
```

Setelah frontend diterbitkan, refresh POS dan buka nota yang sudah diterima.
Pengujian database lokal menggunakan fixture PGlite; tidak menulis data usaha.

## Hasil pemeriksaan

`npm run verify` lulus: pemeriksaan struktur/sintaks, lint, format, dan **181 tes**
tanpa kegagalan. Tes database memastikan angka modal per kg/per butir setelah
koreksi owner serta alokasi ongkir pada nota beberapa produk.

`npm run test:browser` sudah dicoba, tetapi berhenti saat Chromium akan dibuka:
`socket() failed: Operation not permitted`. Alur browser dan tampilan belum
terverifikasi di lingkungan ini; jalankan tes browser pada Windows sebelum push.
Paket belum di-commit, di-push, atau diterbitkan ke situs produksi oleh asisten.

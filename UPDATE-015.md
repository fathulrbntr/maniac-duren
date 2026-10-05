# Update 015 — Karyawan & absensi

Terapkan di atas update 014. Salin file patch ke project. Jalankan `database/015-employees-attendance.sql` di Supabase SQL Editor, lalu muat ulang POS. Jangan reset database. `database/pos.sql` adalah gabungan untuk instalasi baru, bukan file yang perlu dijalankan ulang pada database aktif.

- Kartu karyawan dengan pencarian, filter status, dan pagination.
- Role awal karyawan baru: Staff. Role karyawan lama tetap dipertahankan. Staff memiliki akses absensi; owner dapat mengatur role, cabang, dan izin tambahan.
- Detail/edit nama, tanggal lahir, email, nomor telepon, foto KTP. Foto KTP hanya dapat diambil owner melalui RPC khusus; tidak disertakan dalam daftar umum atau payload jejak aktivitas.
- Satu baris absensi per karyawan per tanggal WIB. Waktu diambil dari server. Check-in pertama tetap; tombol check-in dinonaktifkan sesudah masuk. Check-out berikutnya memperbarui waktu terakhir dalam baris yang sama.
- Duplikat absensi lama digabung menjadi check-in paling awal dan check-out paling akhir. Salinan baris asli disimpan di tabel arsip privat.
- Owner mengatur jam masuk/pulang per cabang pada halaman Absensi. Mendukung jam kerja yang selesai pada hari yang sama. Jadwal disalin saat check-in; perubahan berikutnya tidak mengubah riwayat.
- Rekap pada detail setiap karyawan: bulan ini / minggu ini (Senin sampai hari ini), semua cabang. Hijau untuk masuk tepat waktu, merah untuk masuk terlambat; pulang lebih awal diberi kuning. Tanggal tanpa catatan dan riwayat tanpa jadwal ditandai netral, bukan otomatis dianggap mangkir.

Validasi lokal: test database karyawan/izin/dokumen/jadwal/absensi/migration; regression unit dan operations fresh/upgrade; browser desktop/mobile untuk pencarian, pagination, detail, filter, default Staff, dan form jadwal. Migration belum dijalankan pada Supabase produksi.

```bash
node tests/employees-attendance.test.mjs
node tests/employees-browser.cjs
```
Browser test memerlukan Chromium Playwright, atau `BROWSER_EXECUTABLE` mengarah ke executable Chromium.

```bash
git add pos/app.js pos/index.html pos/operations-ui.mjs pos/retry.mjs pos/employees-ui.mjs pos/employees.css database/015-employees-attendance.sql database/pos.sql scripts/build-database.mjs tests/employees-attendance.test.mjs tests/employees-browser.cjs tests/operations.test.mjs UPDATE-015.md
git commit -m "Update employee UI and daily attendance"
git push
```

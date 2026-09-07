MANIAC DUREN VISUAL EDITOR
===========================

Ini adalah editor lokal berbasis GrapesJS Core (open-source).

PENTING
-------
Jangan buka editor/editor.html dengan double-click file://.
Jalankan project melalui localhost agar index.html dan style.css bisa dibaca oleh editor.

CARA TERMUDAH - VS CODE
-----------------------
1. Buka folder maniac-duren di VS Code.
2. Install extension "Live Server" bila belum ada.
3. Klik kanan index.html -> Open with Live Server.
4. Setelah server aktif, buka:

   http://127.0.0.1:5500/editor/editor.html

   Port bisa berbeda sesuai Live Server kamu.

ALTERNATIF TANPA EXTENSION
--------------------------
Buka terminal di folder project:

python -m http.server 5500

Lalu buka:

http://localhost:5500/editor/editor.html

FITUR
-----
- Preview Desktop
- Preview Tablet
- Preview Mobile
- Klik elemen untuk memilihnya
- Edit ukuran, margin, padding, typography, background, border, posisi
- Layers panel
- Drag block Section / Heading / Text / Image / Button
- Save Draft di localStorage browser
- Reload file index.html + style.css asli
- Export HTML + CSS

EXPORT
------
Tombol "Export HTML + CSS" menghasilkan:

index-edited.html
style-edited.css

File ini TIDAK otomatis menimpa website production.
Review hasil export terlebih dahulu.

Jika sudah sesuai:
1. Backup index.html dan style.css lama.
2. Rename:
   index-edited.html -> index.html
   style-edited.css -> style.css
3. Preview ulang.
4. Commit ke Git.

CATATAN
-------
script.js website production tetap terpisah dan tidak diedit oleh visual editor.
Interaksi JavaScript seperti mobile menu, branch selector, dan Swiper carousel
akan aktif ketika file hasil export dijalankan sebagai website biasa.

Folder assets asli dari project lokal kamu tetap diperlukan.

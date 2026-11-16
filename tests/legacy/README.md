# Modul historis untuk pengujian

Modul offline, page-cache, dan batch versi lama dipindahkan dari `pos/` ke sini karena tidak diimpor aplikasi aktif. Pengujian historis tetap memakai modul ini untuk memastikan kontrak database lama tidak berubah. Folder `tests/` tidak ikut deployment.

Aplikasi aktif memakai mode web online. Jangan mengimpor modul di folder ini ke entry point produksi.

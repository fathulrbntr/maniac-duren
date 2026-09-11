'use strict';
const KEY = 'maniac-duren-menu-draft-v1';
const form = document.querySelector('#product-form');
const status = document.querySelector('#status');
const fields = ['name','category','price','description','image','unit','group','menuType'];
let activeType = 'durian';
document.querySelectorAll('[data-menu-type]').forEach(button=>{button.onclick=()=>{activeType=button.dataset.menuType;if(!editing)form.elements.menuType.value=activeType;render();};});
let items = [], editing = null, ready = false;
const say = message => { status.textContent = message; };
const validImage = value => !value || /^(https?:\/\/|\/(?!\/)|data:image\/(png|jpeg|webp);base64,)/i.test(value);
function validate(data) {
  if (!Array.isArray(data) || data.length > 200) throw new Error('File harus berisi daftar maksimal 200 produk.');
  const ids = new Set();
  return data.map(item => {
    if (!item || typeof item.name !== 'string' || !item.name.trim()) throw new Error('Setiap produk harus memiliki nama.');
    const clean = {};
    fields.filter(key => key !== 'price').forEach(key => { if (item[key] != null && typeof item[key] !== 'string') throw new Error('Format data produk tidak sesuai.'); clean[key] = (item[key] || '').trim(); });
    clean.menuType = MenuLogic.menuType(item.menuType);
    clean.price = MenuLogic.price(item.price);
    clean.unit = ['porsi','kg','paket','box','buah'].includes(clean.unit) ? clean.unit : 'porsi';
    if (!validImage(clean.image)) throw new Error('Gunakan tautan foto http/https, lokasi /assets/, atau unggahan foto.');
    let id = typeof item.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(item.id) ? item.id : crypto.randomUUID();
    if (ids.has(id)) id = crypto.randomUUID(); ids.add(id); clean.id = id; return clean;
  });
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(items)); say('Draf tersimpan di browser. Unduh menu.json untuk memperbarui website.'); }
  catch { say('Penyimpanan browser penuh/tidak tersedia. Draf hanya ada selama halaman ini terbuka. Unduh menu.json sekarang agar perubahan tidak hilang.'); }
  render();
}
function clearForm() {
  editing = null; form.reset(); form.elements.menuType.value=activeType; document.querySelector('#form-title').textContent = 'Tambah produk';
  document.querySelector('#submit').textContent = 'Tambah menu'; document.querySelector('#cancel').hidden = true; preview();
}
function preview() {
  const img = document.querySelector('#photo-preview'); const src = form.elements.image.value.trim(); img.hidden = !src || !validImage(src);
  if (!img.hidden) img.src = src; else img.removeAttribute('src');
}
document.querySelector('#photo-preview').addEventListener('error', () => { document.querySelector('#photo-preview').hidden = true; say('Foto tidak dapat dimuat. Periksa lokasi atau tautan gambar.'); });
function render() {
  const list = document.querySelector('#items'); list.replaceChildren(); document.querySelector('#count').textContent = `(${items.length})`;
  document.querySelectorAll('[data-menu-type]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.menuType===activeType)));
  const visible=items.filter(item=>item.menuType===activeType);
  document.querySelector('#count').textContent=`(${visible.length} / ${items.length})`;
  if (!visible.length) { const p = document.createElement('p'); p.textContent = `Belum ada menu ${MenuLogic.types[activeType].toLowerCase()}. Tambahkan produk pertama Anda.`; list.append(p); }
  visible.forEach(item => {
    const row = document.createElement('article'); row.className = 'item';
    const image = document.createElement('img'); image.alt = item.name; if (item.image) image.src = item.image;
    image.addEventListener('error', () => { image.hidden = true; });
    const info = document.createElement('div'); const name = document.createElement('h3'); name.textContent = item.name;
    const price = document.createElement('p'); price.textContent = item.price === null ? 'Stok Habis' : MenuLogic.money(item.price) + ' / ' + item.unit;
    const actions = document.createElement('div'); actions.className = 'actions';
    const edit = document.createElement('button'); edit.textContent = 'Edit'; edit.setAttribute('aria-label', `Edit ${item.name}`);
    edit.onclick = () => {
      if (editing && !confirm('Ganti produk yang sedang diedit? Isian yang belum disimpan akan dibuang.')) return;
      editing = item.id; fields.forEach(key => { form.elements[key].value = item[key] ?? ''; });
      document.querySelector('#photo').value = ''; document.querySelector('#form-title').textContent = 'Edit produk';
      document.querySelector('#submit').textContent = 'Simpan perubahan'; document.querySelector('#cancel').hidden = false; preview(); form.elements.name.focus();
    };
    const remove = document.createElement('button'); remove.textContent = 'Hapus'; remove.className = 'delete'; remove.setAttribute('aria-label', `Hapus ${item.name}`);
    remove.onclick = () => { if (!confirm(`Hapus ${item.name} dari draf menu?`)) return; items = items.filter(x => x.id !== item.id); if (editing === item.id) clearForm(); save(); };
    actions.append(edit,remove); info.append(name,price,actions); row.append(image,info); list.append(row);
  });
}
form.addEventListener('submit', event => {
  event.preventDefault(); if (!ready) return;
  try {
    const entry = Object.fromEntries(fields.map(key => [key, form.elements[key].value.trim()])); entry.id = editing || crypto.randomUUID();
    const cleaned = validate([entry])[0];
    if (editing) items = items.map(item => item.id === editing ? cleaned : item); else { if (items.length >= 200) throw new Error('Maksimal 200 produk.'); items.push(cleaned); }
    activeType=cleaned.menuType; clearForm(); save();
  } catch(error) { say(error.message); }
});
document.querySelector('#cancel').onclick = clearForm;
form.elements.image.addEventListener('input', preview);
document.querySelector('#photo').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { say('Gunakan PNG, JPG, atau WebP maksimal 2 MB.'); event.target.value = ''; return; }
  const reader = new FileReader(); reader.onload = () => { form.elements.image.value = reader.result; preview(); }; reader.onerror = () => say('Foto gagal dibaca. Pilih ulang foto.'); reader.readAsDataURL(file);
});
document.querySelector('#download').onclick = () => {
  if (!ready) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(items,null,2)], {type:'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = 'menu.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  say('File menu.json diunduh. Ganti menu/menu.json di proyek, lalu deploy agar pengunjung melihat perubahan.');
};
document.querySelector('#import').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file || !ready) return;
  try {
    if (file.size > 25 * 1024 * 1024) throw new Error('File terlalu besar. Maksimal 25 MB.');
    const imported = validate(JSON.parse(await file.text()));
    if (!confirm('Ganti seluruh draf dengan menu dari file ini?')) return;
    items = imported; clearForm(); save();
  } catch(error) { say(`Impor gagal: ${error.message}`); } finally { event.target.value = ''; }
});
async function published() { const response = await fetch('/menu/menu.json',{cache:'no-cache'}); if (!response.ok) throw new Error('Gagal memuat menu publik.'); return validate(await response.json()); }
document.querySelector('#reset').onclick = async () => {
  if (!confirm('Buang draf dan muat ulang menu yang sudah dipublikasikan?')) return;
  try { items = await published(); ready = true; clearForm(); save(); } catch(error) { say(error.message); }
};
(async () => {
  try {
    let draft = null;
    try { draft = localStorage.getItem(KEY); } catch { /* Storage may be disabled. */ }
    if (draft) {
      try { items = validate(MenuLogic.migrate(JSON.parse(draft))); say('Draf browser dimuat. Perubahan belum dipublikasikan.'); }
      catch { items = await published(); say('Draf lama tidak valid. Menu publik dimuat.'); }
    } else { items = await published(); say('Menu publik dimuat. Siap menambah atau mengedit produk.'); }
    ready = true; render();
  } catch { say('Menu gagal dimuat. Pastikan menu/menu.json tersedia, lalu klik Muat ulang menu publik.'); }
})();

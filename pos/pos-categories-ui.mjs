import {itemTypes} from './catalog.mjs?v=59';
import {posMenuEntries} from './pos-menu.mjs?v=52';
export {posProductCards} from './pos-menu.mjs?v=52';
import {escape as e} from './core.mjs?v=9';
import {categoryEligible,categoryName,categoryPayload,posCategories,inPosCategory,posCategoryName,hasPosPrice,savePosCategory} from './pos-categories.mjs?v=52';
const field=(label,html)=>`<label class="field">${label}${html}</label>`;
const sorted=products=>products.slice().sort((a,b)=>a.name.localeCompare(b.name,'id'));
const searchMatch=(p,q)=>[p.name,p.sku,p.barcode,p.variant,p.variantGroupName].join(' ').toLowerCase().includes(q);
const priceNote=p=>(p.stockUnit==='kg_butir'?p.priceKg>0&&p.pricePiece>0:hasPosPrice(p))?'':'<span class="pos-category-price-note">Harga belum diisi</span>';
const productInfo=p=>`<span class="pos-category-product-copy"><b>${e(p.name)}</b><small>${e(p.sku)} · ${e(p.stockUnit)}${p.variant?` · ${e(p.variant)}`:''}</small></span>`;
function categoryChoiceGroups(state,products,selection,kind){
 const row=p=>`<label class="pos-category-product"><input type="checkbox" data-category-${kind}="${e(p.id)}" ${selection.has(p.id)?'checked':''}>${productInfo(p)}${priceNote(p)}${kind==='product'?`<small class="pos-category-other">Kategori lainnya: ${e(posCategoryName(state,p))}</small>`:''}</label>`;
 return posMenuEntries({...state,products}).map(entry=>entry.hasVariants?`<div class="pos-category-choice-group"><label class="pos-category-group-heading"><input type="checkbox" data-category-group="${e(entry.key)}" data-choice-kind="${kind}" ${entry.products.every(p=>selection.has(p.id))?'checked':''}><span><b>${e(entry.name)}</b><small>Pilih semua ${entry.products.length} varian di bawah</small></span></label><div class="pos-category-group-choices">${entry.products.map(row).join('')}</div></div>`:entry.products.map(row).join('')).join('');
}
function syncCategoryGroups(root,state,products,selection){
 const entries=new Map(posMenuEntries({...state,products}).map(entry=>[entry.key,entry]));
 root.querySelectorAll('[data-category-group]').forEach(input=>{const entry=entries.get(input.dataset.categoryGroup);if(!entry)return;const count=entry.products.filter(p=>selection.has(p.id)).length;input.checked=count===entry.products.length;input.indeterminate=count>0&&count<entry.products.length;});
}
export function posCategoryTabs(s){
 const items=[{id:'all',name:'Semua',count:posMenuEntries(s).length},...posCategories(s).map(c=>({...c,count:posMenuEntries(s,c.id).length}))];
 return items.map(c=>`<button type="button" class="order-category ${c.id==='all'?'selected':''}" data-order-category="${e(c.id)}" aria-pressed="${c.id==='all'}">${e(c.name)} <small>${c.count}</small></button>`).join('');
}
const categoryError=err=>{
 const message=err.message||'Penyimpanan kategori gagal.',schemaMissing=err.code==='PGRST202'||['42883','42P01'].includes(err.code);
 return message+(schemaMissing?' · Jalankan database/pos-menu-categories.sql di Supabase, lalu muat ulang POS.':'');
};
export function posCategoryManager(ctx){
 let state=ctx.getState?.()||ctx.state,pendingDelete=null,saving=false;
 const d=ctx.modal('Kelola kategori',`<section data-category-manager-list><p class="muted">Kategori yang sama digunakan di Master Barang, Stok, dan POS. Satu produk dapat masuk ke beberapa kategori. Produk tanpa kategori tetap tersedia di Semua.</p><button type="button" data-create-pos-category class="primary">+ Tambah kategori</button><div class="pos-category-list" data-category-manager-rows></div></section><section data-category-delete-step hidden><h3 data-category-delete-title></h3><p data-category-delete-count></p><p>Kategori ini akan dihapus dari semua outlet. Produk tetap tersedia di <b>Semua</b> dan kategori lainnya. Stok serta data produk tetap tersimpan.</p><button type="button" data-category-delete-back>Kembali ke daftar kategori</button></section>`,'Hapus kategori');
 d.classList.add('pos-category-modal');const submit=d.querySelector('[type="submit"]'),error=message=>d.querySelector('#form-error').textContent=message;
 submit.classList.add('danger');
 function showList(){
  pendingDelete=null;error('');submit.hidden=true;d.querySelector('[data-category-manager-list]').hidden=false;d.querySelector('[data-category-delete-step]').hidden=true;
  d.querySelector('[data-category-manager-rows]').innerHTML=posCategories(state).map(c=>`<div class="pos-category-item"><span><b>${e(c.name)}</b><small>${posMenuEntries(state,c.id).length} produk · ${state.products.filter(p=>categoryEligible(p)&&inPosCategory(state,p,c.id)).length} pilihan/SKU</small></span><div class="pos-category-item-actions"><button type="button" data-edit-pos-category="${e(c.id)}">Kelola produk</button><button type="button" class="pos-category-delete" data-delete-pos-category="${e(c.id)}" aria-label="Hapus kategori ${e(c.name)}">Hapus kategori</button></div></div>`).join('')||'<p class="empty">Belum ada kategori. Seluruh produk jual tetap tampil di Semua.</p>';
  d.querySelectorAll('[data-edit-pos-category]').forEach(b=>b.onclick=()=>{d.close();posCategoryDialog({...ctx,state:ctx.getState?.()||state,categoryId:b.dataset.editPosCategory});});
  d.querySelectorAll('[data-delete-pos-category]').forEach(b=>b.onclick=()=>{
   error('');try{
    const category=posCategories(state).find(c=>c.id===b.dataset.deletePosCategory);
    pendingDelete=categoryPayload(state,{id:crypto.randomUUID(),categoryId:category.id,name:category.name,mode:'delete'});
    d.querySelector('[data-category-delete-title]').textContent=`Hapus kategori “${category.name}”?`;
    d.querySelector('[data-category-delete-count]').textContent=`${posMenuEntries(state,category.id).length} produk · ${state.products.filter(p=>categoryEligible(p)&&inPosCategory(state,p,category.id)).length} pilihan/SKU dalam kategori ini.`;
    d.querySelector('[data-category-manager-list]').hidden=true;d.querySelector('[data-category-delete-step]').hidden=false;submit.hidden=false;submit.disabled=false;
   }catch(err){error(categoryError(err));}
  });
 }
 d.querySelector('[data-create-pos-category]').onclick=()=>{d.close();posCategoryDialog({...ctx,state:ctx.getState?.()||state});};
 d.querySelector('[data-category-delete-back]').onclick=()=>{if(!saving)showList();};
 d.querySelector('form').onsubmit=async ev=>{
  ev.preventDefault();if(!pendingDelete||saving)return;saving=true;submit.disabled=true;error('');
  try{
   if(await ctx.mutate('pos_category_save',pendingDelete,{throwOnError:true})){
    const updated=ctx.getState?.();if(updated)state=updated;else{state=structuredClone(state);savePosCategory(state,pendingDelete);}
    ctx.render(state);d.dataset.dirty='false';showList();ctx.toast('Kategori dihapus. Produk tetap tersedia di Semua.');
   }else error('Penghapusan kategori belum terkonfirmasi. Coba lagi dengan pilihan yang sama.');
  }catch(err){error(categoryError(err));}finally{saving=false;submit.disabled=false;}
 };
 showList();
}
export function posCategoryDialog(ctx){
 let {state,categoryId}=ctx;const {modal,mutate,render,toast}=ctx;
 let category=posCategories(state).find(c=>c.id===categoryId),view=category?'manage':'name',operationId=crypto.randomUUID(),saving=false;
 categoryId ||= crypto.randomUUID();const selected=new Set(),removed=new Set();
 const d=modal('Kelola kategori',`<div class="pos-category-breadcrumb" data-category-breadcrumb></div><section data-category-name-step>${field('Nama kategori',`<input data-category-name value="${e(category?.name||'')}" maxlength="50" required placeholder="Contoh: Paket Hemat">`)}<p class="muted">Kategori tersinkron di Master Barang, Stok, dan POS untuk semua outlet.</p><button type="button" data-category-next class="primary">Lanjut · Tambah produk</button><button type="button" data-category-name-cancel hidden>Kembali ke kategori</button></section><section data-category-members-step hidden><div class="pos-category-selection-head"><div><h3 data-category-title></h3><small data-category-member-count aria-live="polite"></small></div><button type="button" data-category-rename>Ubah nama</button></div><button type="button" data-category-add class="primary">+ Tambah produk dari master</button><h4 class="pos-category-section-title">Produk dalam kategori</h4><div class="pos-category-picker-tools"><label class="pos-category-select-all"><input type="checkbox" data-category-select-all-members><span data-category-select-all-members-label>Pilih semua</span></label></div><div class="pos-category-picker" data-category-members></div><div class="pos-category-remove-tools"><button type="button" data-category-remove disabled>Keluarkan yang dipilih</button><small data-category-remove-count aria-live="polite"></small></div><p class="muted">Produk yang dikeluarkan tetap tersedia di Semua. Data master, stok, dan kategori lainnya tetap tersimpan.</p></section><section data-category-product-step hidden><div class="pos-category-selection-head"><div><h3 data-category-picker-title></h3><small data-category-selection-count aria-live="polite"></small></div><button type="button" data-category-back>Kembali</button></div>${field('Pilih produk dari Master Barang','<input data-category-search type="search" placeholder="Cari nama, varian, SKU, atau barcode…">')}<div class="pos-category-picker-tools"><label class="pos-category-select-all"><input type="checkbox" data-category-select-all-products><span data-category-select-all-products-label>Pilih semua</span></label><button type="button" data-category-clear>Bersihkan pilihan</button></div><p class="muted">Centang produk atau varian yang ingin dimasukkan. Pilih semua mengikuti hasil pencarian. Produk yang sudah ada di kategori ini tidak ditampilkan.</p><div class="pos-category-picker" data-category-picker></div><p class="muted">${e(itemTypes.raw)} dan ${e(itemTypes.prep)} tidak ditampilkan. Produk yang ditambahkan langsung tampil di kategori, termasuk yang belum memiliki harga atau stok. Penjualan aktif setelah harga, stok, dan resep siap.</p></section>`,'Tambahkan ke kategori');
 d.classList.add('pos-category-modal');const submit=d.querySelector('[type="submit"]'),error=message=>d.querySelector('#form-error').textContent=message,dirty=()=>d.dataset.dirty='true';
 const available=()=>sorted(state.products.filter(p=>categoryEligible(p)&&!inPosCategory(state,p,categoryId)));
 const matches=()=>{const q=d.querySelector('[data-category-search]').value.trim().toLowerCase();return available().filter(p=>searchMatch(p,q));};
 const members=()=>sorted(state.products.filter(p=>categoryEligible(p)&&inPosCategory(state,p,categoryId)));
 function syncAll(kind,products,selection,filtered=false){
  const input=d.querySelector(`[data-category-select-all-${kind}]`),count=products.filter(p=>selection.has(p.id)).length;
  input.disabled=!products.length;input.checked=products.length>0&&count===products.length;input.indeterminate=count>0&&count<products.length;
  d.querySelector(`[data-category-select-all-${kind}-label]`).textContent=`Pilih semua${filtered?' hasil pencarian':''} (${products.length})`;
 }
 const updateCount=()=>{d.querySelector('[data-category-selection-count]').textContent=`${selected.size} pilihan/SKU dipilih`;syncAll('products',matches(),selected,!!d.querySelector('[data-category-search]').value.trim());if(view==='add')submit.disabled=!!category&&!selected.size;};
 const drawPicker=()=>{const root=d.querySelector('[data-category-picker]'),rows=matches();root.innerHTML=categoryChoiceGroups(state,rows,selected,'product')||'<p class="empty">Tidak ada produk yang dapat ditambahkan untuk pencarian ini.</p>';syncCategoryGroups(root,state,rows,selected);updateCount();};
 const updateRemoved=()=>{d.querySelector('[data-category-remove]').disabled=!removed.size;d.querySelector('[data-category-remove-count]').textContent=removed.size?`${removed.size} pilihan/SKU dipilih`:'';syncAll('members',members(),removed);};
 const drawMembers=()=>{const rows=members();d.querySelector('[data-category-title]').textContent=category.name;d.querySelector('[data-category-member-count]').textContent=`${posMenuEntries(state,categoryId).length} produk · ${rows.length} pilihan/SKU dari master`;const root=d.querySelector('[data-category-members]');root.innerHTML=categoryChoiceGroups(state,rows,removed,'member')||'<p class="empty">Belum ada produk. Klik Tambah produk dari master.</p>';syncCategoryGroups(root,state,rows,removed);updateRemoved();};
 function show(next){
  view=next;error('');d.querySelector('[data-category-name-step]').hidden=!['name','rename'].includes(view);d.querySelector('[data-category-members-step]').hidden=view!=='manage';d.querySelector('[data-category-product-step]').hidden=view!=='add';
  d.querySelector('[data-category-next]').hidden=view==='rename';d.querySelector('[data-category-name-cancel]').hidden=view!=='rename';submit.hidden=!['add','rename'].includes(view);submit.disabled=false;submit.textContent=view==='rename'?'Simpan nama':category?'Tambahkan ke kategori':'Buat kategori & tambah produk';
  d.querySelector('[data-category-breadcrumb]').textContent=`Kelola kategori${category?` → ${category.name}`:''}${view==='add'?' → Pilih produk dari master':''}`;
  if(view==='manage')drawMembers();if(view==='add'){d.querySelector('[data-category-picker-title]').textContent=`Tambah produk ke ${d.querySelector('[data-category-name]').value}`;drawPicker();}
 }
 d.querySelector('[data-category-next]').onclick=()=>{error('');try{const name=categoryName(d.querySelector('[data-category-name]').value);if(posCategories(state).some(c=>c.id!==categoryId&&c.name.toLowerCase()===name.toLowerCase()))throw Error('Nama kategori sudah digunakan.');d.querySelector('[data-category-name]').value=name;show('add');}catch(err){error(err.message);}};
 d.querySelector('[data-category-add]').onclick=()=>{selected.clear();d.querySelector('[data-category-search]').value='';show('add');};
 d.querySelector('[data-category-back]').onclick=()=>show(category?'manage':'name');
 d.querySelector('[data-category-rename]').onclick=()=>show('rename');
 d.querySelector('[data-category-name-cancel]').onclick=()=>{d.querySelector('[data-category-name]').value=category.name;show('manage');};
 d.querySelector('[data-category-search]').addEventListener('input',drawPicker);
 function toggleChoices(ev,products,selection,root){
  const group=ev.target.closest('[data-category-group]'),input=ev.target.closest('[data-category-product]')||ev.target.closest('[data-category-member]');
  const chosen=group?posMenuEntries({...state,products}).find(e=>e.key===group.dataset.categoryGroup)?.products:input?products.filter(p=>p.id===(input.dataset.categoryProduct||input.dataset.categoryMember)):null;
  if(!chosen)return;for(const p of chosen){if((group||input).checked)selection.add(p.id);else selection.delete(p.id);}
  root.querySelectorAll('[data-category-product],[data-category-member]').forEach(n=>n.checked=selection.has(n.dataset.categoryProduct||n.dataset.categoryMember));syncCategoryGroups(root,state,products,selection);
 }
 d.querySelector('[data-category-picker]').addEventListener('change',ev=>{toggleChoices(ev,matches(),selected,d.querySelector('[data-category-picker]'));dirty();updateCount();});
 function toggleAll(input,products,selection){for(const p of products){if(input.checked)selection.add(p.id);else selection.delete(p.id);}dirty();}
 d.querySelector('[data-category-select-all-products]').addEventListener('change',ev=>{toggleAll(ev.target,matches(),selected);drawPicker();});
 d.querySelector('[data-category-select-all-members]').addEventListener('change',ev=>{toggleAll(ev.target,members(),removed);drawMembers();});
 d.querySelector('[data-category-clear]').onclick=()=>{selected.clear();dirty();drawPicker();};
 d.querySelector('[data-category-members]').addEventListener('change',ev=>{toggleChoices(ev,members(),removed,d.querySelector('[data-category-members]'));dirty();updateRemoved();});
 async function save(mode,productIds){
  if(saving)return;error('');try{
   const payload=categoryPayload(state,{id:operationId,categoryId,name:mode==='rename'||!category?d.querySelector('[data-category-name]').value:category.name,mode,productIds});saving=true;
   if(await mutate('pos_category_save',payload,{throwOnError:true})){
    const updated=ctx.getState?.();if(updated)state=updated;else{state=structuredClone(state);savePosCategory(state,payload);}
    category=posCategories(state).find(c=>c.id===categoryId);operationId=crypto.randomUUID();selected.clear();removed.clear();d.dataset.dirty='false';d.querySelector('[data-category-name]').value=category.name;render(state);show('manage');toast(mode==='add'?'Produk ditambahkan ke kategori':mode==='remove'?'Produk dikeluarkan dari kategori ini':'Nama kategori tersimpan');
   }else error('Perubahan kategori belum terkonfirmasi. Periksa pesan kesalahan, lalu coba lagi.');
  }catch(err){error(categoryError(err));}finally{saving=false;}
 }
 d.querySelector('[data-category-remove]').onclick=()=>removed.size?save('remove',[...removed]):undefined;
 d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();if(view==='name'){d.querySelector('[data-category-next]').onclick();return;}if(view==='rename')await save('rename',[]);else if(view==='add'&&(!category||selected.size))await save('add',[...selected]);};
 show(view);
}

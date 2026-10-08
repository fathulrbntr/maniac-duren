import {posMenuEntries} from './pos-menu.mjs?v=49';
export {posProductCards} from './pos-menu.mjs?v=49';
import {escape as e} from './core.mjs?v=9';
import {categoryEligible,categoryName,categoryPayload,posCategories,inPosCategory,posCategoryName,hasPosPrice,savePosCategory} from './pos-categories.mjs?v=49';
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
 const all=posMenuEntries(s),unassigned=posMenuEntries(s,'unassigned');
 const items=[{id:'all',name:'Semua',count:all.length},...posCategories(s).map(c=>({...c,count:posMenuEntries(s,c.id).length})),...(unassigned.length?[{id:'unassigned',name:'Belum dikategorikan',count:unassigned.length}]:[])];
 return items.map(c=>`<button type="button" class="order-category ${c.id==='all'?'selected':''}" data-order-category="${e(c.id)}" aria-pressed="${c.id==='all'}">${e(c.name)} <small>${c.count}</small></button>`).join('');
}
export function posCategoryManager(ctx){
 const state=ctx.getState?.()||ctx.state,categories=posCategories(state);
 const d=ctx.modal('Kelola kategori POS',`<p class="muted">Pilih kategori, lalu tambahkan produk dari Master Barang. Satu produk dapat tampil di beberapa kategori dengan stok yang sama.</p><button type="button" data-create-pos-category class="primary">+ Tambah kategori</button><div class="pos-category-list">${categories.map(c=>`<div class="pos-category-item"><span><b>${e(c.name)}</b><small>${posMenuEntries(state,c.id).length} produk · ${state.products.filter(p=>categoryEligible(p)&&inPosCategory(state,p,c.id)).length} pilihan/SKU</small></span><button type="button" data-edit-pos-category="${e(c.id)}">Kelola produk</button></div>`).join('')}</div>`);
 d.classList.add('pos-category-modal');d.querySelector('[type="submit"]').hidden=true;
 d.querySelector('[data-create-pos-category]').onclick=()=>{d.close();posCategoryDialog({...ctx,state:ctx.getState?.()||state});};
 d.querySelectorAll('[data-edit-pos-category]').forEach(b=>b.onclick=()=>{d.close();posCategoryDialog({...ctx,state:ctx.getState?.()||state,categoryId:b.dataset.editPosCategory});});
}
export function posCategoryDialog(ctx){
 let {state,categoryId}=ctx;const {modal,mutate,render,toast}=ctx;
 let category=posCategories(state).find(c=>c.id===categoryId),view=category?'manage':'name',operationId=crypto.randomUUID(),saving=false;
 categoryId ||= crypto.randomUUID();const selected=new Set(),removed=new Set();
 const d=modal('Kelola kategori POS',`<div class="pos-category-breadcrumb" data-category-breadcrumb></div><section data-category-name-step>${field('Nama kategori',`<input data-category-name value="${e(category?.name||'')}" maxlength="50" required placeholder="Contoh: Paket Hemat">`)}<p class="muted">Kategori tersedia di semua outlet.</p><button type="button" data-category-next class="primary">Lanjut · Tambah produk</button><button type="button" data-category-name-cancel hidden>Kembali ke kategori</button></section><section data-category-members-step hidden><div class="pos-category-selection-head"><div><h3 data-category-title></h3><small data-category-member-count aria-live="polite"></small></div><button type="button" data-category-rename>Ubah nama</button></div><button type="button" data-category-add class="primary">+ Tambah produk dari master</button><h4 class="pos-category-section-title">Produk dalam kategori</h4><div class="pos-category-picker" data-category-members></div><div class="pos-category-remove-tools"><button type="button" data-category-remove disabled>Keluarkan yang dipilih</button><small data-category-remove-count aria-live="polite"></small></div><p class="muted">Mengeluarkan produk hanya melepasnya dari kategori ini. Produk di master, stok, dan kategori lainnya tetap tersedia.</p></section><section data-category-product-step hidden><div class="pos-category-selection-head"><div><h3 data-category-picker-title></h3><small data-category-selection-count aria-live="polite"></small></div><button type="button" data-category-back>Kembali</button></div>${field('Pilih produk dari Master Barang','<input data-category-search type="search" placeholder="Cari nama, varian, SKU, atau barcode…">')}<div class="pos-category-picker-tools"><button type="button" data-category-select-visible>Pilih hasil pencarian</button><button type="button" data-category-clear>Bersihkan pilihan</button></div><p class="muted">Pilih produk atau varian yang ingin dimasukkan. Gunakan pencarian lalu Pilih hasil pencarian untuk menambahkan seluruh variannya. Pilihan yang sudah ada di kategori ini tidak ditampilkan.</p><div class="pos-category-picker" data-category-picker></div><p class="muted">Bahan baku dan bahan persiapan tidak ditampilkan. Produk yang ditambahkan langsung tampil di kategori, termasuk yang belum memiliki harga atau stok. Penjualan aktif setelah harga, stok, dan resep siap.</p></section>`,'Tambahkan ke kategori');
 d.classList.add('pos-category-modal');const submit=d.querySelector('[type="submit"]'),error=message=>d.querySelector('#form-error').textContent=message,dirty=()=>d.dataset.dirty='true';
 const available=()=>sorted(state.products.filter(p=>categoryEligible(p)&&!inPosCategory(state,p,categoryId)));
 const matches=()=>{const q=d.querySelector('[data-category-search]').value.trim().toLowerCase();return available().filter(p=>searchMatch(p,q));};
 const updateCount=()=>{d.querySelector('[data-category-selection-count]').textContent=`${selected.size} pilihan/SKU dipilih`;if(view==='add')submit.disabled=!!category&&!selected.size;};
 const drawPicker=()=>{const root=d.querySelector('[data-category-picker]'),rows=matches();root.innerHTML=categoryChoiceGroups(state,rows,selected,'product')||'<p class="empty">Tidak ada produk yang dapat ditambahkan untuk pencarian ini.</p>';syncCategoryGroups(root,state,rows,selected);updateCount();};
 const updateRemoved=()=>{d.querySelector('[data-category-remove]').disabled=!removed.size;d.querySelector('[data-category-remove-count]').textContent=removed.size?`${removed.size} pilihan/SKU dipilih`:'';};
 const drawMembers=()=>{const members=sorted(state.products.filter(p=>inPosCategory(state,p,categoryId)));d.querySelector('[data-category-title]').textContent=category.name;d.querySelector('[data-category-member-count]').textContent=`${posMenuEntries(state,categoryId).length} produk · ${members.length} pilihan/SKU dari master`;d.querySelector('[data-category-members]').innerHTML=categoryChoiceGroups(state,members,removed,'member')||'<p class="empty">Belum ada produk. Klik Tambah produk dari master.</p>';updateRemoved();};
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
 d.querySelector('[data-category-select-visible]').onclick=()=>{matches().forEach(p=>selected.add(p.id));dirty();drawPicker();};
 d.querySelector('[data-category-clear]').onclick=()=>{selected.clear();dirty();drawPicker();};
 d.querySelector('[data-category-members]').addEventListener('change',ev=>{toggleChoices(ev,state.products.filter(p=>inPosCategory(state,p,categoryId)),removed,d.querySelector('[data-category-members]'));updateRemoved();});
 async function save(mode,productIds){
  if(saving)return;error('');try{
   const payload=categoryPayload(state,{id:operationId,categoryId,name:mode==='rename'||!category?d.querySelector('[data-category-name]').value:category.name,mode,productIds});saving=true;
   if(await mutate('pos_category_save',payload)){
    const updated=ctx.getState?.();if(updated)state=updated;else{state=structuredClone(state);savePosCategory(state,payload);}
    category=posCategories(state).find(c=>c.id===categoryId);operationId=crypto.randomUUID();selected.clear();removed.clear();d.dataset.dirty='false';d.querySelector('[data-category-name]').value=category.name;render();show('manage');toast(mode==='add'?'Produk ditambahkan ke kategori':mode==='remove'?'Produk dikeluarkan dari kategori ini':'Nama kategori tersimpan');
   }
  }catch(err){error(err.message);}finally{saving=false;}
 }
 d.querySelector('[data-category-remove]').onclick=()=>removed.size?save('remove',[...removed]):undefined;
 d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();if(view==='name'){d.querySelector('[data-category-next]').onclick();return;}if(view==='rename')await save('rename',[]);else if(view==='add'&&(!category||selected.size))await save('add',[...selected]);};
 show(view);
}

import {productPhoto} from './product-photos.mjs?v=65';
import {posCategories,inPosCategory,posCategoryName} from './pos-categories.mjs?v=52';
import {posCategoryManager,posCategoryDialog} from './pos-categories-ui.mjs?v=65';
import {showWeighingHistory} from './receipt-weighing.mjs?v=19';
import {escape as e,money,num,today} from './core.mjs?v=9';
import {productDefaults,itemTypes,isMaterial,isLegacyStock} from './catalog.mjs?v=59';
import {availableStock,menuStatus} from './order-stock.mjs?v=12';
const icons={search:'M21 21l-5-5 M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16',list:'M8 5h13 M8 12h13 M8 19h13 M3 5h.01 M3 12h.01 M3 19h.01',grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',box:'M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10',plus:'M12 5v14 M5 12h14',reset:'M3 11a9 9 0 1 1 2 7 M3 4v7h7',arrow:'M5 12h14 M13 6l6 6-6 6'};
const icon=k=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[k]}"/></svg>`;
const options=(values,selected)=>values.map(([key,label])=>`<option value="${e(key)}" ${key===selected?'selected':''}>${e(label)}</option>`).join('');
const amount=p=>isMaterial(p)?null:isLegacyStock(p)?p.priceKg:p.salePrice;
function entries(state,store,mode){
 const available=availableStock(state,store,today());
 return (state.products||[]).map(p=>({...productDefaults(p),...(isMaterial(p)?{category:null}:{})})).filter(p=>mode!=='stock'||p.itemType!=='recipe').map(p=>{
  const dual=isLegacyStock(p),lots=(dual?state.lots:state.unitLots)||[];
  const own=lots.filter(l=>l.storeId===store&&l.productId===p.id);
  const qty=own.reduce((n,l)=>n+Number(dual?l.kg:l.qty),0),pieces=own.reduce((n,l)=>n+Number(l.pieces||0),0);
  const usable=dual?own.reduce((n,l)=>n+Math.max(0,available.get('lot:'+l.id)?.qty||0),0):Math.max(0,available.get('product:'+p.id)?.qty||0);
  const availablePieces=dual?own.reduce((n,l)=>n+Math.max(0,available.get('lot:'+l.id)?.pieces||0),0):0;
  const menu=p.itemType==='recipe'?menuStatus(state,store,p,[],today()):null;
  const ready=menu?menu.ok:usable>0&&(!dual||availablePieces>0);
  return {p,qty,pieces,usable,availablePieces,ready,menu,own,expired:own.some(l=>l.expiry&&l.expiry<today()&&Number(l.qty)>0)};
 });
}
function filtered(rows,f,state){
 const q=(f.query||'').toLowerCase().trim();
 const category=posCategories(state).some(c=>c.id===f.category)?f.category:'';
 return rows.filter(({p,ready,expired})=>(!q||[p.name,p.variantGroupName,p.sku,p.variant,p.barcode].join(' ').toLowerCase().includes(q))&&(!f.itemType||p.itemType===f.itemType)&&(!category||inPosCategory(state,p,category))&&(!f.status||(f.status==='ready'?ready:!ready))&&(!f.expired||expired)&&(!f.minPrice||(amount(p)!=null&&Number(amount(p))>=Number(f.minPrice)))&&(!f.maxPrice||(amount(p)!=null&&Number(amount(p))<=Number(f.maxPrice)))).sort((a,b)=>f.sort==='za'?b.p.name.localeCompare(a.p.name,'id'):f.sort==='price-low'?(amount(a.p)??Infinity)-(amount(b.p)??Infinity):f.sort==='price-high'?(amount(b.p)??-Infinity)-(amount(a.p)??-Infinity):a.p.name.localeCompare(b.p.name,'id'));
}
function leafCards(rows,mode,state){return rows.map(({p,qty,pieces,usable,availablePieces,ready,menu,expired,own})=>{
 const dual=isLegacyStock(p),price=amount(p),unit=p.stockUnit,variant=p.variantOptions?.length?p.variantOptions.map(o=>o.value).join(' / '):p.variant;
 const stock=menu?'Dibuat sesuai pesanan':`${num(qty)} ${dual?'kg':e(unit)}${dual?` · ${num(pieces)} butir`:''}`;
 return `<article class="inv-card"><div class="inv-photo">${productPhoto(p)?`<img src="${e(productPhoto(p))}" alt="" loading="lazy">`:`<span>${icon('box')}</span>`}</div><div class="inv-copy"><h3>${e(p.name)}</h3><div class="inv-meta"><span data-product-categories>${e(posCategoryName(state,p))}</span><span>${e(p.sku)}</span>${variant?`<span class="inv-variant">${e(variant)}</span>`:''}</div><p class="inv-stockline">${icon('box')} ${stock} <span class="inv-status ${ready?'':'is-empty'}">${ready?'Tersedia':'Belum tersedia'}</span>${expired?'<span class="inv-expired">Ada kedaluwarsa</span>':''}</p><small>${e(itemTypes[p.itemType]||p.itemType)}</small></div><div class="inv-metric"><span>${mode==='stock'?'TERSEDIA DIPAKAI':'HARGA JUAL'}</span><strong>${mode==='stock'?`${num(usable)} ${dual?'kg':e(unit)}`:priceRange([p],amount).label}</strong><small>${mode==='stock'?(dual?`${num(availablePieces)} butir`:'Setelah cadangan pesanan'):isMaterial(p)?'Bahan internal':dual?`${priceRange([p],p=>p.pricePiece).label} / butir`:`${price==null?'Belum diisi':'/ '+e(unit)}`}</small></div><div class="inv-metric inv-secondary"><span>${mode==='stock'?'ASAL STOK':'HARGA BELI'}</span><strong>${mode==='stock'?`${own.filter(l=>Number(dual?l.kg:l.qty)>0).length} penerimaan`:priceRange([p],p=>p.buyPrice,true).label}</strong><small>${mode==='stock'?'Detail lot & supplier':p.buyPrice==null?'Tidak tersedia':`Referensi / ${dual?'kg':e(unit)}`}</small></div><button class="inv-more" type="button" ${mode==='products'?`data-edit-product="${e(p.id)}"`:`data-stock-detail="${e(p.id)}"`} aria-label="${mode==='products'?'Edit':'Detail stok'} ${e(p.name)}" title="${mode==='products'?'Edit produk':'Detail stok'}">${mode==='products'?'•••':icon('arrow')}</button></article>`;
}).join('')||'<div class="inv-empty">Tidak ada item yang sesuai.<br><small>Coba kata kunci lain atau reset filter.</small></div>';}
function priceRange(products, value, allowZero=false) {
 const values=products.map(value).filter(v=>v!==null&&v!==undefined&&v!=='').map(Number).filter(n=>Number.isFinite(n)&&(allowZero?n>=0:n>0));
 if(!values.length)return {label:'—',missing:products.length};
 const low=Math.min(...values),high=Math.max(...values);
 return {label:low===high?money(low):`${money(low)} – ${money(high)}`,missing:products.length-values.length};
}
function summaryPrices(group) {
 const products=group.map(row=>row.p),p=products[0],dual=isLegacyStock(p),material=isMaterial(p);
 const sale=priceRange(products,amount),buy=priceRange(products,p=>p.buyPrice,true);
 const unit=dual?'kg':p.stockUnit;
 const missing=(range)=>range.missing?(range.missing===products.length?'Belum diisi':`${range.missing} harga belum diisi`):'';
 const saleNote=material?'Bahan internal':dual?`${priceRange(products,p=>p.pricePiece).label} / butir`:`/ ${unit}`;
 return `<span class="inv-summary-prices"><span class="inv-summary-metric" data-card-sale><span>HARGA JUAL${dual?' / KG':''}</span><strong>${e(sale.label)}</strong><small>${e(saleNote)}</small>${!material&&missing(sale)?`<small>${e(missing(sale))}</small>`:''}</span><span class="inv-summary-metric" data-card-buy><span>HARGA BELI</span><strong>${e(buy.label)}</strong><small>Referensi / ${e(unit)}</small>${missing(buy)?`<small>${e(missing(buy))}</small>`:''}</span></span>`;
}
function cards(rows,mode,state){
 if(mode!=='products')return leafCards(rows,mode,state);
 const groups=new Map(),totals=new Map();
 for(const p of state.products)if(p.variantGroupId)totals.set(p.variantGroupId,(totals.get(p.variantGroupId)||0)+1);
 for(const row of rows){const key=row.p.variantGroupId?'group:'+row.p.variantGroupId:'product:'+row.p.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 return [...groups.values()].map(group=>{
  const p=group[0].p,total=totals.get(p.variantGroupId)||1,grouped=!!p.variantGroupId&&total>1;
  const title=grouped?p.variantGroupName:p.name;
  const subtitle=grouped?`${group.length===total?total:`${group.length} dari ${total}`} varian`:'Belum memiliki varian';
  const categoryNames=posCategories(state).filter(c=>group.some(row=>inPosCategory(state,row.p,c.id))).map(c=>c.name).join(' · ')||'Semua';
  // The thumbnail follows the first row actually shown after sorting/filtering.
  const photo=productPhoto(p)?`<img src="${e(productPhoto(p))}" alt="" loading="lazy" decoding="async">`:`<span>${icon('box')}</span>`;
  const action=grouped?'<span class="variant-tag">Lihat varian</span>':`<button type="button" class="inv-add-first-variant" data-add-product-variant="${e(p.id)}" aria-label="Tambah varian ${e(p.name)}">+ Tambah varian</button>`;
  const detailRows=!grouped&&p.variantGroupId?group.map(row=>({...row,p:{...row.p,variant:'',variantOptions:[]}})):group;
  return `<article class="inv-catalog-card ${grouped?'has-variants':'no-variants'}" data-catalog-product="${e(p.id)}"><details class="inv-variant-group"><summary aria-label="${grouped?'Lihat varian':'Lihat detail'} ${e(title)}"><span class="inv-summary-photo">${photo}</span><span class="inv-summary-copy"><b>${e(title)}</b><small>${e(itemTypes[p.itemType])} · ${subtitle}</small><small class="inv-summary-categories" data-product-categories>${e(categoryNames)}</small></span>${summaryPrices(group)}${action}</summary><div class="variant-group-actions">${grouped?`<button type="button" data-add-variant="${e(p.variantGroupId)}">+ Tambah varian</button>`:''}<small>${grouped?'Pilih Edit pada varian':'Pilih Edit pada barang'} untuk mengubah harga, SKU, barcode, atau foto.</small></div><div class="variant-group-items">${leafCards(detailRows,mode,state)}</div></details></article>`;
 }).join('')||leafCards([],mode,state);
}
export function inventoryPanel(state,store,filter={},mode='products'){
 const rows=entries(state,store,mode),shown=filtered(rows,filter,state),cats=posCategories(state);
 const selectedCategory=cats.some(c=>c.id===filter.category)?filter.category:'';
 return `<section class="inventory-workspace" data-inventory-mode="${mode}"><div class="inv-toolbar"><div class="inv-heading"><h2>${mode==='stock'?'Stok':'Master Barang'}</h2><span class="inv-total">${rows.length} item</span></div><label class="inv-search">${icon('search')}<input form="catalog-filter" name="query" type="search" value="${e(filter.query||'')}" placeholder="Cari nama, SKU atau barcode…" aria-label="Cari produk"></label><div class="inv-view" role="group" aria-label="Tampilan produk">${['list','grid'].map(v=>`<button type="button" data-inv-view="${v}" class="${(filter.layout||'list')===v?'selected':''}" aria-pressed="${(filter.layout||'list')===v}" aria-label="Tampilan ${v==='list'?'daftar':'grid'}">${icon(v)}</button>`).join('')}</div>${mode==='stock'?'<button type="button" id="movement" class="inv-transfer">Transfer</button>':''}<button type="button" class="inv-add" id="${mode==='stock'?'add-receipt':'add-catalog-product'}">${icon('plus')}${mode==='stock'?'Barang masuk':'Tambah barang'}</button></div><div class="inv-layout"><aside class="inv-filters"><form id="catalog-filter"><div class="inv-filter-section"><span class="inv-label">KETERSEDIAAN</span><div class="inv-status-filters">${[['','Semua'],['ready','Tersedia'],['empty','Belum tersedia']].map(([key,label])=>`<button type="button" data-inv-status="${key}" class="${(filter.status||'')===key?'selected':''}" aria-pressed="${(filter.status||'')===key}">${label}<b>${key===''?rows.length:rows.filter(x=>key==='ready'?x.ready:!x.ready).length}</b></button>`).join('')}</div></div><label class="inv-filter-section"><span class="inv-label">JENIS ITEM</span><select name="itemType"><option value="">Semua jenis item</option>${options(Object.entries(itemTypes).filter(([k])=>mode!=='stock'||k!=='recipe'),filter.itemType)}</select></label><label class="inv-filter-section"><span class="inv-label">URUTKAN</span><select name="sort">${options([['az','Nama: A–Z'],['za','Nama: Z–A'],['price-low','Harga jual terendah'],['price-high','Harga jual tertinggi']],filter.sort||'az')}</select></label><div class="inv-filter-section inv-shared-categories"><label><span class="inv-label">KATEGORI</span><select name="category"><option value="">Semua</option>${options(cats.map(c=>[c.id,c.name]),selectedCategory)}</select></label><small>Kategori yang sama dengan POS. Satu produk dapat masuk beberapa kategori.</small>${!state.access||state.access.master?'<div class="inv-category-actions"><button type="button" data-inventory-category-add>+ Tambah kategori</button><button type="button" data-inventory-category-manage>Kelola kategori</button></div>':''}</div><label class="inv-filter-section inv-check"><input type="checkbox" name="expired" ${filter.expired?'checked':''}><span>Ada stok kedaluwarsa</span></label><div class="inv-filter-section"><span class="inv-label">HARGA JUAL / ${mode==='stock'?'SATUAN':'KG ATAU SATUAN'}</span><label class="inv-price"><span>Rp</span><input type="number" min="0" step="any" name="minPrice" value="${e(filter.minPrice||'')}" placeholder="Harga minimum" aria-label="Harga minimum"></label><label class="inv-price"><span>Rp</span><input type="number" min="0" step="any" name="maxPrice" value="${e(filter.maxPrice||'')}" placeholder="Harga maksimum" aria-label="Harga maksimum"></label></div><button type="button" class="inv-reset" data-inv-reset>${icon('reset')}Reset filter</button></form></aside><div class="inv-content"><div class="inv-context"><span>${e((state.stores||[]).find(s=>s.id===store)?.name||'Pilih toko')}</span><span data-inv-count>${shown.length} dari ${rows.length} item</span></div><div class="inv-results ${filter.layout==='grid'?'is-grid':''}">${cards(shown,mode,state)}</div><p class="inv-footnote">${mode==='stock'?'Stok fisik termasuk barang belum siap dan kedaluwarsa. Tersedia dipakai menghitung tanggal, kondisi buah, kedaluwarsa, serta cadangan pesanan.':`Harga jual berlaku di semua toko. Harga beli merupakan referensi, bukan HPP. Ketersediaan ${e(itemTypes.recipe)} mengikuti bahan siap pakai.`}</p></div></div></section>`;
}
export function bindInventory(state,store,filter,mode,ctx){
 const root=document.querySelector('.inventory-workspace');if(!root)return;
 const rows=entries(state,store,mode),form=root.querySelector('form');
 const draw=()=>{const shown=filtered(rows,filter,state);root.querySelector('.inv-results').innerHTML=cards(shown,mode,state);root.querySelector('[data-inv-count]').textContent=`${shown.length} dari ${rows.length} item`;root.querySelectorAll('[data-inv-status]').forEach(b=>{const active=b.dataset.invStatus===(filter.status||'');b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});};
 const update=()=>{const f=Object.fromEntries(new FormData(form));Object.assign(filter,f,{expired:form.elements.expired.checked});draw();};
 form.onsubmit=ev=>{ev.preventDefault();update();};
 root.querySelectorAll('input,select').forEach(el=>el.addEventListener(el.tagName==='SELECT'||el.type==='checkbox'?'change':'input',update));
 root.addEventListener('click',ev=>{
  const manage=ev.target.closest('[data-inventory-category-manage]'),add=ev.target.closest('[data-inventory-category-add]');
  if(manage||add){
   if(state.access&&!state.access.master)return;
   const categoryContext={...ctx,state:ctx.getState?.()||state};
   if(manage)posCategoryManager(categoryContext);else posCategoryDialog(categoryContext);
   return;
  }
  const status=ev.target.closest('[data-inv-status]');if(status){filter.status=status.dataset.invStatus;draw();}
  const layout=ev.target.closest('[data-inv-view]');if(layout){filter.layout=layout.dataset.invView;root.querySelector('.inv-results').classList.toggle('is-grid',filter.layout==='grid');root.querySelectorAll('[data-inv-view]').forEach(b=>{const active=b===layout;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});}
  if(ev.target.closest('[data-inv-reset]')){for(const k of Object.keys(filter))if(k!=='layout')delete filter[k];form.reset();root.querySelectorAll('input').forEach(i=>{if(i.type==='checkbox')i.checked=false;else i.value='';});form.elements.itemType.value='';form.elements.category.value='';form.elements.sort.value='az';draw();}
  const firstVariant=ev.target.closest('[data-add-product-variant]');if(firstVariant){ev.preventDefault();ctx.addProductVariant?.(firstVariant.dataset.addProductVariant);return;}
  const addVariant=ev.target.closest('[data-add-variant]');if(addVariant)ctx.addVariant?.(addVariant.dataset.addVariant);
  const edit=ev.target.closest('[data-edit-product]');if(edit)ctx.edit(edit.dataset.editProduct);
  const detail=ev.target.closest('[data-stock-detail]');if(detail){const {p,own}=rows.find(x=>x.p.id===detail.dataset.stockDetail),dual=isLegacyStock(p);const d=ctx.modal('Stok '+e(p.name),`<p>${e(itemTypes[p.itemType])} · ${e(p.sku)}</p><p>Kategori: ${e(posCategoryName(state,p))}</p><div class="table-wrap"><table><thead><tr><th>Tanggal / lot</th><th>Supplier / asal</th><th>Sisa fisik</th><th>Kondisi / kedaluwarsa</th></tr></thead><tbody>${own.map(l=>`<tr><td>${e(l.date)}<small>${e(l.id)}</small></td><td>${e((state.suppliers||[]).find(s=>s.id===l.supplierId)?.name||l.kind||'—')}</td><td>${dual?`${num(l.kg)} kg / ${num(l.pieces)} butir`:`${num(l.qty)} ${e(p.stockUnit)}`}</td><td>${dual?e(({ready:'Matang / siap jual',unripe:'Belum matang',unsorted:'Belum disortir',reject:'Reject'})[l.quality]||l.quality||'—'):e(l.expiry||'Tanpa tanggal')}<small>${e(l.note||'')}</small>${l.weighings?.length?`<button type="button" data-weigh-log="${e(l.id)}">Riwayat timbang</button>`:''}</td></tr>`).join('')||'<tr><td colspan="4">Belum ada penerimaan di toko ini.</td></tr>'}</tbody></table></div>`);d.querySelector('[type=submit]').hidden=true;d.querySelectorAll('[data-weigh-log]').forEach(b=>b.onclick=()=>showWeighingHistory(own.find(l=>l.id===b.dataset.weighLog),ctx));}
 });
}

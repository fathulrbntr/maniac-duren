import {escape as e,money,today} from './core.mjs?v=9';
import {posVisible,posCategoryIds,posCategories,hasPosPrice,posProductStatus} from './pos-categories.mjs?v=52';

export const menuKey=p=>p.variantGroupId?'group:'+p.variantGroupId:'product:'+p.id;
export const variantLabel=p=>p.variantOptions?.length?p.variantOptions.map(o=>`${o.name}: ${o.value}`).join(' · '):p.variant||p.name;
const compare=(a,b)=>a.name.localeCompare(b.name,'id',{numeric:true})||a.id.localeCompare(b.id);
export function posMenuEntries(state,category='all',query=''){
 const groups=new Map(),q=query.trim().toLowerCase();
 for(const p of state.products){
  if(!posVisible(p))continue;
  const ids=posCategoryIds(state,p);
  if(category!=='all'&&!ids.includes(category))continue;
  const key=menuKey(p);
  if(!groups.has(key))groups.set(key,{key,name:p.variantGroupId?(p.variantGroupName||p.name):p.name,hasVariants:!!p.variantGroupId||!!String(p.variant||'').trim()||!!p.variantOptions?.length,products:[]});
  groups.get(key).products.push(p);
 }
 return [...groups.values()].map(entry=>({...entry,products:entry.products.sort(compare)})).filter(entry=>!q||entry.name.toLowerCase().includes(q)||entry.products.some(p=>[p.name,p.sku,p.barcode,p.variant,variantLabel(p)].join(' ').toLowerCase().includes(q))).sort((a,b)=>a.name.localeCompare(b.name,'id',{numeric:true})||a.key.localeCompare(b.key));
}
export function posEntryStatus(state,store,entry,draft=[]){
 const statuses=entry.products.map(p=>posProductStatus(state,store,p,draft,today()));
 if(!entry.hasVariants)return statuses[0];
 const ready=statuses.filter(x=>x.ok).length;
 return {ok:ready>0,reason:ready?`${ready} dari ${entry.products.length} varian siap dijual`:statuses.every(x=>x.reason===statuses[0]?.reason)?statuses[0]?.reason:'Semua varian belum siap dijual'};
}
export function posPriceLabel(p){
 if(p.stockUnit==='kg_butir')return `${money(p.priceKg)} / kg · ${money(p.pricePiece)} / butir`;
 return hasPosPrice(p)?`${money(p.salePrice)} / ${p.stockUnit||'pcs'}`:'Harga belum diisi';
}
function entryPrice(entry){
 if(!entry.hasVariants)return posPriceLabel(entry.products[0]);
 const range=(values,unit)=>{const positive=values.map(Number).filter(x=>Number.isFinite(x)&&x>0);if(!positive.length)return '';const low=Math.min(...positive),high=Math.max(...positive);return `${money(low)}${low!==high?' – '+money(high):''} / ${unit}`;};
 if(entry.products[0].stockUnit==='kg_butir')return [range(entry.products.map(p=>p.priceKg),'kg'),range(entry.products.map(p=>p.pricePiece),'butir')].filter(Boolean).join(' · ')||'Harga belum diisi';
 return range(entry.products.map(p=>p.salePrice),entry.products[0].stockUnit||'pcs')||'Harga belum diisi';
}
const entryCategories=(s,entry)=>[...new Set(entry.products.flatMap(p=>posCategoryIds(s,p)))];
const entryCategoryName=(s,entry)=>{const ids=entryCategories(s,entry);return posCategories(s).filter(c=>ids.includes(c.id)).map(c=>c.name).join(' · ')||'Semua';};
export function posProductCards(s,store,draft=[]){
 return posMenuEntries(s).map(entry=>{
  const status=posEntryStatus(s,store,entry,draft),photo=entry.products.find(p=>p.photo)?.photo,ids=entryCategories(s,entry),p=entry.products[0];
  return `<button type="button" class="order-product ${entry.hasVariants?'order-product-variants':''}" ${!entry.hasVariants&&!status.ok?'disabled':''} title="${e(status.reason)}" data-menu-key="${e(entry.key)}" ${entry.hasVariants?`data-order-group="${e(p.variantGroupId||p.id)}" aria-haspopup="dialog"`:`data-order-add="${e(p.id)}"`} data-categories="${e(['all',...ids].join(' '))}"><span class="order-product-photo">${photo?`<img src="${e(photo)}" alt="" loading="lazy">`:`<span>${e(entry.name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase())}</span>`}</span><span class="order-product-info"><span class="order-product-category">${e(entryCategoryName(s,entry))}</span><strong>${e(entry.name)}</strong>${entry.hasVariants?`<span class="order-variant-count">${entry.products.length} pilihan varian</span>`:''}<span class="order-product-price">${e(entryPrice(entry))}</span></span><span class="order-stock-status">${e(status.reason)}</span><span class="order-product-add" aria-hidden="true">${entry.hasVariants?'›':'+'}</span></button>`;
 }).join('')||'<div class="empty">Belum ada produk jual di Master Barang.</div>';
}
// Filtering and cart/stock updates keep the existing card images in place.
export function updatePosCards(root,state,store,draft,category='all',query=''){
 const entries=new Map(posMenuEntries(state,category,query).map(entry=>[entry.key,entry]));
 root.querySelectorAll('[data-menu-key]').forEach(card=>{
  const entry=entries.get(card.dataset.menuKey);card.hidden=!entry;if(!entry)return;
  const status=posEntryStatus(state,store,entry,draft);card.disabled=!entry.hasVariants&&!status.ok;card.title=status.reason;
  card.querySelector('.order-stock-status').textContent=status.reason;
  card.querySelector('.order-product-price').textContent=entryPrice(entry);
  card.querySelector('.order-product-category').textContent=entryCategoryName(state,entry);
  const count=card.querySelector('.order-variant-count');if(count)count.textContent=`${entry.products.length} pilihan varian`;
 });
 return entries.size;
}
const choiceSnapshot=p=>JSON.stringify([p.id,p.name,p.sku,p.stockUnit,p.itemType,p.salePrice,p.priceKg,p.pricePiece,p.variantGroupId,p.variantGroupName,p.variant,p.variantOptions]);
export function posVariantDialog({key,category='all',getState,getDraft,store,modal,onConfirm}){
 const initial=posMenuEntries(getState(),category).find(entry=>entry.key===key);
 if(!initial?.hasVariants)return null;
 const d=modal('Pilih varian',`<div class="pos-variant-heading"><h3>${e(initial.name)}</h3><p class="muted">Pilih varian yang akan dijual, lalu konfirmasi.</p></div><div class="pos-variant-options" data-sale-variants role="radiogroup" aria-label="Pilihan varian"></div><div class="pos-variant-confirmation" data-variant-confirmation aria-live="polite">Belum ada varian dipilih.</div>`,'Tambah ke pesanan');
 d.classList.add('pos-sale-variant-modal');const submit=d.querySelector('[type="submit"]');let selected='',snapshot='',confirming=false,completed=false;
 // Selecting an option is temporary; cancel can dismiss it without a save warning.
 for(const event of ['input','change'])d.addEventListener(event,()=>d.dataset.dirty='false');
 const error=message=>d.querySelector('#form-error').textContent=message;
 const current=()=>{const state=getState();return {state,entry:posMenuEntries(state,category).find(entry=>entry.key===key)};};
 function updateConfirmation(entry){
  const product=entry?.products.find(p=>p.id===selected);submit.disabled=!product;
  submit.textContent=product?.stockUnit==='kg_butir'?'Konfirmasi · Isi berat buah':'Konfirmasi · Tambah ke pesanan';
  d.querySelector('[data-variant-confirmation]').textContent=product?`${product.name} · ${posPriceLabel(product)}`:'Belum ada varian dipilih.';
 }
 function refresh(){
  if(completed||d.closed||d.open===false)return;
  const {state,entry}=current();const product=entry?.products.find(p=>p.id===selected);
  if(selected){
   let reason='';
   if(!product)reason='Varian sudah tidak tersedia dalam kategori ini.';
   else if(choiceSnapshot(product)!==snapshot)reason='Data atau harga varian berubah. Pilih kembali untuk konfirmasi.';
   else{const status=posProductStatus(state,store,product,getDraft(),today());if(!status.ok)reason=status.reason;}
   if(reason){selected='';snapshot='';error(reason);}
  }
  d.querySelector('[data-sale-variants]').innerHTML=entry?.products.map(p=>{const status=posProductStatus(state,store,p,getDraft(),today());return `<label class="pos-sale-variant ${status.ok?'':'is-unavailable'}"><input type="radio" name="saleVariant" value="${e(p.id)}" data-sale-variant="${e(p.id)}" ${selected===p.id?'checked':''} ${status.ok?'':'disabled'}><span class="pos-sale-variant-copy"><b>${e(variantLabel(p))}</b><small>${e(p.name)}</small><small>${e(p.sku)}</small><span class="pos-sale-variant-status">${e(status.reason)}</span></span><strong class="pos-sale-variant-price">${e(posPriceLabel(p))}</strong></label>`;}).join('')||'<p class="empty">Produk sudah tidak tersedia dalam kategori ini.</p>';
  updateConfirmation(entry);
 }
 d.querySelector('[data-sale-variants]').addEventListener('change',ev=>{
  const input=ev.target.closest('[data-sale-variant]');if(!input||input.disabled)return;
  const {state,entry}=current(),product=entry?.products.find(p=>p.id===input.dataset.saleVariant);
  if(!product){refresh();return;}const status=posProductStatus(state,store,product,getDraft(),today());if(!status.ok){error(status.reason);refresh();return;}
  selected=product.id;snapshot=choiceSnapshot(product);error('');refresh();
 });
 d.querySelector('form').onsubmit=async ev=>{
  ev.preventDefault();if(confirming||completed)return;if(!selected){error('Pilih varian terlebih dahulu.');return;}
  refresh();if(!selected)return;
  const {entry}=current(),product=entry?.products.find(p=>p.id===selected);if(!product)return;
  confirming=true;submit.disabled=true;
  try{if(await onConfirm(product)){completed=true;d.close();}}
  catch(err){error(err.message);}
  finally{confirming=false;if(!completed)refresh();}
 };
 refresh();return {dialog:d,refresh};
}

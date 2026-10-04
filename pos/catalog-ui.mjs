import {categories,itemTypes,stockUnits,productDefaults,isMaterial,isLegacyStock,normalizeProduct} from './catalog.mjs?v=3';
import {escape as e,money,id} from './core.mjs?v=3';
const choice=(values,selected)=>Object.entries(values).map(([key,label])=>`<option value="${e(key)}" ${key===selected?'selected':''}>${e(label)}</option>`).join('');
const label=(text,input)=>`<div class="field"><label>${text}${input}</label></div>`;
export function catalogPanel(products,filter={},state={},store=''){
 const qty=value=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:6}).format(value);
 const stock=p=>{if(!store)return '—';const lots=(isLegacyStock(p)?state.lots:state.unitLots)||[];const own=lots.filter(l=>l.productId===p.id&&l.storeId===store);return isLegacyStock(p)?`${qty(own.reduce((n,l)=>n+l.kg,0))} kg<br>${qty(own.reduce((n,l)=>n+l.pieces,0))} butir`:qty(own.reduce((n,l)=>n+l.qty,0));};
 const rows=products.map(productDefaults).filter(p=>(!filter.category||p.category===filter.category)&&(!filter.itemType||p.itemType===filter.itemType)&&(!filter.query||`${p.name} ${p.sku}`.toLowerCase().includes(filter.query.toLowerCase())));
 return `<section class="panel"><div class="header-row"><h3>Produk & bahan</h3><button class="primary small" id="add-catalog-product">Tambah item</button></div>
 <form id="catalog-filter" class="filters">${label('Cari nama / SKU',`<input name="query" value="${e(filter.query||'')}" placeholder="Cari produk atau bahan">`)}${label('Kategori jual',`<select name="category"><option value="">Semua kategori</option>${choice(Object.fromEntries(categories.map(x=>[x,x])),filter.category)}</select>`)}${label('Jenis item',`<select name="itemType"><option value="">Semua jenis</option>${choice(itemTypes,filter.itemType)}</select>`)}<button>Terapkan</button></form>
 <p class="muted">Qty Stok: stok fisik tercatat di ${e((state.stores||[]).find(x=>x.id===store)?.name||'store yang dipilih')}, termasuk batch kedaluwarsa. Harga jual mengikuti master produk dan berlaku sama di semua store.</p>
 <div class="table-wrap"><table class="catalog-table"><thead><tr><th>Foto</th><th>Nama Produk</th><th>Variant</th><th>SKU</th><th>Barcode</th><th>Qty Stok</th><th>Satuan</th><th>Harga Beli</th><th>Harga Jual di Toko</th><th>Action</th></tr></thead><tbody>${rows.map(p=>`<tr><td><span class="catalog-photo" aria-label="Foto belum tersedia">—</span></td><td><b>${e(p.name)}</b><small class="catalog-meta">${e(p.category||'Bahan')} · ${e(itemTypes[p.itemType])}</small></td><td class="muted">—</td><td>${e(p.sku)}</td><td class="muted">—</td><td class="catalog-stock">${stock(p)}</td><td>${e(stockUnits[p.stockUnit])}</td><td class="muted">—</td><td>${isMaterial(p)?'Tidak dijual':isLegacyStock(p)?`${money(p.priceKg)} / kg<br>${money(p.pricePiece)} / butir`:`${money(p.salePrice)} / ${e(stockUnits[p.stockUnit])}`}</td><td><button class="small" data-edit-product="${e(p.id)}" aria-label="Edit ${e(p.name)}">Edit</button></td></tr>`).join('')||'<tr><td colspan="10" class="empty">Tidak ada item yang sesuai.</td></tr>'}</tbody></table></div><p class="muted catalog-note">Foto, variant, barcode, dan harga beli belum dicatat pada versi ini; tanda — berarti data belum tersedia. Penjualan hasil produksi melalui kasir menyusul.</p></section>`;
}
export function productDialog({product,state,modal,mutate,render,toast}){
 const p=productDefaults(product||{}),editing=!!product;
 const locked=editing&&((state.unitLots||[]).some(l=>l.productId===p.id)||(state.recipes||[]).some(r=>r.outputId===p.id||r.ingredients.some(l=>l.productId===p.id))||state.lots.some(x=>x.productId===p.id)||state.sales.some(x=>x.lines.some(l=>l.productId===p.id)));
 const d=modal(editing?'Edit produk / bahan':'Tambah produk / bahan',`${label('Nama',`<input name="name" value="${e(p.name||'')}" required maxlength="100">`)}${label('SKU',`<input name="sku" value="${e(p.sku||'')}" required maxlength="40">`)}${label('Jenis item',`<select name="itemType" ${locked?'disabled':''}>${choice(itemTypes,p.itemType)}</select>`)}<div id="category-field">${label('Kategori jual',`<select name="category">${choice(Object.fromEntries(categories.map(x=>[x,x])),p.category)}</select>`)}</div>${label('Satuan stok',`<select name="stockUnit" ${locked?'disabled':''}>${choice(stockUnits,p.stockUnit)}</select>`)}<p class="muted">${locked?'Jenis dan satuan terkunci karena item sudah memiliki resep atau riwayat stok/transaksi.':'Gunakan gram untuk berat bahan dan ml untuk cairan. Hasil produksi akan dicatat sesuai satuan ini.'}</p><div id="catalog-prices"></div>`);
 const f=d.querySelector('form'),control=n=>f.elements.namedItem(n),prices={priceKg:p.priceKg??'',pricePiece:p.pricePiece??'',salePrice:p.salePrice??''};
 function update(){
  for(const key of Object.keys(prices)){const input=control(key);if(input)prices[key]=input.value;}
  const type=control('itemType').value,unit=control('stockUnit'),material=['raw','prep'].includes(type);
  d.querySelector('#category-field').hidden=material;control('category').disabled=material;
  const allowed=type==='recipe'?['porsi']:['g','ml','pcs',...(type==='direct'&&control('category').value==='Buah'?['kg_butir']:[])];
  for(const option of unit.options)option.disabled=!allowed.includes(option.value);
  if(!allowed.includes(unit.value))unit.value=allowed[0];
  const keys=material?[]:unit.value==='kg_butir'?['priceKg','pricePiece']:['salePrice'];
  d.querySelector('#catalog-prices').innerHTML=keys.map(key=>label({priceKg:'Harga jual / kg (Rp)',pricePiece:'Harga jual / butir (Rp)',salePrice:'Harga jual / satuan (Rp)'}[key],`<input name="${key}" type="number" min="0.01" step="any" required value="${e(prices[key])}">`)).join('');
 }
 control('itemType').onchange=update;control('stockUnit').onchange=update;
 control('category').onchange=()=>{if(locked&&p.stockUnit==='kg_butir'&&control('category').value!=='Buah'){control('category').value='Buah';toast('Durian dengan stok kg + butir tetap kategori Buah');}update();};update();
 f.onsubmit=async ev=>{ev.preventDefault();try{
  const values=Object.fromEntries(new FormData(f));if(locked){values.itemType=p.itemType;values.stockUnit=p.stockUnit;}
  const payload={...normalizeProduct(values),id:editing?p.id:id(),kind:'products'};
  if(await mutate(editing?'product_update':'master',payload)){d.close();render();toast('Master produk tersimpan');}
 }catch(err){d.querySelector('#form-error').textContent=err.message;}};
}

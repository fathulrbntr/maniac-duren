import {employeesPage,bindEmployees} from './employees-ui.mjs?v=28';
import {checkOrder,menuStatus} from './order-stock.mjs?v=12';
import {orderMargins} from './finance.mjs?v=9';
import {escape as e,id,today,num,money} from './core.mjs?v=9';
export const opsPages=['salesreport','orders','kitchen','losses','trace','finance','employees','attendance','guide'];
const needsKitchen=o=>o.lines.some(l=>l.itemType==='recipe');
const isPaid=o=>o.payment_status==='paid'||(!o.payment_status&&o.status==='paid');
const paymentLabel=o=>o.payment_status==='refunded'?'Dikembalikan':isPaid(o)?'Lunas':'Belum bayar';
const orderLabel=o=>({queued:isPaid(o)?'Antre':'Menunggu bayar',preparing:'Dibuat',ready:'Siap',paid:'Selesai',cancelled:'Dibatalkan'})[o.status]||o.status;
const paymentFields=total=>`<h3>Total ${money(total)}</h3>${field('Metode pembayaran','<select name="payment"><option>Tunai</option><option>QRIS</option><option>Transfer</option></select>')}${field('Uang diterima',input('paid','number',`min="${total}" step="any" value="${total}" required`))}<p data-change>Kembalian: ${money(0)}</p><p class="muted">Pastikan pembayaran sudah diterima sebelum menekan konfirmasi. QRIS / transfer dicatat manual.</p>`;
function bindPayment(d,total){const f=d.querySelector('form'),amount=f.elements.paid,method=f.elements.payment;const update=()=>{const cash=method.value==='Tunai';amount.readOnly=!cash;if(!cash)amount.value=total;d.querySelector('[data-change]').textContent=Number(amount.value)>=total?'Kembalian: '+money(Number(amount.value)-total):'Pembayaran kurang: '+money(total-Number(amount.value));};amount.oninput=update;method.onchange=update;update();}
const quality={unsorted:'Belum disortir',ready:'Matang / siap jual',unripe:'Belum matang',reject:'Reject'};
const actions={receipt:'Terima buah',unit_receipt:'Terima bahan / produk',sort:'Sortir buah',recover:'Olah reject menjadi bahan',produce:'Produksi bahan',waste_process:'Olah reject',inventory_loss:'Waste / penyusutan',sale:'Jual buah',order_create:'Buat pesanan',order_start:'Mulai buat pesanan',order_ready:'Pesanan siap',order_pay:'Bayar pesanan',order_complete:'Pesanan diserahkan',order_direct:'Selesaikan produk siap jual',order_cancel:'Batalkan pesanan',movement:'Transfer',void:'Batalkan penjualan',production_void:'Batalkan produksi',waste_void:'Batalkan olahan',employee_save:'Ubah karyawan',attendance_in:'Absen masuk',attendance_out:'Absen pulang'};
const field=(label,html)=>`<label class="field">${label}${html}</label>`;
const input=(name,type='text',extra='')=>`<input name="${name}" type="${type}" ${extra}>`;
const opts=(rows,value='')=>rows.map(x=>`<option value="${e(x.id)}" ${x.id===value?'selected':''}>${e(x.name)}</option>`).join('');
const table=(heads,rows)=>`<div class="table-wrap"><table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')||`<tr><td colspan="${heads.length}" class="empty">Belum ada data.</td></tr>`}</tbody></table></div>`;
const header=(name,description,buttons='')=>`<div class="intro"><div><h2>${name}</h2><p class="muted">${description}</p></div><div class="toolbar">${buttons}<button id="ops-refresh">Perbarui</button></div></div>`;
const nm=(s,key,value)=>s[key]?.find(x=>x.id===value)?.name||(key==='employees'?s.people?.find(x=>x.id===value)?.name:null)||value?.slice(0,8)||'—';
const button=(label,action,value,cls='')=>`<button class="small ${cls}" data-op="${action}" data-id="${e(value)}">${label}</button>`;
const balance=(l)=>l.kg!==undefined?`${num(l.kg)} kg / ${l.pieces} butir`:`${num(l.qty)} ${e(l.unit)}`;
const lots=(s,store)=>[...s.lots,...s.unitLots].filter(x=>x.storeId===store&&(x.kg??x.qty)>0);
const cost=(n)=>n==null?'Belum diketahui':money(n);
const allowed=(s,p)=>!s.access||s.access[p];
let draft=[];
export function opsPage(view,s,store){
 if(['employees','attendance'].includes(view))return employeesPage(view,s,store);
 const note=!s.opsVersion?'<div class="notice">Fitur operasional baru memerlukan SQL versi 009 dan login. Demo lama hanya menampilkan struktur; tombol simpan baru tidak mengubah data demo.</div>':'';
 let html='';
 if(view==='guide')html=header('Urutan pendataan','Gunakan alur yang sama di setiap cabang.')+`<section class="panel"><ol class="flow-guide"><li><b>Data karyawan dan cabang</b><p>Tentukan siapa yang menerima, membuat, menjual, serta cabang yang boleh diakses.</p></li><li><b>Supplier, produk, bahan, dan resep</b><p>Buah: kg + butir. Bahan pembelian: g/ml/kg/pcs. Bahan siap pakai: hasil kitchen. Menu pesanan: porsi. Produk jual langsung: produk supplier atau kemasan siap jual.</p></li><li><b>Barang datang</b><p>Catat supplier, jumlah, total modal dan kedaluwarsa. Akun penerima terekam otomatis. Penerimaan buah langsung siap jual setelah penurunan selesai.</p></li><li><b>Persiapan kitchen</b><p>Olah reject menjadi Durpas/Coral. Gunakan Produksi bahan untuk cendol, jelly, ketan, atau daging dari kemasan melalui resep. Modal bahan diteruskan ke hasil.</p></li><li><b>Pesanan & kitchen</b><p>Kasir menerima pembayaran dan membuat satu pesanan buah/dessert/produk supplier. Buah dan produk siap jual langsung selesai serta dipotong stoknya saat bayar. Hanya menu resep masuk kitchen; stok bahan resep dipotong saat Mulai buat. Bayar di kasir → Antre → Dibuat → Siap → Diserahkan. Pesanan antre mencadangkan bahan. Stok fisik dipotong saat kitchen mulai membuat; pembatalan antre melepaskan cadangan.</p></li><li><b>Waste, absensi, dan pemeriksaan</b><p>Catat bahan basi/salah buat dan penyusutan berat. Cocokkan stok fisik dengan Jejak stok. Periksa biaya yang belum diketahui sebelum membaca laba kotor.</p></li></ol></section>`;
 if(view==='losses')html=header('Waste & penyusutan','Catat stok yang benar-benar hilang. Untuk buah reject yang dimanfaatkan, gunakan Olah reject.',button('Olah reject menjadi bahan','recover','')+button('Catat kehilangan','loss','', 'primary'))+`<section class="panel">${table(['Waktu','Jenis / alasan','Penanggung jawab'],(s.events||[]).filter(x=>x.store_id===store&&x.action==='inventory_loss').map(x=>`<tr><td>${e(x.business_date)}</td><td>${e(x.payload?.cause||'Waste / penyusutan')}<small>${e(x.payload?.reason||'Detail pada akun finance')}</small></td><td>${e(nm(s,'employees',x.employee_id))}</td></tr>`))}</section>`;
 if(view==='kitchen')html=kitchenPage(s,store);
 if(view==='orders'){
 const sellable=s.products.filter(p=>!['raw','prep'].includes(p.itemType)&&((p.salePrice??0)>0||p.stockUnit==='kg_butir'));
 const categories=['Semua',...new Set(sellable.map(p=>p.category||'Lainnya'))];
 const productCard=p=>{const availability=menuStatus(s,store,p,draft,today());return `<button type="button" class="order-product" ${availability.ok?'':'disabled'} title="${e(availability.reason)}" data-order-add="${e(p.id)}" data-category="${e(p.category||'Lainnya')}" data-name="${e(p.name.toLowerCase())}"><span class="order-product-photo">${p.photo?`<img src="${e(p.photo)}" alt="" loading="lazy">`:`<span>${e(p.name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase())}</span>`}</span><span class="order-product-info"><span class="order-product-category">${e(p.category||'Menu')}</span><strong>${e(p.name)}</strong><span class="order-product-price">${p.stockUnit==='kg_butir'?`${money(p.priceKg)} <small>/ kg</small><br>${money(p.pricePiece)} <small>/ butir</small>`:`${money(p.salePrice)} <small>/ ${e(p.stockUnit||'pcs')}</small>`}</span></span><span class="order-stock-status">${e(availability.reason)}</span><span class="order-product-add" aria-hidden="true">+</span></button>`;};
 const draftTotal=draft.reduce((a,x)=>a+x.qty*x.price,0);
 const itemCount=draft.reduce((a,x)=>a+x.qty,0);
 const cartLines=draft.map((x,i)=>{const p=s.products.find(p=>p.id===x.productId);const fruit=p?.stockUnit==='kg_butir';const unit=fruit?(x.unit==='KG'?'kg':'butir'):(p?.stockUnit||'pcs');return `<article class="order-cart-line"><div class="order-cart-copy"><strong>${e(nm(s,'products',x.productId))}</strong><span>${num(x.qty)} ${e(unit)} × ${money(x.price)}</span>${fruit?`<small>${num(x.kg)} kg aktual · ${x.pieces} butir<br>${e(nm(s,'suppliers',x.supplierId))} · ${e((x.lotId||'').slice(0,8))}</small>`:''}</div><div class="order-cart-actions">${!fruit?`<button type="button" data-draft-qty="${i}" data-delta="-1" aria-label="Kurangi jumlah">−</button><button type="button" data-draft-qty="${i}" data-delta="1" aria-label="Tambah jumlah">+</button>`:''}<button type="button" class="order-remove" data-remove-line="${i}" aria-label="Hapus item">×</button><b>${money(x.qty*x.price)}</b></div></article>`;}).join('');
 html=header('Pesanan & kitchen','Pilih menu dan terima pembayaran. Buah dan produk siap jual langsung selesai. Hanya menu yang perlu dibuat masuk kitchen.')+(allowed(s,'sell')?`<div class="order-screen"><section class="panel order-catalog"><div class="order-catalog-head"><div><h3>Pilih menu</h3><p class="muted">${e(nm(s,'stores',store))} · buah / produk siap jual langsung diproses kasir.</p></div><label class="order-search"><span class="sr-only">Cari menu</span><input id="order-search" type="search" placeholder="Cari menu…" autocomplete="off"></label></div><div class="order-categories" role="group" aria-label="Kategori menu">${categories.map((c,i)=>`<button type="button" class="order-category ${i===0?'selected':''}" data-order-category="${e(c)}" aria-pressed="${i===0?'true':'false'}">${e(c)}${i===0?` <small>${sellable.length}</small>`:''}</button>`).join('')}</div><div id="order-products" class="order-product-grid">${sellable.map(productCard).join('')||'<div class="empty">Belum ada menu yang bisa dijual. Atur produk dan harga di Product.</div>'}</div><p id="order-no-results" class="empty" hidden>Menu tidak ditemukan.</p><form id="order-line" class="order-line-editor" hidden><div class="order-editor-title"><div><span class="order-product-category">PENJUALAN BUAH</span><h4 id="fruit-order-name">Pilih cara jual</h4></div><button type="button" id="close-fruit-editor" aria-label="Tutup">×</button></div><select class="sr-only" name="productId" required><option value="">Pilih durian</option>${opts(sellable.filter(p=>p.stockUnit==='kg_butir'))}</select><input class="sr-only" name="qty" type="number" value="1"><div id="fruit-order-fields" hidden><div class="form-grid">${field('Asal penerimaan',`<select name="lotId" required></select>`)}${field('Cara jual','<select name="unit" required><option value="KG">Per kg</option><option value="BUTIR">Per butir</option></select>')}${field('Berat buah aktual (kg)',input('kg','number','min="0.000001" step="any" required'))}${field('Jumlah butir terjual',input('pieces','number','min="1" step="1" required'))}${field('Harga jual satuan (Rp)',input('price','number','min="0.01" step="any" required'))}</div></div><button type="submit" class="primary">Tambah ke pesanan</button></form></section><aside class="panel order-summary"><div class="order-summary-head"><div><span class="order-product-category">PESANAN SAAT INI</span><h3>Rincian pesanan</h3></div><span class="order-count" id="order-item-count">${num(itemCount)} item</span></div><div id="order-draft" class="order-cart-items">${cartLines||'<div class="order-empty"><span>＋</span><b>Belum ada item</b><small>Pilih menu untuk mulai membuat pesanan.</small></div>'}</div><div class="order-total-row"><span>Total pesanan</span><strong id="order-total">${money(draftTotal)}</strong></div><label class="field order-note-field">Meja / nama / catatan<input id="order-note" maxlength="300" placeholder="Meja 03 · tidak pakai es"></label><button class="primary full order-save" id="save-order" ${draft.length?'':'disabled'}>Bayar sekarang · ${money(draftTotal)}</button><p id="order-stock-message" class="order-payment-hint" aria-live="polite"></p><p class="order-payment-hint">Buah / produk siap jual: stok dipotong saat bayar. Menu resep: masuk kitchen setelah lunas.</p></aside></div>`:'')+`<section class="panel order-queue"><div class="header-row"><div><h3>Antrean pesanan</h3><p class="muted">Pesanan cabang ini · bayar → antre → dibuat → siap → diserahkan.</p></div></div>${table(['Pesanan / catatan','Item','Status / total','Aksi'],(s.orders||[]).filter(o=>o.store_id===store).map(o=>`<tr><td><b>${e(o.id.slice(0,8))}</b><small>${e(o.business_date)}</small>${e(o.note)}</td><td>${o.lines.map(l=>`${e(l.name)} × ${num(l.qty)} ${e(l.unit)}`).join('<br>')}</td><td><span class="pill">${e(orderLabel(o))}</span><small>${e(paymentLabel(o))} · ${money(o.total)}</small></td><td>${isPaid(o)&&!needsKitchen(o)&&['queued','preparing','ready'].includes(o.status)&&allowed(s,'sell')?button('Selesaikan di kasir','order_direct',o.id,'primary'):''}${!isPaid(o)&&o.status!=='cancelled'&&allowed(s,'sell')?button('Bayar sekarang','pay',o.id,'primary'):''}${isPaid(o)&&needsKitchen(o)&&o.status==='ready'&&allowed(s,'sell')?button('Sudah diserahkan','order_complete',o.id,'primary'):''}${!['paid','cancelled'].includes(o.status)&&allowed(s,'cancel')?button('Batalkan','cancel',o.id,'danger'):''}${button('Detail / struk','order_receipt',o.id)}</td></tr>`))}</section>`;
 }
 if(view==='salesreport')html=header('Laporan seluruh penjualan','Penjualan pesanan dan riwayat transaksi buah lama. Pesanan belum dibayar tidak dihitung.')+`<section class="panel"><div class="form-grid">${field('Dari',input('reportFrom','date',`id="sales-from" value="${today().slice(0,8)}01"`))}${field('Sampai',input('reportTo','date',`id="sales-to" value="${today()}"`))}</div><div id="sales-result"></div></section>`;
 if(view==='trace')html=header('Jejak stok','Pilih penerimaan atau hasil untuk melihat pergerakan dan asal bahan lintas proses.')+`<section class="panel">${field('Telusuri lot / penerimaan',`<select id="trace-lot"><option value="">Semua pergerakan</option>${opts([...s.lots,...s.unitLots].filter(l=>l.storeId===store).map(l=>({id:l.id,name:`${nm(s,'products',l.productId)} · ${l.date} · ${l.id.slice(0,8)}`})))}</select>`)}<div id="trace-result"></div></section>`;
 if(view==='finance')html=header('Biaya & laba kotor','Biaya bahan aktual. Belum termasuk gaji, sewa, listrik, pajak dan biaya operasional lain.')+`<section class="panel"><div class="form-grid">${field('Dari',input('financeFrom','date',`id="finance-from" value="${today().slice(0,8)}01"`))}${field('Sampai',input('financeTo','date',`id="finance-to" value="${today()}"`))}${field('Supplier buah',`<select id="finance-supplier"><option value="">Semua supplier</option>${opts(s.suppliers)}</select>`)}</div><div id="finance-result"></div></section>`;
 return note+html;
}
export function bindOps(view,s,store,ctx){
 if(['employees','attendance'].includes(view))return bindEmployees(view,s,store,ctx);
 if(!opsPages.includes(view))return;
 document.querySelector('#ops-refresh')?.addEventListener('click',async()=>{try{await ctx.refresh();ctx.render()}catch(err){ctx.toast(err.message)}});
 const save=async(action,p)=>{if(!s.opsVersion){ctx.toast('Hubungkan database versi 009 untuk fitur ini.');return false;}return ctx.mutate(action,{id:id(),storeId:store,date:today(),...p});};
 const modalSave=(label,html,action,transform=x=>x)=>{const d=ctx.modal(label,html),requestId=id();let submitting=false;d.querySelector('form').onsubmit=async(ev)=>{ev.preventDefault();if(submitting)return;submitting=true;const submit=ev.currentTarget.querySelector('[type=submit]');submit.disabled=true;try{if(await save(action,{id:requestId,...transform(Object.fromEntries(new FormData(ev.currentTarget)),ev.currentTarget)})){d.close();ctx.render()}}catch(err){ctx.toast(err.message)}finally{submitting=false;submit.disabled=false;}};return d;};
 const bindActions=root=>{
 root.querySelectorAll('[data-op]').forEach(b=>b.onclick=async()=>{
 const key=b.dataset.id,op=b.dataset.op;
 if(op==='recover'){
 const stock=s.lots.filter(l=>l.storeId===store&&['ready','reject'].includes(l.quality)&&l.kg>0),outputs=s.products.filter(p=>['prep','finished','direct'].includes(p.itemType)&&['kg','g','pcs'].includes(p.stockUnit));
 modalSave('Olah reject menjadi bahan / produk',`${field('Stok buah asal',`<select name="lotId" required>${opts(stock.map(l=>({id:l.id,name:`${nm(s,'products',l.productId)} · ${balance(l)} · ${l.id.slice(0,8)}`})))}</select>`)}<div class="form-grid">${field('Buah diolah (kg)',input('kg','number','min="0.000001" step="any" required'))}${field('Buah diolah (butir)',input('pieces','number','min="1" step="1" required'))}</div>${field('Hasil olahan',`<select name="productId" required>${opts(outputs.map(p=>({id:p.id,name:p.name+' ('+p.stockUnit+')'})))}</select>`)}${field('Jumlah hasil dalam satuan produk',input('qty','number','min="0.000001" step="any" required'))}${field('Total berat bersih hasil (kg; wajib jika pcs)',input('weightKg','number','min="0.000001" step="any"'))}${field('Kedaluwarsa hasil',input('expiry','date','required'))}${field('Catatan',input('reason','text','minlength="3" maxlength="300" required'))}<p>Pelaksana mengikuti akun login. Untuk beberapa jenis hasil sekaligus gunakan Olah reject Durpas/Coral.</p>`,'recover');
 }else if(op==='loss'){
 const stock=lots(s,store);
 modalSave('Catat waste / penyusutan',`${field('Stok asal',`<select name="lotId" required>${opts(stock.map(l=>({id:l.id,name:`${nm(s,'products',l.productId)} · ${balance(l)} · ${l.id.slice(0,8)}`})))}</select>`)}${field('Penyebab','<select name="cause"><option value="spoiled">Basi / rusak</option><option value="mistake">Salah buat / tertumpah</option><option value="shrinkage">Penyusutan berat buah</option><option value="discard">Dibuang</option></select>')}${field('Jumlah hilang (satuan stok asal)',input('qty','number','min="0.000001" step="any" required'))}${field('Butir hilang (buah saja; penyusutan = 0)',input('pieces','number','min="0" step="1" value="0"'))}${field('Alasan',input('reason','text','minlength="3" maxlength="300" required'))}`,'inventory_loss');
 }else if(op==='pay'){
 const o=s.orders.find(o=>o.id===key);const requestId=id();const d=modalSave('Bayar '+key.slice(0,8),paymentFields(o.total),'order_pay',v=>({...v,id:requestId,orderId:key}));bindPayment(d,Number(o.total));
 }else if(op==='cancel'){
 const o=s.orders.find(o=>o.id===key);modalSave('Batalkan pesanan',`<p>${o.status==='queued'&&o.lines.every(l=>l.itemType==='recipe')?'Bahan kitchen belum dipotong.':'Stok yang sudah keluar tidak otomatis dikembalikan; dicatat sebagai waste. Bahan kitchen yang belum dipakai dilepas dari cadangan.'}</p>${isPaid(o)?`<p>Refund sebesar <b>${money(o.total)}</b>. Pengembalian uang dilakukan manual.</p><label><input type="checkbox" name="refundConfirmed" required> Saya sudah mengembalikan pembayaran kepada customer.</label>`:''}${field('Alasan',input('reason','text','minlength="3" required'))}`,'order_cancel',v=>({...v,refundConfirmed:v.refundConfirmed==='on',orderId:key}));
 }else if(op==='order_receipt'){
 const o=s.orders.find(o=>o.id===key);const d=ctx.modal('Detail pesanan',`<div class="receipt-print"><h3>MANIAC DUREN</h3><p>${e(nm(s,'stores',o.store_id))} · ${e(o.business_date)}<br>${e(o.id)}<br>${e(o.note)}</p>${table(['Item','Jumlah','Subtotal'],o.lines.map(l=>`<tr><td>${e(l.name)}</td><td>${num(l.qty)} ${e(l.unit)}</td><td>${money(l.qty*l.price)}</td></tr>`))}<p>Total: <b>${money(o.total)}</b><br>Pesanan: ${e(orderLabel(o))}<br>Pembayaran: ${e(paymentLabel(o))}<br>${o.paid_date?`${e(o.payment)} · Diterima ${money(o.paid)} · Kembalian ${money(o.paid-o.total)}`:''}</p></div><button id="print-order" type="button">Cetak</button>`);d.querySelector('[type=submit]').hidden=true;d.querySelector('#print-order').onclick=()=>window.print();
 }else if(['order_start','order_ready','order_complete','order_direct','attendance_in','attendance_out'].includes(op)){
 if(await save(op,key?{orderId:key}:{}))ctx.render();
 }
 });
 };
 bindActions(document);
 if(view==='orders'&&document.querySelector('#order-line')){
 const f=document.querySelector('#order-line');
 const container=document.querySelector('#order-draft');
 const totalNode=document.querySelector('#order-total');
 const countNode=document.querySelector('#order-item-count');
 const saveButton=document.querySelector('#save-order');
 const updateCards=()=>document.querySelectorAll('[data-order-add]').forEach(card=>{const p=s.products.find(p=>p.id===card.dataset.orderAdd);const status=menuStatus(s,store,p,draft,today());card.disabled=!status.ok;card.title=status.reason;card.querySelector('.order-stock-status').textContent=status.reason;});
 const totalDraft=()=>draft.reduce((a,x)=>a+x.qty*x.price,0);
 const showDraft=()=>{
  const total=totalDraft(),count=draft.reduce((a,x)=>a+x.qty,0);
  container.innerHTML=draft.map((x,i)=>{
   const p=s.products.find(p=>p.id===x.productId),fruit=p?.stockUnit==='kg_butir';
   const unit=fruit?(x.unit==='KG'?'kg':'butir'):(p?.stockUnit||'pcs');
   return `<article class="order-cart-line"><div class="order-cart-copy"><strong>${e(nm(s,'products',x.productId))}</strong><span>${num(x.qty)} ${e(unit)} × ${money(x.price)}</span>${fruit?`<small>${num(x.kg)} kg aktual · ${x.pieces} butir<br>${e(nm(s,'suppliers',x.supplierId))} · ${e((x.lotId||'').slice(0,8))}</small>`:''}</div><div class="order-cart-actions">${!fruit?`<button type="button" data-draft-qty="${i}" data-delta="-1" aria-label="Kurangi jumlah">−</button><button type="button" data-draft-qty="${i}" data-delta="1" aria-label="Tambah jumlah">+</button>`:''}<button type="button" class="order-remove" data-remove-line="${i}" aria-label="Hapus item">×</button><b>${money(x.qty*x.price)}</b></div></article>`;
  }).join('')||'<div class="order-empty"><span>＋</span><b>Belum ada item</b><small>Pilih menu untuk mulai membuat pesanan.</small></div>';
  totalNode.textContent=money(total);countNode.textContent=`${num(count)} item`;
  const stock=checkOrder(s,store,draft,today());
  saveButton.disabled=!draft.length||!stock.ok;document.querySelector('#order-stock-message').textContent=stock.ok?'Bahan tersedia untuk pesanan ini.':stock.reason;updateCards();saveButton.textContent=`Bayar sekarang · ${money(total)}`;
 };
 const addDraftLine=x=>{
  const stock=checkOrder(s,store,[...draft,x],today());if(!stock.ok){ctx.toast(stock.reason);return false;}
  const p=s.products.find(p=>p.id===x.productId);
  if(p?.stockUnit!=='kg_butir'){
   const match=draft.find(line=>line.productId===x.productId&&line.price===x.price);
   if(match)match.qty+=x.qty;else draft.push(x);
  }else draft.push(x);
  showDraft();return true;
 };
 showDraft();
 document.querySelector('#order-products').addEventListener('stock-refresh',ev=>{s=ev.detail;showDraft();const template=document.createElement('template');template.innerHTML=opsPage('orders',s,store);const queue=template.content.querySelector('.order-queue');if(queue){document.querySelector('.order-queue')?.replaceWith(queue);bindActions(queue);}});
 document.querySelector('#order-products')?.addEventListener('click',ev=>{
  const card=ev.target.closest('[data-order-add]');if(!card||card.disabled)return;
  const p=s.products.find(p=>p.id===card.dataset.orderAdd);if(!p)return;
  if(p.stockUnit==='kg_butir'){
   f.elements.productId.value=p.id;f.elements.productId.dispatchEvent(new Event('change'));
   f.hidden=false;requestAnimationFrame(()=>f.scrollIntoView({behavior:'smooth',block:'nearest'}));
  }else{
   addDraftLine({productId:p.id,qty:1,price:Number(p.salePrice)});
  }
 });
 let activeCategory='Semua';
 const filterProducts=()=>{
  const q=(document.querySelector('#order-search')?.value||'').trim().toLowerCase();let visible=0;
  document.querySelectorAll('[data-order-add]').forEach(card=>{const matchCategory=activeCategory==='Semua'||card.dataset.category===activeCategory;const matchName=card.dataset.name.includes(q);card.hidden=!(matchCategory&&matchName);if(!card.hidden)visible++;});
  document.querySelector('#order-no-results').hidden=visible>0;
 };
 document.querySelector('#order-search')?.addEventListener('input',filterProducts);
 document.querySelectorAll('[data-order-category]').forEach(button=>button.addEventListener('click',()=>{
  activeCategory=button.dataset.orderCategory;
  document.querySelectorAll('[data-order-category]').forEach(item=>{const selected=item===button;item.classList.toggle('selected',selected);item.setAttribute('aria-pressed',String(selected));});
  filterProducts();
 }));
 container.addEventListener('click',ev=>{
  const remove=ev.target.closest('[data-remove-line]');
  if(remove){draft.splice(Number(remove.dataset.removeLine),1);showDraft();return;}
  const change=ev.target.closest('[data-draft-qty]');
  if(change){const index=Number(change.dataset.draftQty);const candidate=draft.map((x,i)=>i===index?{...x,qty:Math.max(1,x.qty+Number(change.dataset.delta))}:x);const stock=checkOrder(s,store,candidate,today());if(Number(change.dataset.delta)>0&&!stock.ok){ctx.toast(stock.reason);return;}draft=candidate;showDraft();}
 });
 f.elements.productId.onchange=()=>{
  const p=s.products.find(p=>p.id===f.elements.productId.value),fruit=p?.stockUnit==='kg_butir';
  document.querySelector('#fruit-order-fields').hidden=!fruit;
  for(const k of ['lotId','kg','pieces','unit','price'])f.elements[k].disabled=!fruit;
  f.elements.qty.disabled=fruit;
  document.querySelector('#fruit-order-name').textContent=p?.name||'Pilih durian';
  f.elements.price.value=fruit?p.priceKg||'':'';
  f.elements.lotId.innerHTML=opts(s.lots.filter(l=>l.productId===p?.id&&l.storeId===store&&l.kg>0&&l.quality==='ready').map(l=>({id:l.id,name:`${nm(s,'suppliers',l.supplierId)} · ${l.date} · ${balance(l)}`})));
 };
 f.elements.unit.onchange=()=>{const p=s.products.find(p=>p.id===f.elements.productId.value);f.elements.price.value=f.elements.unit.value==='KG'?p.priceKg:p.pricePiece;};
 f.onsubmit=ev=>{ev.preventDefault();const x=Object.fromEntries(new FormData(f));const p=s.products.find(p=>p.id===x.productId);if(!p)return; x.qty=+(x.unit==='KG'?x.kg:x.pieces);x.price=+x.price;if(!addDraftLine(x))return;f.hidden=true;f.reset();f.elements.qty.value='1';f.elements.productId.value='';f.elements.productId.dispatchEvent(new Event('change'));};
 document.querySelector('#close-fruit-editor').onclick=()=>{f.hidden=true;};
 saveButton.onclick=()=>{
  if(!draft.length)return ctx.toast('Tambahkan item terlebih dahulu');
  if(!(s.orderRoutingVersion>=13))return ctx.toast('Jalankan migration 013 di Supabase, lalu perbarui halaman.');
  const total=totalDraft(),requestId=id(),lines=draft.map(x=>({...x})),note=document.querySelector('#order-note').value;
  const d=ctx.modal('Pembayaran pesanan',paymentFields(total),'Konfirmasi pembayaran');bindPayment(d,total);
  let submitting=false;
  d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();if(submitting)return;submitting=true;const submit=ev.currentTarget.querySelector('[type=submit]');submit.disabled=true;
   // ID tetap; retry.mjs menolak perubahan payload jika hasil sebelumnya belum pasti.
   const pending={id:requestId,lines,note,...Object.fromEntries(new FormData(ev.currentTarget))};
   try{if(await save('order_create',pending)){draft=[];d.close();ctx.render();ctx.toast(lines.some(l=>s.products.find(p=>p.id===l.productId)?.itemType==='recipe')?'Pembayaran tercatat. Menu resep masuk kitchen.':'Pembayaran tercatat. Penjualan selesai.');}}
   catch(err){ctx.toast(err.message)}finally{submitting=false;submit.disabled=false;}
  };
 };

 }
 if(view==='trace'){
 const renderTrace=()=>{const key=document.querySelector('#trace-lot').value;const ancestry=new Set(key?[key]:[]);let changed=true;while(changed){changed=false;for(const row of s.journal||[]){if(row.qty>0&&ancestry.has(row.lot_id))for(const parent of s.journal.filter(p=>p.event_id===row.event_id&&p.qty<0)){if(!ancestry.has(parent.lot_id)){ancestry.add(parent.lot_id);changed=true}}}for(const l of s.lots){if(ancestry.has(l.id)&&l.sourceLotId&&!ancestry.has(l.sourceLotId)){ancestry.add(l.sourceLotId);changed=true}}}
 const rows=(s.journal||[]).filter(x=>x.store_id===store&&(!key||ancestry.has(x.lot_id)));
 document.querySelector('#trace-result').innerHTML=(key?`<p>Menampilkan lot terpilih beserta ${Math.max(0,ancestry.size-1)} lot asalnya. Penerimaan sebelum upgrade mungkin belum mempunyai jurnal.</p>`:'')+table(['Waktu / kegiatan','Produk / lot','Supplier','Perubahan stok','Pelaksana'],rows.map(x=>{const ev=s.events.find(v=>v.id===x.event_id);return `<tr><td>${e(ev?.business_date)}<small>${e(actions[ev?.action]||ev?.action)}</small></td><td>${e(nm(s,'products',x.product_id))}<small>${e(x.lot_id.slice(0,8))}</small></td><td>${e(nm(s,'suppliers',x.supplier_id))}</td><td>${x.qty>0?'+':''}${num(x.qty)} ${e(x.unit)}${x.pieces?` / ${num(x.pieces)} butir`:''}</td><td>${e(nm(s,'employees',ev?.employee_id))}</td></tr>`}));};document.querySelector('#trace-lot').onchange=renderTrace;renderTrace();
 }
 if(view==='salesreport'){
 const draw=()=>{const from=document.querySelector('#sales-from').value,to=document.querySelector('#sales-to').value;
 const rows=[...(s.orders||[]).filter(o=>o.store_id===store&&isPaid(o)).map(o=>({id:o.id,date:o.paid_date,total:o.total,payment:o.payment,items:o.lines.map(l=>l.name+' × '+num(l.qty)+' '+l.unit).join(', ')})),...(s.sales||[]).filter(o=>o.storeId===store&&!o.voided).map(o=>({id:o.id,date:o.date,total:o.total,payment:o.payment,items:o.lines.map(l=>nm(s,'products',l.productId)+' · '+num(l.kg)+' kg / '+l.pieces+' butir').join(', ')}))].filter(o=>o.date>=from&&o.date<=to).sort((a,b)=>b.date.localeCompare(a.date));
 document.querySelector('#sales-result').innerHTML=`<div class="stats"><div class="stat"><small>Omzet</small><strong>${money(rows.reduce((a,x)=>a+x.total,0))}</strong></div><div class="stat"><small>Transaksi lunas</small><strong>${rows.length}</strong></div></div>${table(['Tanggal / struk','Item','Pembayaran','Total'],rows.map(o=>`<tr><td>${e(o.date)}<small>${e(o.id.slice(0,8))}</small></td><td>${e(o.items)}</td><td>${e(o.payment)}</td><td>${money(o.total)}</td></tr>`))}`;};document.querySelector('#sales-from').onchange=draw;document.querySelector('#sales-to').onchange=draw;draw();
 }
 if(view==='finance'){
 const renderFinance=()=>{const from=document.querySelector('#finance-from').value,to=document.querySelector('#finance-to').value,supplier=document.querySelector('#finance-supplier').value;
 const rows=(s.money||[]).filter(x=>{const ev=s.events.find(e=>e.id===x.event_id);return x.store_id===store&&ev?.business_date>=from&&ev?.business_date<=to});
 const unknown=rows.filter(x=>x.cost==null).length,rev=rows.reduce((a,x)=>a+ +x.revenue,0),cogs=rows.filter(x=>['sale','reversal'].includes(x.category)).reduce((a,x)=>a+ +(x.cost||0),0),loss=rows.filter(x=>x.category==='loss').reduce((a,x)=>a+ +(x.cost||0),0);
 const paidOrders=(s.orders||[]).filter(o=>isPaid(o)&&o.store_id===store&&o.paid_date>=from&&o.paid_date<=to);
 const margins=orderMargins(s,paidOrders),recovered=margins.filter(m=>m.recovered);
 const allocated=new Map();for(const m of margins){const known=m.cost!=null&&m.sources.every(x=>x.cost!=null),base=m.sources.reduce((a,x)=>a+(x.cost||0),0);if(!known||base<=0)continue;for(const src of m.sources){const row=allocated.get(src.supplierId)||{revenue:0,cost:0};row.revenue+=m.revenue*src.cost/base;row.cost+=src.cost;allocated.set(src.supplierId,row);}}

 const fruitRows=(s.sales||[]).filter(x=>!x.voided&&x.storeId===store&&x.date>=from&&x.date<=to).flatMap(x=>x.lines).concat((s.orders||[]).filter(o=>isPaid(o)&&o.store_id===store&&o.paid_date>=from&&o.paid_date<=to).flatMap(o=>o.lines.filter(l=>l.itemType==='fruit').map(l=>({...l,total:l.price*l.qty,supplierId:s.lots.find(x=>x.id===l.lotId)?.supplierId}))));
 document.querySelector('#finance-result').innerHTML=`${unknown?`<div class="notice">${unknown} transaksi memiliki biaya belum diketahui. Laba belum dapat dinyatakan lengkap; biaya lama tidak diasumsikan nol.</div>`:''}<div class="stats"><div class="stat"><small>Omzet tercatat sejak upgrade</small><strong>${money(rev)}</strong></div><div class="stat"><small>Biaya barang terjual</small><strong>${money(cogs)}</strong></div><div class="stat"><small>Waste / penyusutan</small><strong>${money(loss)}</strong></div><div class="stat"><small>Laba kotor setelah waste</small><strong>${unknown?'Belum lengkap':money(rev-cogs-loss)}</strong></div></div><h3>Penjualan buah per supplier</h3>${table(['Supplier','Kg / butir','Omzet'],s.suppliers.filter(x=>!supplier||x.id===supplier).map(x=>{const r=fruitRows.filter(l=>l.supplierId===x.id);return `<tr><td>${e(x.name)}</td><td>${num(r.reduce((a,l)=>a+ +l.kg,0))} kg / ${r.reduce((a,l)=>a+ +l.pieces,0)} butir</td><td>${money(r.reduce((a,l)=>a+ +l.total,0))}</td></tr>`}))}<h3>Produk terjual yang memakai hasil olahan reject</h3><p class="muted">Termasuk pemakaian melalui resep bertingkat. Laba per item mencakup seluruh bahan item tersebut.</p>${table(['Produk / pesanan','Omzet','Biaya bahan','Laba kotor item'],recovered.map(o=>`<tr><td>${e(o.name)}<small>${e(o.orderId.slice(0,8))}</small></td><td>${money(o.revenue)}</td><td>${cost(o.cost)}</td><td>${cost(o.profit)}</td></tr>`))}<h3>Alokasi penjualan pesanan menurut supplier bahan</h3><p class="muted">Untuk produk campuran, omzet dialokasikan menurut proporsi modal bahan. Ini alokasi analitis, bukan penjualan langsung buah. Item tanpa modal lengkap atau modal nol tidak dialokasikan.</p>${table(['Supplier','Alokasi omzet','Modal bahan','Selisih'],[...allocated].filter(([key])=>!supplier||key===supplier).map(([key,x])=>`<tr><td>${e(nm(s,'suppliers',key))}</td><td>${money(x.revenue)}</td><td>${money(x.cost)}</td><td>${money(x.revenue-x.cost)}</td></tr>`))}<h3>Rincian biaya & pendapatan</h3>${table(['Kegiatan','Pendapatan','Biaya'],rows.map(x=>`<tr><td>${e(x.note)}</td><td>${money(x.revenue)}</td><td>${cost(x.cost)}</td></tr>`))}<p class="muted">Modal buah reject yang diolah dipindahkan ke hasil menurut berat hasil. Selisih kulit/biji belum dianggap kerugian rupiah tersendiri agar modal tidak dihitung dua kali.</p>`;};for(const k of ['finance-from','finance-to','finance-supplier'])document.getElementById(k).onchange=renderFinance;renderFinance();
 }
}
export function clearOrderDraft(){draft=[];}

function kitchenPage(s,store) {
 const orders=(s.orders||[]).filter(o=>o.store_id===store&&isPaid(o)&&needsKitchen(o)&&['queued','preparing','ready'].includes(o.status)).sort((a,b)=>(a.created_at||a.business_date).localeCompare(b.created_at||b.business_date));
 return header('Antrean Kitchen','Hanya menu resep yang sudah lunas masuk antrean. Tekan Mulai buat, lalu Selesai / siap saat pesanan selesai.', '<button id="kitchen-sound" type="button">Aktifkan suara</button>')+
 `<div class="kitchen-status" id="kitchen-sync" role="status">Pembaruan otomatis setiap 5 detik · ${orders.filter(o=>o.status==='queued').length} pesanan menunggu</div><div class="kitchen-board">${[['queued','Pesanan baru'],['preparing','Sedang dibuat'],['ready','Selesai / siap']].map(([status,label])=>`<section class="kitchen-lane"><h3>${label}<span>${orders.filter(o=>o.status===status).length}</span></h3>${orders.filter(o=>o.status===status).map(o=>`<article class="kitchen-ticket"><div class="header-row"><b>#${e(o.id.slice(0,8))}</b><span class="muted">${e(o.business_date)}</span></div><span class="pill">Lunas</span><p class="kitchen-note">${e(o.note||'Tanpa catatan')}</p><ul>${o.lines.filter(l=>l.itemType==='recipe').map(l=>`<li><strong>${num(l.qty)} ${e(l.unit)}</strong><span>${e(l.name)}</span>${l.kg?`<small>${num(l.kg)} kg aktual · ${l.pieces} butir</small>`:''}</li>`).join('')}</ul>${status==='queued'&&(allowed(s,'kitchen')||!o.lines.some(l=>l.itemType==='recipe'))?button('Mulai buat','order_start',o.id,'primary full'):''}${status==='preparing'&&(allowed(s,'kitchen')||!o.lines.some(l=>l.itemType==='recipe'))?button('Selesai / siap','order_ready',o.id,'primary full'):''}${status==='ready'?'<p class="muted">Siap disajikan / diserahkan</p>':''}</article>`).join('')||'<p class="empty">Belum ada pesanan</p>'}</section>`).join('')}</div>`;
}

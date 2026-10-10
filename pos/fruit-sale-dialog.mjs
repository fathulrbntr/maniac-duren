import {escape as e,today,num,money} from './core.mjs?v=10';
import {availableStock,requirements,checkOrder} from './order-stock.mjs?v=12';
import {sumProducts} from './decimal-totals.mjs?v=66';
import {posVisible} from './pos-categories.mjs?v=52';

const dateLabel=value=>value.split('-').reverse().join('/');
const field=(label,control)=>`<label class="field">${label}${control}</label>`;
const supplierName=(s,id)=>s.suppliers?.find(x=>x.id===id)?.name||'Supplier tidak tersedia';
export function parseFruitReceiptDate(value) {
  const raw=String(value??'').trim();
  if(!/^(?:\d{8}|\d{2}\/\d{2}\/\d{4})$/.test(raw))return null;
  const digits=raw.replaceAll('/',''),day=Number(digits.slice(0,2)),month=Number(digits.slice(2,4)),year=Number(digits.slice(4));
  if(year<1000||month<1||month>12||day<1)return null;
  const parsed=new Date(Date.UTC(year,month-1,day));
  return parsed.getUTCFullYear()===year&&parsed.getUTCMonth()===month-1&&parsed.getUTCDate()===day?parsed.toISOString().slice(0,10):null;
}

export function fruitSaleLots(s,store,productId,draft,date=today()) {
  const available=availableStock(s,store,date),used=requirements(s,draft);
  return (s.lots||[]).filter(l=>l.storeId===store&&l.productId===productId&&l.quality==='ready'&&l.date<=date).map(l=>{
    const key='lot:'+l.id,left=available.get(key)||{qty:0,pieces:0},taken=used.get(key)||{qty:0,pieces:0};
    return {...l,kg:left.qty-taken.qty,pieces:left.pieces-taken.pieces};
  }).filter(l=>l.kg>1e-8&&l.pieces>=1);
}

export function fruitSaleDialog({productId,scale=null,getState,getDraft,store,modal,onAdd,onClose,verifyBarcode}) {
  const initial=getState(),product=initial.products.find(p=>p.id===productId);
  if(!product||!posVisible(product)||product.stockUnit!=='kg_butir')throw Error('Produk buah tidak tersedia.');
  if(!fruitSaleLots(initial,store,productId,getDraft()).length)throw Error('Stok buah siap jual habis pada outlet ini.');
  const d=modal('Penjualan buah',`<div class="fruit-sale-heading"><h3>${e(product.name)}</h3><p class="muted">Ketik tanggal → Enter · pilih supplier ↑ ↓ → Enter · pilih kg/butir ↑ ↓ → Enter${scale?' masuk keranjang.':' lalu isi berat dan jumlah buah.'}</p></div>
    ${scale?`<div class="fruit-sale-measures"><div><span>Berat label</span><strong>${num(scale.kg)} kg</strong></div><div><span>Jumlah buah</span><strong>1 butir</strong></div></div>`:''}
    ${field('1. Tanggal barang masuk','<input name="receiptDate" type="text" inputmode="numeric" maxlength="10" autocomplete="off" placeholder="DDMMYYYY · contoh 09102026" aria-describedby="fruit-date-help" required>')}
    <p id="fruit-date-help" class="fruit-sale-hint">Ketik 8 angka, lalu Enter. Contoh: 09102026 = 09/10/2026.</p>
    ${field('2. Supplier','<select name="lotId" aria-describedby="fruit-stock-help" required disabled></select>')}
    <p id="fruit-stock-help" data-fruit-stock class="muted" role="status"></p>
    ${field('3. Cara jual','<select name="unit" required><option value="KG">Per kg</option><option value="BUTIR">Per butir</option></select>')}
    ${scale?'':`<div class="fruit-sale-measures-input">${field('Berat buah aktual (kg)','<input name="kg" type="number" min="0.000001" step="any" required>')}${field('Jumlah butir terjual','<input name="pieces" type="number" min="1" step="1" value="1" required>')}</div>`}
    <div class="fruit-sale-summary"><div><span data-fruit-price-label>Harga per kg</span><strong data-fruit-price></strong></div><div><span>Subtotal</span><strong data-fruit-total></strong></div></div>`,'Tambah ke pesanan');
  d.classList.add('fruit-sale-modal');
  const form=d.querySelector('form'),control=name=>form.elements.namedItem(name),submit=d.querySelector('[type="submit"]');
  let finished=false,displayedPrice=null,lastDate=null;
  const active=()=>!finished&&d.hasAttribute('open');
  const error=message=>d.querySelector('#form-error').textContent=message;
  const focus=name=>control(name).focus();
  const reject=(name,message)=>{focus(name);throw Error(message);};
  const quantities=()=>({kg:scale?scale.kg:Number(control('kg').value),pieces:scale?1:Number(control('pieces').value)});
  const currentProduct=()=>getState().products.find(p=>p.id===productId);
  const validProduct=p=>p&&posVisible(p)&&p.stockUnit==='kg_butir';
  const priceFor=p=>Number(control('unit').value==='KG'?p?.priceKg:p?.pricePiece);
  const dateLots=()=>{
    const date=parseFruitReceiptDate(control('receiptDate').value);
    return date?fruitSaleLots(getState(),store,productId,getDraft()).filter(l=>l.date===date&&l.supplierId):[];
  };
  function preview() {
    const p=currentProduct(),price=priceFor(p),{kg,pieces}=quantities(),qty=control('unit').value==='KG'?kg:pieces;
    displayedPrice=price;
    d.querySelector('[data-fruit-price-label]').textContent=control('unit').value==='KG'?'Harga per kg':'Harga per butir';
    d.querySelector('[data-fruit-price]').textContent=Number.isFinite(price)&&price>0?money(price):'Belum diisi';
    d.querySelector('[data-fruit-total]').textContent=Number.isFinite(qty)&&qty>0&&Number.isFinite(price)&&price>0?money(sumProducts([[qty,price]])):'—';
  }
  function refresh() {
    if(!active())return;
    const s=getState(),date=parseFruitReceiptDate(control('receiptDate').value),lots=dateLots(),select=control('lotId');
    const oldLot=date===lastDate?select.value:'';lastDate=date;
    const counts=new Map();for(const lot of lots)counts.set(lot.supplierId,(counts.get(lot.supplierId)||0)+1);
    const rows=lots.map(l=>({id:l.id,name:supplierName(s,l.supplierId)+(counts.get(l.supplierId)>1?` · ${num(l.kg)} kg / ${l.pieces} butir · ${l.id.slice(0,8)}${l.note?' · '+l.note:''}`:'')})).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
    const html='<option value="">Pilih supplier</option>'+rows.map(r=>`<option value="${e(r.id)}">${e(r.name)}</option>`).join('');
    // Avoid replacing a native select's options during polling when nothing changed.
    if(select.innerHTML!==html)select.innerHTML=html;
    select.value=rows.some(r=>r.id===oldLot)?oldLot:'';select.disabled=!rows.length;
    const chosen=lots.find(l=>l.id===select.value);
    d.querySelector('[data-fruit-stock]').textContent=chosen?`Tersedia: ${num(chosen.kg)} kg / ${chosen.pieces} butir.`:date&&!lots.length?'Tidak ada stok siap jual untuk tanggal ini.':[...counts.values()].some(count=>count>1)?'Supplier dengan beberapa penerimaan ditampilkan per penerimaan. Pilih asal buah yang sesuai.':date?'Pilih supplier dengan tombol ↑ ↓, lalu Enter.':'Ketik tanggal masuk untuk melihat supplier yang tersedia.';
    submit.disabled=!validProduct(currentProduct())||!fruitSaleLots(s,store,productId,getDraft()).length;
    preview();
  }
  function checkDate() {
    const date=parseFruitReceiptDate(control('receiptDate').value);
    if(!date)reject('receiptDate','Isi tanggal barang masuk dengan 8 angka DDMMYYYY yang valid, contoh 09102026.');
    if(!dateLots().length)reject('receiptDate',`Tidak ada stok buah siap jual pada ${dateLabel(date)} di outlet ini.`);
    return date;
  }
  function checkSource() {
    checkDate();
    const lot=dateLots().find(l=>l.id===control('lotId').value);
    if(!lot)reject('lotId','Pilih supplier / penerimaan yang masih tersedia pada tanggal ini.');
    return lot;
  }
  control('receiptDate').oninput=()=>{error('');refresh();};
  control('receiptDate').onchange=()=>{error('');refresh();};
  control('lotId').onchange=()=>{error('');refresh();};
  control('unit').onchange=()=>{error('');preview();};
  if(!scale)for(const name of ['kg','pieces'])control(name).addEventListener('input',preview);
  // Cancelling a temporary cart selection never writes master data or stock.
  for(const event of ['input','change'])d.addEventListener(event,()=>d.dataset.dirty='false');
  function addToCart() {
    if(!active())return;
    try {
      const s=getState(),p=currentProduct();
      if(!validProduct(p))throw Error('Produk buah sudah berubah atau tidak tersedia.');
      verifyBarcode?.();
      const lot=checkSource(),{kg,pieces}=quantities(),unit=control('unit').value,price=priceFor(p);
      if(!['KG','BUTIR'].includes(unit))reject('unit','Pilih cara jual buah.');
      if(!Number.isFinite(kg)||kg<=0)reject(scale?'unit':'kg','Isi berat buah positif.');
      if(!Number.isInteger(pieces)||pieces<=0)reject(scale?'unit':'pieces','Isi jumlah butir bulat minimal 1.');
      if(!Number.isFinite(price)||price<=0)reject('unit','Harga jual untuk cara jual ini belum diisi di Master Barang.');
      if(price!==displayedPrice){preview();reject('unit','Harga jual berubah. Periksa harga terbaru lalu tambah kembali.');}
      const line={productId,lotId:lot.id,supplierId:lot.supplierId,unit,kg,pieces,qty:unit==='KG'?kg:pieces,price};
      const stock=checkOrder(s,store,[...getDraft(),line],today());if(!stock.ok)throw Error(stock.reason);
      if(onAdd(line,lot)===false)throw Error('Buah belum ditambahkan. Periksa stok dan ulangi.');
      finished=true;submit.disabled=true;d.close();
    }catch(err){error(err.message);}
  }
  function advance(name) {
    error('');
    if(name==='receiptDate'){
      const date=checkDate();control('receiptDate').value=dateLabel(date);refresh();
      const supplier=control('lotId');if(!supplier.value){supplier.value=[...supplier.options].find(o=>o.value&&!o.disabled)?.value||'';refresh();}
      focus('lotId');
    }else if(name==='lotId'){checkSource();focus('unit');}
    else if(name==='unit'){checkSource();if(scale)addToCart();else focus('kg');}
    else if(name==='kg'){
      if(!Number.isFinite(Number(control('kg').value))||Number(control('kg').value)<=0)reject('kg','Isi berat buah positif.');
      focus('pieces');control('pieces').select?.();
    }else addToCart();
  }
  for(const name of ['receiptDate','lotId','unit',...(!scale?['kg','pieces']:[])])control(name).addEventListener('keydown',ev=>{
    if(ev.key==='Enter'){
      ev.preventDefault();ev.stopPropagation?.();
      if(!active()||ev.repeat||ev.isComposing||ev.ctrlKey||ev.altKey||ev.metaKey)return;
      try{advance(name);}catch(err){error(err.message);}return;
    }
    if(!['lotId','unit'].includes(name)||!['ArrowUp','ArrowDown'].includes(ev.key)||ev.altKey||ev.ctrlKey||ev.metaKey||ev.isComposing)return;
    ev.preventDefault();if(!active()||control(name).disabled)return;
    const c=control(name),options=[...c.options].filter(o=>o.value&&!o.disabled),index=options.findIndex(o=>o.value===c.value);
    if(options.length){const next=index<0?(ev.key==='ArrowDown'?0:options.length-1):Math.max(0,Math.min(options.length-1,index+(ev.key==='ArrowDown'?1:-1)));c.value=options[next].value;c.onchange();}
  });
  form.onsubmit=ev=>{ev.preventDefault();addToCart();};
  d.addEventListener('close',()=>onClose?.(finished));
  refresh();focus('receiptDate');return {dialog:d,refresh};
}

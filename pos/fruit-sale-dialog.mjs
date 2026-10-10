import {escape as e,today,num,money} from './core.mjs?v=10';
import {availableStock,requirements,checkOrder} from './order-stock.mjs?v=12';
import {sumProducts} from './decimal-totals.mjs?v=66';
import {posVisible} from './pos-categories.mjs?v=52';

const dateLabel=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('/'):value;
const field=(label,control)=>`<label class="field">${label}${control}</label>`;
const supplierName=(s,id)=>s.suppliers?.find(x=>x.id===id)?.name||'Supplier tidak tersedia';

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
  const d=modal('Penjualan buah',`<div class="fruit-sale-heading"><h3>${e(product.name)}</h3><p class="muted">Pilih cara jual, tanggal barang masuk, lalu supplier.</p></div>
    ${scale?`<div class="fruit-sale-measures"><div><span>Berat label</span><strong>${num(scale.kg)} kg</strong></div><div><span>Jumlah buah</span><strong>1 butir</strong></div></div>`:''}
    ${field('Cara jual','<select name="unit" required><option value="KG">Per kg</option><option value="BUTIR">Per butir</option></select>')}
    <div class="fruit-sale-origins">${field('Tanggal barang masuk','<select name="receiptDate" required></select>')}${field('Supplier pada tanggal tersebut','<select name="supplierId" required disabled></select>')}</div>
    <div data-fruit-lot-field hidden>${field('Penerimaan dari supplier ini','<select name="lotId" required disabled></select>')}</div>
    <p data-fruit-stock class="muted" role="status"></p>
    ${scale?'':`<div class="fruit-sale-measures-input">${field('Berat buah aktual (kg)','<input name="kg" type="number" min="0.000001" step="any" required>')}${field('Jumlah butir terjual','<input name="pieces" type="number" min="1" step="1" value="1" required>')}</div>`}
    <div class="fruit-sale-summary"><div><span data-fruit-price-label>Harga per kg</span><strong data-fruit-price></strong></div><div><span>Subtotal</span><strong data-fruit-total></strong></div></div>`,'Tambah ke pesanan');
  d.classList.add('fruit-sale-modal');
  const form=d.querySelector('form'),control=name=>form.elements.namedItem(name),submit=d.querySelector('[type="submit"]');
  let finished=false,displayedPrice=null;
  const error=message=>d.querySelector('#form-error').textContent=message;
  const quantities=()=>({kg:scale?scale.kg:Number(control('kg').value),pieces:scale?1:Number(control('pieces').value)});
  const currentProduct=()=>getState().products.find(p=>p.id===productId);
  const validProduct=p=>p&&posVisible(p)&&p.stockUnit==='kg_butir';
  const priceFor=p=>Number(control('unit').value==='KG'?p?.priceKg:p?.pricePiece);
  const fill=(name,rows,prompt,selected='')=>{
    const c=control(name);c.innerHTML=`<option value="">${e(prompt)}</option>`+rows.map(r=>`<option value="${e(r.id)}">${e(r.name)}</option>`).join('');
    c.value=rows.some(r=>r.id===selected)?selected:'';
  };
  function preview() {
    const p=currentProduct(),price=priceFor(p),{kg,pieces}=quantities(),qty=control('unit').value==='KG'?kg:pieces;
    displayedPrice=price;
    d.querySelector('[data-fruit-price-label]').textContent=control('unit').value==='KG'?'Harga per kg':'Harga per butir';
    d.querySelector('[data-fruit-price]').textContent=Number.isFinite(price)&&price>0?money(price):'Belum diisi';
    d.querySelector('[data-fruit-total]').textContent=Number.isFinite(qty)&&qty>0&&Number.isFinite(price)&&price>0?money(sumProducts([[qty,price]])):'—';
  }
  function refresh(resetSupplier=false,resetLot=false) {
    if(finished||!d.hasAttribute('open'))return;
    const s=getState(),lots=fruitSaleLots(s,store,productId,getDraft());
    const oldDate=control('receiptDate').value,oldSupplier=resetSupplier?'':control('supplierId').value,oldLot=resetLot?'':control('lotId').value;
    const dates=[...new Set(lots.map(l=>l.date))].sort().reverse();
    fill('receiptDate',dates.map(date=>({id:date,name:dateLabel(date)})),'Pilih tanggal masuk',oldDate);
    const dateLots=lots.filter(l=>l.date===control('receiptDate').value);
    const suppliers=[...new Set(dateLots.map(l=>l.supplierId))].filter(Boolean).map(id=>({id,name:supplierName(s,id)})).sort((a,b)=>a.name.localeCompare(b.name));
    fill('supplierId',suppliers,'Pilih supplier',oldSupplier);control('supplierId').disabled=!control('receiptDate').value;
    const matches=dateLots.filter(l=>l.supplierId===control('supplierId').value);
    fill('lotId',matches.map(l=>({id:l.id,name:`${num(l.kg)} kg / ${l.pieces} butir · ${l.id.slice(0,8)}${l.note?' · '+l.note:''}`})),'Pilih penerimaan',matches.length===1?matches[0].id:oldLot);
    control('lotId').disabled=!control('supplierId').value;
    d.querySelector('[data-fruit-lot-field]').hidden=matches.length<=1;
    const chosen=matches.find(l=>l.id===control('lotId').value);
    d.querySelector('[data-fruit-stock]').textContent=chosen?`Tersedia: ${num(chosen.kg)} kg / ${chosen.pieces} butir.`:!lots.length?'Stok buah siap jual habis.':matches.length>1?'Ada beberapa penerimaan pada tanggal dan supplier ini. Pilih penerimaan yang sesuai.':'Pilihan hanya menampilkan stok siap jual di outlet ini.';
    submit.disabled=!lots.length||!validProduct(currentProduct());
    preview();
  }
  control('receiptDate').onchange=()=>{error('');refresh(true,true);};
  control('supplierId').onchange=()=>{error('');refresh(false,true);};
  control('lotId').onchange=()=>{error('');refresh();};
  control('unit').onchange=()=>{error('');preview();};
  if(!scale)for(const name of ['kg','pieces'])control(name).addEventListener('input',preview);
  // Cancelling a temporary cart selection never writes master data or stock.
  for(const event of ['input','change'])d.addEventListener(event,()=>d.dataset.dirty='false');
  form.onsubmit=ev=>{
    ev.preventDefault();if(finished||!d.hasAttribute('open'))return;
    try {
      const s=getState(),p=currentProduct();
      if(!validProduct(p))throw Error('Produk buah sudah berubah atau tidak tersedia.');
      verifyBarcode?.();
      if(!['KG','BUTIR'].includes(control('unit').value))throw Error('Pilih cara jual buah.');
      if(!control('receiptDate').value)throw Error('Pilih tanggal barang masuk.');
      if(!control('supplierId').value)throw Error('Pilih supplier pada tanggal tersebut.');
      const lot=fruitSaleLots(s,store,productId,getDraft()).find(l=>l.id===control('lotId').value&&l.date===control('receiptDate').value&&l.supplierId===control('supplierId').value);
      if(!lot)throw Error('Pilih penerimaan yang masih tersedia untuk tanggal dan supplier ini.');
      const {kg,pieces}=quantities(),unit=control('unit').value,price=priceFor(p);
      if(!Number.isFinite(kg)||kg<=0||!Number.isInteger(pieces)||pieces<=0)throw Error('Isi berat positif dan jumlah butir bulat minimal 1.');
      if(!Number.isFinite(price)||price<=0)throw Error('Harga jual untuk cara jual ini belum diisi di Master Barang.');
      if(price!==displayedPrice){preview();throw Error('Harga jual berubah. Periksa harga terbaru lalu tambah kembali.');}
      const line={productId,lotId:lot.id,supplierId:lot.supplierId,unit,kg,pieces,qty:unit==='KG'?kg:pieces,price};
      const stock=checkOrder(s,store,[...getDraft(),line],today());if(!stock.ok)throw Error(stock.reason);
      if(onAdd(line,lot)===false)throw Error('Buah belum ditambahkan. Periksa stok dan ulangi.');
      finished=true;submit.disabled=true;d.close();
    }catch(err){error(err.message);}
  };
  d.addEventListener('close',()=>onClose?.(finished));
  refresh();return {dialog:d,refresh};
}

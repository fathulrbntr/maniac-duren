import {escape as e,num} from './core.mjs';
import {normalizeBarcode,bindBarcodeInput} from './barcode-scanner.mjs';
import {fruitLot,stockScanCandidate,checkFruitStockSelection} from './fruit-stock.mjs';

// Keep one supplier batch per transaction. Never infer a batch from the label date.
export function attachFruitScanSelection(dialog,{state,store,sourceName='sourceLotId',weightName='kg',states=['available','reject']}){
 const form=dialog.querySelector('form'),c=name=>form.elements.namedItem(name),source=c(sourceName);
 const box=document.createElement('section');box.className='fruit-scan-selection';
 box.innerHTML='<label class="field">Scan barcode buah<div class="fruit-scan-entry"><input data-fruit-scan type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="256" placeholder="Scan label tracking 26 digit"><button type="button" data-fruit-scan-add>Tambah</button></div></label><p data-fruit-scan-status role="status" aria-live="polite"></p><div data-fruit-link hidden><p data-fruit-link-message></p><button type="button" data-fruit-link-confirm>Gunakan batch ini</button><button type="button" data-fruit-link-cancel>Batal</button></div><div data-fruit-scan-list></div><p data-fruit-scan-summary></p>';
 // Main app uses div.field; Reject uses label.field. Support both structures.
 const anchor=source.closest('.field')||source.closest('label')||source;
 anchor.parentNode.insertBefore(box,anchor.nextSibling);
 const input=box.querySelector('[data-fruit-scan]'),status=box.querySelector('[data-fruit-scan-status]'),linkBox=box.querySelector('[data-fruit-link]');
 let units=[],chosen=source.value,pending=null;
 const label=(key,id)=>state[key]?.find(x=>x.id===id)?.name||'—';
 const batchText=lot=>`${label('products',lot.productId)} · ${label('suppliers',lot.supplierId)} · masuk ${lot.date} · batch ${lot.id.slice(0,8)}`;
 const message=(text,error=false)=>{status.textContent=text;status.dataset.error=String(error);};
 const draw=()=>{
  const lot=fruitLot(state,source.value),fruit=!!lot;
  for(const name of [weightName,'pieces'])if(c(name))c(name).readOnly=fruit;
  if(fruit){c(weightName).value=units.length?units.reduce((n,u)=>n+u.grams,0)/1000:'';c('pieces').value=units.length||'';}
  box.hidden=!fruit;
  box.querySelector('[data-fruit-scan-list]').innerHTML=units.map(u=>`<div class="fruit-scan-row"><div><code>${e(u.barcode)}</code><small>${u.pendingLink?'Tautan batch akan disimpan':'Label terdaftar'}</small></div><strong>${num(u.grams/1000)} kg</strong><button type="button" data-remove-fruit="${e(u.barcode)}" aria-label="Hapus barcode ${e(u.barcode)}">×</button></div>`).join('');
  box.querySelectorAll('[data-remove-fruit]').forEach(b=>b.onclick=()=>{units=units.filter(x=>x.barcode!==b.dataset.removeFruit);draw();input.focus();});
  box.querySelector('[data-fruit-scan-summary]').textContent=lot?`${units.length} butir · ${num(units.reduce((n,u)=>n+u.grams,0)/1000)} kg dipilih. Sisa batch: ${num(lot.kg)} kg / ${lot.pieces} butir. ${batchText(lot)}`:'';
  if(c(weightName))c(weightName).dispatchEvent(new Event('input',{bubbles:true}));
 };
 const sync=()=>{
  if(chosen!==source.value){chosen=source.value;units=[];pending=null;linkBox.hidden=true;message('Batch diubah. Scan buah dari batch ini.');}
  const shrink=c('cause')?.querySelector('[value="shrinkage"]');
  if(shrink){shrink.disabled=!!fruitLot(state,source.value);if(shrink.disabled&&c('cause').value==='shrinkage')c('cause').value='discard';}
  draw();
 };
 source.addEventListener('change',sync);
 function add(unit){
  if(units.some(u=>u.barcode.slice(0,16)===unit.barcode.slice(0,16)))throw Error('Barcode ini sudah dipilih; jumlah tidak ditambahkan lagi.');
  if(units.length&&unit.lotId!==source.value)throw Error('Selesaikan batch ini dahulu, lalu scan buah dari batch lain.');
  if(![...source.options].some(o=>o.value===unit.lotId))throw Error('Batch buah tidak tersedia untuk tindakan ini.');
  if(source.value!==unit.lotId){source.value=unit.lotId;source.dispatchEvent(new Event('change',{bubbles:true}));}
  const next=[...units,unit];checkFruitStockSelection(state,source.value,next);units=next;pending=null;linkBox.hidden=true;draw();message(`${units.length} buah dipilih. Siap scan berikutnya.`);input.focus();
 }
 const scan=bindBarcodeInput(input,{onScan:(raw,settings)=>{
  if(pending)throw Error('Konfirmasi atau batalkan batch label sebelumnya terlebih dahulu.');
  const code=normalizeBarcode(raw,settings),unit=stockScanCandidate(state,code,store,source.value,states);
  if(units.some(u=>u.barcode.slice(0,16)===code.slice(0,16)))throw Error('Barcode ini sudah dipilih; jumlah tidak ditambahkan lagi.');
  if(unit.pendingLink){
   checkFruitStockSelection(state,source.value,[...units,unit]);pending=unit;linkBox.hidden=false;
   box.querySelector('[data-fruit-link-message]').textContent=`Label ${code} (${num(unit.grams/1000)} kg) belum tertaut. Pastikan buah berasal dari ${batchText(fruitLot(state,source.value))}. Stok tidak ditambah; label ditautkan saat pencatatan disimpan.`;
   message('Pastikan batch asal untuk label yang belum terdaftar.');
  }else add(unit);
 },onError:msg=>message(msg,true)});
 box.querySelector('[data-fruit-scan-add]').onclick=scan;
 box.querySelector('[data-fruit-link-confirm]').onclick=()=>{try{if(pending)add(pending);}catch(err){message(err.message,true);}};
 box.querySelector('[data-fruit-link-cancel]').onclick=()=>{pending=null;linkBox.hidden=true;input.value='';message('Label dibatalkan. Siap scan berikutnya.');input.focus();};
 message('Scan buah satu per satu. Batch, supplier, berat, dan butir mengikuti label terdaftar.');sync();
 return {focus:()=>{if(!box.hidden)input.focus();},payload:()=>{
  if(!fruitLot(state,source.value))return {};
  if(pending)throw Error('Konfirmasi atau batalkan batch label sebelum menyimpan.');
  if(input.value.trim())throw Error('Tekan Tambah atau Enter untuk mencatat barcode yang masih di kolom scan.');
  const result=checkFruitStockSelection(state,source.value,units);
  return {...result,[weightName]:result.kg};
 }};
}

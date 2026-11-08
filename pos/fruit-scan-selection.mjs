import {escape as e,num} from './core.mjs';
import {normalizeBarcode,bindBarcodeInput} from './barcode-scanner.mjs';
import {fruitLot,stockScanCandidate,checkFruitStockSelection} from './fruit-stock.mjs';

// Draft scan log mirrors receipt weighing. Only the parent form commits stock.
export function attachFruitScanSelection(dialog,{state,store,sourceName='sourceLotId',weightName='kg',states=['available','reject']}){
 const form=dialog.querySelector('form'),c=name=>form.elements.namedItem(name),source=c(sourceName);
 const box=document.createElement('section');box.className='fruit-scan-selection';
 box.innerHTML='<div class="fruit-scan-overview"><div><strong>Catatan barcode buah</strong><p data-fruit-scan-summary aria-live="polite"></p></div><button type="button" data-fruit-scan-open>Catat barcode buah</button></div><p data-fruit-batch-info class="form-help"></p><p class="form-help">Hanya label yang sudah terdaftar pada batch ini yang dapat dicatat. Stok berubah setelah pencatatan utama diselesaikan.</p>';
 const anchor=source.closest('.field')||source.closest('label')||source;
 anchor.parentNode.insertBefore(box,anchor.nextSibling);
 const opener=box.querySelector('[data-fruit-scan-open]');
 let units=[],chosen=source.value,child=null,scanInput=null,sequence=0;
 const label=(key,id)=>state[key]?.find(x=>x.id===id)?.name||'—';
 const batchText=lot=>`${label('products',lot.productId)} · ${label('suppliers',lot.supplierId)} · masuk ${lot.date} · batch ${lot.id.slice(0,8)}`;
 const total=()=>units.reduce((n,u)=>n+u.grams,0)/1000;
 function draw(){
  const lot=fruitLot(state,source.value),fruit=!!lot;
  for(const name of [weightName,'pieces'])if(c(name))c(name).readOnly=fruit;
  if(fruit){c(weightName).value=units.length?total():'';c('pieces').value=units.length||'';}
  box.hidden=!fruit;
  box.querySelector('[data-fruit-scan-summary]').textContent=units.length?`${units.length} butir · ${num(total())} kg tercatat`:'Belum ada buah dicatat';
  box.querySelector('[data-fruit-batch-info]').textContent=lot?`Stok batch: ${num(lot.kg)} kg / ${lot.pieces} butir. Setelah pencatatan: ${num(Number(lot.kg)-total())} kg / ${Number(lot.pieces)-units.length} butir.`:'';
  if(child){
   child.querySelector('[data-fruit-scan-list]').innerHTML=units.length?`<table><thead><tr><th>Catatan / barcode</th><th>Berat</th><th>Butir</th><th>Aksi</th></tr></thead><tbody>${[...units].reverse().map(u=>`<tr><td><strong>Buah ${u.scanNo}</strong><small>${e(new Date(u.scannedAt).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'}))}</small><code>${e(u.barcode)}</code></td><td>${num(u.grams/1000)} kg</td><td>1</td><td><button type="button" data-remove-fruit="${e(u.barcode)}" aria-label="Hapus barcode ${e(u.barcode)}">Hapus</button></td></tr>`).join('')}</tbody></table>`:'<p class="empty">Belum ada hasil scan. Scan buah dari batch yang dipilih.</p>';
   child.querySelector('[data-fruit-scan-total]').textContent=`Total ${units.length} butir · ${num(total())} kg`;
   child.querySelectorAll('[data-remove-fruit]').forEach(b=>b.onclick=()=>{units=units.filter(x=>x.barcode!==b.dataset.removeFruit);draw();scanInput.focus();});
  }
  c(weightName)?.dispatchEvent(new Event('input',{bubbles:true}));
 }
 source.addEventListener('change',()=>{
  if(chosen!==source.value){
   if(units.length&&!confirm('Ganti batch asal? Catatan barcode sementara akan dikosongkan.')){source.value=chosen;return;}
   chosen=source.value;units=[];sequence=0;if(child)child.close();
  }
  const shrink=c('cause')?.querySelector('[value="shrinkage"]');
  if(shrink){shrink.disabled=!!fruitLot(state,source.value);if(shrink.disabled&&c('cause').value==='shrinkage')c('cause').value='discard';}
  draw();
 });
 opener.onclick=()=>{
  const lot=fruitLot(state,source.value);if(!lot||child)return;
  child=document.createElement('dialog');child.className='modal weighing-dialog fruit-stock-scan-dialog';
  child.innerHTML=`<div class="modal-head"><h2>Catat barcode buah</h2><button type="button" data-fruit-scan-close aria-label="Tutup pencatatan barcode">×</button></div><p class="fruit-scan-batch">${e(batchText(lot))}</p><form class="weigh-scan"><label>Scan barcode buah<div class="weigh-scan-controls"><input data-fruit-scan type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="256" placeholder="Scan label tracking 26 digit"><button type="submit" data-fruit-scan-add>Catat barcode</button></div></label><p data-fruit-scan-status role="status" aria-live="polite">Scan buah satu per satu dari batch ini.</p></form><div data-fruit-scan-list class="table-wrap"></div><p data-fruit-scan-total class="fruit-scan-total" aria-live="polite"></p><p class="form-help">Catatan terbaru tampil paling atas. Selesai mencatat menyimpan daftar sementara; stok belum berubah.</p><div class="modal-actions"><button type="button" data-fruit-scan-close class="primary">Selesai mencatat</button></div>`;
  document.body.append(child);scanInput=child.querySelector('[data-fruit-scan]');
  const status=child.querySelector('[data-fruit-scan-status]'),message=(text,error=false)=>{status.textContent=text;status.dataset.error=String(error);};
  const scan=bindBarcodeInput(scanInput,{onScan:(raw,settings)=>{
   if(source.value!==chosen)throw Error('Batch asal berubah. Tutup pencatatan dan pilih ulang batch.');
   const code=normalizeBarcode(raw,settings),unit=stockScanCandidate(state,code,store,chosen,states);
   if(units.some(u=>u.barcode.slice(0,16)===code.slice(0,16)))throw Error('Barcode ini sudah dicatat; jumlah tidak ditambahkan lagi.');
   checkFruitStockSelection(state,chosen,[...units,unit]);
   units.push({...unit,scanNo:++sequence,scannedAt:new Date().toISOString()});draw();message(`Buah ${sequence} tercatat. Siap scan berikutnya.`);scanInput.focus();
  },onError:msg=>message(msg,true)});
  child.querySelector('form').onsubmit=ev=>{ev.preventDefault();return scan();};
  const close=()=>{if(scanInput.value.trim()&&!confirm('Barcode di kolom scan belum dicatat. Tutup dan abaikan isi kolom tersebut?'))return;child.close();};
  child.querySelectorAll('[data-fruit-scan-close]').forEach(b=>b.onclick=close);
  child.oncancel=ev=>{ev.preventDefault();close();};
  const opened=child;child.onclose=()=>{opened.remove();child=null;scanInput=null;opener.focus();};
  draw();child.showModal();scanInput.focus();
 };
 dialog.addEventListener('close',()=>{if(child)child.close();});
 draw();
 return {focus:()=>{if(!box.hidden)opener.focus();},payload:()=>{
  if(!fruitLot(state,source.value))return {};
  if(child)throw Error('Klik Selesai mencatat sebelum menyelesaikan pencatatan utama.');
  if(source.value!==chosen)throw Error('Batch asal berubah. Pilih ulang batch dan catat barcode kembali.');
  units.forEach(u=>stockScanCandidate(state,u.barcode,store,source.value,states));
  const result=checkFruitStockSelection(state,source.value,units);
  return {...result,[weightName]:result.kg};
 }};
}

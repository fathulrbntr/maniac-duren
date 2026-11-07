import {escape as e,num} from './core.mjs';
import {normalizeBarcode,bindBarcodeInput} from './barcode-scanner.mjs';
import {trackedFruit} from './scale-label.mjs';

// One action may contain many scanned fruits from the same supplier batch.
export function attachFruitScanSelection(dialog,{state,store,sourceName='sourceLotId',weightName='kg',states=['available','reject']}){
 if(!state.fruitUnits?.length)return {payload:()=>({})};
 const form=dialog.querySelector('form'),c=name=>form.elements.namedItem(name),source=c(sourceName);
 const box=document.createElement('section');box.className='fruit-scan-selection';
 box.innerHTML='<label class="field">Scan barcode buah<input data-fruit-scan type="text" autocomplete="off" spellcheck="false" maxlength="256" placeholder="Scan label tracking 26 digit"></label><button type="button" data-fruit-scan-add>Catat barcode</button><p data-fruit-scan-status role="status">Scan setiap buah yang akan diproses.</p><div data-fruit-scan-list></div>';
 source.closest('label').after(box);
 const input=box.querySelector('[data-fruit-scan]'),status=box.querySelector('[data-fruit-scan-status]');
 let codes=[],chosen=source.value;
 const isTracked=()=>state.fruitUnits?.some(u=>u.lotId===source.value);
 const draw=()=>{
  const units=codes.map(code=>state.fruitUnits.find(u=>u.barcode===code));
  if(isTracked()){
   c(weightName).value=units.length?units.reduce((n,u)=>n+u.grams,0)/1000:'';
   c('pieces').value=units.length||'';
  }
  box.querySelector('[data-fruit-scan-list]').innerHTML=units.map(u=>`<p><code>${e(u.barcode)}</code> · ${num(u.grams/1000)} kg <button type="button" data-remove-fruit="${e(u.barcode)}" aria-label="Hapus barcode">×</button></p>`).join('');
  box.querySelectorAll('[data-remove-fruit]').forEach(b=>b.onclick=()=>{codes=codes.filter(x=>x!==b.dataset.removeFruit);draw();input.focus();});
  c(weightName).dispatchEvent(new Event('input',{bubbles:true}));
 };
 const sync=()=>{
  if(chosen!==source.value){chosen=source.value;codes=[];}
  for(const name of [weightName,'pieces'])c(name).readOnly=!!isTracked();
  box.hidden=!state.fruitUnits?.some(u=>[...source.options].some(o=>o.value===u.lotId));
  const shrink=c('cause')?.querySelector('[value="shrinkage"]');
  if(shrink){shrink.disabled=!!isTracked();if(isTracked()&&c('cause').value==='shrinkage')c('cause').value='discard';}
  if(isTracked())draw();
 };
 source.addEventListener('change',sync);
 const scan=bindBarcodeInput(input,{
  onScan:(raw,settings)=>{
   const code=normalizeBarcode(raw,settings),unit=trackedFruit(state,code,store,states);
   if(codes.includes(code))throw Error('Barcode ini sudah dipilih; jumlah tidak ditambahkan lagi.');
   if(codes.length&&unit.lotId!==source.value)throw Error('Selesaikan batch ini dahulu, lalu proses buah dari batch lain.');
   if(![...source.options].some(o=>o.value===unit.lotId))throw Error('Batch buah tidak tersedia untuk tindakan ini.');
   if(source.value!==unit.lotId){source.value=unit.lotId;source.dispatchEvent(new Event('change',{bubbles:true}));}
   codes.push(code);draw();status.textContent=`${codes.length} buah dipilih. Siap scan berikutnya.`;input.focus();
  },onError:message=>{status.textContent=message;}
 });
 box.querySelector('[data-fruit-scan-add]').onclick=scan;
 sync();
 return {payload:()=>isTracked()?{barcodes:[...codes]}:{}};
}

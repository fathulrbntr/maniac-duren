import {escape as e,num,today,id} from './core.mjs';
import {formSection} from './workflow-ui.mjs';
import {attachFruitScanSelection} from './fruit-scan-selection.mjs';
const field=(label,html)=>`<label class="field">${label}${html}</label>`;
export function openFruitTransfer(s,store,ctx){
 const lots=s.lots.filter(l=>l.storeId===store&&l.kg>0&&l.pieces>0),destinations=s.stores.filter(x=>x.id!==store);
 if(!lots.length)return ctx.toast('Tidak ada stok buah tersedia.');
 if(!destinations.length)return ctx.toast('Belum ada outlet tujuan yang dapat dipilih.');
 const name=(key,id)=>s[key]?.find(x=>x.id===id)?.name||'—';
 const d=ctx.modal('Transfer buah',`${formSection(1,'Identitas transfer','Satu pencatatan untuk satu batch asal.')}<p class="muted">Outlet asal: ${e(name('stores',store))}</p><div class="form-grid">${field('Tanggal',`<input name="date" type="date" value="${today()}" required>`)}${field('Outlet tujuan',`<select name="toStoreId" required>${destinations.map(x=>`<option value="${e(x.id)}">${e(x.name)}</option>`).join('')}</select>`)}</div>${field('Catatan pengiriman','<input name="note" maxlength="300" required placeholder="Keterangan pengiriman">')}${formSection(2,'Catat buah yang dikirim','Pilih batch, lalu catat barcode setiap buah seperti pencatatan Barang masuk.')}${field('Batch asal',`<select name="lotId" required>${lots.map(l=>`<option value="${e(l.id)}">${e(name('products',l.productId))} · ${e(name('suppliers',l.supplierId))} · ${e(l.date)} · ${e(l.id.slice(0,8))}</option>`).join('')}</select>`)}${formSection(3,'Periksa dan selesaikan','Berat dan jumlah mengikuti label yang sudah terdaftar pada batch asal.')}<div class="form-grid">${field('Total berat (kg)','<input name="kg" type="number" step="0.001" readonly>')}${field('Total buah (butir)','<input name="pieces" type="number" readonly>')}</div><p class="form-help">Saat transfer diselesaikan, stok asal berkurang dan stok tujuan bertambah. Barcode, supplier, modal, dan jejak penerimaan tetap tersambung.</p>`,'Selesaikan transfer');
 d.classList.add('receipt-shipment-dialog','fruit-transfer-modal');
 const f=d.querySelector('form'),selection=attachFruitScanSelection(d,{state:s,store,sourceName:'lotId'}),request=id();let saving=false,completed=false;
 f.onsubmit=async ev=>{
  ev.preventDefault();if(saving||completed)return;
  const error=d.querySelector('#form-error'),submit=d.querySelector('[type="submit"]');error.textContent='';
  try{
   const p={...Object.fromEntries(new FormData(f)),id:request,storeId:store,kind:'Transfer',...selection.payload()};
   if(p.toStoreId===store||!destinations.some(x=>x.id===p.toStoreId))throw Error('Pilih outlet tujuan yang berbeda.');
   if(p.date<lots.find(l=>l.id===p.lotId).date)throw Error('Tanggal transfer tidak boleh sebelum penerimaan batch.');
   if(!confirm(`Selesaikan transfer ${p.pieces} butir (${num(p.kg)} kg) ke ${name('stores',p.toStoreId)}? Stok mengikuti batch yang dipilih.`))return;
   saving=true;submit.disabled=true;
   if(await ctx.mutate('movement',p)){completed=true;d.close();ctx.render();ctx.toast(`${p.pieces} buah (${num(p.kg)} kg) ditransfer; jejak batch tersimpan.`);}
  }catch(err){error.textContent=err.message;}finally{saving=false;if(!completed)submit.disabled=false;}
 };
 selection.focus();return d;
}

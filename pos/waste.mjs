import {isLegacyStock} from './catalog.mjs?v=5';
import {quantity} from './production.mjs?v=5';
export const wasteOutputs=[{key:'durpas500',label:'Durpas 500 gr',unit:'pcs',weight:.5},{key:'durpas1000',label:'Durpas 1 kg',unit:'pcs',weight:1},{key:'coral',label:'Coral',unit:'kg',weight:1}];
const round=n=>Math.round(n*1e6)/1e6;
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
const validDate=d=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||Number.isNaN(Date.parse(d+'T00:00:00Z'))||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d)throw Error('Tanggal tidak valid');};
export function wastePlan(s,p){
 if(!s.stores.some(x=>x.id===p.storeId))throw Error('Pilih store');
 validDate(p.date);validDate(p.receivedDate);
 if(p.date>today()||p.date<p.receivedDate)throw Error('Tanggal waste harus sejak barang masuk sampai hari ini');
 const lot=s.lots.find(x=>x.id===p.sourceLotId&&x.storeId===p.storeId&&x.date===p.receivedDate);
 const product=s.products.find(x=>x.id===lot?.productId);
 if(!lot||!product||!isLegacyStock(product))throw Error('Pilih batch durian sesuai tanggal barang masuk dan store');
 const kg=quantity(p.kg,'kg'),pieces=quantity(p.pieces,'pcs');
 if(kg>lot.kg||pieces>lot.pieces)throw Error('Stok batch tidak cukup. Perbarui stok');
 if(!p.reason?.trim()||p.reason.trim().length>300)throw Error('Alasan waste wajib, maksimal 300 karakter');
 if(!Array.isArray(p.outputs)||p.outputs.length!==3)throw Error('Isi tiga jenis hasil olahan');
 const seen=new Set(),lotIds=new Set(),outputs=[];
 for(const spec of wasteOutputs){const line=p.outputs.find(x=>x.key===spec.key);if(!line)throw Error('Jenis hasil tidak lengkap');const n=Number(line.qty);if(!Number.isFinite(n)||n<0)throw Error('Hasil tidak boleh negatif');if(n===0)continue;
  const qty=quantity(n,spec.unit),output=s.products.find(x=>x.id===line.productId);
  if(!output||!['finished','direct'].includes(output.itemType)||output.stockUnit!==spec.unit||seen.has(output.id))throw Error('Pilih produk hasil berbeda dengan satuan '+spec.unit+' untuk '+spec.label);
  if(!line.lotId||lotIds.has(line.lotId)||(s.unitLots||[]).some(x=>x.id===line.lotId))throw Error('ID batch hasil tidak valid');
  if(line.expiry){validDate(line.expiry);if(line.expiry<p.date)throw Error('Kedaluwarsa hasil sebelum tanggal waste');}
  seen.add(output.id);lotIds.add(line.lotId);outputs.push({key:spec.key,label:spec.label,productId:output.id,name:output.name,unit:spec.unit,qty,weightKg:round(qty*spec.weight),lotId:line.lotId,expiry:line.expiry||null});
 }
 const outputKg=round(outputs.reduce((sum,o)=>sum+o.weightKg,0));if(outputKg>kg)throw Error('Berat total hasil olahan melebihi berat durian yang diolah');
 return {sourceLotId:lot.id,sourceProductId:product.id,sourceName:product.name,supplierId:lot.supplierId,supplierName:s.suppliers.find(x=>x.id===lot.supplierId)?.name||'',receivedDate:lot.date,kg,pieces,outputKg,lossKg:round(kg-outputKg),outputs,reason:p.reason.trim()};
}
export function wasteAction(s,action,p){
 s.wasteRuns??=[];s.unitLots??=[];
 if(action==='waste_process'){
  if(s.wasteRuns.some(x=>x.id===p.id))return;
  const plan=wastePlan(s,p),source=s.lots.find(x=>x.id===plan.sourceLotId);
  source.kg=round(source.kg-plan.kg);source.pieces-=plan.pieces;
  for(const line of plan.outputs)s.unitLots.push({id:line.lotId,productId:line.productId,storeId:p.storeId,unit:line.unit,qty:line.qty,receivedQty:line.qty,date:p.date,expiry:line.expiry,kind:'waste',supplierId:plan.supplierId,note:'Hasil waste '+p.id});
  s.wasteRuns.push({id:p.id,storeId:p.storeId,date:p.date,...plan,voided:false,createdAt:new Date().toISOString()});return;
 }
 if(action==='waste_void'){
  const run=s.wasteRuns.find(x=>x.id===p.wasteId);if(!run)throw Error('Pencatatan waste tidak ditemukan');if(run.voided)return;
  if(!p.reason?.trim()||p.reason.trim().length>300)throw Error('Alasan hapus wajib, maksimal 300 karakter');
  for(const line of run.outputs){const lot=s.unitLots.find(x=>x.id===line.lotId);if(!lot||lot.qty!==line.qty)throw Error('Hasil olahan sudah dipakai atau stoknya berubah. Waste tidak dapat dihapus');}
  const source=s.lots.find(x=>x.id===run.sourceLotId);if(!source)throw Error('Batch asal tidak ditemukan');
  for(const line of run.outputs)s.unitLots.find(x=>x.id===line.lotId).qty=0;
  source.kg=round(source.kg+run.kg);source.pieces+=run.pieces;
  run.voided=true;run.voidReason=p.reason.trim();run.voidedAt=new Date().toISOString();return;
 }
 throw Error('Aksi waste tidak valid');
}

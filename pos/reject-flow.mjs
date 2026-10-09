import {quantity} from './production.mjs?v=59';
import {wastePlan,wasteAction} from './waste.mjs?v=43';
import {photoValue} from './product-details.mjs?v=9';
import {availableStock} from './order-stock.mjs?v=12';
export const rejectActions=new Set(['reject_mark','reject_process','reject_coral','reject_loss','reject_void']);
export const rejectCauses={arrival:'Reject saat datang',taste:'Rasa tidak sesuai',overripe:'Terlalu matang',damage:'Buah rusak / pecah',other:'Lainnya'};
export const lossCauses={spoiled:'Basi / rusak',mistake:'Salah buat / tertumpah',shrinkage:'Penyusutan berat buah',discard:'Dibuang'};
export const rejectKinds={mark:'Catat reject',direct:'Catat & langsung olah',process:'Olah reject',coral:'Olah Coral',loss:'Waste / dibuang'};
export const round=n=>Math.round(n*1e6)/1e6;
const now=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
const date=d=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(d||'')||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d||d>now())throw Error('Tanggal tidak valid atau melebihi hari ini');};
const access=(s,p,store)=>{if(s.access&&!s.access[p])throw Error('Hak akses '+p+' diperlukan');if(s.me&&s.me.role!=='owner'&&!s.me.storeIds?.includes(store)&&!s.me.store_ids?.includes(store))throw Error('Outlet tidak dapat diakses');};
export function rejectLots(s,store,kind){
 return [...s.lots,...s.unitLots].filter(l=>l.storeId===store&&(l.kg??l.qty)>0&&l.date<=now()).filter(l=>kind==='mark'?l.kg!==undefined&&['ready','unripe'].includes(l.quality):kind==='process'?l.kg!==undefined&&l.quality==='reject':kind==='coral'?s.products.find(p=>p.id===l.productId)?.durianOutput==='coral'&&(!l.expiry||l.expiry>=now()):true);
}
export function fleshProduct(s,coral){return s.products.find(p=>coral?.durianSourceId&&p.durianSourceId===coral.durianSourceId&&p.durianOutput==='daging'&&p.stockUnit==='kg'&&['finished','direct'].includes(p.itemType));}
export function rejectPhoto(s,lot){return (s.rejectRecords||[]).find(r=>!r.voided&&r.rejectLotId===lot)?.evidence?.reject||'';}
function consistency(l,kg,pieces){if(kg>l.kg||pieces>l.pieces||(round(l.kg-kg)===0)!==(l.pieces-pieces===0))throw Error('Jumlah melebihi stok atau sisa kg dan butir tidak konsisten');}
function unique(s,id){if(!id||[...s.lots,...s.unitLots].some(l=>l.id===id))throw Error('ID stok hasil tidak valid');}
export function rejectPlan(s,action,p){
 if(!rejectActions.has(action)||action==='reject_void')throw Error('Aksi tidak valid');
 date(p.date);access(s,'waste',p.storeId);
 const source=[...s.lots,...s.unitLots].find(l=>l.id===p.sourceLotId&&l.storeId===p.storeId),product=s.products.find(x=>x.id===source?.productId);
 if(!source||!product||source.date>p.date)throw Error('Pilih stok dan tanggal yang sesuai');
 if(source.costFinalized===false)throw Error('Selesaikan modal nota sebelum menggunakan batch ini');
 const reason=String(p.reason||'').trim();if(reason.length<3||reason.length>300)throw Error('Alasan wajib, 3–300 karakter');
 const evidence=Object.fromEntries(['reject','durpas500','durpas1000','coral','daging'].map(k=>[k,photoValue(p.evidence?.[k])]));
 const doc={id:p.id,createdAt:new Date().toISOString(),sourceLotId:source.id,sourceProductId:product.id,sourceName:product.name,supplierId:source.supplierId,receivedDate:source.date,date:p.date,storeId:p.storeId,reason,cause:p.cause,processedBy:s.me?.name||'Petugas demo',outputs:[],voided:false};
 const cost=q=>source.unitCost==null?null:q*source.unitCost;
 if(action==='reject_mark'||action==='reject_process'){
  const kg=quantity(p.kg,'kg'),pieces=quantity(p.pieces,'pcs');if(source.kg===undefined)throw Error('Pilih durian utuh');consistency(source,kg,pieces);
  Object.assign(doc,{kg,pieces,inputCost:cost(kg)});
  let lot=source;
  if(action==='reject_mark'){
   if(!['ready','unripe'].includes(source.quality)||!rejectCauses[p.cause])throw Error('Pilih buah siap jual dan penyebab reject');
   if(!evidence.reject)throw Error('Foto buah reject wajib');unique(s,p.rejectLotId);
   lot={...source,id:p.rejectLotId,sourceLotId:source.id,quality:'reject',kg,pieces,receivedKg:kg,receivedPieces:pieces,note:'Reject: '+reason};
   Object.assign(doc,{kind:p.processNow?'direct':'mark',rejectLotId:lot.id,markedKg:kg,markedPieces:pieces});
  }else{if(source.quality!=='reject')throw Error('Catat buah sebagai reject sebelum diolah');doc.kind='process';evidence.reject ||= rejectPhoto(s,source.id);}
  if(doc.kind!=='mark'){
   const work={...p,sourceLotId:lot.id,receivedDate:lot.date,processedBy:doc.processedBy,evidence};
   const plan=wastePlan({...s,lots:lot===source?s.lots:[...s.lots,lot]},work);
   Object.assign(doc,{outputKg:plan.outputKg,lossKg:plan.lossKg,outputs:plan.outputs,stage:1});
  }
  return {doc,evidence,source,lot};
 }
 if(action==='reject_coral'){
  const out=fleshProduct(s,product),kg=quantity(p.kg,'kg'),net=quantity(p.netKg,'kg');
  if(source.qty===undefined||product.durianOutput!=='coral'||!out)throw Error('Coral / master daging durian belum sesuai');
  if(source.expiry&&source.expiry<p.date)throw Error('Coral kedaluwarsa; gunakan Catat waste');
  if(kg>source.qty||net>kg)throw Error('Berat daging melebihi Coral atau stok tidak cukup');
  if(!evidence.coral||!evidence.daging)throw Error('Foto Coral dan hasil daging wajib');
  if(p.expiry&&(!/^\d{4}-\d{2}-\d{2}$/.test(p.expiry)||p.expiry<p.date))throw Error('Kedaluwarsa hasil tidak valid');unique(s,p.outputLotId);
  Object.assign(doc,{kind:'coral',kg,outputKg:net,lossKg:round(kg-net),stage:2,inputCost:cost(kg),outputs:[{key:'daging',productId:out.id,name:out.name,lotId:p.outputLotId,qty:net,weightKg:net,unit:'kg',expiry:p.expiry||null}]});
 }else{
  const qty=quantity(p.qty,source.kg!==undefined?'kg':source.unit),pieces=Number(p.pieces||0);
  if(!lossCauses[p.cause]||!evidence.reject)throw Error('Penyebab dan foto bukti waste wajib');
  if(source.kg!==undefined){if(!Number.isInteger(pieces)||pieces<0||(p.cause==='shrinkage'?pieces!==0:pieces===0))throw Error('Butir waste tidak valid');consistency(source,qty,pieces);}
  else if(qty>source.qty||p.cause==='shrinkage')throw Error('Jumlah / penyebab waste tidak sesuai stok');
  Object.assign(doc,{kind:'loss',qty,unit:source.kg!==undefined?'kg':source.unit,pieces:source.kg!==undefined?pieces:0,inputCost:cost(qty)});
 }
 return {doc,evidence,source};
}
// Same isolated in-memory transactions used by demo mode. Live writes use SQL 063.
export function rejectDemo(s,action,p){
 for(const k of ['rejectRecords','events','journal','money','origins','wasteRuns'])s[k]||=[];
 const log=(lot,qty,pieces=0)=>s.journal.push({id:crypto.randomUUID(),event_id:p.id,lot_id:lot.id,product_id:lot.productId,store_id:lot.storeId,supplier_id:lot.supplierId,qty,pieces,unit:lot.kg!==undefined?'kg':lot.unit,cost:lot.unitCost==null?null:qty*lot.unitCost,quality:lot.quality});
 if(action==='reject_void'){
  access(s,'cancel',p.storeId);date(p.date);const r=s.rejectRecords.find(r=>r.id===p.recordId&&r.storeId===p.storeId);
  if(!r||r.voided||p.date<r.date||String(p.reason||'').trim().length<3)throw Error('Pencatatan atau alasan pembatalan tidak valid');
  const changes=new Map();for(const j of s.journal.filter(j=>j.event_id===r.id)){const c=changes.get(j.lot_id)||{qty:0,pieces:0};c.qty=round(c.qty+j.qty);c.pieces+=j.pieces||0;changes.set(j.lot_id,c);}
  for(const [key,c] of changes){const l=[...s.lots,...s.unitLots].find(l=>l.id===key);if(!l||c.qty>0&&((l.kg??l.qty)!==c.qty||(l.pieces||0)!==c.pieces))throw Error('Hasil sudah dipakai atau stok berubah');}
  for(const [key,c] of changes){const l=[...s.lots,...s.unitLots].find(l=>l.id===key);if(l.kg!==undefined){l.kg=round(l.kg-c.qty);l.pieces-=c.pieces;}else l.qty=round(l.qty-c.qty);if(c.qty||c.pieces)log(l,-c.qty,-c.pieces);}
  r.voided=true;r.voidReason=p.reason;r.voidEventId=p.id;const w=s.wasteRuns.find(w=>w.id===r.id);if(w)w.voided=true;
  s.origins=s.origins.filter(o=>!r.outputs.some(x=>x.lotId===o.lot_id));
  for(const m of s.money.filter(m=>m.event_id===r.id&&m.category==='loss'))s.money.push({...m,id:crypto.randomUUID(),event_id:p.id,cost:m.cost==null?null:-m.cost,note:'Koreksi waste: '+p.reason});
 }else{
  const {doc,evidence,source,lot}=rejectPlan(s,action,p);
  if(action==='reject_mark'){
   source.kg=round(source.kg-doc.kg);source.pieces-=doc.pieces;s.lots.push(lot);log(source,-doc.kg,-doc.pieces);log(lot,doc.kg,doc.pieces);
  }
  if(doc.kind==='direct'||doc.kind==='process'){
   const from=lot||source;
   wasteAction(s,'waste_process',{...p,sourceLotId:from.id,receivedDate:from.date,processedBy:doc.processedBy,evidence});log(from,-doc.kg,-doc.pieces);
   for(const o of doc.outputs){const out=s.unitLots.find(l=>l.id===o.lotId);out.unitCost=doc.inputCost==null?null:doc.inputCost*o.weightKg/doc.outputKg/o.qty;log(out,o.qty);s.origins.push({lot_id:o.lotId,inputs:[{lotId:from.id,qty:doc.kg*o.weightKg/doc.outputKg}]});}
  }else if(doc.kind==='coral'){
   source.qty=round(source.qty-doc.kg);log(source,-doc.kg);const o=doc.outputs[0],out={id:o.lotId,productId:o.productId,storeId:p.storeId,unit:'kg',qty:o.qty,receivedQty:o.qty,date:p.date,expiry:p.expiry||null,kind:'production',supplierId:source.supplierId,unitCost:doc.inputCost==null?null:doc.inputCost/o.qty,note:'Olah Coral '+p.id};s.unitLots.push(out);log(out,o.qty);s.origins.push({lot_id:o.lotId,inputs:[{lotId:source.id,qty:doc.kg}]});
  }else if(doc.kind==='loss'){
   if(source.kg!==undefined){source.kg=round(source.kg-doc.qty);source.pieces-=doc.pieces;}else source.qty=round(source.qty-doc.qty);log(source,-doc.qty,-doc.pieces);
  }
  if(doc.kind==='loss'||['direct','process'].includes(doc.kind)&&doc.outputKg===0)s.money.push({id:crypto.randomUUID(),event_id:p.id,store_id:p.storeId,category:'loss',revenue:0,cost:doc.inputCost,note:'Waste: '+doc.reason});
  s.rejectRecords.unshift({...doc,evidence,hasEvidence:true});
 }
 // A loss or recovery may not consume ingredients reserved for a paid kitchen order.
 const available=availableStock(s,p.storeId,now());for(const [key,value] of available)if(value.qty< -1e-6||value.pieces<0)throw Error('Stok sudah dipesan');
}

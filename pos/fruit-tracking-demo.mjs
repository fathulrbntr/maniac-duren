import {parseTrackingBarcode,trackedFruit,checkTrackedLines} from './scale-label.mjs';
const clone=x=>structuredClone(x);
export function validateFruitDemo(s,action,p){
 if(['order_create','sale'].includes(action))checkTrackedLines(s,p.storeId,p.lines);
 if(['movement','reject_mark','reject_process','reject_loss'].includes(action)){
  const lot=p.sourceLotId||p.lotId;
  if(!s.fruitUnits?.some(u=>u.lotId===lot)&&!p.barcodes)return;
  if(action==='movement'&&p.kind!=='Transfer')throw Error('Gunakan Reject & Waste untuk buah tracking.');
  if(!Array.isArray(p.barcodes)||!p.barcodes.length)throw Error('Scan barcode setiap buah pada batch ini.');
  if(new Set(p.barcodes).size!==p.barcodes.length)throw Error('Barcode buah terduplikasi.');
  const units=p.barcodes.map(code=>trackedFruit(s,code,p.storeId,action==='reject_mark'?['available']:action==='reject_process'?['reject']:['available','reject']));
  if(units.some(u=>u.lotId!==lot)||units.reduce((n,u)=>n+u.grams,0)/1000!==Number(p.kg??p.qty)||units.length!==Number(p.pieces))throw Error('Batch, berat dan butir harus sesuai barcode yang dipilih.');
 }
 if(action==='reject_void')for(const event of s.fruitEvents||[])if(event.eventId===p.recordId&&s.fruitUnits.find(u=>u.barcode===event.barcode)?.lastEvent!==p.recordId)throw Error('Batalkan proses berikutnya terlebih dahulu.');
}
export function recordFruitDemo(s,before,action,p){
 s.fruitUnits||=[];s.fruitEvents||=[];
 const record=(u,old,eventId=p.id)=>s.fruitEvents.push({eventId,barcode:u.barcode,action,at:new Date().toISOString(),actor:s.me?.name||'Demo',before:old?clone(old):null,after:clone(u)});
 const change=(code,lotId,status,lastEvent=p.id)=>{
  const u=s.fruitUnits.find(u=>u.barcode===code),old=clone(u),lot=s.lots.find(l=>l.id===lotId);
  Object.assign(u,{lotId,storeId:lot.storeId,status,lastEvent});record(u,old);
 };
 if(action==='receipt_batch')for(const line of p.lines)for(const row of line.weighings){
  const scale=parseTrackingBarcode(row.barcode||'');if(!scale)continue;
  const unit={barcode:scale.barcode,grams:scale.grams,productId:line.productId,receiptLotId:line.id,lotId:line.id,storeId:p.storeId,status:'available',lastEvent:line.id};
  s.fruitUnits.push(unit);record(unit,null,line.id);
 }
 if(['order_create','sale'].includes(action))for(const line of p.lines)if(line.barcode?.startsWith('92'))change(line.barcode,line.lotId,'sold');
 if(['movement','reject_mark','reject_process','reject_loss'].includes(action))for(const code of p.barcodes||[]){
  const old=before.fruitUnits.find(u=>u.barcode===code);
  change(code,action==='movement'?p.id:action==='reject_mark'?p.rejectLotId:old.lotId,action==='movement'?old.status:action==='reject_loss'?'waste':action==='reject_process'||p.processNow?'processed':'reject');
 }
 if(action==='reject_void')for(const event of before.fruitEvents.filter(e=>e.eventId===p.recordId))change(event.barcode,event.before.lotId,event.before.status,event.before.lastEvent);
 if(['order_void','order_cancel','void'].includes(action)){
  const returned=action==='void'||s.orders.find(o=>o.id===p.orderId)?.voidMeta?.returnStock||s.orders.find(o=>o.id===p.orderId)?.void_meta?.returnStock;
  for(const event of before.fruitEvents.filter(e=>e.eventId===(p.orderId||p.saleId)))change(event.barcode,event.before.lotId,returned?'available':'waste');
 }
}
export function fruitHistoryDemo(s,code){
 return (s.fruitEvents||[]).filter(e=>e.barcode===code).map(e=>({action:e.action,eventId:e.eventId,at:e.at,actor:e.actor,fromStatus:e.before?.status,toStatus:e.after.status,storeId:e.after.storeId,lotId:e.after.lotId}));
}

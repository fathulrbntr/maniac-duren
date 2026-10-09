// Quantities in ancestry are equivalents of the original fruit, used internally
// for attribution. Physical stock is always shown in each product's own unit.
export function batchReports(s,store=''){
 const lots=new Map([...s.lots,...s.unitLots].map(l=>[l.id,l])),origins=new Map((s.origins||[]).map(o=>[o.lot_id,o.inputs]));
 for(const r of s.wasteRuns||[])if(!r.voided&&r.outputKg>0)for(const o of r.outputs||[])if(!origins.has(o.lotId))origins.set(o.lotId,[{lotId:r.sourceLotId,qty:r.kg*o.weightKg/r.outputKg}]);
 for(const r of s.productions||[])if(!r.voided&&!origins.has(r.id)&&r.used)origins.set(r.id,r.used);
 for(const r of s.rejectRecords||[])if(!r.voided&&r.kind==='coral')for(const o of r.outputs)origins.set(o.lotId,[{lotId:r.sourceLotId,qty:r.kg}]);
 const cache=new Map();
 function ancestry(key,path=new Set()){
  if(cache.has(key))return cache.get(key);if(path.has(key))return new Map();
  const l=lots.get(key),result=new Map();if(!l)return result;const next=new Set(path).add(key);
  const add=(parents,ratio)=>{for(const [root,n] of parents)result.set(root,(result.get(root)||0)+n*ratio);};
  if(origins.has(key)){const denominator=l.receivedQty??l.receivedKg;if(denominator>0)for(const from of origins.get(key))add(ancestry(from.lotId,next),from.qty/denominator);}
  else if(l.sourceLotId&&lots.has(l.sourceLotId))add(ancestry(l.sourceLotId,next),1);
  else if(l.kg!==undefined)result.set(l.id,1);
  cache.set(key,result);return result;
 }
 const reports=new Map(s.lots.filter(l=>!l.sourceLotId||!lots.has(l.sourceLotId)).map(root=>[root.id,{root,relatedStores:new Set([root.storeId]),stock:[],records:[],journal:[],pendingOrders:new Set(),readyKg:0,readyPieces:0,rejectKg:0,rejectPieces:0,otherFruitKg:0,markedKg:0,markedPieces:0,processedKg:0,firstLossKg:0,coralKg:0,fleshKg:0,secondLossKg:0,soldKg:0,soldPieces:0,soldEquivalent:0,lostEquivalent:0,remainingEquivalent:0,fruitRevenue:0,allocatedRevenue:0,revenueIncomplete:false,scopeIncomplete:!!root.sourceLotId&&!lots.has(root.sourceLotId)}]));
 const distribute=(key,quantity,fn)=>{for(const [root,factor] of ancestry(key)){const r=reports.get(root);if(r)fn(r,quantity*factor);}};
 for(const l of lots.values()){
  const qty=l.kg??l.qty;if(!(qty>1e-8))continue;
  distribute(l.id,qty,(r,equivalent)=>{r.relatedStores.add(l.storeId);r.remainingEquivalent+=equivalent;r.stock.push({lot:l,equivalent,mixed:ancestry(l.id).size>1});if(l.kg!==undefined){if(l.quality==='reject'){r.rejectKg+=l.kg;r.rejectPieces+=l.pieces;}else if(l.quality==='ready'){r.readyKg+=l.kg;r.readyPieces+=l.pieces;}else r.otherFruitKg+=l.kg;}});
 }
 const seen=new Set((s.rejectRecords||[]).map(r=>r.id));
 const records=[...(s.rejectRecords||[]),...(s.wasteRuns||[]).filter(w=>!seen.has(w.id)).map(w=>({...w,kind:'legacy',stage:1}))];
 for(const record of records){
  const shares=ancestry(record.sourceLotId),denom=[...shares.values()].reduce((a,b)=>a+b,0);
  for(const [root,factor] of shares){const r=reports.get(root);if(!r)continue;r.relatedStores.add(record.storeId);r.records.push(record);if(record.voided)continue;
   const share=denom?factor/denom:0;
   if(['mark','direct'].includes(record.kind)){r.markedKg+=record.markedKg*share;r.markedPieces+=record.markedPieces*share;}
   if(['process','direct','legacy'].includes(record.kind)){r.processedKg+=record.kg*share;r.firstLossKg+=record.lossKg*share;if(record.outputKg===0)r.lostEquivalent+=record.kg*factor;}
   if(record.kind==='coral'){r.coralKg+=record.kg*share;r.fleshKg+=record.outputKg*share;r.secondLossKg+=record.lossKg*share;}
   if(record.kind==='loss')r.lostEquivalent+=record.qty*factor;
  }
 }
 const isPaid=o=>o.payment_status==='paid'||(!o.payment_status&&o.status==='paid');
 for(const order of s.orders||[]){
  if(order.status==='cancelled'){
   if(order.void_meta){for(const c of order.consumption||[]){const returned=(order.void_meta.returned||[]).filter(x=>x.lotId===c.lotId&&x.lineId===c.lineId).reduce((n,x)=>n+x.qty,0);distribute(c.lotId,Math.max(0,c.qty-returned),(r,q)=>r.lostEquivalent+=q);}}
   continue;
  }
  if(!isPaid(order))continue;
  const gross=order.subtotal??order.lines.reduce((n,l)=>n+l.qty*l.price,0);
  for(const line of order.lines){
   const consumed=(order.consumption||[]).filter(c=>c.lineId===line.lineId),known=consumed.length>0&&consumed.every(c=>c.unitCost!=null),base=known?consumed.reduce((n,c)=>n+c.qty*c.unitCost,0):null,revenue=gross>0?line.qty*line.price*order.total/gross:0;
   if(line.itemType==='fruit')distribute(line.lotId,1,(r)=>{r.soldKg+=line.kg;r.soldPieces+=line.pieces;r.fruitRevenue+=revenue;});
   for(const c of consumed)distribute(c.lotId,c.qty,(r,equivalent)=>{r.soldEquivalent+=equivalent;if(order.status!=='paid')r.pendingOrders.add(order.id);if(line.itemType!=='fruit'){if(base>0&&r.root.unitCost!=null)r.allocatedRevenue+=revenue*equivalent*r.root.unitCost/base;else r.revenueIncomplete=true;}});
  }
 }
 for(const sale of s.sales||[])if(!sale.voided)for(const line of sale.lines)distribute(line.lotId,line.kg,(r,q)=>{r.soldEquivalent+=q;r.soldKg+=line.kg;r.soldPieces+=line.pieces;r.fruitRevenue+=line.total;});
 // Legacy physical losses remain traceable where the permitted event payload is available.
 for(const event of s.events||[])if(event.action==='inventory_loss'){for(const j of s.journal||[])if(j.event_id===event.id)distribute(j.lot_id,-j.qty,(r,q)=>r.lostEquivalent+=q);}
 // Non-finance readers get physical journals, but no order cost/consumption document.
 // Net stock out to orders still reconciles the batch without exposing prices or cost.
 if(s.access&&!s.access.finance){
  for(const r of reports.values())r.soldEquivalent=0;
  const actions=new Map((s.events||[]).map(e=>[e.id,e.action]));
  for(const j of s.journal||[])if(['sale','void','order_create','order_start','order_direct','order_void'].includes(actions.get(j.event_id)))distribute(j.lot_id,-j.qty,(r,q)=>r.soldEquivalent+=q);
 }
 for(const order of s.batchOpenOrders||[])for(const lot of order.lotIds||[])distribute(lot,1,r=>r.pendingOrders.add(order.id));
 for(const move of s.movements||[])if(move.kind==='Transfer'&&!s.stores.some(st=>st.id===move.toStoreId))distribute(move.lotId,1,r=>r.scopeIncomplete=true);
 for(const j of s.journal||[])distribute(j.lot_id,1,r=>{r.relatedStores.add(j.store_id);r.journal.push(j);});
 return [...reports.values()].map(r=>{
  const untraced=r.root.receivedKg-r.remainingEquivalent-r.soldEquivalent-r.lostEquivalent;
  const known=r.root.unitCost!=null;
  return {...r,untraced,remainingCost:known?r.remainingEquivalent*r.root.unitCost:null,cogs:known?r.soldEquivalent*r.root.unitCost:null,lossCost:known?r.lostEquivalent*r.root.unitCost:null,totalCost:r.root.totalCost??(known?r.root.receivedKg*r.root.unitCost:null),status:r.scopeIncomplete?'scope':Math.abs(untraced)>1e-5?'review':r.stock.length||r.pendingOrders.size?'active':'closed'};
 }).filter(r=>!store||r.relatedStores.has(store)).sort((a,b)=>b.root.date.localeCompare(a.root.date)||a.root.id.localeCompare(b.root.id));
}

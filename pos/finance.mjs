// Pure report calculations; immutable transaction costs stay authoritative.
export function sources(state,lotId,qty,seen=new Set()){
 if(seen.has(lotId))return [{supplierId:null,cost:null,recovered:false}];
 const next=new Set(seen).add(lotId),lot=[...state.lots,...state.unitLots].find(x=>x.id===lotId);
 if(!lot)return [{supplierId:null,cost:null,recovered:false}];
 const origin=state.origins?.find(x=>x.lot_id===lotId);
 if(origin){
 const denominator=lot.receivedQty??lot.receivedKg;
 return origin.inputs.flatMap(x=>sources(state,x.lotId,qty*x.qty/denominator,next)).map(x=>({...x,recovered:x.recovered||lot.kind==='waste'}));
 }
 if(lot.sourceLotId)return sources(state,lot.sourceLotId,qty,next);
 return [{supplierId:lot.supplierId||null,cost:lot.unitCost==null?null:qty*lot.unitCost,recovered:lot.kind==='waste'}];
}
export function orderMargins(state,orders){
 return orders.flatMap(order=>order.lines.map(line=>{
 const consumption=(order.consumption||[]).filter(x=>x.lineId===line.lineId);
 const ancestry=consumption.flatMap(c=>sources(state,c.lotId,c.qty));
 const known=consumption.length>0&&consumption.every(c=>c.unitCost!=null);
 const cost=known?consumption.reduce((n,c)=>n+c.qty*c.unitCost,0):null;
 const revenue=line.qty*line.price;
 const recovered=ancestry.some(x=>x.recovered);
 return {orderId:order.id,line,name:line.name,revenue,cost,profit:cost==null?null:revenue-cost,recovered,sources:ancestry};
 }));
}

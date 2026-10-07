// Attribution follows physical lot links; labels do not create another receipt.
export function rootContributions(s,lotId,qty,seen=new Set()) {
 if(seen.has(lotId))return [];
 const next=new Set(seen).add(lotId),lot=[...(s.lots||[]),...(s.unitLots||[])].find(l=>l.id===lotId);
 if(!lot)return [];
 const origin=(s.origins||[]).find(o=>o.lot_id===lotId);
 if(origin){const denominator=lot.receivedQty??lot.receivedKg;return (origin.inputs||[]).flatMap(i=>rootContributions(s,i.lotId,qty*i.qty/denominator,next));}
 if(lot.sourceLotId)return rootContributions(s,lot.sourceLotId,qty,next);
 return [{lotId:lot.id,supplierId:lot.supplierId,rawKg:qty,cost:lot.unitCost==null?null:qty*lot.unitCost}];
}
export function batchReport(s,rootId) {
 const root=s.lots.find(l=>l.id===rootId);if(!root)return null;
 const all=[...s.lots,...s.unitLots];
 const descendants=all.map(l=>({lot:l,contributions:rootContributions(s,l.id,l.kg??l.qty)})).filter(x=>x.lot.id===rootId||rootContributions(s,x.lot.id,x.lot.receivedQty??x.lot.receivedKg).some(a=>a.lotId===rootId));
 const movements=(s.journal||[]).filter(j=>descendants.some(x=>x.lot.id===j.lot_id));
 const processes=(s.wasteRuns||[]).filter(r=>!r.voided&&rootContributions(s,r.sourceLotId,r.kg).some(x=>x.lotId===rootId));
 const coral=(s.batchProcesses||[]).filter(r=>!r.voided&&r.inputs.some(i=>rootContributions(s,i.lotId,i.qty).some(x=>x.lotId===rootId)));
 const sales=[];
 for(const o of s.orders||[])if(o.status!=='cancelled'&&(o.payment_status==='paid'||o.status==='paid'))for(const line of o.lines||[]){
  const inputs=(o.consumption||[]).filter(i=>i.lineId===line.lineId),ancestry=inputs.flatMap(i=>rootContributions(s,i.lotId,i.qty));
  const own=ancestry.filter(a=>a.lotId===rootId);if(!own.length)continue;
  const denominator=ancestry.reduce((a,x)=>a+x.rawKg,0),fraction=denominator?own.reduce((a,x)=>a+x.rawKg,0)/denominator:0;
  const known=inputs.length&&inputs.every(i=>i.unitCost!=null);
  sales.push({id:o.id,date:o.business_date,name:line.name,revenue:line.qty*line.price*fraction,cost:known?inputs.reduce((a,i)=>a+i.qty*i.unitCost,0)*fraction:null,fraction});
 }
 for(const sale of s.sales||[])if(!sale.voided)for(const line of sale.lines||[]){if(!rootContributions(s,line.lotId,line.kg).some(a=>a.lotId===rootId))continue;sales.push({id:sale.id,date:sale.date,name:s.products.find(p=>p.id===line.productId)?.name,revenue:line.total,cost:root.unitCost==null?null:line.kg*root.unitCost,fraction:1});}
 return {root,descendants,movements,processes,coral,sales,closed:descendants.every(x=>(x.lot.kg??x.lot.qty)===0),differenceKg:root.expectedKg==null?null:root.expectedKg-root.receivedKg,differencePieces:root.expectedPieces==null?null:root.expectedPieces-root.receivedPieces};
}

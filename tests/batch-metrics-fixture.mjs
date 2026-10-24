import {rejectReportFixture} from './reject-report-fixture.mjs';
export function batchMetricsFixture(){
 const s=rejectReportFixture(),inputCost=17600000,totalOutput=227;
 Object.assign(s.lots[0],{unitCost:44000,totalCost:22000000,purchaseCost:22000000,shippingCost:0,pieces:165});
 Object.assign(s.lots[1],{unitCost:44000,receivedPieces:20});
 const outputs=s.unitLots.map(l=>{const weightKg=l.productId==='durpas05'?l.receivedQty*.5:l.receivedQty;l.unitCost=inputCost*weightKg/totalOutput/l.receivedQty;return {key:l.productId==='durpas05'?'durpas500':l.productId==='durpas1'?'durpas1000':'coral',productId:l.productId,name:s.products.find(p=>p.id===l.productId).name,lotId:l.id,qty:l.receivedQty,unit:l.unit,weightKg};});
 Object.assign(s.rejectRecords[0],{markedPieces:20,pieces:20,outputKg:227,lossKg:173,inputCost,outputs,reason:'Uji olahan buah',createdAt:'2026-10-23T10:00:00Z'});
 s.wasteRuns=[{...s.rejectRecords[0],sourceLotId:'rejected'}];
 s.origins=outputs.map(o=>({lot_id:o.lotId,inputs:[{lotId:'rejected',qty:400*o.weightKg/totalOutput}]}));
 s.sales=[3.24,3,21,3].map((kg,i)=>({id:'sale'+i,date:i===0?'2026-10-21':'2026-10-24',storeId:'a',total:kg*100000,paid:kg*100000,payment:'Tunai',lines:[{lotId:'original',productId:'fruit',supplierId:'sup',kg,pieces:[1,2,10,2][i],unit:'KG',qty:kg,price:100000,total:kg*100000}]}));
 return s;
}

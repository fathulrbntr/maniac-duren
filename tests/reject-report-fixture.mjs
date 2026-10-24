import {emptyState} from '../pos/core.mjs';
export const period={from:'2026-10-01',to:'2026-10-31',store:'a'};
// Synthetic reproduction of the supplied report: 500 in, 30.24 sold,
// 400 marked AND processed, leaving 69.76 kg fruit and three output products.
export function rejectReportFixture(){
 const s={...emptyState(),journal:[],money:[],expenses:[],origins:[],rejectRecords:[],me:{id:'owner',role:'owner',name:'Owner uji'},access:{reports:true,trace:true,finance:true,sell:true,master:true},stores:[{id:'a',name:'Outlet Uji'},{id:'b',name:'Outlet B'}],products:[{id:'fruit',name:'Durian Monthong',itemType:'direct',stockUnit:'kg_butir'},{id:'coral',name:'Coral Monthong',itemType:'finished',stockUnit:'kg'},{id:'durpas1',name:'Durpas Monthong 1 kg',itemType:'finished',stockUnit:'pcs'},{id:'durpas05',name:'Durpas Monthong 500 gr',itemType:'finished',stockUnit:'pcs'}],suppliers:[{id:'sup',name:'Supplier Uji'}]};
 const original={id:'original',storeId:'a',productId:'fruit',supplierId:'sup',date:'2026-10-21',receivedKg:500,receivedPieces:200,kg:69.76,pieces:30,quality:'ready',unitCost:100};
 s.lots=[original,{...original,id:'rejected',sourceLotId:'original',receivedKg:400,receivedPieces:160,kg:0,pieces:0,quality:'reject'}];
 s.unitLots=[['coral',127,'kg'],['durpas1',70,'pcs'],['durpas05',60,'pcs']].map(([productId,qty,unit])=>({id:'out-'+productId,productId,storeId:'a',supplierId:'sup',date:'2026-10-23',qty,receivedQty:qty,unit,kind:'production',unitCost:100}));
 const payload={sourceLotId:'original',rejectLotId:'rejected',kg:400,pieces:160,processNow:true};
 s.events=[{id:'receipt',action:'receipt',business_date:'2026-10-21'},{id:'mark',action:'reject_mark',business_date:'2026-10-23',payload},...[3.24,3,21,3].map((qty,i)=>({id:'sale'+i,action:'sale',business_date:i===0?'2026-10-21':'2026-10-24'}))];
 const log=(event_id,lot,qty)=>({id:'j'+s.journal.length,event_id,lot_id:lot.id,product_id:lot.productId,store_id:lot.storeId,supplier_id:'sup',qty,unit:lot.unit||'kg',quality:lot.quality});
 s.journal.push(log('receipt',original,500),log('mark',original,-400),log('mark',s.lots[1],400),log('mark',s.lots[1],-400));
 for(const lot of s.unitLots)s.journal.push(log('mark',lot,lot.qty));
 [3.24,3,21,3].forEach((qty,i)=>s.journal.push(log('sale'+i,original,-qty)));
 s.rejectRecords=[{id:'mark',date:'2026-10-23',storeId:'a',kind:'direct',sourceLotId:'original',sourceProductId:'fruit',rejectLotId:'rejected',markedKg:400,kg:400,voided:false}];return s;
}

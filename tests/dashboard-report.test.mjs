import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,today} from '../pos/core.mjs';
import {dashboardReport,inventoryAssets,loadReportCash,cashReport} from '../pos/dashboard-report.mjs';
import {dashboardPrintHTML} from '../pos/dashboard-print.mjs';
import {dashboardPage,bindDashboard,resetDashboard} from '../pos/dashboard-ui.mjs';
import {Node} from './variant-dom.mjs';

const date=today(),filter={from:date,to:date,store:'a'};
function fixture(){
 const s={...emptyState(),access:{reports:true,finance:true,stock:true},stores:[{id:'a',name:'Depok <test>'},{id:'b',name:'Bekasi'}],events:[],money:[],orders:[],expenses:[],suppliers:[]};
 s.products=[{id:'fruit',name:'Monthong',category:'Buah',itemType:'direct',stockUnit:'kg_butir'},{id:'raw',name:'Gula',category:'Bahan',itemType:'raw',stockUnit:'g'},{id:'drink',name:'Minuman',category:'Minuman',itemType:'recipe',stockUnit:'porsi'},{id:'durpas',name:'Durpas',category:'Olahan',itemType:'finished',stockUnit:'pcs'}];
 s.lots=[{id:'l1',storeId:'a',productId:'fruit',kg:8,pieces:4,unitCost:50000,quality:'ready'},{id:'reject',storeId:'a',productId:'fruit',kg:2,pieces:1,unitCost:50000,quality:'reject'},{id:'foreign',storeId:'b',productId:'fruit',kg:1,pieces:1,unitCost:50000,quality:'ready'}];
 s.unitLots=[{id:'sugar',storeId:'a',productId:'raw',qty:500,unit:'g',unitCost:20},{id:'output',storeId:'a',productId:'durpas',qty:4,unit:'pcs',unitCost:40000},{id:'empty',storeId:'a',productId:'raw',qty:0,unit:'g',unitCost:null}];
 s.orders=[{id:'o1',store_id:'a',paid_date:date,business_date:date,payment_status:'paid',status:'paid',table_no:'1',total:180000,subtotal:200000,payment:'Tunai',discount:{name:'Promo <script>',amount:20000},pointsEarned:2,lines:[{lineId:'line1',productId:'fruit',name:'Monthong',unit:'KG',qty:2,kg:2,price:100000}],consumption:[{lineId:'line1',lotId:'l1',qty:2,unitCost:50000}]},
 {id:'o2',store_id:'a',paid_date:date,business_date:date,payment_status:'paid',status:'paid',table_no:null,total:30000,payment:'QRIS',pointsEarned:0,lines:[{lineId:'line2',productId:'drink',name:'Minuman',unit:'porsi',qty:1,price:30000}],consumption:[{lineId:'line2',lotId:'sugar',qty:100,unitCost:20}]},
 {id:'o3',store_id:'b',paid_date:date,payment_status:'paid',status:'paid',total:900000,payment:'Tunai',lines:[]}];
 s.sales=[{id:'o1',storeId:'a',date,total:180000,lines:[]},{id:'legacy',storeId:'a',date,total:100000,payment:'Transfer',lines:[{productId:'fruit',lotId:'l1',unit:'KG',kg:1,pieces:1,price:100000,total:100000}]}];
 s.events=[{id:'loss',business_date:date},{id:'undo',business_date:date}];s.money=[{event_id:'loss',store_id:'a',category:'loss',cost:20000},{event_id:'undo',store_id:'a',category:'loss',cost:-5000}];
 s.expenses=[{id:'expense',store_id:'a',date,amount:30000,description:'Makan staf'},{id:'void',store_id:'a',date,amount:999999,voided:true},{id:'foreign',store_id:'b',date,amount:999999}];
 return s;
}
test('profit reconciles sale snapshots, discount, signed waste and operating costs without charging stock purchases again',()=>{
 const s=fixture(),before=structuredClone(s),r=dashboardReport(s,filter);
 assert.equal(r.total,310000);assert.equal(r.tx.length,3);assert.equal(r.financial.cogs,152000);assert.equal(r.financial.gross,158000);assert.equal(r.financial.loss,15000);assert.equal(r.financial.operating,30000);assert.equal(r.financial.result,113000);
 assert.equal(r.categories.reduce((n,r)=>n+r.revenue,0),r.total);assert.equal(r.payments.reduce((n,r)=>n+r.revenue,0),r.total);assert.equal(r.discounts[0].revenue,20000);assert.equal(r.points,2);assert.deepEqual(s,before);
 s.lots[0].unitCost=60000;assert.equal(dashboardReport(s,filter).financial.cogs,162000,'Only legacy sale falls back to lot cost; order snapshot remains authoritative');
});
test('assets count every physical lot once, do not double kg and pieces, and value mixed finished goods at their full unit cost',()=>{
 const s=fixture(),a=inventoryAssets(s,'a');assert.equal(a.total,670000);assert.equal(a.rows.length,4);
 assert.equal(a.groups.find(x=>x.name==='Reject menunggu pengolahan').value,100000);
 assert.equal(inventoryAssets(s,'').total,720000);
 s.unitLots.push({id:'recipe',storeId:'a',productId:'drink',qty:10,unit:'porsi',unitCost:999});
 s.lots.push({...s.lots[0]});assert.equal(inventoryAssets(s,'a').total,670000);
 s.lots.push({id:'no-access',storeId:'secret',productId:'fruit',kg:5,unitCost:999});assert.equal(inventoryAssets(s,'').total,720000);
});
test('missing or invalid costs and incompatible units remain unknown, but explicit zero cost is valid',()=>{
 for(const bad of [null,undefined,'',NaN,-1]){const s=fixture();s.orders[0].consumption[0].unitCost=bad;assert.equal(dashboardReport(s,filter).financial.result,null);}
 const s=fixture();s.orders[0].consumption[0].unitCost=0;assert.equal(dashboardReport(s,filter).financial.result,213000);
 s.unitLots[0].unit='kg';assert.equal(inventoryAssets(s,'a').total,null);assert.equal(inventoryAssets(s,'a').known,660000);
 s.unitLots[0].unit='g';s.unitLots[0].qty=-1;assert.equal(inventoryAssets(s,'a').total,null);
 s.lots[0].unitCost=null;assert.equal(inventoryAssets(s,'a').unknown,2);
});
test('missing expense amount and undated loss prevent a misleading complete profit',()=>{
 const s=fixture();s.expenses[0].amount=null;assert.equal(dashboardReport(s,filter).financial.result,null);
 s.expenses[0].amount=30000;s.money.push({store_id:'a',category:'loss',event_id:'missing',cost:500});
 assert.equal(dashboardReport(s,filter).financial.loss,null);
});
test('voids are shown on their cancellation date but not deducted twice, and future/foreign data stays excluded',()=>{
 const s=fixture();s.orders.push({...s.orders[0],id:'void',status:'cancelled',payment_status:'refunded',void_meta:{date,reason:'Tidak jadi'}});
 s.orders.push({...s.orders[0],id:'future',paid_date:'2999-01-01'});s.orders.push({...s.orders[0],id:'secret',store_id:'secret'});
 const r=dashboardReport(s,filter);assert.equal(r.total,310000);assert.equal(r.cancellations.length,1);assert.equal(r.financial.result,113000);
 assert.equal(dashboardReport(s,{...filter,store:''}).total,1210000);
 assert.equal(dashboardReport(s,{...filter,from:'2000-01-01',to:'2000-01-01'}).financial.assets.total,670000,'Assets are current, not historical');
});
test('mixed units and permission boundaries survive printed output; names are escaped and demo is unmistakable',()=>{
 const s=fixture();s.stockDemo={};s.orders[1].lines.push({productId:'fruit',name:'Monthong',unit:'BUTIR',qty:1,price:1000});
 const r=dashboardReport(s,filter),html=dashboardPrintHTML(s,r);assert(html.includes('2 kg · 1 butir')||html.includes('3 kg · 1 butir'));assert(html.includes('DEMO · BUKAN TRANSAKSI NYATA'));assert(!html.includes('Promo <script>'));assert(html.includes('Promo &lt;script&gt;'));assert.equal((html.match(/class="dr-page"/g)||[]).length,3);
 s.access.finance=false;const hidden=dashboardReport(s,filter);assert.equal(hidden.financial,null);assert(!dashboardPrintHTML(s,hidden).includes('Total estimasi nilai aset persediaan'));
 resetDashboard();assert(!dashboardPage(s,'a').includes('Profit / rugi bersih'));s.access.reports=false;assert(!dashboardPage(s,'a').includes('id="dash-print"'));
});
test('empty scope produces valid zeros without leaking stock from another outlet',()=>{
 const s=fixture();s.stores.push({id:'empty',name:'Kosong'});const r=dashboardReport(s,{...filter,store:'empty'});assert.equal(r.total,0);assert.equal(r.financial.result,0);assert.equal(r.financial.assets.total,0);
});
test('cash pagination includes lookahead once, scopes stores/dates in WIB, and uses refund dates independently of sale date',async()=>{
 const s=fixture(),entries=Array.from({length:42},(_,i)=>({id:'e'+i,storeId:'a',createdAt:date+'T10:00:00Z',kind:i===41?'refund':'sale',payment:'Tunai',amount:1000})),history=Array.from({length:23},(_,i)=>({id:'h'+i,storeId:'a',closedAt:date+'T10:00:00Z',summary:{difference:-100}}));
 let calls=0;const data=await loadReportCash(async f=>{calls++;return {entries:entries.slice(f.offset,f.offset+21),history:history.slice(f.historyOffset,f.historyOffset+21)};},filter);
 assert.equal(calls,3);assert.equal(data.entries.length,42);assert.equal(data.history.length,23);const cash=cashReport(data,s,filter);assert.equal(cash.sales,41000);assert.equal(cash.refunds,1000);assert.equal(cash.net,40000);assert.equal(cash.difference,-2300);
 assert.equal(cashReport(null,s,filter),null);assert.equal(await loadReportCash(null,filter),null);await assert.rejects(loadReportCash(async()=>{throw Error('Offline');},filter),/Offline/);
});
test('print handler opens synchronously, fills complete A4 report, recovers a history error and blocks invalid custom dates',async()=>{
 const s=fixture();s.cashierShiftVersion=83;const root=new Node(),old={document:globalThis.document,window:globalThis.window};let opened=0,closed=0,historyCalls=0;const notices=[],slot={innerHTML:''},button={disabled:false};
 globalThis.document={querySelector:q=>root.querySelector(q),querySelectorAll:q=>root.querySelectorAll(q)};
 globalThis.window={open:()=>{opened++;return {closed:false,close(){closed++;},print(){},document:{write(){},close(){},getElementById:id=>id==='print'?button:slot}};}};
 const ctx={render,toast:m=>notices.push(m),readShifts:async()=>{assert.equal(opened,1);assert(button.disabled);historyCalls++;throw Error('Offline');}};
 function render(){root.innerHTML=dashboardPage(s,'a');bindDashboard(s,'a',ctx);}
 try{resetDashboard();render();await root.querySelector('#dash-print').fire('click');assert.equal(opened,1);assert.equal(historyCalls,1);assert.equal(closed,0);assert(!button.disabled);assert(slot.innerHTML.includes('Laba / Rugi'));assert(slot.innerHTML.includes('Offline'));assert(!root.querySelector('#dash-print').disabled);
  root.querySelector('#dash-period').value='custom';await root.querySelector('#dash-period').fire('change');root.querySelector('#dash-from').value='2999-01-01';await root.querySelector('#dash-print').fire('click');assert.equal(opened,1);assert.match(notices[0],/tanggal/);
 }finally{resetDashboard();Object.assign(globalThis,old);}
});

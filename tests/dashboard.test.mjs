import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,today} from '../pos/core.mjs';
import {dashboardRange,validDashboardDates,dashboardSales,dashboardStock,dashboardRejects,dashboardCustomers,dashboardTabs} from '../pos/dashboard-data.mjs';
import {dashboardPage,bindDashboard,resetDashboard,followDashboardStore} from '../pos/dashboard-ui.mjs';
import {Node} from './variant-dom.mjs';
const day=today(),range={from:day,to:day,store:'a'};
function fixture(){
 const s={...emptyState(),me:{id:'owner',name:'Nama Owner Sangat Panjang <test>',role:'owner'},access:{reports:true,finance:true,stock:true,master:true,waste:true,sell:true},stores:[{id:'a',name:'Depok'},{id:'b',name:'Bekasi'}],products:[{id:'fruit',name:'Monthong',itemType:'direct',stockUnit:'kg_butir'},{id:'water',name:'Air mineral',itemType:'direct',stockUnit:'pcs'},{id:'sugar',name:'Gula',itemType:'raw',stockUnit:'g'},{id:'recipe',name:'Es durian',itemType:'recipe',stockUnit:'porsi'}],suppliers:[{id:'supplier',name:'Supplier A'}],documents:[],rejectRecords:[]};
 const order=(id,store_id,total,payment,productId,qty,price,extra={})=>({id,store_id,business_date:day,paid_date:day,status:'paid',payment_status:'paid',total,payment,created_at:day+'T03:05:00Z',lines:[{productId,qty,price,unit:'pcs'}],...extra});
 s.orders=[order('o1','a',270000,'Tunai','fruit',2,150000,{lines:[{productId:'fruit',qty:2,kg:2,pieces:1,price:150000,unit:'KG',itemType:'fruit',lotId:'lot',supplierId:'supplier'}]}),order('o2','a',300000,'QRIS','water',2,150000,{created_at:day+'T08:15:00Z'}),order('o3','b',500000,'Transfer','recipe',2,250000),order('cancelled','a',999999,'Tunai','water',1,999999,{status:'cancelled'}),order('unpaid','a',999999,'Tunai','water',1,999999,{status:'queued',payment_status:'unpaid'}),order('outside','forbidden',999999,'Tunai','water',1,999999)];
 s.sales=[{id:'o1',storeId:'a',date:day,total:270000,lines:[]},{id:'legacy',storeId:'a',date:day,total:100000,payment:'Transfer',lines:[{productId:'fruit',lotId:'lot',supplierId:'supplier',unit:'KG',kg:1,pieces:1,price:100000,total:100000}]},{id:'voided',storeId:'a',date:day,total:999999,voided:true,lines:[]}];
 s.lots=[{id:'lot',storeId:'a',productId:'fruit',supplierId:'supplier',kg:10,pieces:5,quality:'ready',receivedKg:10,date:day}];s.unitLots=[{id:'waterlot',storeId:'a',productId:'water',qty:6,unit:'pcs'},{id:'sugarlot',storeId:'b',productId:'sugar',qty:500,unit:'g'}];
 return s;
}
test('dashboard reconciles net revenue and receipt counts with reports, excludes duplicates, voids and inaccessible outlets',()=>{
 const s=fixture(),before=structuredClone(s),a=dashboardSales(s,range);assert.equal(a.total,670000);assert.equal(a.tx.length,3);
 assert.equal(a.payments.reduce((n,p)=>n+p.total,0),a.total);assert.equal(a.payments.reduce((n,p)=>n+p.count,0),3);
 assert.deepEqual(a.payments.map(p=>[p.name,p.total]),[['Tunai',270000],['QRIS',300000],['Transfer',100000]]);
 assert.deepEqual(a.topProducts.map(p=>[p.id,p.revenue]),[['fruit',370000],['water',300000]]);assert.equal(a.topProducts[0].units.get('kg'),3);
 assert.equal(dashboardSales(s,{...range,store:''}).total,1170000);assert.equal(dashboardSales(s,{...range,store:'b'}).total,500000);assert.deepEqual(s,before);
});
test('hourly chart uses WIB and keeps missing or mismatched hours outside the bars while retaining revenue',()=>{
 const s=fixture(),a=dashboardSales(s,range);assert.equal(a.timeline.bins.length,6);assert.equal(a.timeline.bins[2].total,270000);assert.equal(a.timeline.bins[3].total,300000);assert.equal(a.timeline.unknown.total,100000);
 assert.equal(a.timeline.bins.reduce((n,b)=>n+b.total,0)+a.timeline.unknown.total,a.total);
 s.orders[0].created_at=day+'T20:00:00Z';const b=dashboardSales(s,range);assert.equal(b.timeline.unknown.total,370000);
 const long=dashboardSales(s,{from:'2020-01-01',to:day,store:'a'});assert(long.timeline.bins.length<=12);assert.equal(long.timeline.bins.reduce((n,b)=>n+b.total,0),670000);
});
test('date presets handle Monday/new year and custom validation rejects impossible or reversed ranges',()=>{
 assert.deepEqual(dashboardRange('week',{},'2026-01-01'),{from:'2025-12-29',to:'2026-01-01'});
 assert.deepEqual(dashboardRange('month',{},'2024-02-29'),{from:'2024-02-01',to:'2024-02-29'});
 assert.deepEqual(dashboardRange('yesterday',{},'2026-01-01'),{from:'2025-12-31',to:'2025-12-31'});
 for(const [from,to] of [['2026-02-30',day],[day,'2020-01-01'],['',day],['2026-01-01','2999-01-01']])assert(!validDashboardDates(from,to));
});
test('stock keeps physical units separate and reject history does not count voided or legacy duplicates',()=>{
 const s=fixture(),a=dashboardStock(s,'a');assert.equal(a.available,2);assert.equal(a.empty,1);assert.equal(a.units.get('kg'),10);assert.equal(a.units.get('pcs'),6);assert.equal(a.units.get('g'),0);assert(!a.rows.some(x=>x.id==='recipe'));
 assert.equal(dashboardStock(s,'').units.get('g'),500);
 s.rejectRecords=[{id:'mark',storeId:'a',date:day,kind:'mark',kg:5},{id:'process',storeId:'a',date:day,kind:'process',kg:3},{id:'void',storeId:'a',date:day,kind:'mark',kg:99,voided:true},{id:'foreign',storeId:'b',date:day,kind:'mark',kg:88}];s.wasteRuns=[{id:'process',storeId:'a',date:day,kg:3}];
 const r=dashboardRejects(s,range);assert.equal(r.rows.length,2);assert.equal(r.markedKg,5);assert.equal(r.processedKg,3);
});
test('customer names come only from issued invoices linked to scoped paid sales, with no duplicate receipts',()=>{
 const s=fixture();s.documents=[{kind:'INV',status:'issued',store_id:'a',source_type:'order',source_id:'o1',party:'Pelanggan A'},{kind:'INV',status:'issued',store_id:'a',source_type:'order',source_id:'o1',party:'Duplikat'},{kind:'INV',status:'draft',store_id:'a',source_type:'order',source_id:'o2',party:'Draft'},{kind:'INV',status:'issued',store_id:'b',source_type:'order',source_id:'o3',party:'Toko lain'}];
 const c=dashboardCustomers(s,dashboardSales(s,range).tx);assert.deepEqual(c,{rows:[{name:'Pelanggan A',count:1,total:270000}],matched:1,anonymous:2});
 assert.deepEqual(dashboardTabs({...s,access:{reports:true}}).map(t=>t[0]),['transactions','suppliers']);
});
test('dashboard handlers switch period/store/tabs without requests, validate dates, show chart details and recover refresh errors',async()=>{
 const s=fixture(),root=new Node(),globals={document:globalThis.document,fetch:globalThis.fetch};let active='a',reads=0,busy=false;const messages=[];
 globalThis.document={querySelector:q=>root.querySelector(q),querySelectorAll:q=>root.querySelectorAll(q)};globalThis.fetch=()=>{throw Error('No network during dashboard navigation');};
 const ctx={render,changeStore:next=>{active=next;followDashboardStore();render();return true;},isBusy:()=>busy,refresh:async()=>{reads++;throw Error('Jaringan terputus');},toast:m=>messages.push(m)};
 function render(){root.innerHTML=dashboardPage(s,active);bindDashboard(s,active,ctx);}
 try{
  resetDashboard();render();assert(root.querySelector('.dash-profile'));assert.equal(root.querySelectorAll('[data-dash-tab]').length,5);assert(root.textContent.includes('670.000'));assert(!dashboardPage(s,active).includes('<test>'));
  const bar=root.querySelector('[data-dash-bar="2"]');bar.getAttribute=k=>bar.attrs[k];await bar.fire('click');assert.match(root.querySelector('#dash-chart-detail').textContent,/270.000/);
  const store=root.querySelector('#dash-store');store.value='';await store.fire('change');assert(root.textContent.includes('1.170.000'));assert.equal(active,'a','All outlets does not alter cashier outlet');
  root.querySelector('#dash-store').value='b';await root.querySelector('#dash-store').fire('change');assert.equal(active,'b');assert(root.textContent.includes('500.000'));
  root.querySelector('#dash-period').value='custom';await root.querySelector('#dash-period').fire('change');root.querySelector('#dash-from').value='2999-01-01';await root.querySelector('#dash-from').fire('change');assert.match(root.querySelector('#dash-date-error').textContent,/tanggal/);
  for(const t of ['stock','suppliers','reject','customers']){await root.querySelector(`[data-dash-tab="${t}"]`).fire('click');assert(root.querySelector('.dash-panel'));}
  await root.querySelector('[data-dash-home]').fire('click');assert(root.querySelector('.dash-chart'));
  busy=true;root.querySelector('#dash-store').value='a';await root.querySelector('#dash-store').fire('change');assert.equal(active,'b');busy=false;
  const reload=root.querySelector('#dash-refresh');await reload.fire('click');assert.equal(reads,1);assert(!reload.disabled);assert.equal(messages[0],'Jaringan terputus');
  resetDashboard();assert.equal((dashboardPage(s,'a').match(/data-dash-tab="transactions" aria-pressed="true"/)||[]).length,1);
 }finally{resetDashboard();Object.assign(globalThis,globals);}
});

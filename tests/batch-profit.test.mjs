import {test} from 'node:test';
import assert from 'node:assert/strict';
import {batchReports} from '../pos/batch-report.mjs';
import {batchProfit,batchProfitTotals,profitState} from '../pos/batch-profit.mjs';
import {batchReportSheets} from '../pos/reports.mjs';
import {batchMetricsFixture} from './batch-metrics-fixture.mjs';
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);
export function profitFixture(){
 const s=batchMetricsFixture();
 Object.assign(s.products[0],{priceKg:100000,pricePiece:300000});
 for(const p of s.products.slice(1))p.salePrice=({coral:80000,durpas1:90000,durpas05:45000})[p.id];
 return s;
}
const report=s=>batchProfit(s,batchReports(s).find(r=>r.root.id==='original'));
test('actual profit, capital and projected sales are distinct; processing shrinkage is not a second loss',()=>{
 const s=profitFixture(),before=structuredClone(s),p=report(s);
 near(p.realized,1693440);near(p.loss,0);near(p.capital,20669440);near(p.rejectCapital,0);
 near(p.stockRevenue,26136000);near(p.stockProfit,5466560);near(p.projected,7160000);
 assert.equal(p.status,'Untung');assert.deepEqual(p.issues,[]);assert.deepEqual(s,before);
});
test('new sale updates capital and realized profit while keeping the full-price projection conserved',()=>{
 const s=profitFixture();s.lots[0].kg-=10;
 s.sales.push({id:'next',total:1000000,lines:[{lotId:'original',kg:10,pieces:4,total:1000000}]});
 const p=report(s);near(p.realized,2253440);near(p.capital,20229440);near(p.projected,7160000);
 // Refunding a sale with returned stock restores the previous actual result.
 s.sales.at(-1).voided=true;s.lots[0].kg+=10;near(report(s).realized,1693440);
});
test('reject waiting is capital, disposal realizes loss, reversing the waste restores the result',()=>{
 const s=profitFixture();s.lots[0].kg-=5;s.lots.push({...s.lots[0],id:'waiting',sourceLotId:'original',kg:5,receivedKg:5,quality:'reject'});
 let p=report(s);near(p.realized,1693440);near(p.rejectCapital,220000);near(p.capital,20669440);assert.equal(p.projected,null);
 assert.match(p.stocks.find(x=>x.lot.id==='waiting').reason,/Reject menunggu/);
 s.lots.at(-1).kg=0;s.rejectRecords.push({id:'waste',kind:'loss',sourceLotId:'waiting',qty:5,storeId:'a'});
 p=report(s);near(p.loss,220000);near(p.realized,1473440);near(p.capital,20449440);near(p.projected,6660000);
 s.rejectRecords.at(-1).voided=true;s.lots.at(-1).kg=5;near(report(s).realized,1693440);
});
test('negative results, full disposal and break-even have explicit statuses',()=>{
 const s=profitFixture();for(const sale of s.sales)for(const line of sale.lines)line.total=0;
 assert.equal(report(s).status,'Rugi');near(report(s).realized,-1330560);
 assert.equal(profitState(0),'Impas');assert.equal(profitState(null),'Belum lengkap');
 const full={...profitFixture(),unitLots:[],origins:[],wasteRuns:[],sales:[],rejectRecords:[{kind:'loss',sourceLotId:'original',qty:500}]};full.lots=full.lots.slice(0,1);full.lots[0].kg=0;
 near(report(full).realized,-22000000);near(report(full).projected,-22000000);
});
test('missing prices, units, raw materials, cost, reconciliation and access scope never become zero-profit claims',()=>{
 const s=profitFixture();s.products[0].priceKg=null;let p=report(s);near(p.realized,1693440);assert.equal(p.stockRevenue,null);assert.equal(p.projected,null);assert.match(p.stocks[0].reason,/per butir tidak digunakan/);
 s.products[0].priceKg=100000;s.products[1].stockUnit='pcs';assert.match(report(s).stocks.find(x=>x.lot.productId==='coral').reason,/Satuan/);
 s.products[1].stockUnit='kg';s.products[1].itemType='raw';assert.equal(report(s).projected,null);
 s.lots[0].unitCost=null;assert.equal(report(s).realized,null);
 const t=profitFixture();t.lots[0].kg-=1;assert.equal(report(t).realized,null);
 const r=batchReports(profitFixture())[0];r.scopeIncomplete=true;assert.equal(batchProfit(profitFixture(),r).realized,null);
});
test('mixed batches allocate actual and potential revenue by material cost, never duplicate the whole product',()=>{
 const a={id:'a',storeId:'s',date:'2026-10-01',productId:'fruit',kg:0,receivedKg:50,quality:'ready',unitCost:100};
 const s={stores:[{id:'s'}],lots:[a,{...a,id:'b',unitCost:300}],unitLots:[{id:'mix',productId:'mix',storeId:'s',unit:'pcs',receivedQty:10,qty:5,unitCost:2000}],products:[{id:'mix',itemType:'finished',stockUnit:'pcs',salePrice:6000}],origins:[{lot_id:'mix',inputs:[{lotId:'a',qty:50},{lotId:'b',qty:50}]}],orders:[{id:'sale',status:'paid',subtotal:20000,total:20000,lines:[{lineId:'line',itemType:'direct',qty:5,price:4000}],consumption:[{lineId:'line',lotId:'mix',qty:5,unitCost:2000}]}]};
 const rows=batchReports(s),aProfit=batchProfit(s,rows[0]),bProfit=batchProfit(s,rows[1]),total=batchProfitTotals(s,rows);
 near(aProfit.realized,2500);near(bProfit.realized,7500);near(aProfit.stockRevenue,7500);near(bProfit.stockRevenue,22500);
 near(total.realized,10000);near(total.capital,10000);near(total.projected,30000);
 // Refund consumed stock that cannot be returned: revenue disappears and cost is waste.
 s.orders[0].status='cancelled';s.orders[0].void_meta={returned:[]};near(batchProfitTotals(s,batchReports(s)).realized,-10000);
});
test('summary/export preserve unknown results, filters and finance permissions',()=>{
 const s=profitFixture(),rows=batchReports(s);rows[0].revenueIncomplete=true;assert.equal(batchProfitTotals(s,rows).realized,null);
 let sheets=batchReportSheets(s,{store:'a'}),row=sheets.find(x=>x.name==='Laba rugi batch').rows[0];near(row[5],1693440);near(row[11],7160000);
 assert.equal(batchReportSheets(s,{store:'b'}).find(x=>x.name==='Laba rugi batch').rows.length,0);
 s.access.finance=false;sheets=batchReportSheets(s);assert(!sheets.some(x=>/Laba rugi|Estimasi stok/.test(x.name)));
});

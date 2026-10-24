import {test} from 'node:test';
import assert from 'node:assert/strict';
import {batchReports} from '../pos/batch-report.mjs';
import {batchMetrics,batchStockCosts,formatPercent,percentOf} from '../pos/batch-metrics.mjs';
import {batchReportSheets} from '../pos/reports.mjs';
import {reportPrint,workbook} from '../pos/report-export.mjs';
import {batchMetricsFixture} from './batch-metrics-fixture.mjs';
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const report=s=>batchReports(s).find(r=>r.root.id==='original');
test('500 kg basis: physical fruit, processing, actual output, skin and reject with explicit overlap',()=>{
 const s=batchMetricsFixture(),before=structuredClone(s),r=report(s),m=batchMetrics(r);assert.equal(r.status,'active');near(r.untraced,0);
 assert.equal(m.baseKg,500);
 for(const [key,kg,percent] of [['whole_stock',69.76,13.952],['whole_sold',30.24,6.048],['processed',400,80],['output',227,45.4],['skin',173,34.6],['reject',400,80]]){const row=m.rows.find(x=>x.key===key);near(row.kg,kg);near(row.percent,percent);}
 near(m.yieldPercent,56.75);near(m.skinPercent,43.25);assert.equal(formatPercent(13.952),'13,95%');assert.equal(formatPercent(0),'0,00%');assert.deepEqual(s,before);
});
test('unit cost is per actual pcs/kg, carries shrinkage cost and matches supplier allocation',()=>{
 const s=batchMetricsFixture(),r=report(s),lookup=id=>batchStockCosts(r,r.stock.find(x=>x.lot.productId===id));
 near(lookup('fruit').unitCost,44000);near(lookup('durpas1').unitCost,17600000/227);near(lookup('durpas05').unitCost,17600000/227/2);near(lookup('coral').unitCost,17600000/227);
 assert.equal(lookup('durpas05').unit,'pcs');assert.equal(lookup('coral').unit,'kg');near(lookup('fruit').batchCost,3069440);
 near(r.stock.filter(x=>x.lot.qty!==undefined).reduce((n,x)=>n+batchStockCosts(r,x).batchCost,0),17600000);
});
test('zero receipt or unknown physical quantities stay unknown; percentages are never silently capped',()=>{
 const r=report(batchMetricsFixture());r.root={...r.root,receivedKg:0};assert(batchMetrics(r).rows.every(x=>x.percent===null));
 r.root.receivedKg=500;r.processedKg=NaN;r.firstLossKg=undefined;const m=batchMetrics(r);assert.equal(m.outputKg,null);assert.equal(m.yieldPercent,null);assert.equal(formatPercent(null),'Belum diketahui');assert.equal(percentOf(600,500),120);assert.equal(percentOf(1,null),null);
});
test('mixed products show full product cost separately from the batch portion',()=>{
 const r=report(batchMetricsFixture());r.root={...r.root,unitCost:100};
 const x={lot:{qty:2,unit:'pcs',unitCost:500},equivalent:2,mixed:true};const c=batchStockCosts(r,x);assert.equal(c.unitCost,500);assert.equal(c.batchCost,200);
 x.lot.unitCost=null;assert.equal(batchStockCosts(r,x).unitCost,null,'cannot infer full mixed-product cost from only the fruit portion');r.root.unitCost=null;assert.equal(batchStockCosts(r,x).batchCost,null);
});
test('second-stage Coral yield uses input Coral, without adding it to first-stage skin/output again',()=>{
 const r=report(batchMetricsFixture());Object.assign(r,{coralKg:100,fleshKg:65,secondLossKg:35});const m=batchMetrics(r);assert.equal(m.fleshPercent,65);assert.equal(m.seedPercent,35);assert.equal(m.skinKg,173);assert.equal(m.outputKg,227);
});
test('Excel/PDF include ratio denominators and numeric unit costs, respect role and filter',async()=>{
 const s=batchMetricsFixture(),sheets=batchReportSheets(s,{store:'a'}),ratios=sheets.find(x=>x.name==='Rasio batch'),stocks=sheets.find(x=>x.name==='Stok turunan batch');
 const row=ratios.rows.find(x=>x[2]==='Kulit & sisa proses buah');assert.deepEqual(row.slice(3,6),[173,500,34.6]);
 const durpas=stocks.rows.find(x=>x[1]==='Durpas Monthong 500 gr');near(durpas[7],17600000/227/2);assert.equal(durpas[5],'pcs');
 const bytes=Buffer.from(await workbook(sheets).arrayBuffer());assert(bytes.includes(Buffer.from('<v>34.6</v>')));assert(reportPrint(sheets,{},'Uji').includes('Modal per satuan produk'));
 s.access={trace:true,finance:false};const limited=batchReportSheets(s);assert(!limited.find(x=>x.name==='Stok turunan batch').headers.some(h=>/Modal/.test(h)));assert(limited.find(x=>x.name==='Stok turunan batch').rows.every(x=>x.length===7));
 assert.equal(batchReportSheets(s,{store:'b'}).find(x=>x.name==='Rasio batch').rows.length,0);
});

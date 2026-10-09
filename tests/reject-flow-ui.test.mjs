import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {emptyState,today} from '../pos/core.mjs';
import {createStockDemo,applyStockDemoAction} from '../pos/stock-demo.mjs';
import {wastePage,bindWaste} from '../pos/waste-ui.mjs';
import {batchReportPage,bindBatchReport} from '../pos/batch-report-ui.mjs';
import {batchReports} from '../pos/batch-report.mjs';
import {menuStatus} from '../pos/order-stock.mjs';
import {Node,makeModal,FormDataAdapter} from './variant-dom.mjs';
const store=id(),supplier=id(),fruit=id(),nitrogen=id();
const products=[];
for(const [source,label] of [[fruit,'Musang King Fresh'],[nitrogen,'Musang King Nitrogen']]){
 products.push({id:source,name:'Durian '+label,sku:source,itemType:'direct',stockUnit:'kg_butir',category:'Buah',priceKg:50000,pricePiece:100000});
 for(const [key,name,unit] of [['durpas500','Durpas 500 gr','pcs'],['durpas1000','Durpas 1 kg','pcs'],['coral','Coral','kg'],['daging','Daging durian','kg']])products.push({id:id(),name:name+' '+label,sku:id(),itemType:'finished',stockUnit:unit,category:'Olahan Duren',salePrice:50000,durianSourceId:source,durianOutput:key});
}
const originalState={...emptyState(),stores:[{id:store,name:'Depok'}],suppliers:[{id:supplier,name:'Supplier A'}],products,me:{id:id(),name:'Owner',role:'owner'},access:{sell:true,waste:true,produce:true,trace:true,finance:true,cancel:true},recipes:[]},before=structuredClone(originalState);
let state=createStockDemo(originalState),page='waste';const root=new Node(),m=makeModal(),posted=[],toasts=[];
const globalBefore={document:globalThis.document,FormData:globalThis.FormData,fetch:globalThis.fetch,createImageBitmap:globalThis.createImageBitmap,FileReader:globalThis.FileReader,confirm:globalThis.confirm};
globalThis.document={querySelector:q=>root.querySelector(q),querySelectorAll:q=>root.querySelectorAll(q)};globalThis.FormData=FormDataAdapter;globalThis.fetch=()=>{throw Error('No network in demo/menu filtering');};globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});globalThis.confirm=()=>true;
globalThis.FileReader=class{readAsDataURL(blob){blob.arrayBuffer().then(b=>{this.result='data:'+blob.type+';base64,'+Buffer.from(b).toString('base64');this.onload();});}};
const file=new Blob([Buffer.from('89504e470d0a1a0a','hex')],{type:'image/png'});
const upload=async(d,key)=>{const n=d.querySelector(`[data-proof-file="${key}"]`);n.files=[file];await n.onchange({target:n});};
const ctx={modal:m.modal,getState:()=>state,toast:msg=>toasts.push(msg),refresh:async()=>{},render(){root.innerHTML=page==='waste'?wastePage(state,store):batchReportPage(state);if(page==='waste')bindWaste('waste',state,store,ctx);else bindBatchReport(state,store,ctx);},async mutate(action,p){posted.push({action,p:structuredClone(p)});state=applyStockDemoAction(state,action,p);return true;},loadRejectEvidence:async rid=>state.rejectRecords.find(r=>r.id===rid).evidence};
const c=(d,name)=>d.querySelector(`[name="${name}"]`),submit=d=>d.querySelector('form').fire('submit');
try{
 ctx.render();assert.match(root.textContent,/Reject & Waste/);assert.equal(root.querySelectorAll('[data-reject-op]').length,4);
 const fruitLot=state.lots.find(l=>l.productId===fruit);fruitLot.unitCost=32000;
 await root.querySelector('[data-reject-op="mark"]').fire('click');let d=m.latest;c(d,'sourceLotId').value=fruitLot.id;await d.querySelector('form').fire('change');
 c(d,'kg').value='100';c(d,'pieces').value='100';c(d,'cause').value='taste';c(d,'reason').value='Rasa tidak enak';await upload(d,'reject');await submit(d);assert(d.closed,d.querySelector("#form-error")?.textContent);const marked=state.rejectRecords[0];assert.equal(marked.kind,'mark');assert.equal(state.lots.find(l=>l.id===fruitLot.id).kg,0);assert.equal(state.lots.find(l=>l.id===marked.rejectLotId).kg,100);assert.equal(menuStatus(state,store,products[0],[],today()).ok,false,'Reject cannot be selected in POS');assert.match(root.textContent,/100 kg/);const count=posted.length;await submit(d);assert.equal(posted.length,count,'Completed form cannot resubmit');
 await root.querySelector(`[data-reject-op="process"][data-lot="${marked.rejectLotId}"]`).fire('click');d=m.latest;c(d,'kg').value='100';c(d,'pieces').value='100';c(d,'durpas500_qty').value='20';c(d,'durpas1000_qty').value='20';c(d,'coral_qty').value='10';c(d,'reason').value='Olah seluruh batch';for(const k of ['durpas500','durpas1000','coral'])await upload(d,k);await d.querySelector('form').fire('input');assert.match(d.querySelector('[data-reject-preview]').textContent,/60/);await submit(d);assert(d.closed,d.querySelector("#form-error")?.textContent);const process=state.rejectRecords[0];assert.equal(process.lossKg,60);assert.equal(process.outputs.reduce((n,o)=>n+o.weightKg,0),40);assert(!state.rejectRecords[0].sourceName.includes('Nitrogen'));
 const coral=state.unitLots.find(l=>l.id===process.outputs.find(o=>o.key==='coral').lotId);
 await root.querySelector('[data-reject-op="coral"]').fire('click');d=m.latest;c(d,'sourceLotId').value=coral.id;await d.querySelector('form').fire('change');c(d,'kg').value='10';c(d,'netKg').value='6.5';c(d,'reason').value='Ambil daging bersih';for(const k of ['coral','daging'])await upload(d,k);await submit(d);assert(d.closed,d.querySelector("#form-error")?.textContent);const second=state.rejectRecords[0];assert.equal(second.lossKg,3.5);const flesh=state.unitLots.find(l=>l.id===second.outputs[0].lotId);assert(Math.abs(flesh.unitCost*flesh.qty-800000)<1e-6);
 const snap=structuredClone(state);assert.throws(()=>applyStockDemoAction(state,'reject_void',{id:id(),storeId:store,date:today(),recordId:process.id,reason:'Batal terlalu awal'}),/sudah dipakai/);assert.deepEqual(state,snap);
 page='batches';ctx.render();assert.match(root.textContent,/Masih ada stok/);await root.querySelector(`[data-batch-detail="${fruitLot.id}"]`).fire('click');d=m.latest;assert.match(d.textContent,/Daging durian Musang King Fresh/);assert.match(d.textContent,/3,5/);assert.match(d.textContent,/60/);assert.match(d.textContent,/3.200.000/);assert.match(d.textContent,/Selisih nota tidak diasumsikan nol/);
 const report=batchReports(state,store).find(r=>r.root.id===fruitLot.id);assert.equal(report.status,'active');assert(Math.abs(report.remainingCost-3200000)<1e-6);assert.equal(report.untraced,0);assert.equal(report.lossCost,0);
 // Filter interactions stay local and preserve data.
 const preserved=structuredClone(state);root.querySelector('#batch-search').value='tidak ditemukan';await root.querySelector('#batch-search').fire('input');assert.equal(root.querySelectorAll('[data-batch-detail]').length,0);assert.deepEqual(state,preserved);
 page='waste';ctx.render();await root.querySelector('[data-reject-op="loss"]').fire('click');d=m.latest;c(d,'sourceLotId').value=flesh.id;await d.querySelector('form').fire('change');assert(d.querySelector('[data-fruit-pieces]').hidden);c(d,'qty').value='1.5';c(d,'cause').value='spoiled';c(d,'reason').value='Daging sudah rusak';await upload(d,'reject');await submit(d);assert(d.closed,d.querySelector("#form-error")?.textContent);assert.equal(state.unitLots.find(l=>l.id===flesh.id).qty,5);
 const lost=state.rejectRecords[0];await root.querySelector(`[data-reject-detail="${lost.id}"]`).fire('click');d=m.latest;await d.querySelector('[data-reject-proof]').fire('click');assert.equal(d.querySelectorAll('[data-reject-photos] img').length,1);await d.querySelector('[data-reject-void]').fire('click');d=m.latest;c(d,'reason').value='Salah input waste';await submit(d);assert.equal(state.unitLots.find(l=>l.id===flesh.id).qty,6.5);assert.equal(state.rejectRecords.find(r=>r.id===lost.id).voided,true);
 // Changing the source clears both quantities and evidence; no cross-family submission.
 await root.querySelector('[data-reject-op="mark"]').fire('click');d=m.latest;c(d,'kg').value='1';c(d,'pieces').value='1';await upload(d,'reject');c(d,'processNow').checked=true;await d.querySelector('form').fire('change');assert(!d.querySelector('[data-reject-outputs]').disabled);assert.match(d.querySelector('[data-output-name="coral"]').textContent,/Nitrogen/);
 assert.deepEqual(originalState,before,'Live source remains untouched throughout demo');
 console.log('PASS UI/demo: real forms mark/process/Coral/waste/undo, POS exclusion, actual mass and cost, complete batch detail, isolated filters, photo loading, one submission and original-state isolation.');
}finally{Object.assign(globalThis,globalBefore);}

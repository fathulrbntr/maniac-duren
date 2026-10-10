import assert from 'node:assert/strict';
import {fruitSaleDialog,fruitSaleLots,parseFruitReceiptDate} from '../pos/fruit-sale-dialog.mjs?v=69';
import {Node,makeModal} from './variant-dom.mjs';
import {fixture,day} from './stock-demo-fixture.mjs';

assert.equal(parseFruitReceiptDate('09102026'),'2026-10-09');
assert.equal(parseFruitReceiptDate('09/10/2026'),'2026-10-09');
assert.equal(parseFruitReceiptDate('29022024'),'2024-02-29');
for(const invalid of ['', '091026','2026-10-09','31/11/2026','29022026','00012026','09132026','091020260','abcdefgh','01010000'])assert.equal(parseFruitReceiptDate(invalid),null,invalid);
const typed=date=>date.split('-').reverse().join('');
const f=fixture(),fruit={...f.fruit,priceKg:100000,pricePiece:180000};
const previous='2026-01-01';
const lot=(id,date,supplierId,extra={})=>({id,date,supplierId,storeId:f.store,productId:fruit.id,quality:'ready',kg:20,pieces:10,...extra});
const s={...f.state,products:[fruit],suppliers:[{id:'a',name:'Supplier A'},{id:'b',name:'Supplier B'},{id:'c',name:'Supplier C'}],orders:[],lots:[lot('old',previous,'a'),lot('new-a',day,'a'),lot('new-a2',day,'a'),lot('new-b',day,'b'),lot('foreign',day,'c',{storeId:f.otherStore}),lot('reject',day,'c',{quality:'reject'}),lot('future','2999-01-01','c')]};
let draft=[],added=[];
const m=makeModal(),open=(scale={kg:2.414},extra={})=>fruitSaleDialog({productId:fruit.id,scale,getState:()=>s,getDraft:()=>draft,store:f.store,modal:m.modal,onAdd:line=>{added.push(line);draft.push(line);return true;},...extra});
const c=(d,name)=>d.querySelector(`[name="${name}"]`);
const choose=async(d,name,value)=>{c(d,name).value=value;await c(d,name).fire(name==='receiptDate'?'input':'change');};
const submit=d=>d.querySelector('form').fire('submit');
const values=(d,name)=>c(d,name).options.map(o=>o.value).filter(Boolean);
const source=async(d,date=day,batch='new-b')=>{await choose(d,'receiptDate',typed(date));await choose(d,'lotId',batch);};
async function key(d,name,key,extra={}){let prevented=false;for(const fn of c(d,name).listeners.keydown||[])await fn({key,code:key==='Enter'?'NumpadEnter':key,target:c(d,name),preventDefault(){prevented=true;},stopPropagation(){},...extra});return prevented;}
const focused=(d,name)=>assert.equal(Node.activeElement,c(d,name));

let ui=open(),d=ui.dialog;
focused(d,'receiptDate');assert(c(d,'lotId').disabled);assert.equal(c(d,'receiptDate').attrs.inputmode,'numeric');
assert.deepEqual(d.querySelectorAll('input,select').map(n=>n.name),['receiptDate','lotId','unit']);
assert(!c(d,'kg'));assert(!c(d,'pieces'),'Scanner quantities are displayed, not re-entered');
await key(d,'receiptDate','Enter');assert.match(d.querySelector('#form-error').textContent,/8 angka DDMMYYYY/);focused(d,'receiptDate');assert.equal(added.length,0);
await choose(d,'receiptDate','31022026');await key(d,'receiptDate','Enter');focused(d,'receiptDate');assert(c(d,'lotId').disabled);
await choose(d,'receiptDate','31122999');await key(d,'receiptDate','Enter');assert.match(d.querySelector('#form-error').textContent,/Tidak ada stok/);focused(d,'receiptDate');
await choose(d,'receiptDate',typed(previous));assert.deepEqual(values(d,'lotId'),['old']);await key(d,'receiptDate','Enter');assert.equal(c(d,'receiptDate').value,'01/01/2026');focused(d,'lotId');assert.equal(c(d,'lotId').value,'old');
await choose(d,'receiptDate',typed(day));assert.equal(c(d,'lotId').value,'','New date clears old supplier/batch');assert.deepEqual(values(d,'lotId'),['new-a','new-a2','new-b']);
await key(d,'receiptDate','Enter',{repeat:true});assert.equal(c(d,'lotId').value,'','Held Enter does not advance');
await key(d,'receiptDate','Enter',{isComposing:true});assert.equal(c(d,'lotId').value,'');
await key(d,'receiptDate','Enter');focused(d,'lotId');assert.equal(c(d,'lotId').value,'new-a');
await c(d,'receiptDate').fire('change');assert.equal(c(d,'lotId').value,'new-a','Blur after formatting date must not clear the supplier');
await key(d,'lotId','ArrowDown');assert.equal(c(d,'lotId').value,'new-a2','Same-date receipts stay separate in supplier choices');
await key(d,'lotId','ArrowDown');assert.equal(c(d,'lotId').value,'new-b');
await key(d,'lotId','ArrowDown');assert.equal(c(d,'lotId').value,'new-b','Arrows stop at list edge');
await key(d,'lotId','Enter');focused(d,'unit');assert.equal(added.length,0);
await key(d,'unit','ArrowDown');assert.equal(c(d,'unit').value,'BUTIR');assert.match(d.querySelector('[data-fruit-total]').textContent,/180.000/);
await key(d,'unit','Enter',{repeat:true});assert.equal(added.length,0);
await key(d,'unit','Enter',{ctrlKey:true});assert.equal(added.length,0);
const snapshot=JSON.stringify(s);await key(d,'unit','Enter');await key(d,'unit','Enter');await submit(d);
assert.equal(added.length,1);assert.deepEqual(added[0],{productId:fruit.id,lotId:'new-b',supplierId:'b',unit:'BUTIR',kg:2.414,pieces:1,qty:1,price:180000});assert.equal(JSON.stringify(s),snapshot);

// Numpad flow defaults to KG; opening the next scan starts with a blank date.
draft=[];ui=open();d=ui.dialog;focused(d,'receiptDate');assert.equal(c(d,'receiptDate').value,'');await choose(d,'receiptDate',typed(day));await key(d,'receiptDate','Enter');await key(d,'lotId','Enter');await key(d,'unit','ArrowDown');await key(d,'unit','ArrowUp');await key(d,'unit','Enter');assert.equal(added.at(-1).qty,2.414);assert.equal(added.at(-1).unit,'KG');
// Clicking the submit button and changing controls with a mouse still work.
draft=[];ui=open();d=ui.dialog;await source(d);c(d,'lotId').value='old';const beforeForged=added.length;await submit(d);assert.equal(added.length,beforeForged);assert.match(d.querySelector('#form-error').textContent,/Pilih supplier/);await source(d);await submit(d);assert.equal(added.length,beforeForged+1);

// Manual input advances through actual kg and fruit count before submitting.
draft=[];ui=open(null);d=ui.dialog;await source(d);await key(d,'lotId','Enter');await key(d,'unit','ArrowDown');await key(d,'unit','Enter');focused(d,'kg');
await key(d,'kg','Enter');focused(d,'kg');assert.match(d.querySelector('#form-error').textContent,/berat buah positif/);
c(d,'kg').value='5.5';await key(d,'kg','Enter');focused(d,'pieces');assert(c(d,'pieces').textSelected);
c(d,'pieces').value='1.5';await key(d,'pieces','Enter');assert.match(d.querySelector('#form-error').textContent,/butir bulat/);
c(d,'pieces').value='2';await key(d,'pieces','Enter');assert.equal(added.at(-1).qty,2);assert.equal(added.at(-1).kg,5.5);assert.equal(added.at(-1).price,180000);

// Stock is checked again on submit, including reservations and items in cart.
draft=[];ui=open();d=ui.dialog;await source(d);const target=s.lots.find(l=>l.id==='new-b');target.kg=1;const before=added.length;await key(d,'unit','Enter');assert.equal(added.length,before);assert.match(d.querySelector('#form-error').textContent,/Stok kurang/);target.kg=20;
s.orders=[{store_id:f.store,status:'queued',reserved:{'lot:new-b':{qty:19,pieces:9}}}];await submit(d);assert.equal(added.length,before);s.orders=[];
draft=[{productId:fruit.id,lotId:'new-b',kg:19,pieces:9}];await submit(d);assert.equal(added.length,before);draft=[];
target.quality='reject';ui.refresh();assert.equal(c(d,'lotId').value,'','Polling never replaces unavailable selection with another supplier');await key(d,'unit','Enter');assert.equal(added.length,before);target.quality='ready';d.close();

// Price changes and barcode remapping still require review.
ui=open();d=ui.dialog;await source(d);fruit.priceKg=110000;await key(d,'unit','Enter');assert.match(d.querySelector('#form-error').textContent,/Harga jual berubah/);assert.equal(added.length,before);await key(d,'unit','Enter');assert.equal(added.at(-1).price,110000);
draft=[];ui=open({kg:3.032},{verifyBarcode:()=>{throw Error('Pemetaan barcode berubah');}});d=ui.dialog;await source(d);await submit(d);assert.match(d.querySelector('#form-error').textContent,/Pemetaan barcode/);d.close();
const after=added.length;await key(d,'unit','Enter');await submit(d);assert.equal(added.length,after,'Closed/cancelled popup cannot add an item');
assert.equal(fruitSaleLots(s,f.store,fruit.id,[]).length,4);
console.log('PASS keyboard fruit popup: DDMMYYYY/leap-date validation, numpad Enter/focus, arrow supplier/receipt and unit selection, repeat/IME guards, immediate cart add, automatic scan quantities, manual keyboard flow, exact batch, stock/price/remapping guards and cancel/double submit.');

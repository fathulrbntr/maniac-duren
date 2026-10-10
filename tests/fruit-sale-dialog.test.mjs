import assert from 'node:assert/strict';
import {fruitSaleDialog,fruitSaleLots} from '../pos/fruit-sale-dialog.mjs?v=68';
import {makeModal} from './variant-dom.mjs';
import {fixture,day} from './stock-demo-fixture.mjs';

const f=fixture(),fruit={...f.fruit,priceKg:100000,pricePiece:180000};
const previous='2026-01-01';
const lot=(id,date,supplierId,extra={})=>({id,date,supplierId,storeId:f.store,productId:fruit.id,quality:'ready',kg:20,pieces:10,...extra});
const s={...f.state,products:[fruit],suppliers:[{id:'a',name:'Supplier A'},{id:'b',name:'Supplier B'},{id:'c',name:'Supplier C'}],orders:[],lots:[lot('old',previous,'a'),lot('new-a',day,'a'),lot('new-a2',day,'a'),lot('new-b',day,'b'),lot('foreign',day,'c',{storeId:f.otherStore}),lot('reject',day,'c',{quality:'reject'}),lot('future','2999-01-01','c')]};
let draft=[],added=[];
const m=makeModal(),open=(scale={kg:2.414},extra={})=>fruitSaleDialog({productId:fruit.id,scale,getState:()=>s,getDraft:()=>draft,store:f.store,modal:m.modal,onAdd:line=>{added.push(line);draft.push(line);return true;},...extra});
const c=(d,name)=>d.querySelector(`[name="${name}"]`);
const choose=async(d,name,value)=>{c(d,name).value=value;await c(d,name).fire('change');};
const submit=d=>d.querySelector('form').fire('submit');
const values=(d,name)=>c(d,name).options.map(o=>o.value).filter(Boolean);
const source=async(d,date=day,supplier='b')=>{await choose(d,'receiptDate',date);await choose(d,'supplierId',supplier);};

let ui=open(),d=ui.dialog;
assert(c(d,'supplierId').disabled);assert.deepEqual(values(d,'receiptDate'),[day,previous]);
assert(!c(d,'kg'));assert(!c(d,'pieces'),'Scanner quantities are displayed, not re-entered');
await submit(d);assert.match(d.querySelector('#form-error').textContent,/tanggal barang masuk/);assert.equal(added.length,0);
await choose(d,'receiptDate',previous);assert.deepEqual(values(d,'supplierId'),['a']);
await choose(d,'supplierId','a');assert.equal(c(d,'lotId').value,'old');
await choose(d,'receiptDate',day);assert.equal(c(d,'supplierId').value,'');assert.equal(c(d,'lotId').value,'');assert.deepEqual(values(d,'supplierId'),['a','b']);
await choose(d,'supplierId','a');assert.equal(d.querySelector('[data-fruit-lot-field]').hidden,false);assert.equal(c(d,'lotId').value,'');
await submit(d);assert.match(d.querySelector('#form-error').textContent,/Pilih penerimaan/);
await choose(d,'lotId','new-a2');await choose(d,'supplierId','b');assert.equal(c(d,'lotId').value,'new-b');assert.equal(d.querySelector('[data-fruit-lot-field]').hidden,true);
// Forged supplier/date/lot combinations may not bypass the dependent selectors.
c(d,'lotId').value='new-a';await submit(d);assert.equal(added.length,0);await source(d);
await choose(d,'unit','BUTIR');assert.match(d.querySelector('[data-fruit-price-label]').textContent,/butir/);assert.match(d.querySelector('[data-fruit-total]').textContent,/180.000/);
const snapshot=JSON.stringify(s);await submit(d);await submit(d);
assert.equal(added.length,1);assert.deepEqual(added[0],{productId:fruit.id,lotId:'new-b',supplierId:'b',unit:'BUTIR',kg:2.414,pieces:1,qty:1,price:180000});assert.equal(JSON.stringify(s),snapshot);

// Manual entry uses the same modal and can sell multiple fruit per piece.
draft=[];ui=open(null);d=ui.dialog;await source(d);c(d,'kg').value='5.5';c(d,'pieces').value='2';await choose(d,'unit','BUTIR');await submit(d);
assert.equal(added.at(-1).qty,2);assert.equal(added.at(-1).kg,5.5);assert.equal(added.at(-1).price,180000);
draft=[];ui=open(null);d=ui.dialog;await source(d);c(d,'kg').value='2.5';c(d,'pieces').value='1.5';await submit(d);assert.match(d.querySelector('#form-error').textContent,/butir bulat/);d.close();

// Stock is checked again on submit, including reservations and items in cart.
draft=[];ui=open();d=ui.dialog;await source(d);const target=s.lots.find(l=>l.id==='new-b');target.kg=1;const before=added.length;await submit(d);assert.equal(added.length,before);assert.match(d.querySelector('#form-error').textContent,/Stok kurang/);target.kg=20;
s.orders=[{store_id:f.store,status:'queued',reserved:{'lot:new-b':{qty:19,pieces:9}}}];await submit(d);assert.equal(added.length,before);s.orders=[];
draft=[{productId:fruit.id,lotId:'new-b',kg:19,pieces:9}];await submit(d);assert.equal(added.length,before);draft=[];
target.quality='reject';await submit(d);assert.equal(added.length,before);target.quality='ready';d.close();

// Price changes and barcode remapping require review instead of a stale sale.
ui=open();d=ui.dialog;await source(d);fruit.priceKg=110000;await submit(d);assert.match(d.querySelector('#form-error').textContent,/Harga jual berubah/);assert.equal(added.length,before);await submit(d);assert.equal(added.at(-1).price,110000);
draft=[];ui=open({kg:3.032},{verifyBarcode:()=>{throw Error('Pemetaan barcode berubah');}});d=ui.dialog;await source(d);await submit(d);assert.match(d.querySelector('#form-error').textContent,/Pemetaan barcode/);d.close();
const after=added.length;await submit(d);assert.equal(added.length,after,'Closed/cancelled popup cannot add an item');
assert.equal(fruitSaleLots(s,f.store,fruit.id,[]).length,4);
console.log('PASS fruit popup: ordered date/supplier filters, duplicate receipts, automatic scan quantities, kg/piece pricing, manual input, stale/foreign/reject/future/reserved stock, price changes, remapping, cancel and double submit.');

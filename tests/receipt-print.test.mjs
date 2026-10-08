import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeModal,Node} from './variant-dom.mjs';
import {printDocument} from './receipt-print-dom.mjs';
import {receiptHeightMm,printReceipt} from '../pos/receipt-printer.mjs?v=58';
const {showReceipt}=await import(process.env.RECEIPT_UI_MODULE||'../pos/cashier-ui.mjs');
const css=fs.readFileSync(new URL('../pos/pos.css',import.meta.url),'utf8');
const exception=css.match(/body\s*>\s*(dialog\.[\w-]+)\s*\{\s*display:\s*block\s*!important/)[1];
const m=makeModal(),frames=[],messages=[];
const saved={document:globalThis.document,window:globalThis.window,requestAnimationFrame:globalThis.requestAnimationFrame,fetch:globalThis.fetch};
const order={id:'receipt-order',store_id:'store',business_date:'2026-10-08',status:'paid',note:'Tanpa es',table_no:7,subtotal:50000,total:45000,discount:{name:'Owner 10%',amount:5000,approvedName:'Owner'},payment:'Tunai',paid:50000,lines:[{name:'Durpas Bawor 500 gr',qty:1,unit:'pcs',price:50000}]};
const state={stores:[{id:'store',name:'Depok'}],orders:[order]};
let measuredHeight=384,printerError=false;
const printDom=printDocument({height:()=>measuredHeight,onPrint:({text,css})=>{
 assert.match(text,/MANIAC DUREN/);assert(!text.includes('Cetak struk'));assert(!text.includes('Transaksi sudah tersimpan'));
 assert.match(css,new RegExp(`size: 80mm ${receiptHeightMm(measuredHeight)}mm; margin: 0;`));
 if(printerError)throw Error('Printer tidak tersedia');
}});
const ctx={getState:()=>state,modal:(...args)=>{const d=m.modal(...args);d.classList.add('modal');printDom.document.body.append(d);return d;},toast:message=>messages.push(message),mutate:()=>{throw Error('Printing must not mutate transactions');}};
globalThis.document=printDom.document;
globalThis.requestAnimationFrame=fn=>frames.push(fn);
globalThis.window={print(){throw Error('Do not print the entire POS page');}};
globalThis.fetch=()=>{throw Error('Printing must not fetch data or fonts');};
// Advance scheduled frames while awaiting the actual async click/print handlers.
async function flush(promise){let done=false,result,error;Promise.resolve(promise).then(x=>{done=true;result=x;},e=>{done=true;error=e;});for(let i=0;i<40&&!done;i++){await Promise.resolve();if(frames.length)frames.shift()();}assert(done,'Print handler must settle');if(error)throw error;return result;}
try{
 assert.equal(receiptHeightMm(96),26.4);assert.equal(receiptHeightMm(960),255);
 assert(receiptHeightMm(10000)>2600,'Never truncate a long order to a fixed page height');
 for(const height of [0,-1,NaN,Infinity])assert.throws(()=>receiptHeightMm(height));
 const original=JSON.stringify(state);
 let d=showReceipt(ctx,order.id,true,{title:'Pesanan berhasil',message:'Pembayaran tersimpan'});
 assert(d.matches(exception),'Keep the 055 print-visible dialog fallback');
 assert.equal(printDom.printed.length,0);
 const automatic=frames.shift()();assert(d.querySelector('#print-order').disabled);
 await flush(automatic);assert.equal(printDom.printed.length,1);
 const first=printDom.printed[0];
 assert.match(first.text,/Durpas Bawor/);assert.match(first.text,/Meja 7/);assert.match(first.text,/Tanpa es/);assert.match(first.text,/45.000/);assert.match(first.text,/Diskon Owner 10%/);
 assert.equal(JSON.stringify(state),original);assert(!d.querySelector('#print-order').disabled);
 assert(!first.frame.removed,'Keep print document alive when browsers return before the preview closes');
 await flush(d.querySelector('#print-order').fire('click'));
 assert.equal(printDom.printed.length,2);assert.equal(printDom.printed[1].text,first.text);assert(first.frame.removed,'Replace old print document on explicit reprint');
 assert.equal(printDom.frames.filter(f=>!f.removed).length,1,'Keep only one print document');
 assert.equal(JSON.stringify(state),original);
 d=showReceipt(ctx,order.id,true);d.close();await flush(frames.shift()());assert.equal(printDom.printed.length,2);
 state.stockDemo={sessionId:'demo'};order.status='cancelled';order.void_meta={reason:'Salah input',byName:'Kasir',approvedName:'Owner'};
 d=showReceipt(ctx,order.id);await flush(d.querySelector('#print-order').fire('click'));
 assert.match(printDom.printed.at(-1).text,/DEMO/);assert.match(printDom.printed.at(-1).text,/VOID/);assert.match(printDom.printed.at(-1).text,/Salah input/);
 order.lines=Array.from({length:100},(_,i)=>({name:'Produk panjang '+(i+1),qty:1,unit:'pcs',price:1000}));
 measuredHeight=8000;d=showReceipt(ctx,order.id);await flush(d.querySelector('#print-order').fire('click'));
 assert.match(printDom.printed.at(-1).text,/Produk panjang 100/);assert.match(printDom.printed.at(-1).text,/Kembalian/);
 // Measurement/printer failure keeps the saved order and allows retry.
 const beforeFailure=JSON.stringify(state),printCount=printDom.printed.length;
 measuredHeight=0;await flush(d.querySelector('#print-order').fire('click'));assert.equal(printDom.printed.length,printCount);assert.match(messages.at(-1),/belum siap/);assert(!d.querySelector('#print-order').disabled);
 measuredHeight=384;printerError=true;await flush(d.querySelector('#print-order').fire('click'));assert.match(messages.at(-1),/Pesanan tetap tersimpan/);assert(printDom.frames.at(-1).removed);assert(!d.querySelector('#print-order').disabled);
 printerError=false;await flush(d.querySelector('#print-order').fire('click'));assert.equal(JSON.stringify(state),beforeFailure);
 // Overlapping preparations cannot replace the document being measured.
 const receipt=d.querySelector('.receipt-print'),pending=printReceipt(receipt);
 await assert.rejects(printReceipt(receipt),/sedang disiapkan/);await flush(pending);
 await assert.rejects(printReceipt(new Node('div')),/kosong/);
 console.log('PASS receipt printing: content-sized 80 mm page, isolated document, auto/manual/reprint, saved totals/table/discount, demo/void, 100 items, stale/duplicate requests, zero-height and printer errors; no transaction/network writes. DOM measurement is simulated, not a physical/browser print test.');
}finally{Object.assign(globalThis,saved);}

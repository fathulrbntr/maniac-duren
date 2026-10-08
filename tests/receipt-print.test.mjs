import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeModal,Node} from './variant-dom.mjs';
const {showReceipt}=await import(process.env.RECEIPT_UI_MODULE||'../pos/cashier-ui.mjs');
// Verify that the real receipt renderer qualifies for the existing print-only
// exception at the moment print() runs. This reproduces the blank-page regression.
const css=fs.readFileSync(new URL('../pos/pos.css',import.meta.url),'utf8');
const exception=css.match(/body\s*>\s*(dialog\.[\w-]+)\s*\{\s*display:\s*block\s*!important/)[1];
const m=makeModal(),body=new Node('body'),frames=[],printed=[];
const saved={window:globalThis.window,requestAnimationFrame:globalThis.requestAnimationFrame};
const order={id:'receipt-order',store_id:'store',business_date:'2026-10-08',status:'paid',note:'Tanpa es',table_no:7,subtotal:50000,total:45000,discount:{name:'Owner 10%',amount:5000,approvedName:'Owner'},payment:'Tunai',paid:50000,lines:[{name:'Durpas Bawor 500 gr',qty:1,unit:'pcs',price:50000}]};
const state={stores:[{id:'store',name:'Depok'}],orders:[order]};
const ctx={getState:()=>state,modal:(...args)=>{const d=m.modal(...args);d.classList.add('modal');d.setAttribute('open','');d.parent=body;body.children.push(d);return d;},toast:message=>{throw Error(message);},mutate:()=>{throw Error('Printing must not mutate transactions');}};
globalThis.requestAnimationFrame=fn=>frames.push(fn);
globalThis.window={print(){const d=m.latest;assert.equal(d.parent,body);assert(d.matches(exception),'The receipt dialog is hidden by body > * during print');assert('open' in d.attrs);const receipt=d.querySelector('.receipt-print');assert(receipt);assert.match(receipt.textContent,/MANIAC DUREN/);assert(!receipt.textContent.includes('Cetak struk'));printed.push(receipt.textContent);}};
try{
 let d=showReceipt(ctx,order.id,true,{title:'Pesanan berhasil',message:'Pembayaran tersimpan'});assert(d.matches(exception),'The receipt dialog is hidden by body > * during print');assert.equal(printed.length,0,'Wait until the receipt dialog is ready');frames.shift()();assert.equal(printed.length,1);assert.match(printed[0],/Durpas Bawor/);assert.match(printed[0],/Meja 7/);assert.match(printed[0],/Tanpa es/);assert.match(printed[0],/45.000/);assert.match(printed[0],/Diskon Owner 10%/);
 await d.querySelector('#print-order').fire('click');assert.equal(printed.length,2);assert.equal(printed[1],printed[0],'Reprint keeps the original saved receipt');
 state.stockDemo={sessionId:'demo'};order.status='cancelled';order.void_meta={reason:'Salah input',byName:'Kasir',approvedName:'Owner'};d=showReceipt(ctx,order.id);await d.querySelector('#print-order').fire('click');assert.match(printed.at(-1),/DEMO/);assert.match(printed.at(-1),/VOID/);assert.match(printed.at(-1),/Salah input/);
 order.lines=Array.from({length:100},(_,i)=>({name:'Produk panjang '+(i+1),qty:1,unit:'pcs',price:1000}));d=showReceipt(ctx,order.id);await d.querySelector('#print-order').fire('click');assert.match(printed.at(-1),/Produk panjang 100/);
 console.log('PASS actual receipt renderer: matches the print-visible dialog rule before auto/manual print, persisted totals/discount/table/note, reprint without a new sale, demo/void markers and 100-line content. No physical printer/browser rendering claimed.');
}finally{Object.assign(globalThis,saved);}

import assert from 'node:assert/strict';
import {receiptBarcode} from '../pos/receipt-barcode.mjs';
import {openWeighingReceipt} from '../pos/receipt-weighing.mjs';
import {systemDock} from '../pos/system-dock.mjs';
import {defaultDeviceSettings,deviceSettingsKey} from '../pos/device-settings.mjs';
import {Node,makeModal} from './variant-dom.mjs';

const products=[
 {id:'fruit',name:'Monthong',barcode:'0001',itemType:'direct',category:'Buah',stockUnit:'kg_butir'},
 {id:'other',name:'Bawor',barcode:'0002',itemType:'direct',category:'Buah',stockUnit:'kg_butir'},
];
const code='2100010030320', second='2100010024145';
assert.deepEqual(receiptBarcode(code,products,'fruit'),{barcode:code,kg:3.032,pieces:1});
assert.throws(()=>receiptBarcode(code,products,'other'),/Monthong/);
assert.throws(()=>receiptBarcode(code,[], 'fruit'),/belum terdaftar/);
assert.throws(()=>receiptBarcode(code,[...products,{...products[0],id:'duplicate'}],'fruit'),/lebih dari satu/);
assert.throws(()=>receiptBarcode(code,[{...products[0],stockUnit:'pcs'}],'fruit'),/Kg \+ butir/);
assert.throws(()=>receiptBarcode('0001',products,'fruit'),/tidak memuat berat/);
assert.throws(()=>receiptBarcode('2100010030321',products,'fruit'),/digit pemeriksa/);
assert(systemDock('stock',{stock:true}).includes('data-dock-scan'));
for(const access of [{master:true},{sell:true},{produce:true},{reports:true}])assert(!systemDock('stock',access).includes('data-dock-scan'));

// Exercise the real receipt and weighing handlers with a small DOM adapter.
const original=Object.fromEntries(['document','localStorage','confirm'].map(k=>[k,globalThis[k]]));
const keys=['elements','className','append','remove','showModal','reset','close','matches'];
const descriptors=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(Node.prototype,k)]));
const matches=Node.prototype.matches;
Node.prototype.matches=function(selector){return matches.call(this,selector.replace(/\[([\w-]+)=([\w-]+)\]/g,'[$1="$2"]'));};
Object.defineProperty(Node.prototype,'elements',{configurable:true,get(){return new Proxy({namedItem:name=>this.querySelector(`[name="${name}"]`)},{get:(t,k)=>k in t?t[k]:this.querySelector(`[name="${k}"]`)});}});
Object.defineProperty(Node.prototype,'className',{configurable:true,get(){return this.attrs.class||''},set(v){this.attrs.class=v}});
Node.prototype.append=function(n){n.parent=this;this.children.push(n);};
Node.prototype.remove=function(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);};
Node.prototype.showModal=function(){this.setAttribute('open','');};
Node.prototype.close=function(){this.removeAttribute('open');this.onclose?.();};
Node.prototype.reset=function(){for(const n of this.querySelectorAll('input'))n._value=n.attrs.value??'';};
const body=new Node('body');
const settings=defaultDeviceSettings();
globalThis.document={body,createElement:tag=>new Node(tag)};
globalThis.localStorage={getItem:key=>key===deviceSettingsKey?JSON.stringify(settings):null};
let confirmation=false,confirms=0;
globalThis.confirm=()=>{confirms++;return confirmation;};
const modal=makeModal(),writes=[];
const state={products,stores:[{id:'store',name:'Outlet'}],suppliers:[{id:'supplier',name:'Supplier'}],lots:[],receiptShipmentVersion:82};
const ctx={modal:modal.modal,mutate:async(action,payload)=>{writes.push({action,payload});return true;},render(){},toast(){}};
try {
 const d=openWeighingReceipt(state,'store',ctx);
 const card=d.querySelector('.receipt-product');
 await card.querySelector('[data-weigh-open]').fire('click');
 let w=body.querySelector('.weighing-dialog');
 const input=w.querySelector('#receipt-weigh-scan');
 assert.equal(Node.activeElement,input);
 async function scan(value,key='Enter',extra={}){input.value=value;for(const fn of input.listeners.keydown)await fn({key,preventDefault(){},...extra});}
 const history=()=>w.querySelector('[data-history]').querySelectorAll('[data-edit]');
 await scan(code);assert.equal(history().length,1);assert.equal(input.value,'');assert.equal(Node.activeElement,input);
 await scan(second);assert.equal(history().length,2);assert.match(w.querySelector('[data-total]').textContent,/5,446 kg · 2 butir/);assert.equal(writes.length,0);
 await scan(code);assert.equal(history().length,2,'repeat cancelled');assert.equal(confirms,1);
 confirmation=true;await scan(code);assert.equal(history().length,3,'distinct fruit with same encoded weight allowed after confirmation');
 await w.querySelector('[data-delete]').fire('click');assert.equal(history().length,2);
 await scan(code,'Enter',{repeat:true});assert.equal(history().length,2);
 await scan('2100010030321');assert.match(w.querySelector('#receipt-scan-status').textContent,/digit pemeriksa/);assert.equal(history().length,2);
 input.value='';
 await history()[0].fire('click');
 assert(w.querySelector('.weigh-manual').open);
 await scan(code);assert.match(w.querySelector('#receipt-scan-status').textContent,/koreksi/);assert.equal(history().length,2);
 input.value='';
 w.querySelector('[name="kg"]').value='2.5';
 await w.querySelector('.weigh-entry').fire('submit');
 assert.match(w.querySelector('[data-total]').textContent,/5,532 kg · 2 butir/);
 assert.match(w.querySelector('[data-history]').textContent,/Dikoreksi/);
 assert.match(w.querySelector('[data-history]').textContent,/2100010024145/,'correction retains original label');
 await w.querySelector('[data-close]').fire('click');
 await card.querySelector('[data-weigh-open]').fire('click');
 w=body.querySelector('.weighing-dialog');assert.equal(history().length,2,'reopening retains draft rows');
 await w.querySelector('[data-close]').fire('click');
 const f=d.querySelector('form');f.elements.invoiceNo.value='SCAN-100';
 card.querySelector('[data-purchase]').value='500000';await card.querySelector('[data-purchase]').fire('input');
 await f.fire('submit');assert.equal(writes.length,1);assert.equal(writes[0].action,'receipt_batch');
 const rows=writes[0].payload.lines[0].weighings;
 assert.deepEqual(rows.map(r=>[r.kg,r.pieces,r.barcode]),[[3.032,1,code],[2.5,1,second]]);
 assert(rows[1].editedAt);assert.equal(writes[0].payload.unloadingComplete,true);
 // Prefix/suffix and Tab work, and disabling the scanner keeps manual input available.
 settings.scanner.prefix='MD:';settings.scanner.suffix='#';settings.scanner.terminator='Tab';
 assert.equal(receiptBarcode('MD:'+code+'#',products,'fruit',settings).kg,3.032);
 settings.scanner.enabled=false;
 const disabled=openWeighingReceipt(state,'store',ctx);await disabled.querySelector('[data-weigh-open]').fire('click');
 const fallback=body.querySelector('.weighing-dialog');assert(fallback.querySelector('#receipt-weigh-scan').disabled);assert(fallback.querySelector('.weigh-manual').open);
 console.log('PASS receipt barcode: exact product/weight, no price/stock prerequisite, permissions, repeat confirmation, invalid scan, manual correction with label history, reopen, draft-only scans and final receipt payload.');
} finally {
 Object.assign(globalThis,original);
 for(const [key,value]of Object.entries(descriptors)){if(value)Object.defineProperty(Node.prototype,key,value);else delete Node.prototype[key];}
}

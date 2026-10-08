import assert from 'node:assert/strict';
import {createStockDemo,applyStockDemoAction} from '../pos/stock-demo.mjs';
import {opsPage,bindOps,clearOrderDraft,hasOrderDraft} from '../pos/operations-ui.mjs';
import {Node,makeModal,FormDataAdapter} from './variant-dom.mjs';
import {fixture,qty} from './stock-demo-fixture.mjs';
const f=fixture(),m=makeModal(),root=new Node(),posted=[];let state=createStockDemo(f.state);
const globals={document:globalThis.document,FormData:globalThis.FormData,fetch:globalThis.fetch,requestAnimationFrame:globalThis.requestAnimationFrame};
const descriptor=Object.getOwnPropertyDescriptor(Node.prototype,'elements');
Object.defineProperty(Node.prototype,'elements',{configurable:true,get(){return new Proxy({namedItem:name=>this.querySelector(`[name="${name}"]`)},{get:(target,k)=>k in target?target[k]:this.querySelector(`[name="${k}"]`)});}});
globalThis.requestAnimationFrame=fn=>fn();globalThis.FormData=FormDataAdapter;
globalThis.document={querySelector:q=>root.querySelector(q),querySelectorAll:q=>root.querySelectorAll(q),createElement:tag=>{const n=new Node(tag);if(tag==='template')n.content=n;return n;}};
globalThis.fetch=()=>{throw Error('Demo UI must not fetch');};
const ctx={modal:m.modal,getState:()=>state,mutate:async(action,payload)=>{posted.push(action);state=applyStockDemoAction(state,action,payload);return true;},render,refresh(){},toast(){}};
function render(){root.innerHTML=opsPage('orders',state,f.store);bindOps('orders',state,f.store,ctx);}
const submit=d=>d.querySelector('form').fire('submit');
try{
 clearOrderDraft();render();assert.equal(hasOrderDraft(),false);assert.match(root.querySelector('#save-order').textContent,/Uji pembayaran/);
 await root.querySelector('#order-products').listeners.click[0]({target:root.querySelector(`[data-menu-key="product:${f.water.id}"]`)||root.querySelector(`[data-product="${f.water.id}"]`)});
 assert(hasOrderDraft());assert.match(root.querySelector('#order-draft').textContent,/Air mineral/);
 await root.querySelector('#save-order').fire('click');assert.match(m.latest.textContent,/Simulasi pembayaran demo/);await submit(m.latest);
 assert.deepEqual(posted,['order_create']);assert.equal(qty(state,f.water,f.store),99);assert.equal(state.orders.length,1);assert.equal(hasOrderDraft(),false);
 const detail=root.querySelector('[data-op="order_receipt"]');assert(detail);await detail.fire('click');assert.match(m.latest.textContent,/DEMO · BUKAN TRANSAKSI NYATA/);
 assert.match(opsPage('kitchen',state,f.store),/Mode demo · hanya di tab ini/);
 console.log('PASS actual demo POS UI: product click, local cart, simulated payment, stock decrement, cleared draft, demo receipt watermark and kitchen status.');
}finally{clearOrderDraft();Object.assign(globalThis,globals);if(descriptor)Object.defineProperty(Node.prototype,'elements',descriptor);else delete Node.prototype.elements;}

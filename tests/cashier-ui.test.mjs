import assert from 'node:assert/strict';
import {id,today} from '../pos/core.mjs';
import {createStockDemo,applyStockDemoAction as apply} from '../pos/stock-demo.mjs';
import {opsPage,bindOps,clearOrderDraft,hasOrderDraft} from '../pos/operations-ui.mjs';
import {voidDialog,discountsPage} from '../pos/cashier-ui.mjs';
import {cashierQuote,checkoutTotals} from '../pos/cashier.mjs';
import {visibleSections} from '../pos/navigation.mjs';
import {orderMargins} from '../pos/finance.mjs';
import {Node,makeModal,FormDataAdapter} from './variant-dom.mjs';
import {fixture,qty} from './stock-demo-fixture.mjs';
const f=fixture(),owner={...f.state.me},cashier={id:id(),role:'cashier',name:'Kasir'},root=new Node(),m=makeModal(),posted=[];
let state=createStockDemo(f.state),view='orders',prints=0,failure=null;
const globals={document:globalThis.document,FormData:globalThis.FormData,fetch:globalThis.fetch,requestAnimationFrame:globalThis.requestAnimationFrame,window:globalThis.window};
const descriptor=Object.getOwnPropertyDescriptor(Node.prototype,'elements'),oldClose=Node.prototype.close;
Object.defineProperty(Node.prototype,'elements',{configurable:true,get(){return new Proxy({namedItem:name=>this.querySelector(`[name="${name}"]`)},{get:(target,k)=>k in target?target[k]:this.querySelector(`[name="${k}"]`)});}});
Node.prototype.close=function(){if(this.closed)return;this.closed=true;for(const fn of this.listeners.close||[])fn();};
globalThis.window={print(){prints++;}};globalThis.requestAnimationFrame=fn=>fn();globalThis.FormData=FormDataAdapter;
globalThis.document={querySelector:q=>root.querySelector(q),querySelectorAll:q=>root.querySelectorAll(q),createElement:tag=>{const n=new Node(tag);if(tag==='template')n.content=n;return n;}};globalThis.fetch=()=>{throw Error('No demo request allowed');};
const ctx={modal:m.modal,getState:()=>state,mutate:async(action,payload)=>{posted.push({action,payload});if(failure)throw failure;state=apply(state,action,payload);return true;},render,refresh(){},toast(){}};
function render(){root.innerHTML=opsPage(view,state,f.store);bindOps(view,state,f.store,ctx);}
const submit=d=>d.querySelector('form').fire('submit'),field=(d,name)=>d.querySelector(`[name="${name}"]`);
const pick=async p=>root.querySelector('#order-products').listeners.click[0]({target:root.querySelector(`[data-menu-key="product:${p.id}"]`)});
const refreshCheckout=()=>root.querySelector('#order-discount').fire('change');
try{
 assert(!visibleSections({sell:true}).flatMap(s=>s.pages).includes('discounts'));assert(visibleSections({sell:true,cashierOwner:true}).flatMap(s=>s.pages).includes('discounts'));
 // Owner config uses its real form; cashier cannot see or save settings.
 view='discounts';render();await root.querySelector('#new-discount').fire('click');let d=m.latest;field(d,'name').value='Diskon uji';field(d,'kind').value='percent';field(d,'value').value='10';await submit(d);assert.equal(state.discounts.length,1);const policy=state.discounts[0];
 state.me=cashier;assert.match(discountsPage(state),/hanya untuk owner/);assert.throws(()=>apply(state,'discount_save',{id:id(),discountId:id(),expectedVersion:0,name:'Bebas',kind:'amount',value:1000,active:true}),/owner/);
 view='orders';clearOrderDraft();render();assert(root.querySelector('#order-table'));assert.equal(root.querySelector('#order-note').attrs.placeholder,'Nama pelanggan / permintaan khusus');
 await pick(f.water);root.querySelector('#order-table').value='7';root.querySelector('#order-note').value='Tanpa es';root.querySelector('#order-discount').value=policy.id;await refreshCheckout();assert(root.querySelector('#save-order').disabled);
 await root.querySelector('#request-discount').fire('click');let a=state.cashierApprovals.at(-1);assert.equal(a.status,'pending');assert.equal(state.orders.length,0);assert.equal(qty(state,f.water,f.store),100);
 assert.throws(()=>apply(state,'cashier_approval_decide',{id:id(),approvalId:a.id,decision:'approved'}),/owner/);
 // Simulate the owner's separate authorized session; update the cashier's polled snapshot.
 state=apply({...state,me:owner},'cashier_approval_decide',{id:id(),approvalId:a.id,decision:'approved'});state.me=cashier;await refreshCheckout();assert(!root.querySelector('#save-order').disabled);assert.match(root.querySelector('#discount-status').textContent,/Disetujui/);assert.match(root.querySelector('#order-total').textContent,/4.500/);
 root.querySelector('#order-table').value='8';await root.querySelector('#order-table').fire('change');assert(root.querySelector('#save-order').disabled,'Table change invalidates approval');root.querySelector('#order-table').value='7';await refreshCheckout();
 // Cancel before confirming does not post an order and keeps the cart.
 const before=posted.length;await root.querySelector('#save-order').fire('click');d=m.latest;field(d,'payment').value='QRIS';await field(d,'payment').fire('change');await submit(d);assert.match(m.latest.textContent,/Konfirmasi pembayaran/);assert.equal(posted.length,before);m.latest.close();assert.match(m.latest.textContent,/Pembayaran dibatalkan/);assert(hasOrderDraft());assert.equal(state.orders.length,0);assert.equal(prints,0);
 // Confirm twice: one sale, one print, net amount on receipt and separate table/note.
 await root.querySelector('#save-order').fire('click');d=m.latest;field(d,'payment').value='QRIS';await field(d,'payment').fire('change');await submit(d);const confirm=m.latest;await submit(confirm);await submit(confirm);
 assert.equal(posted.filter(p=>p.action==='order_create').length,1);assert.equal(state.orders.length,1);let o=state.orders[0];assert.equal(o.total,4500);assert.equal(o.subtotal,5000);assert.equal(o.table_no,7);assert.equal(o.note,'Tanpa es');assert.equal(qty(state,f.water,f.store),99);assert(!hasOrderDraft());assert.equal(prints,1);assert.match(m.latest.textContent,/Pesanan berhasil/);assert.match(m.latest.textContent,/Meja 7/);assert.match(m.latest.textContent,/Diskon Diskon uji/);
 assert.equal(orderMargins(state,[o])[0].revenue,4500);
 // Cashier requests void, owner approves, cashier confirms refund; direct stock returns once.
 d=voidDialog(ctx,f.store,o.id);field(d,'reason').value='Salah input';field(d,'returnStock').value='true';await submit(d);assert.match(m.latest.textContent,/Permintaan void terkirim/);assert.equal(state.orders[0].status,'paid');a=state.cashierApprovals.at(-1);
 state=apply({...state,me:owner},'cashier_approval_decide',{id:id(),approvalId:a.id,decision:'approved'});state.me=cashier;
 d=voidDialog(ctx,f.store,o.id);await submit(d);assert.match(d.querySelector('#form-error').textContent,/pengembalian pembayaran/);field(d,'refundConfirmed').checked=true;await submit(d);assert.equal(state.orders[0].status,'cancelled');assert.equal(qty(state,f.water,f.store),100);assert.match(m.latest.textContent,/Pesanan dibatalkan/);
 // Failed save stays in the confirmation dialog; uncertain result is never called cancelled.
 clearOrderDraft();render();await pick(f.water);await root.querySelector('#save-order').fire('click');await submit(m.latest);d=m.latest;delete state.stockDemo;failure=Object.assign(Error('Jaringan terputus'),{definitive:false});await submit(d);assert.match(d.querySelector('#form-error').textContent,/Jaringan terputus/);assert(hasOrderDraft());d.close();assert.match(m.latest.textContent,/Status pembayaran belum pasti/);failure=null;
 console.log('PASS cashier UI/demo: owner settings, cashier authorization, table/note separation, approval binding, cancel-without-save, final confirmation, single save/print, discounted receipt/report, void/refund/stock return, failed and uncertain result states.');
}finally{clearOrderDraft();Object.assign(globalThis,globals);Object.defineProperty(Node.prototype,'elements',descriptor);Node.prototype.close=oldClose;}

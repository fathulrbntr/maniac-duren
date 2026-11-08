import assert from 'node:assert/strict';
import {id} from '../pos/core.mjs';
import {createStockDemo,applyStockDemoAction} from '../pos/stock-demo.mjs';
import {payExistingOrder} from '../pos/cashier-ui.mjs';
import {openCustomerDisplay,resetCustomerDisplay} from '../pos/customer-display-channel.mjs';
import {Node,makeModal} from './variant-dom.mjs';
import {fixture} from './stock-demo-fixture.mjs';
import {testPaymentQR} from './payment-qr-fixture.mjs';
const f=fixture();let state=createStockDemo(f.state);
state=applyStockDemoAction(state,'cashier_shift_open',{id:id(),storeId:f.store,openingCash:0});delete state.stockDemo;
const order={id:id(),store_id:f.store,payment_status:'unpaid',status:'queued',total:150000,subtotal:150000,lines:[{productId:f.water.id,qty:1,price:150000}]};state.orders=[order];
const original={window:globalThis.window,BroadcastChannel:globalThis.BroadcastChannel,localStorage:globalThis.localStorage}, oldClose=Node.prototype.close;
let messages=[],pagehide,failed=false,saves=0;const m=makeModal();
class Channel {postMessage(msg){messages.push(msg);}close(){}}
globalThis.BroadcastChannel=Channel;
globalThis.window={open:()=>({closed:false,focus(){}}),addEventListener:(e,fn)=>{if(e==='pagehide')pagehide=fn;}};
globalThis.localStorage={getItem:()=>JSON.stringify({printer:{autoPrint:false}})};
// Native HTMLDialogElement emits close asynchronously. Reproduce that ordering.
Node.prototype.close=function(){if(this.closed)return;this.closed=true;this.removeAttribute('open');queueMicrotask(()=>{for(const fn of this.listeners.close||[])fn();});};
const ctx={getState:()=>state,modal:m.modal,toast:msg=>{throw Error(msg);},render(){},mutate:async()=>{saves++;if(failed)throw Error('Connection lost');order.payment_status='paid';return true;}};
const last=()=>messages.at(-1)?.snapshot;
const field=(d,n)=>d.querySelector(`[name="${n}"]`),submit=d=>d.querySelector('form').fire('submit');
async function start(ref){
 payExistingOrder(ctx,f.store,order.id);const d=m.latest;
 field(d,'payment').value='QRIS';await field(d,'payment').fire('change');
 const input=d.querySelector('[data-qr-payload]');input.value=testPaymentQR({reference:ref});await input.fire('input');
 d.querySelector('[data-qr-confirm]').checked=true;await d.querySelector('[data-qr-show]').fire('click');assert(last().qr);
 return d;
}
try {
 openCustomerDisplay();let d=await start('CANCEL');d.close();await Promise.resolve();assert.equal(last().qr,null);assert.equal(last().phase,'cart');assert.equal(saves,0);
 d=await start('SUCCESS');field(d,'paymentConfirmed').checked=true;await submit(d);assert.equal(last().phase,'confirming');assert.equal(last().qr,null);
 const confirmation=m.latest;await submit(confirmation);await submit(confirmation);assert.equal(saves,1);assert.equal(last().phase,'paid');
 order.payment_status='unpaid';failed=true;d=await start('FAILED');field(d,'paymentConfirmed').checked=true;await submit(d);await submit(m.latest);assert.equal(last().phase,'uncertain');assert.equal(last().qr,null);
 m.latest.close();await Promise.resolve();assert.equal(last().phase,'uncertain');
 failed=false;d=await start('LOGOUT');resetCustomerDisplay();d.close();await Promise.resolve();assert.equal(last(),null,'Late close events must not resurrect a previous session');
 console.log('PASS real checkout handlers: QR cancellation, async close ordering, exactly-once save, paid only after success, uncertain network, logout and stale-dialog isolation.');
} finally {pagehide?.();Node.prototype.close=oldClose;Object.assign(globalThis,original);}

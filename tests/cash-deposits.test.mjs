import {test} from 'node:test';
import assert from 'node:assert/strict';
import {id,today} from '../pos/core.mjs';
import {fixture} from './stock-demo-fixture.mjs';
import {createStockDemo,applyStockDemoAction as apply,readStockDemo} from '../pos/stock-demo.mjs';
import {depositTotals,refreshDepositDemo,readDepositsDemo,depositProofDemo,validateDepositInput,mutateDepositDemo} from '../pos/cash-deposits.mjs';
import {openDepositDialog,depositPanel} from '../pos/cash-deposits-ui.mjs';
import {makeModal} from './variant-dom.mjs';
import {prepareRetry,setRetryScope,settleRetry,reconcileRetry,pendingRetry} from '../pos/retry.mjs';

const proof='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
function setup(){
 const f=fixture();let s=createStockDemo(f.state);
 s=apply(s,'cashier_shift_open',{id:id(),storeId:f.store,openingCash:100000});
 const order={id:id(),storeId:f.store,date:today(),payment:'Tunai',paid:200000,lines:[{productId:f.water.id,qty:1,price:150000}]};
 s=apply(s,'order_create',order);s=apply(s,'order_create',{...order,id:id(),payment:'QRIS',paid:150000});
 return {...f,s,order,p:{id:id(),storeId:f.store,amount:'50000',bank:'Bank Mandiri',proof}};
}
test('cash balance uses net cash sale, not tendered amount, QRIS, opening float or expenses; deposits do not alter sales or profit',()=>{
 const {s,p,store}=setup(),before=structuredClone(s),next=apply(s,'cash_deposit_save',p);
 assert.equal(depositTotals(s,store).pending,150000);assert.equal(depositTotals(next,store).pending,100000);assert.equal(depositTotals(next,store).deposited,50000);
 assert.equal(next.cashDeposits[0].cashierName,s.me.name);assert.equal(next.cashDeposits[0].date,today());assert.equal(next.cashDepositProofs[p.id],proof);
 assert.deepEqual(next.orders,s.orders);assert.deepEqual(next.money,s.money);assert.deepEqual(s,before);assert.equal(apply(next,'cash_deposit_save',p),next,'same operation does not duplicate');
 assert.throws(()=>apply(next,'cash_deposit_save',{...p,amount:1}),/ID/);
});
test('locked date, amount and proof are validated independently of the rendered form',()=>{
 const {s,p}=setup();for(const amount of [0,-1,'',null,'bad',Infinity,0.5,150001])assert.throws(()=>apply(s,'cash_deposit_save',{...p,amount}),/setoran|saldo|Rupiah/i);
 for(const change of [{date:'2000-01-01'},{cashierName:'Spoofed'},{createdAt:'2000-01-01'}])assert.throws(()=>apply(s,'cash_deposit_save',{...p,...change}),/server/);
 for(const image of ['', 'data:image/svg+xml;base64,AAAA', 'data:image/png;base64,SGVsbG8gd29ybGQh', 'data:image/png;base64,'+'A'.repeat(2796208)])assert.throws(()=>validateDepositInput({...p,proof:image}),/Bukti|bukti/);
 assert.throws(()=>validateDepositInput({...p,bank:'x'}),/bank/);assert.throws(()=>validateDepositInput({...p,bank:'Bank\nX'}),/bank/);
 const copy=structuredClone(s);mutateDepositDemo(copy,'cash_deposit_save',p,'2026-11-05T17:01:00Z');assert.equal(copy.cashDeposits[0].date,'2026-11-06','date assigned in WIB, not UTC');
});
test('finance-only void preserves proof, restores balance, and leaves an audit trail',()=>{
 let {s,p,store}=setup();s=apply(s,'cash_deposit_save',p);const voided={id:id(),depositId:p.id,reason:'Salah nominal'};
 const cashier={...s,me:{id:id(),name:'Kasir',role:'cashier'},access:{sell:true}};assert.throws(()=>apply(cashier,'cash_deposit_void',voided),/pengelola/);
 s=apply(s,'cash_deposit_void',voided);assert.equal(depositTotals(s,store).pending,150000);assert.equal(s.cashDepositProofs[p.id],proof);assert(s.cashDeposits[0].voidedAt);assert.equal(s.cashDeposits[0].voidReason,voided.reason);assert.equal(apply(s,'cash_deposit_void',voided),s);
});
test('refund after deposit shows a negative balance instead of hiding a reconciliation deficit',()=>{
 let {s,p,store,order}=setup();s=apply(s,'cash_deposit_save',{...p,amount:150000});
 const request={id:id(),storeId:store,date:today(),kind:'void',orderId:order.id,reason:'Produk kembali',returnStock:true};
 s=apply(s,'cashier_approval_request',request);s=apply(s,'order_void',{id:id(),storeId:store,date:today(),orderId:order.id,approvalId:request.id,refundConfirmed:true});
 assert.equal(depositTotals(s,store).pending,-150000);assert(depositPanel(s,store).includes('Saldo negatif'));assert.throws(()=>apply(s,'cash_deposit_save',{...p,id:id()}),/melebihi/);
});
test('demo reset discards bank evidence and real balances; reads and totals stay within outlet access',()=>{
 let {s,p,store,otherStore}=setup();s=apply(s,'cash_deposit_save',p);
 const cashier={...s,me:{id:id(),name:'Kasir',role:'cashier'},access:{sell:true},stores:s.stores.filter(x=>x.id===otherStore)};
 assert.throws(()=>readDepositsDemo(cashier,{storeId:store}),/diakses/);assert.throws(()=>depositProofDemo(cashier,p.id),/diakses/);assert.equal(depositTotals(cashier,'').deposited,0);assert.equal(readDepositsDemo(cashier).rows.length,0);
 const demo=createStockDemo(s);assert.deepEqual(demo.cashDepositProofs,{});assert.equal(demo.cashDeposits.length,0);assert.equal(depositTotals(demo,store).pending,0);
 assert.equal(readStockDemo(s,'pos_cash_deposit_proof',{deposit_id:p.id}).proof,proof);
});
test('history date filter does not reset lifetime pending balance and paging uses a lookahead row',()=>{
 let {s,store}=setup();s.cashDeposits=Array.from({length:25},(_,i)=>({id:'d'+String(i).padStart(2,'0'),storeId:store,date:'2026-10-01',createdAt:'2026-10-01T10:00:00Z',amount:1000}));refreshDepositDemo(s);
 const data=readDepositsDemo(s,{storeId:store,from:'2026-10-01',to:'2026-10-31'});assert.equal(data.rows.length,21);assert.equal(data.periodDeposited,25000);assert.equal(depositTotals(s,store,data.summary).pending,125000);
 const more=readDepositsDemo(s,{storeId:store,offset:20});assert.equal(more.rows.length,5);assert(!data.rows.slice(0,20).some(x=>more.rows.some(y=>x.id===y.id)));
 assert.equal(readDepositsDemo(s,{from:'2999-01-01'}).rows.length,0);assert.equal(depositTotals(s,store).deposited,25000);
});
test('summary does not convert missing installation or outlet totals into false zero balances',()=>{
 const {s,store}=setup();assert.equal(depositTotals({...s,cashDepositVersion:0},store),null);assert.equal(depositTotals({...s,cashDepositSummary:[]},store),null);
});
test('uncertain deposit writes keep one operation ID and reconcile with server event ids',()=>{
 let {s,p}=setup();setRetryScope('deposit-test');prepareRetry('cash_deposit_save',p);settleRetry('cash_deposit_save',true);assert(pendingRetry());
 assert.equal(prepareRetry('cash_deposit_save',{...p,id:id()}).id,p.id);s=apply(s,'cash_deposit_save',p);assert(reconcileRetry(s));assert.equal(pendingRetry(),null);
});
test('popup locks server date, requires an image, sends no editable date/identity and submits once',async()=>{
 let {s,store}=setup();const modal=makeModal();let sends=0,rendered=0;const messages=[];
 const ctx={...modal,getState:()=>s,readCashDeposits:async()=>({...readDepositsDemo(s,{storeId:store}),serverDate:'2026-11-06'}),compressDepositProof:async()=>({photo:proof,bytes:72}),mutate:async(a,p)=>{sends++;assert(!('date' in p));assert(!('depositDate' in p));s=apply(s,a,p);},render:()=>rendered++,toast:x=>messages.push(x)};
 const d=await openDepositDialog(ctx,store),form=d.querySelector('form');assert(d.querySelector('[name="depositDate"]').hasAttribute('readonly'));assert.equal(d.querySelector('[name="depositDate"]').value,'2026-11-06');
 d.querySelector('[name="amount"]').value='50000';d.querySelector('[name="bank"]').value='Mandiri';await form.fire('submit');assert.equal(sends,0);assert.match(d.querySelector('#form-error').textContent,/Bukti/);
 const file=d.querySelector('[name="proof"]');file.files=[{type:'image/png',size:72}];await file.fire('change');d.querySelector('[name="depositDate"]').value='2000-01-01';await form.fire('submit');assert.equal(sends,1);assert.equal(rendered,1);assert(d.closed);assert.equal(s.cashDeposits[0].date,today());
});

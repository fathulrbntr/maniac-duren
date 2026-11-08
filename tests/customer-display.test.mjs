import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {crc16,validatePaymentQR,createQRSession,attachQR,activeQR,QR_DISPLAY_TTL} from '../pos/payment-qr.mjs';
import {customerSnapshot,receiverState,visibleSnapshot,DISPLAY_PROTOCOL,publishCustomer,publishCustomerCart,openCustomerDisplay,resetCustomerDisplay} from '../pos/customer-display-channel.mjs';
import {testPaymentQR,tlv} from './payment-qr-fixture.mjs';
import {paymentQRFields,bindPaymentQR} from '../pos/payment-qr-ui.mjs';
import {Node} from './variant-dom.mjs';
import {qrcode} from '../pos/vendor/qrcode.mjs';
import jsQR from '../pos/vendor/jsqr.mjs';

assert.equal(crc16('123456789'),'29B1'); // Independent CRC-16/CCITT-FALSE known vector.
const payload=testPaymentQR();
assert.equal(validatePaymentQR(payload,150000).payload,payload);
assert.throws(()=>validatePaymentQR(payload,149999),/Nominal/);
assert.throws(()=>validatePaymentQR(payload.slice(0,-1)+'X',150000),/CRC/);
assert.throws(()=>validatePaymentQR(testPaymentQR({initiation:'11'}),150000),/statis/);
assert.throws(()=>validatePaymentQR(testPaymentQR({currency:'840'}),150000),/Rupiah/);
assert.throws(()=>validatePaymentQR(testPaymentQR({country:'US'}),150000),/Indonesia/);
assert.throws(()=>validatePaymentQR(testPaymentQR({merchant:''}),150000));
assert.throws(()=>validatePaymentQR(testPaymentQR({extra:tlv('54','1')}),150000),/tag/);
assert.throws(()=>validatePaymentQR(testPaymentQR({extra:tlv('55','01')}),150000),/tambahan/);
assert.throws(()=>validatePaymentQR('https://bank.example/pay',150000));
assert.throws(()=>validatePaymentQR(payload.slice(0,-4),150000));
assert.throws(()=>attachQR(createQRSession({total:150000,transactionId:'a'}),payload,false,1000),/merchant/);
const attached=attachQR(createQRSession({total:150000,transactionId:'a'}),payload,true,1000);
assert(activeQR(attached,'a',150000,1001));
assert.equal(activeQR(attached,'b',150000,1001),null);
assert.equal(activeQR(attached,'a',120000,1001),null);
assert.equal(activeQR(attached,'a',150000,1000+QR_DISPLAY_TTL),null);
assert.throws(()=>attachQR(createQRSession({total:150000,transactionId:'b'}),payload,true,1001),/lain/);
assert.throws(()=>attachQR(attached,payload,true,1000+QR_DISPLAY_TTL),/habis/);

// Render and decode the exact payload with independent QR libraries.
const code=qrcode(0,'M');code.addData(payload,'Byte');code.make();
const n=code.getModuleCount(), scale=5, width=(n+8)*scale, pixels=new Uint8ClampedArray(width*width*4).fill(255);
for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(code.isDark(y,x))for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){
 const p=((y+4)*scale+dy)*width*4+((x+4)*scale+dx)*4;pixels[p]=pixels[p+1]=pixels[p+2]=0;
}
assert.equal(jsQR(pixels,width,width).data,payload);

const state={token:'SECRET',me:{name:'Private'},stores:[{id:'store',name:'Cikarang'}],products:[{id:'p',name:'Monthong',buyPrice:999}]};
const payment={storeId:'store',lines:[{productId:'p',qty:1.5,price:150000,unit:'KG',supplierId:'PRIVATE'}],memberName:'PRIVATE',note:'PRIVATE'};
const snap=customerSnapshot(state,payment,{total:225000},'payment',{...attached.qr,expiresAt:5000});
assert(!/SECRET|PRIVATE|buyPrice|token|member/.test(JSON.stringify(snap)));
assert.equal(customerSnapshot({...state,stockDemo:true},payment,{total:225000},'payment',attached.qr).qr,null);
const msg={protocol:DISPLAY_PROTOCOL,type:'snapshot',seq:1,snapshot:snap}, received=receiverState(null,msg,1000);
assert.equal(receiverState(received,{...msg,seq:0},1001),received);
assert.equal(receiverState(received,{...msg,protocol:'other',seq:2},1001),received);
assert.equal(visibleSnapshot(received,5001).phase,'expired');
assert.equal(visibleSnapshot(received,17000),null);

// Two cashier tabs use different channels; no global storage or auth snapshot.
const old={window:globalThis.window,BroadcastChannel:globalThis.BroadcastChannel};
let opened, lastChannel, pagehide;
class Channel {constructor(name){this.name=name;this.messages=[];lastChannel=this;}postMessage(m){this.messages.push(m);}close(){this.closed=true;}}
globalThis.BroadcastChannel=Channel;globalThis.window={open(url){opened=url;return {closed:false,focus(){}};},addEventListener(event,fn){if(event==='pagehide')pagehide=fn;}};
try{
 openCustomerDisplay();const token1=lastChannel.name;assert.match(opened,/customer-display\.html#[\w-]{36}$/);
 publishCustomerCart({...snap,phase:'cart',qr:null});publishCustomer(snap);publishCustomerCart({...snap,phase:'cart',qr:null});
 assert.equal(lastChannel.messages.at(-1).snapshot.phase,'payment','Unchanged polling cannot erase QR');
 publishCustomerCart({...snap,phase:'cart',qr:null,total:230000});assert.equal(lastChannel.messages.at(-1).snapshot.qr,null);
 resetCustomerDisplay();assert.equal(lastChannel.messages.at(-1).snapshot,null);
 pagehide();openCustomerDisplay();assert.notEqual(lastChannel.name,token1);pagehide();
}finally{Object.assign(globalThis,old);}

const root=new Node();root.innerHTML=paymentQRFields(false);let shown=null;
const ui=bindPaymentQR(root,{total:150000,transactionId:randomUUID(),demo:false,onQR:qr=>shown=qr,onError:()=>{}});
ui.setMethod('QRIS');const f=root.querySelector('[data-qr-payload]'),c=root.querySelector('[data-qr-confirm]');
f.value=testPaymentQR({reference:'UI-002'});await f.fire('input');c.checked=true;await root.querySelector('[data-qr-show]').fire('click');assert(shown?.payload);
f.value=testPaymentQR({amount:'100'});await f.fire('input');assert.equal(shown,null);assert.equal(c.checked,false);
ui.setMethod('Tunai');assert(root.querySelector('[data-edc-qr]').hidden);assert.equal(shown,null);ui.dispose();
console.log('PASS customer display: CRC, TLV, static/amount/currency rejection, exact QR round-trip, merchant confirmation, expiry, reuse prevention, private channels, polling, clear/cancel, privacy and demo isolation.');

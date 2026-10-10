import assert from 'node:assert/strict';
import {barcodeProduct,parseScaleBarcode} from '../pos/barcode-scanner.mjs?v=66';
import {defaultDeviceSettings} from '../pos/device-settings.mjs?v=58';
import {cashierQuote,checkoutTotals,discountAmount,validPayment} from '../pos/cashier.mjs?v=66';
import {sumProducts} from '../pos/decimal-totals.mjs?v=66';

const fruit={id:'monthong',name:'Monthong',barcode:'0001',sku:'MT',itemType:'direct',stockUnit:'kg_butir',priceKg:100000};
const state={products:[fruit]},settings=defaultDeviceSettings();
// Actual printed labels supplied from the CAS scale, including their check digits.
for(const [code,kg,total] of [['2100010030320',3.032,303200],['2100010024145',2.414,241400]]) {
  const result=barcodeProduct(state,code,settings);
  assert.equal(result.product.id,'monthong');
  assert.deepEqual(result.scale,{itemCode:'0001',grams:kg*1000,kg});
  assert.equal(Math.round(result.scale.kg*result.product.priceKg),total);
  const request={storeId:'store',lines:[{productId:fruit.id,lotId:'batch',unit:'KG',kg,pieces:1,price:100000}]};
  assert.equal(cashierQuote(state,request).subtotal,total);
  assert.equal(checkoutTotals(state,request).total,total);
  for(const payment of ['Tunai','QRIS','Transfer'])assert.equal(validPayment({paid:total,payment},total),total);
}
assert.equal(sumProducts([[0.1],[0.2]]),0.3);
assert.equal(sumProducts([[1e-7,10000000]]),1);
assert.equal(sumProducts([[3.032,100000],[2.414,100000],[0.25,5000]]),545850);
assert.equal(discountAmount({active:true,kind:'percent',value:7.5},241400),18105);
assert.equal(sumProducts([[241400],[-18105]]),223295);
assert.throws(()=>barcodeProduct(state,'2100010030321',settings),/digit pemeriksa/);
assert.throws(()=>barcodeProduct(state,'2100010000002',settings),/Berat label/);
// A small local encoder provides boundary fixtures, not the parser's expected result.
function label(item,grams){const body=`21${item}${String(grams).padStart(6,'0')}`;let sum=0;for(let i=0;i<12;i++)sum+=Number(body[i])*(i%2?3:1);return body+(10-sum%10)%10;}
assert.equal(parseScaleBarcode(label('0001',1)).kg,0.001);
assert.equal(parseScaleBarcode(label('0001',30000)).kg,30);
assert.throws(()=>parseScaleBarcode(label('0001',30001)),/maksimal 30 kg/);
assert.throws(()=>barcodeProduct(state,label('0002',3032),settings),/0002 belum terdaftar/);
assert.throws(()=>barcodeProduct({products:[{...fruit,barcode:'1',sku:'0001'}]},'2100010030320',settings),/belum terdaftar/);
assert.throws(()=>barcodeProduct({products:[fruit,{...fruit,id:'second'}]},'2100010030320',settings),/lebih dari satu/);
for(const product of [{...fruit,stockUnit:'pcs'},{...fruit,itemType:'raw'},{...fruit,itemType:'prep'}]) {
  assert.throws(()=>barcodeProduct({products:[product]},'2100010030320',settings),/Kg \+ butir/);
}
for(const priceKg of [0,null,'',Infinity,NaN,-1])assert.throws(()=>barcodeProduct({products:[{...fruit,priceKg}]},'2100010030320',settings),/Harga jual per kg/);
assert.equal(barcodeProduct(state,'MD:2100010030320#\r\n',{...settings,scanner:{...settings.scanner,prefix:'MD:',suffix:'#'}}).scale.kg,3.032);
assert.throws(()=>barcodeProduct(state,'2100010030320',{...settings,scanner:{...settings.scanner,enabled:false}}),/dinonaktifkan/);
assert.throws(()=>barcodeProduct(state,'1400010394004',settings),/Label timbangan lama/);
const ordinary={id:'drink',barcode:'8990000000001',sku:'DRINK',itemType:'direct',stockUnit:'pcs'};
assert.equal(barcodeProduct({products:[ordinary]},ordinary.barcode,settings).product,ordinary);
assert.equal(barcodeProduct({products:[ordinary]},'drink',settings).product,ordinary);
assert.equal(parseScaleBarcode(ordinary.barcode),null);
assert.equal(barcodeProduct(state,'0001',settings).scale,undefined,'A four-digit product scan still opens manual weight entry');
assert.throws(()=>barcodeProduct({products:[{...ordinary,barcode:'2100010030320'}]},'2100010030320',settings),/0001 belum terdaftar/,'Prefix 21 is reserved for scale labels; a full label must never add one ordinary unit');
console.log('PASS CAS barcode: both real labels, exact item mapping, checksum, gram boundaries, duplicate/raw/unpriced rejection, scanner framing, legacy rejection and ordinary barcode/SKU compatibility.');

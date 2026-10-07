import assert from 'node:assert/strict';
import {test} from 'node:test';
import {makeOrder,project} from '../pos/offline.mjs';
import {checkOrder} from '../pos/order-stock.mjs';
const date='2026-10-08';
const fixture=()=>({offlineSyncVersion:21,orderStockVersion:12,access:{sell:true},stores:[{id:'a'},{id:'b'}],products:[{id:'water',itemType:'direct',stockUnit:'pcs',name:'Air'},{id:'fruit',itemType:'direct',stockUnit:'kg_butir',name:'Durian'},{id:'dessert',itemType:'recipe',stockUnit:'porsi',name:'Es'},{id:'prep',itemType:'prep',stockUnit:'g'}],recipes:[{id:'r',outputId:'dessert',version:3,yieldQty:1,ingredients:[{productId:'prep',qty:50}]}],orders:[],lots:[{id:'lot',productId:'fruit',storeId:'a',date,quality:'ready',kg:10,pieces:5}],unitLots:[{id:'w',productId:'water',storeId:'a',date,qty:3},{id:'p',productId:'prep',storeId:'a',date,qty:100},{id:'expired',productId:'prep',storeId:'a',date:'2026-10-01',expiry:'2026-10-07',qty:1000}]});
const payload=()=>({id:'one',storeId:'a',date,payment:'Tunai',paid:150,lines:[{productId:'water',qty:1,price:50},{productId:'dessert',qty:1,price:100}]});
test('pending orders reserve direct stock AND recipe ingredients across repeated sales/reloads',()=>{
 const s=fixture(),row=makeOrder(s,payload(),'device','owner');
 assert.equal(row.envelope.recipeVersions.dessert.version,3);
 const b={snapshot:s,queue:[row]};const local=project(b);
 assert.equal(checkOrder(local,'a',[{productId:'dessert',qty:2}],date).ok,false);
 assert.equal(checkOrder(local,'a',[{productId:'water',qty:3}],date).ok,false);
 assert.equal(checkOrder(local,'a',[{productId:'water',qty:2}],date).ok,true);
 assert.equal(s.orders.length,0);assert.equal(project(b).orders.length,1);
 assert.throws(()=>makeOrder(local,{...payload(),storeId:'b'},'d','o'),/Stok/);
});
test('a response lost after commit never reserves stock twice once server read sees it',()=>{
 const s=fixture(),row=makeOrder(s,payload(),'d','o');s.orders.push({...row.order,localOnly:undefined});
 const view=project({snapshot:s,queue:[row]});assert.equal(view.orders.length,1);
});
test('reject negative/fractional quantities, mismatched fruit lot, invalid payment/access',()=>{
 const s=fixture();
 for(const qty of [-1,0,1.5,Infinity])assert.throws(()=>makeOrder(s,{...payload(),lines:[{productId:'water',qty,price:1}]},'d','o'),/Jumlah/);
 assert.throws(()=>makeOrder(s,{...payload(),paid:1},'d','o'),/Pembayaran/);
 assert.throws(()=>makeOrder(s,{...payload(),payment:'QRIS',paid:151},'d','o'),/Pembayaran/);
 assert.throws(()=>makeOrder({...s,access:{sell:false}},payload(),'d','o'),/akses/);
 assert.throws(()=>makeOrder(s,{...payload(),lines:[{productId:'fruit',lotId:'w',kg:2,pieces:1,unit:'KG',price:1}]},'d','o'),/Asal/);
 const fruit={...payload(),lines:[{productId:'fruit',lotId:'lot',kg:2.25,pieces:1,unit:'KG',price:10}],paid:22.5};
 const row=makeOrder(s,fruit,'d','o');assert.equal(row.order.total,22.5);
 assert.equal(row.order.reserved['lot:lot'].qty,2.25);assert.equal(row.order.reserved['lot:lot'].pieces,1);
});

import {orderTotal} from '../pos/amounts.mjs';
test('decimal quantities match SQL total without rounding weights',()=>{
 assert.equal(orderTotal([{qty:0.1,price:1},{qty:0.2,price:1}]),0.3);
 assert.equal(orderTotal([{qty:1.005,price:1000}]),1005);
 assert.equal(orderTotal([{qty:0.000001,price:49999}]),0.049999);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {id,today} from '../pos/core.mjs';
import {createStockDemo,applyStockDemoAction as apply,readStockDemo as read} from '../pos/stock-demo.mjs';
import {documentPrint,documentsPage} from '../pos/documents-ui.mjs';
import {salesReport,expenseReport,stockReport} from '../pos/reports.mjs';
import {fixture,qty} from './stock-demo-fixture.mjs';
const setup=()=>{const f=fixture();Object.assign(f.state.access,{stock:true,finance:true,reports:true});return {...f,s:apply(createStockDemo(f.state),'cashier_shift_open',{id:id(),storeId:f.store,openingCash:0})};};
const draft=(s,storeId,kind,body)=>{const documentId=id();return {s:apply(s,'document_save',{id:id(),documentId,storeId,kind,body,date:today(),version:0}),documentId};};
const issue=(s,documentId)=>{const d=s.documents.find(x=>x.id===documentId);return apply(s,'document_issue',{id:id(),documentId,storeId:d.store_id,version:d.version});};
const get=(s,documentId)=>read(s,'pos_document_get',{document_id:documentId});

test('examples form a consistent PO → purchase → paid POS → invoice/delivery flow, entirely in demo',()=>{
 const {state,store,fruit}=setup(),before=structuredClone(state),empty=apply(createStockDemo(state),'cashier_shift_open',{id:id(),storeId:store,openingCash:0}),p={id:id(),storeId:store};
 const s=apply(empty,'document_examples',p);assert.deepEqual(state,before);assert.equal(empty.documents.length,0);
 assert.equal(s.documents.length,4);assert.equal(s.orders.length,1);assert(s.documents.every(d=>d.status==='issued'&&d.number.startsWith('DEMO/MD/')));
 const po=s.documents.find(d=>d.kind==='PO'),pur=s.documents.find(d=>d.kind==='PUR'),inv=s.documents.find(d=>d.kind==='INV'),delivery=s.documents.find(d=>d.kind==='DO');
 assert.equal(pur.source_id,po.id);assert.equal(inv.source_id,s.orders[0].id);assert.equal(delivery.source_id,inv.source_id);
 assert.equal(po.total,300000);assert.equal(pur.total,300000);assert.equal(inv.total,150000);assert.equal(delivery.total,0);assert(!('price' in delivery.body.lines[0]));
 assert.equal(s.lots.filter(l=>l.storeId===store&&l.productId===fruit.id).reduce((a,l)=>a+l.kg,0),101);
 const f={from:today(),to:today(),store};assert.equal(salesReport(s,f).total,150000);assert.equal(expenseReport(s,f).purchases,300000);
 const stock=stockReport(s,f).rows.find(x=>x.productId===fruit.id);assert.equal(stock.current,101);assert.equal(stock.closing,101);
 assert.equal(apply(s,'document_examples',p),s);assert.throws(()=>apply(s,'document_examples',{id:id(),storeId:store}),/sudah dibuat/);
 const detail=get(s,inv.id);assert.equal(detail.history.length,2);assert.match(documentPrint(detail),/DEMO · BUKAN DOKUMEN RESMI/);
 detail.body.party='Changed externally';assert.equal(get(s,inv.id).body.party,'Pelanggan Demo');
 const reset=createStockDemo(state);assert.equal(reset.documents.length,0);assert.equal(reset.orders.length,0);assert.deepEqual(state,before);
});

test('draft edit, issue, version guard, cancellation and numbering preserve document history',()=>{
 const {s:empty,store,water}=setup();let {s,documentId}=draft(empty,store,'PO',{supplierId:empty.stockDemo.supplierId,lines:[{productId:water.id,qty:2,price:50000}],shipping:10000});
 assert.equal(qty(s,water,store),100);assert.equal(get(s,documentId).status,'draft');
 s=apply(s,'document_save',{id:id(),documentId,storeId:store,kind:'PO',date:today(),version:1,body:{...get(s,documentId).body,reference:'PO-TEST'}});
 assert.throws(()=>apply(s,'document_issue',{id:id(),documentId,storeId:store,version:1}),/berubah/);
 s=issue(s,documentId);const d=get(s,documentId);assert.equal(d.total,110000);assert.equal(qty(s,water,store),100);
 assert.throws(()=>apply(s,'document_save',{id:id(),documentId,storeId:store,kind:'PO',date:today(),version:d.version,body:d.body}),/tidak dapat diedit/);
 s=apply(s,'document_cancel',{id:id(),documentId,storeId:store,version:d.version,reason:'Latihan batal'});assert.equal(get(s,documentId).status,'cancelled');assert.equal(get(s,documentId).history.length,4);
 const second=draft(s,store,'PO',d.body);s=issue(second.s,second.documentId);assert.notEqual(get(s,second.documentId).number,d.number);
});

test('partial PO purchases allocate shipping, cannot over-receive, and cannot be cancelled after receipt',()=>{
 const {s:empty,store,water}=setup(),body={supplierId:empty.stockDemo.supplierId,lines:[{productId:water.id,qty:3,price:50000}],shipping:0};
 const po=draft(empty,store,'PO',body);let s=issue(po.s,po.documentId);
 const purchase=draft(s,store,'PUR',{...body,sourceType:'po',sourceId:po.documentId,lines:[{productId:water.id,qty:2,price:50000}],shipping:10000});s=issue(purchase.s,purchase.documentId);
 assert.equal(qty(s,water,store),102);const pur=get(s,purchase.documentId),lot=s.unitLots.find(l=>l.id===pur.body.lines[0].receiptId);assert.equal(lot.unitCost,55000);assert.equal(lot.totalCost,110000);
 assert.throws(()=>apply(s,'document_cancel',{id:id(),documentId:po.documentId,storeId:store,version:get(s,po.documentId).version,reason:'Uji batal'}),/dipakai pembelian/);
 assert.throws(()=>apply(s,'document_cancel',{id:id(),documentId:pur.id,storeId:store,version:pur.version,reason:'Uji batal'}),/Stok sudah/);
 const excess=draft(s,store,'PUR',{...body,sourceType:'po',sourceId:po.documentId,lines:[{productId:water.id,qty:2,price:50000}]}),snapshot=structuredClone(excess.s);
 assert.throws(()=>issue(excess.s,excess.documentId),/melebihi sisa/);assert.deepEqual(excess.s,snapshot);
 const receipt=draft(s,store,'PUR',{sourceType:'unit_receipt',sourceId:lot.id});s=issue(receipt.s,receipt.documentId);assert.equal(qty(s,water,store),102,'Receipt-linked document never receives stock twice');assert.equal(get(s,receipt.documentId).total,110000);
});

test('delivery transfer changes only local lots and rejects overselling, duplicate lots and reserved kitchen stock',()=>{
 const {s:empty,store,otherStore,water,fruit,menu}=setup(),lot=empty.unitLots.find(x=>x.productId===water.id&&x.storeId===store);
 const move=draft(empty,store,'DO',{sourceType:'transfer',toStoreId:otherStore,lines:[{lotId:lot.id,qty:3}]});let s=issue(move.s,move.documentId);
 assert.equal(qty(s,water,store),97);assert.equal(qty(s,water,otherStore),103);assert.equal(qty(empty,water,store),100);assert(!('price' in get(s,move.documentId).body.lines[0]));
 for(const body of [{toStoreId:store,lines:[{lotId:lot.id,qty:1}]},{toStoreId:otherStore,lines:[{lotId:lot.id,qty:200}]},{toStoreId:otherStore,lines:[{lotId:lot.id,qty:1},{lotId:lot.id,qty:1}]}]){const bad=draft(s,store,'DO',{sourceType:'transfer',...body}),before=structuredClone(bad.s);assert.throws(()=>issue(bad.s,bad.documentId));assert.deepEqual(bad.s,before);}
 const fruitLot=s.lots.find(x=>x.productId===fruit.id&&x.storeId===store),badFruit=draft(s,store,'DO',{sourceType:'transfer',toStoreId:otherStore,lines:[{lotId:fruitLot.id,qty:100,pieces:1}]});assert.throws(()=>issue(badFruit.s,badFruit.documentId),/Sisa kg/);
 s=apply(s,'order_create',{id:id(),storeId:store,date:today(),payment:'Tunai',paid:150000,lines:[{productId:menu.id,qty:1,price:150000}]});const queued=draft(s,store,'DO',{sourceType:'transfer',toStoreId:otherStore,lines:[{lotId:lot.id,qty:1}]});assert.throws(()=>issue(queued.s,queued.documentId),/antrean kitchen/);
});

test('invoice takes authoritative paid sale totals; duplicate, cancelled or foreign-store sources fail atomically',()=>{
 const {s:empty,store,otherStore,water}=setup(),orderId=id();let s=apply(empty,'order_create',{id:orderId,storeId:store,date:today(),payment:'Tunai',paid:150000,lines:[{productId:water.id,qty:1,price:150000}]});
 const body={sourceType:'order',sourceId:orderId,party:'Pelanggan <script>',lines:[{qty:10,price:1}],shipping:900000};
 const inv=draft(s,store,'INV',body);s=issue(inv.s,inv.documentId);assert.equal(get(s,inv.documentId).total,150000);assert.equal(get(s,inv.documentId).body.shipping,0);assert.equal(qty(s,water,store),99);
 assert.match(documentPrint(get(s,inv.documentId)),/Pelanggan &lt;script&gt;/);assert(!documentPrint(get(s,inv.documentId)).includes('<script>'));
 const duplicate=draft(s,store,'INV',body);assert.throws(()=>issue(duplicate.s,duplicate.documentId),/sudah ada/);
 const foreign=draft(s,otherStore,'INV',body);assert.throws(()=>issue(foreign.s,foreign.documentId),/sudah ada|toko ini/);
 s.orders[0].status='cancelled';assert.equal(get(s,inv.documentId).sourceCancelled,true);
 const cancelled=draft(s,store,'DO',body);assert.throws(()=>issue(cancelled.s,cancelled.documentId),/lunas/);
});

test('letterhead snapshots, permissions, reset, UI enabling and unsupported RPC guard',()=>{
 const {s:empty,store,water}=setup(),h={name:'Nama Demo',address:'Alamat Demo',logo:'',footer:'Latihan'};
 let s=apply(empty,'letterhead_save',{id:id(),storeId:store,version:0,header:h});assert.equal(read(s,'pos_letterhead_get',{store_id:store}).version,1);
 const draftPO=draft(s,store,'PO',{supplierId:s.stockDemo.supplierId,lines:[{productId:water.id,qty:1,price:150000}]});s=issue(draftPO.s,draftPO.documentId);
 s=apply(s,'letterhead_save',{id:id(),storeId:store,version:1,header:{...h,name:'Nama Baru'}});assert.equal(get(s,draftPO.documentId).header.name,'Nama Demo');
 const restricted={...s,access:{stock:true}};assert.throws(()=>get(restricted,draftPO.documentId),/Hak akses/);assert.throws(()=>apply(restricted,'document_examples',{id:id(),storeId:store}),/Hak akses/);
 assert.throws(()=>read(s,'pos_read',{}),/belum tersedia/);assert.throws(()=>read({...s,stockDemo:null},'pos_letterhead_get',{store_id:store}),/belum aktif/);
 assert.match(documentsPage(s,store),/Buat contoh dokumen/);assert(!/data-new-document="PO" disabled/.test(documentsPage(s,store)));assert(!documentsPage({...s,stockDemo:null}).includes('documents-examples'));
});

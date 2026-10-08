import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {emptyState,today} from '../pos/core.mjs';
import {categoryPayload,defaultPosCategories,menuCatalogChanged,inferredCategoryId,posCategoryIds,inPosCategory,savePosCategory} from '../pos/pos-categories.mjs';
import {posCategoryTabs,posCategoryDialog,posCategoryManager,posProductCards} from '../pos/pos-categories-ui.mjs';
import {opsPage,bindOps,clearOrderDraft} from '../pos/operations-ui.mjs';
import {prepareRetry,setRetryScope,settleRetry,reconcileRetry} from '../pos/retry.mjs';
import {Node,makeModal,FormDataAdapter} from './variant-dom.mjs';
const cats=defaultPosCategories(),cat=name=>cats.find(c=>c.name===name).id;
const products=[
 {id:id(),name:'Durian Musang King Fresh',sku:'MK-F',itemType:'direct',stockUnit:'kg_butir',category:'Buah',priceKg:50000,pricePiece:100000},
 {id:id(),name:'Durpas Musang King Fresh 500 gr',sku:'DP-MK-F500',itemType:'finished',stockUnit:'pcs',category:'Olahan Duren',salePrice:75000},
 {id:id(),name:'Coral Musang King Fresh',sku:'CORAL-MK',itemType:'finished',stockUnit:'kg',category:'Olahan Duren',salePrice:null},
 {id:id(),name:'Crystaline',sku:'WATER',barcode:'899001',itemType:'direct',stockUnit:'pcs',category:'Minuman',salePrice:5000},
 {id:id(),name:'Es cendol',sku:'CENDOL',itemType:'recipe',stockUnit:'porsi',category:'Dessert',salePrice:25000},
 {id:id(),name:'Gula',sku:'BB-GULA',itemType:'raw',stockUnit:'g',category:null},
 {id:id(),name:'Cendol prepare',sku:'PREP-CENDOL',itemType:'prep',stockUnit:'g',category:null},
 {id:id(),name:'Paket bebas',sku:'PAKET',itemType:'direct',stockUnit:'pcs',category:'Olahan Duren',salePrice:15000},
];products.forEach(p=>p.posCategoryId=inferredCategoryId(p));
let state={...emptyState(),products,posCategories:cats,stores:[{id:'A',name:'Outlet A'},{id:'B',name:'Outlet B'}],orders:[],opsVersion:19,orderStockVersion:11,orderRoutingVersion:13,access:{master:true,sell:true},unitLots:[{id:'water-lot',productId:products[3].id,storeId:'A',qty:8,date:today()}]};
const m=makeModal(),posted=[],ctx={modal:m.modal,mutate:async(action,p)=>{assert.equal(action,'pos_category_save');const next=structuredClone(state);savePosCategory(next,p);state=next;posted.push(p);return true;},render(){},toast(){},refresh(){},getState:()=>state};
const tabs=posCategoryTabs(state);for(const name of ['Buah','Durpas','Coral','Makan','Minuman','Dessert'])assert(tabs.includes(name));assert(tabs.includes('Belum dikategorikan'));
assert.throws(()=>categoryPayload(state,{id:id(),categoryId:id(),name:'  BUAH ',productIds:[]}),/sudah digunakan/);
assert.throws(()=>categoryPayload(state,{id:id(),categoryId:id(),name:'Raw salah',productIds:[products[5].id]}),/produk jual/);
const unchanged=structuredClone(state.products);
const onlyStock=structuredClone(state);onlyStock.unitLots[0].qty=7;assert.equal(menuCatalogChanged(state,onlyStock),false);const changedCatalog=structuredClone(state);changedCatalog.products[0].name+=' Premium';assert.equal(menuCatalogChanged(state,changedCatalog),true);
posCategoryDialog({...ctx,state});const d=m.latest;
assert.equal(d.querySelector('[data-category-product-step]').hidden,true);d.querySelector('[data-category-name]').value='Paket Pilihan';await d.querySelector('[data-category-next]').fire('click');
assert.equal(d.querySelector('[data-category-product-step]').hidden,false);assert.equal(d.querySelectorAll('[data-category-product]').length,6);assert(!d.querySelector('[data-category-picker]').textContent.includes('BB-GULA'));assert.match(d.querySelector('[data-category-picker]').textContent,/Harga belum diisi/);
d.querySelector('[data-category-search]').value='899001';await d.querySelector('[data-category-search]').fire('input');assert.equal(d.querySelectorAll('[data-category-product]').length,1);await d.querySelector('[data-category-select-visible]').fire('click');
d.querySelector('[data-category-search]').value='Durpas';await d.querySelector('[data-category-search]').fire('input');await d.querySelector('[data-category-select-visible]').fire('click');assert.match(d.querySelector('[data-category-selection-count]').textContent,/2 pilihan\/SKU dipilih/);
await d.querySelector('[data-category-back]').fire('click');await d.querySelector('[data-category-next]').fire('click');assert.match(d.querySelector('[data-category-selection-count]').textContent,/2 pilihan\/SKU dipilih/);
assert.equal(posted.length,0,'Selecting alone must not write');
await d.querySelector('form').fire('submit');assert.equal(posted.length,1);assert.equal(posted[0].productIds.length,2);assert.equal(posted[0].mode,'add');
const target=posted[0].categoryId,product=sku=>state.products.find(p=>p.sku===sku);
assert.deepEqual(posCategoryIds(state,product('WATER')),[cat('Minuman'),target].sort());
assert.deepEqual(posCategoryIds(state,product('DP-MK-F500')),[cat('Durpas'),target].sort());
assert.equal(d.querySelector('[data-category-members-step]').hidden,false);assert.equal(d.querySelectorAll('[data-category-member]').length,2,'Show added products in category immediately');
assert.deepEqual(state.products.map(({posCategoryIds,...p})=>p),unchanged);
posCategoryManager({...ctx,state});const manager=m.latest;assert.equal(manager.querySelectorAll('[data-edit-pos-category]').length,7);await manager.querySelector(`[data-edit-pos-category="${target}"]`).fire('click');const edit=m.latest;
assert.equal(edit.querySelector('[data-category-members-step]').hidden,false);assert.equal(edit.querySelector('[data-category-product-step]').hidden,true);
await edit.querySelector('[data-category-add]').fire('click');
assert.equal(edit.querySelectorAll('[data-category-product]').length,4);assert(!edit.querySelector(`[data-category-product="${products[3].id}"]`),'Existing members excluded from add picker');
edit.querySelector('[data-category-search]').value='MK-F';await edit.querySelector('[data-category-search]').fire('input');await edit.querySelector('[data-category-select-visible]').fire('click');await edit.querySelector('form').fire('submit');
assert.equal(edit.querySelectorAll('[data-category-member]').length,3);assert(inPosCategory(state,product('MK-F'),cat('Buah')),'Fruit still in Buah');assert(inPosCategory(state,product('WATER'),target),'Add does not replace existing members');
const toRemove=edit.querySelector(`[data-category-member="${products[3].id}"]`);toRemove.checked=true;await edit.querySelector('[data-category-members]').listeners.change[0]({target:toRemove});await edit.querySelector('[data-category-remove]').fire('click');
assert.equal(posted.at(-1).mode,'remove');assert.deepEqual(posCategoryIds(state,product('WATER')),[cat('Minuman')]);assert(inPosCategory(state,product('DP-MK-F500'),target));assert.equal(edit.querySelectorAll('[data-category-member]').length,2);
await edit.querySelector('[data-category-rename]').fire('click');edit.querySelector('[data-category-name]').value='Pilihan pelanggan';await edit.querySelector('form').fire('submit');assert.equal(posted.at(-1).mode,'rename');assert.equal(edit.querySelector('[data-category-title]').textContent,'Pilihan pelanggan');
// No duplicate links, including independent operations and exact network retry.
const addWater=categoryPayload(state,{id:id(),categoryId:cat('Makan'),name:'Makan',productIds:[products[3].id]});savePosCategory(state,addWater);savePosCategory(state,addWater);
assert.deepEqual(posCategoryIds(state,product('WATER')),[cat('Minuman'),cat('Makan')].sort());assert.throws(()=>savePosCategory(state,{...addWater,name:'Different'}),/ID pengiriman/);
// Cashiers may filter, but management controls need Master permission.
assert(!opsPage('orders',{...state,access:{sell:true,master:false}},'A').includes('id="add-pos-category"'));
const stockCards=posProductCards(state,'A');const parsed=new Node();parsed.innerHTML=stockCards;assert.equal(parsed.querySelector(`[data-order-add="${products[3].id}"]`).disabled,false);assert.equal(parsed.querySelector(`[data-order-add="${products[4].id}"]`).disabled,true,'Recipe without prep remains unavailable');assert(!stockCards.includes('BB-GULA'));
const other=new Node();other.innerHTML=posProductCards(state,'B');assert.equal(other.querySelector(`[data-order-add="${products[3].id}"]`).disabled,true,'Category cannot bypass outlet stock');
// Real POS handlers: filters, search, cart, and automatic category/catalog refresh.
const originals={document:globalThis.document,FormData:globalThis.FormData};
const elementDescriptor=Object.getOwnPropertyDescriptor(Node.prototype,'elements');
Object.defineProperty(Node.prototype,'elements',{configurable:true,get(){return new Proxy({namedItem:name=>this.querySelector(`[name="${name}"]`)},{get:(target,k)=>k in target?target[k]:this.querySelector(`[name="${k}"]`)});}});
Node.prototype.replaceWith=function(other){const i=this.parent.children.indexOf(this);other.parent=this.parent;this.parent.children[i]=other;};
const root=new Node();
globalThis.document={querySelector:q=>root.querySelector(q),querySelectorAll:q=>root.querySelectorAll(q),createElement:tag=>{const n=new Node(tag);if(tag==='template')n.content=n;return n;}};globalThis.FormData=FormDataAdapter;
const render=()=>{root.innerHTML=opsPage('orders',state,'A');bindOps('orders',state,'A',{...ctx,render});};
try{
 clearOrderDraft();render();
 const categories=root.querySelector('.order-categories');const choose=async key=>{const target=root.querySelector(`[data-order-category="${key}"]`);await categories.listeners.click[0]({target});};
 await choose(cat('Buah'));assert.equal(root.querySelectorAll('[data-order-add]').filter(p=>!p.hidden).length,1);
 root.querySelector('#order-search').value='899001';await root.querySelector('#order-search').fire('input');assert.equal(root.querySelector('#order-no-results').hidden,false);
 await choose('all');assert.equal(root.querySelectorAll('[data-order-add]').filter(p=>!p.hidden).length,1);
 root.querySelector('#order-search').value='';await root.querySelector('#order-search').fire('input');
 const waterCard=root.querySelector(`[data-order-add="${products[3].id}"]`);
 assert.equal(root.querySelectorAll(`[data-order-add="${products[3].id}"]`).length,1,'All displays master product once');
 await choose(cat('Minuman'));assert.equal(waterCard.hidden,false);await root.querySelector('#order-products').listeners.click[0]({target:waterCard});
 await choose(cat('Makan'));assert.equal(waterCard.hidden,false);await root.querySelector('#order-products').listeners.click[0]({target:waterCard});
 assert.equal(root.querySelectorAll('[data-remove-line]').length,1,'Same product from two categories shares a cart line');assert.match(root.querySelector('#order-draft').textContent,/Crystaline/);assert.match(root.querySelector('#order-draft').textContent,/2 pcs/);
 root.querySelector('#order-note').value='Meja 03';
 const fresh=structuredClone(state);fresh.products.find(p=>p.id===products[3].id).posCategoryIds.push(cat('Dessert'));fresh.posCategories.find(c=>c.id===cat('Makan')).name='Makan & Paket';
 await root.querySelector('#order-products').listeners['stock-refresh'][0]({detail:fresh});state=fresh;
 assert(root.querySelector('.order-categories').textContent.includes('Makan & Paket'));assert(root.querySelector(`[data-order-add="${products[3].id}"]`).dataset.categories.includes(cat('Dessert')));assert.equal(root.querySelector('#order-note').value,'Meja 03');assert.match(root.querySelector('#order-draft').textContent,/Crystaline/);
 await root.querySelector('#add-pos-category').fire('click');const modal=m.latest;modal.querySelector('[data-category-name]').value='Lain-lain';await modal.querySelector('[data-category-next]').fire('click');await modal.querySelector('form').fire('submit');assert.equal(root.querySelector('#order-note').value,'Meja 03');assert.match(root.querySelector('#order-draft').textContent,/Crystaline/);
}finally{clearOrderDraft();Object.assign(globalThis,originals);Object.defineProperty(Node.prototype,'elements',elementDescriptor);}
globalThis.sessionStorage={getItem(){return null},setItem(){},removeItem(){}};setRetryScope('category-test');prepareRetry('pos_category_save',posted[0]);settleRetry('pos_category_save',true);assert.equal(prepareRetry('pos_category_save',{...posted[0],id:id()}).id,posted[0].id);assert(reconcileRetry({events:[{id:posted[0].id}]}));
console.log('PASS POS category membership UI: manage/add/select flow, existing member exclusion, additive selection across categories, scoped removal, rename, search/multi-select, price and permission rules, unchanged master/stock, one card and cart line per product, local filters/poll refresh, cart/note preservation, retry recovery.');

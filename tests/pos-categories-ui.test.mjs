import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {emptyState,today} from '../pos/core.mjs';
import {categoryPayload,defaultPosCategories,menuCatalogChanged,inferredCategoryId,posCategoryId,savePosCategory} from '../pos/pos-categories.mjs';
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
const m=makeModal(),posted=[],ctx={modal:m.modal,mutate:async(action,p)=>{assert.equal(action,'pos_category_save');const next=structuredClone(state);savePosCategory(next,p);state=next;posted.push(p);return true;},render(){},toast(){},refresh(){}};
const tabs=posCategoryTabs(state);for(const name of ['Buah','Durpas','Coral','Makan','Minuman','Dessert'])assert(tabs.includes(name));assert(tabs.includes('Belum dikategorikan'));
assert.throws(()=>categoryPayload(state,{id:id(),categoryId:id(),name:'  BUAH ',productIds:[]}),/sudah digunakan/);
assert.throws(()=>categoryPayload(state,{id:id(),categoryId:id(),name:'Raw salah',productIds:[products[5].id]}),/produk jual/);
const unchanged=structuredClone(state.products);
const onlyStock=structuredClone(state);onlyStock.unitLots[0].qty=7;assert.equal(menuCatalogChanged(state,onlyStock),false);const changedCatalog=structuredClone(state);changedCatalog.products[0].name+=' Premium';assert.equal(menuCatalogChanged(state,changedCatalog),true);
posCategoryDialog({...ctx,state});const d=m.latest;
assert.equal(d.querySelector('[data-category-product-step]').hidden,true);d.querySelector('[data-category-name]').value='Paket Pilihan';await d.querySelector('[data-category-next]').fire('click');
assert.equal(d.querySelector('[data-category-product-step]').hidden,false);assert.equal(d.querySelectorAll('[data-category-product]').length,6);assert(!d.querySelector('[data-category-picker]').textContent.includes('BB-GULA'));assert.match(d.querySelector('[data-category-picker]').textContent,/Harga belum diisi/);
d.querySelector('[data-category-search]').value='899001';await d.querySelector('[data-category-search]').fire('input');assert.equal(d.querySelectorAll('[data-category-product]').length,1);await d.querySelector('[data-category-select-visible]').fire('click');
d.querySelector('[data-category-search]').value='Durpas';await d.querySelector('[data-category-search]').fire('input');await d.querySelector('[data-category-select-visible]').fire('click');assert.match(d.querySelector('[data-category-selection-count]').textContent,/2 produk dipilih/);
await d.querySelector('[data-category-back]').fire('click');await d.querySelector('[data-category-next]').fire('click');assert.match(d.querySelector('[data-category-selection-count]').textContent,/2 produk dipilih/);
await d.querySelector('form').fire('submit');assert.equal(posted.length,1);assert.equal(posted[0].productIds.length,2);assert.equal(state.products.find(p=>p.sku==='WATER').posCategoryId,posted[0].categoryId);
assert.deepEqual(state.products.map(({posCategoryId,...p})=>p),unchanged.map(({posCategoryId,...p})=>p));
posCategoryManager({...ctx,state});const manager=m.latest;assert.equal(manager.querySelectorAll('[data-edit-pos-category]').length,7);await manager.querySelector(`[data-edit-pos-category="${posted[0].categoryId}"]`).fire('click');const edit=m.latest;assert.equal(edit.querySelector('[data-category-product-step]').hidden,false);assert.match(edit.querySelector('[data-category-selection-count]').textContent,/2 produk dipilih/);await edit.querySelector('[data-category-clear]').fire('click');await edit.querySelector('form').fire('submit');assert.equal(posted[1].productIds.length,0);assert.equal(state.products.find(p=>p.sku==='WATER').posCategoryId,null);
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
 const waterCard=root.querySelector(`[data-order-add="${products[3].id}"]`);await root.querySelector('#order-products').listeners.click[0]({target:waterCard});assert.match(root.querySelector('#order-draft').textContent,/Crystaline/);
 root.querySelector('#order-note').value='Meja 03';
 const fresh=structuredClone(state);fresh.products.find(p=>p.id===products[3].id).posCategoryId=cat('Makan');fresh.posCategories.find(c=>c.id===cat('Makan')).name='Makan & Paket';
 await root.querySelector('#order-products').listeners['stock-refresh'][0]({detail:fresh});state=fresh;
 assert(root.querySelector('.order-categories').textContent.includes('Makan & Paket'));assert.equal(root.querySelector(`[data-order-add="${products[3].id}"]`).dataset.category,cat('Makan'));assert.equal(root.querySelector('#order-note').value,'Meja 03');assert.match(root.querySelector('#order-draft').textContent,/Crystaline/);
 await root.querySelector('#add-pos-category').fire('click');const modal=m.latest;modal.querySelector('[data-category-name]').value='Lain-lain';await modal.querySelector('[data-category-next]').fire('click');await modal.querySelector('form').fire('submit');assert.equal(root.querySelector('#order-note').value,'Meja 03');assert.match(root.querySelector('#order-draft').textContent,/Crystaline/);
}finally{clearOrderDraft();Object.assign(globalThis,originals);Object.defineProperty(Node.prototype,'elements',elementDescriptor);}
globalThis.sessionStorage={getItem(){return null},setItem(){},removeItem(){}};setRetryScope('category-test');prepareRetry('pos_category_save',posted[0]);settleRetry('pos_category_save',true);assert.equal(prepareRetry('pos_category_save',{...posted[0],id:id()}).id,posted[0].id);assert(reconcileRetry({events:[{id:posted[0].id}]}));
console.log('PASS POS categories UI: six filters, unassigned fallback, create/select/search/multi-select/edit/remove flow, master permission, raw/prep exclusion, same product IDs, stock/recipe/outlet checks, real POS filtering and category refresh, cart/note preservation and retry recovery.');

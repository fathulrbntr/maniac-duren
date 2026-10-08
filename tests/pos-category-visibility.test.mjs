import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {emptyState,today} from '../pos/core.mjs';
import {defaultPosCategories,savePosCategory,posProductStatus} from '../pos/pos-categories.mjs';
import {opsPage,bindOps,clearOrderDraft} from '../pos/operations-ui.mjs';
import {Node,makeModal,FormDataAdapter} from './variant-dom.mjs';

const cats=defaultPosCategories(),durpas=cats.find(c=>c.name==='Durpas').id,group=id();
const product500={id:id(),name:'Durpas Bawor 500 gr',sku:'MD-BAWOR-DP500',itemType:'finished',stockUnit:'pcs',category:'Olahan Duren',salePrice:null,posCategoryIds:[],variant:'500 gr',durianOutput:'durpas500'};
const product1kg={id:id(),name:'Durpas Bawor 1 kg',sku:'MD-BAWOR-DP1KG',itemType:'finished',stockUnit:'pcs',category:'Olahan Duren',salePrice:0,posCategoryIds:[],variant:'1 kg',durianOutput:'durpas1000'};
for(const p of [product500,product1kg])Object.assign(p,{variantGroupId:group,variantGroupName:'Durpas Bawor',variantOptions:[{name:'Ukuran',value:p.variant}]});
const raw={id:id(),name:'Gula',sku:'GULA',itemType:'raw',stockUnit:'g',posCategoryIds:[]},prep={id:id(),name:'Cendol prepare',sku:'CENDOL-PREP',itemType:'prep',stockUnit:'g',posCategoryIds:[]};
let state={...emptyState(),products:[product500,product1kg,raw,prep],posCategories:cats,posCategoryMembershipVersion:2,stores:[{id:'A',name:'Outlet A'}],orders:[],opsVersion:19,orderStockVersion:11,orderRoutingVersion:13,access:{master:true,sell:true},unitLots:[{id:id(),productId:product500.id,storeId:'A',qty:3,date:today()}]};
const before=structuredClone(state.products),stockBefore=structuredClone(state.unitLots),m=makeModal(),posted=[];
const root=new Node(),originals={document:globalThis.document,FormData:globalThis.FormData,fetch:globalThis.fetch};
const elementDescriptor=Object.getOwnPropertyDescriptor(Node.prototype,'elements'),replace=Node.prototype.replaceWith;
Object.defineProperty(Node.prototype,'elements',{configurable:true,get(){return new Proxy({namedItem:name=>this.querySelector(`[name="${name}"]`)},{get:(target,k)=>k in target?target[k]:this.querySelector(`[name="${k}"]`)});}});
Node.prototype.replaceWith=function(other){const i=this.parent.children.indexOf(this);other.parent=this.parent;this.parent.children[i]=other;};
globalThis.document={querySelector:q=>root.querySelector(q),querySelectorAll:q=>root.querySelectorAll(q),createElement:tag=>{const n=new Node(tag);if(tag==='template')n.content=n;return n;}};
globalThis.FormData=FormDataAdapter;
globalThis.fetch=()=>{throw Error('Category/filter/render must use loaded data');};
const ctx={modal:m.modal,getState:()=>state,mutate:async(action,payload)=>{assert.equal(action,'pos_category_save');const next=structuredClone(state);savePosCategory(next,payload);state=JSON.parse(JSON.stringify(next));posted.push(payload);return true;},render,toast(){},refresh(){}};
function render(){root.innerHTML=opsPage('orders',state,'A');bindOps('orders',state,'A',ctx);}
const card=p=>root.querySelector(p.variantGroupId?`[data-order-group="${p.variantGroupId}"]`:`[data-order-add="${p.id}"]`);
const choose=async key=>root.querySelector('.order-categories').listeners.click[0]({target:root.querySelector(`[data-order-category="${key}"]`)});
const poll=async next=>{await root.querySelector('#order-products').listeners['stock-refresh'][0]({detail:next});state=next;};
const click=async p=>{await root.querySelector('#order-products').listeners.click[0]({target:card(p)});return m.latest;};
const pick=async(d,p)=>{const target=d.querySelector(`[data-sale-variant="${p.id}"]`);target.checked=true;await d.querySelector('[data-sale-variants]').listeners.change[0]({target});};
try{
 clearOrderDraft();render();
 await root.querySelector('#manage-pos-categories').fire('click');
 await m.latest.querySelector(`[data-edit-pos-category="${durpas}"]`).fire('click');
 const d=m.latest;assert.equal(d.querySelectorAll('[data-category-member]').length,0);
 await d.querySelector('[data-category-add]').fire('click');d.querySelector('[data-category-search]').value='Durpas Bawor';await d.querySelector('[data-category-search]').fire('input');
 assert.equal(d.querySelectorAll('[data-category-product]').length,2);
 const groupChoice=d.querySelector('[data-category-group]');assert(groupChoice);groupChoice.checked=true;await d.querySelector('[data-category-picker]').listeners.change[0]({target:groupChoice});assert(d.querySelectorAll('[data-category-product]').every(n=>n.checked));
 const child=d.querySelector(`[data-category-product="${product500.id}"]`);child.checked=false;await d.querySelector('[data-category-picker]').listeners.change[0]({target:child});assert.equal(groupChoice.indeterminate,true);assert.equal(groupChoice.checked,false);
 groupChoice.checked=true;await d.querySelector('[data-category-picker]').listeners.change[0]({target:groupChoice});assert.equal(groupChoice.indeterminate,false);await d.querySelector('form').fire('submit');
 assert.equal(posted.length,1);assert.equal(d.querySelectorAll('[data-category-member]').length,2);
 d.close();await choose(durpas);
 assert.equal(root.querySelector(`[data-order-category="${durpas}"]`).querySelector('small').textContent,'1','Two variants use one product card');
 assert(card(product500));assert.equal(card(product500),card(product1kg));assert.equal(card(product500).hidden,false);assert.equal(card(product500).disabled,false,'Can inspect unpriced variants');assert.match(card(product500).textContent,/Harga.*belum diisi/);
 assert.equal(root.querySelector('#order-no-results').hidden,true);assert.equal(card(raw),null);assert.equal(card(prep),null);
 let popup=await click(product500);assert.equal(popup.querySelectorAll('[data-sale-variant]').length,2);assert(popup.querySelectorAll('[data-sale-variant]').every(n=>n.disabled));
 await popup.querySelector('form').fire('submit');assert.equal(root.querySelectorAll('[data-remove-line]').length,0,'Stock without a price cannot enter cart');
 assert.deepEqual(state.products.map(({posCategoryIds,...p})=>p),before.map(({posCategoryIds,...p})=>p));assert.deepEqual(state.unitLots,stockBefore);
 let next=structuredClone(state);next.products[0].salePrice=75000;next.products[1].salePrice=140000;await poll(next);
 assert.equal(card(product500).hidden,false);assert.equal(popup.querySelector(`[data-sale-variant="${product500.id}"]`).disabled,false);assert.equal(popup.querySelector(`[data-sale-variant="${product1kg.id}"]`).disabled,true);assert.match(popup.textContent,/Stok kurang/);
 await pick(popup,product500);await popup.querySelector('form').fire('submit');assert.equal(root.querySelectorAll('[data-remove-line]').length,1);
 popup=await click(product500);next=structuredClone(state);next.products[0].salePrice=0;await poll(next);assert(popup.querySelector(`[data-sale-variant="${product500.id}"]`).disabled);
 next=structuredClone(state);next.unitLots[0].qty=4;await poll(next);assert(popup.querySelector(`[data-sale-variant="${product500.id}"]`).disabled);assert.equal(card(product500).hidden,false);
 await popup.querySelector('form').fire('submit');assert.match(root.querySelector('#order-draft').textContent,/1 pcs/);
 // Price rejection covers finished, direct and made-to-order products.
 for(const itemType of ['finished','direct','recipe'])for(const salePrice of [null,undefined,0,-1,'',NaN,Infinity,'invalid']){
  const p={...product500,itemType,salePrice};assert.deepEqual(posProductStatus(state,'A',p,[],today()),{ok:false,reason:'Harga jual belum diisi'});
 }
 console.log('PASS Durpas Bawor visibility: actual manage/select/save/filter flow, group card and both popup variants shown without prices, stock-zero variant shown, invalid-price and polling guards, original master/stock preserved, raw/prep excluded, no extra reads.');
}finally{
 clearOrderDraft();Object.assign(globalThis,originals);Object.defineProperty(Node.prototype,'elements',elementDescriptor);if(replace)Node.prototype.replaceWith=replace;else delete Node.prototype.replaceWith;
}

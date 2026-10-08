import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {emptyState,today} from '../pos/core.mjs';
import {saveProduct} from '../pos/catalog.mjs';
import {inventoryPanel,bindInventory} from '../pos/inventory-ui.mjs';
import {productDialog} from '../pos/product-dialog.mjs';
import {defaultPosCategories,savePosCategory,posCategoryName,posCategories} from '../pos/pos-categories.mjs';
import {posMenuEntries} from '../pos/pos-menu.mjs';
import {Node,makeModal,FormDataAdapter} from './variant-dom.mjs';
const cats=defaultPosCategories(),cat=name=>cats.find(c=>c.name===name).id,groupId=id();
const make=(name,extra={})=>({id:id(),name,sku:id(),itemType:'finished',stockUnit:'pcs',category:'Olahan Duren',salePrice:50000,buyPrice:30000,posCategoryIds:[],...extra});
const a=make('Durpas Bawor 500 gr',{variantGroupId:groupId,variantGroupName:'Durpas Bawor',variant:'500 gr',variantOptions:[{name:'Ukuran',value:'500 gr'}],posCategoryIds:[cat('Durpas')]}),b=make('Durpas Bawor 1 kg',{variantGroupId:groupId,variantGroupName:'Durpas Bawor',variant:'1 kg',variantOptions:[{name:'Ukuran',value:'1 kg'}],posCategoryIds:[cat('Dessert')]});
const fruit=make('Durian Bawor',{itemType:'direct',stockUnit:'kg_butir',category:'Buah',priceKg:60000,pricePiece:120000,posCategoryIds:[cat('Buah')]}),water=make('Air mineral',{itemType:'direct',category:'Minuman'}),raw=make('Gula',{itemType:'raw',stockUnit:'g',category:null,salePrice:null}),prep=make('Jelly',{itemType:'prep',stockUnit:'g',category:null,salePrice:null}),menu=make('Es durian',{itemType:'recipe',stockUnit:'porsi',category:'Dessert',posCategoryIds:[cat('Dessert')]});
let state={...emptyState(),products:[a,b,fruit,water,raw,prep,menu],posCategories:cats,posCategoryMembershipVersion:2,stores:[{id:'A',name:'Outlet A'},{id:'B',name:'Outlet B'}],access:{master:true,sell:true},unitLots:[{id:id(),productId:a.id,storeId:'A',qty:3,date:today()},{id:id(),productId:b.id,storeId:'A',qty:8,date:today()}]};
const before=structuredClone(state),root=new Node(),modal=makeModal(),posted=[];let mode='products',filter={},fail=false;
const original={document:globalThis.document,FormData:globalThis.FormData,fetch:globalThis.fetch},elements=Object.getOwnPropertyDescriptor(Node.prototype,'elements');
Object.defineProperty(Node.prototype,'elements',{configurable:true,get(){return new Proxy({namedItem:name=>this.querySelector(`[name="${name}"]`)},{get:(target,key)=>key in target?target[key]:this.querySelector(`[name="${key}"]`)});}});
globalThis.document={querySelector:selector=>selector==='.inventory-workspace'?root:root.querySelector(selector)};
globalThis.FormData=FormDataAdapter;
globalThis.fetch=()=>{throw Error('Category navigation/filtering must not read the server');};
const ctx={state,getState:()=>state,modal:modal.modal,render,toast(){},mutate:async(action,payload)=>{
 posted.push({action,payload:structuredClone(payload)});if(fail)return false;
 const next=structuredClone(state);if(action==='pos_category_save')savePosCategory(next,payload);else if(action==='product_save')saveProduct(next,payload,payload.editing);else throw Error(action);
 state=next;return true;
}};
function render(){root.innerHTML=inventoryPanel(state,'A',filter,mode);bindInventory(state,'A',filter,mode,ctx);}
const view=(next,f={})=>{mode=next;filter=f;render();};
const click=selector=>root.listeners.click.at(-1)({target:root.querySelector(selector),preventDefault(){}});
const parse=(next,f={})=>{const n=new Node();n.innerHTML=inventoryPanel(state,'A',f,next);return n;};
const leafIds=n=>n.querySelectorAll('[data-edit-product],[data-stock-detail]').map(x=>x.dataset.editProduct||x.dataset.stockDetail).sort();
const checkAllViews=(category,expected)=>{
 for(const next of ['products','stock'])assert.deepEqual(leafIds(parse(next,{category})),expected.filter(pid=>next==='products'||pid!==menu.id).sort());
 assert.deepEqual(posMenuEntries(state,category).flatMap(e=>e.products.map(p=>p.id)).sort(),expected.sort());
};
const checkPicker=()=>{
 for(const next of ['products','stock']) {
  const select=parse(next).querySelector('[name="category"]');
  assert.deepEqual(select.options.map(o=>[o.value,o.textContent]),[['','Semua'],...posCategories(state).map(c=>[c.id,c.name])]);
 }
};
const openCategory=async(category)=>{await click('[data-inventory-category-manage]');await modal.latest.querySelector(`[data-edit-pos-category="${category}"]`).fire('click');return modal.latest;};
const pick=async(d,p)=>{const input=d.querySelector(`[data-category-product="${p.id}"]`);assert(input);input.checked=true;await d.querySelector('[data-category-picker]').listeners.change[0]({target:input});};
try {
 view('products');checkPicker();checkAllViews(cat('Durpas'),[a.id]);checkAllViews(cat('Dessert'),[b.id,menu.id]);
 const select=root.querySelector('[name="category"]');select.value=cat('Durpas');await select.fire('change');assert.deepEqual(leafIds(root),[a.id]);assert.match(root.textContent,/1 dari 2 varian/);
 assert.equal(posCategoryName(state,water),'Semua','Explicit empty membership cannot fall back to Minuman');
 assert(leafIds(parse('products')).includes(raw.id));assert(leafIds(parse('stock')).includes(prep.id));
 assert(!posMenuEntries(state).flatMap(e=>e.products).some(p=>[raw.id,prep.id].includes(p.id)));
 // Real stock entry point uses the exact POS add/select/save flow.
 view('stock');let d=await openCategory(cat('Durpas'));await d.querySelector('[data-category-add]').fire('click');
 assert(!d.querySelector(`[data-category-product="${raw.id}"]`));assert(!d.querySelector(`[data-category-product="${prep.id}"]`));
 await pick(d,b);fail=true;await d.querySelector('form').fire('submit');checkAllViews(cat('Durpas'),[a.id]);assert.match(d.querySelector('#form-error').textContent,/belum terkonfirmasi/);
 fail=false;await d.querySelector('form').fire('submit');assert.deepEqual(posted[0],posted[1]);checkAllViews(cat('Durpas'),[a.id,b.id]);checkAllViews(cat('Dessert'),[b.id,menu.id]);
 // Removing membership preserves other categories and the product itself.
 const remove=d.querySelector(`[data-category-member="${b.id}"]`);remove.checked=true;await d.querySelector('[data-category-members]').listeners.change[0]({target:remove});await d.querySelector('[data-category-remove]').fire('click');
 checkAllViews(cat('Durpas'),[a.id]);checkAllViews(cat('Dessert'),[b.id,menu.id]);
 // Create/rename/delete from Master Barang propagates to all three views.
 view('products');await click('[data-inventory-category-add]');d=modal.latest;
 d.querySelector('[data-category-name]').value='Paket Hemat';await d.querySelector('[data-category-next]').fire('click');await pick(d,a);await pick(d,water);await d.querySelector('form').fire('submit');
 const custom=state.posCategories.find(c=>c.name==='Paket Hemat');checkPicker();checkAllViews(custom.id,[a.id,water.id]);
 await d.querySelector('[data-category-rename]').fire('click');d.querySelector('[data-category-name]').value='Paket Keluarga';await d.querySelector('form').fire('submit');checkPicker();assert(parse('stock').textContent.includes('Paket Keluarga'));assert.equal(state.products.find(p=>p.id===a.id).category,'Olahan Duren');
 // Form shows the shared memberships, preserving only the internal legacy value in its payload.
 productDialog({...ctx,state,store:'A',product:state.products.find(p=>p.id===a.id)});let form=modal.latest;
 assert.equal(form.querySelector('select[name="category"]'),null);
 assert.equal(form.querySelector('[data-product-category-names]').textContent,'Durpas · Paket Keluarga');
 form.querySelector('[name="salePrice"]').value='65000';await form.querySelector('form').fire('submit');assert.equal(posted.at(-1).payload.category,'Olahan Duren');assert.equal(posted.at(-1).payload.posCategoryIds,undefined);assert.deepEqual(state.products.find(p=>p.id===a.id).posCategoryIds,[cat('Durpas'),custom.id].sort());
 view('stock',{category:custom.id});await click('[data-inventory-category-manage]');d=modal.latest;await d.querySelector(`[data-delete-pos-category="${custom.id}"]`).fire('click');await d.querySelector('form').fire('submit');
 assert.equal(root.querySelector('[name="category"]').value,'','Deleted active category falls back to Semua');assert(leafIds(root).includes(water.id));checkPicker();checkAllViews(cat('Durpas'),[a.id]);
 // Saving a fresh product puts it in Semua; its category is assigned later using the same flow.
 productDialog({...ctx,state,store:'A'});form=modal.latest;
 assert.equal(form.querySelector('[data-product-category-names]').textContent,'Semua');
 form.querySelector('[name="name"]').value='Minuman baru';form.querySelector('[name="sku"]').value='DRINK-NEW';form.querySelector('[name="stockUnit"]').value='pcs';await form.querySelector('[name="stockUnit"]').fire('change');form.querySelector('[name="salePrice"]').value='10000';await form.querySelector('form').fire('submit');
 const fresh=state.products.find(p=>p.sku==='DRINK-NEW');assert(fresh);assert.equal(fresh.category,'Minuman');assert.equal(posCategoryName(state,fresh),'Semua');assert(posMenuEntries(state).some(e=>e.products.some(p=>p.id===fresh.id)));assert(!posMenuEntries(state,cat('Minuman')).some(e=>e.products.some(p=>p.id===fresh.id)));
 // Store/category operations cannot change quantities, recipes or operational classification.
 assert.deepEqual(state.unitLots,before.unitLots);assert.deepEqual(state.recipes,before.recipes);assert.deepEqual(state.products.slice(0,7).map(p=>[p.id,p.category,p.stockUnit]),before.products.map(p=>[p.id,p.category,p.stockUnit]));
 state.access.master=false;assert(!parse('stock').querySelector('[data-inventory-category-manage]'));assert(!parse('products').querySelector('[data-inventory-category-add]'));
 console.log('PASS shared categories: actual Master/Stock entry points, same POS memberships and pickers, multi-category add/remove/create/rename/delete, failed save/retry, group filtering, deleted filter fallback, product form/new product flow, preserved stock/recipes and no additional reads.');
}finally{Object.assign(globalThis,original);Object.defineProperty(Node.prototype,'elements',elements);}

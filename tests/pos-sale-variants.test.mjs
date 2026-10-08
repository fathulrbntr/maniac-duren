import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {emptyState,today} from '../pos/core.mjs';
import {defaultPosCategories,menuCatalogChanged,savePosCategory} from '../pos/pos-categories.mjs';
import {posMenuEntries,posVariantDialog,menuKey} from '../pos/pos-menu.mjs';
import {opsPage,bindOps,clearOrderDraft} from '../pos/operations-ui.mjs';
import {Node,makeModal,FormDataAdapter} from './variant-dom.mjs';
const cats=defaultPosCategories(),cat=name=>cats.find(c=>c.name===name).id,promo=id();cats.push({id:promo,name:'Paket Hemat',sortOrder:6,version:1});
const family=(name,type,unit,category,options)=>{const group=id();return options.map(([label,price])=>({id:id(),name:name+' '+label,sku:id(),itemType:type,stockUnit:unit,salePrice:unit==='kg_butir'?null:price,priceKg:unit==='kg_butir'?price:null,pricePiece:unit==='kg_butir'?price*2:null,variantGroupId:group,variantGroupName:name,variant:label,variantOptions:[{name:'Pilihan',value:label}],posCategoryIds:[category]}));};
const bawor=family('Durpas Bawor','finished','pcs',cat('Durpas'),[['500 gr',40000],['1 kg',75000]]);bawor[0].posCategoryIds.push(promo);
const fruit=family('Durian Musang King','direct','kg_butir',cat('Buah'),[['Fresh',60000],['Nitrogen',90000]]);
const recipes=family('Es Durian','recipe','porsi',cat('Dessert'),[['Small',20000],['Large',30000]]);
const coral=family('Coral Black Thorn','finished','kg',cat('Coral'),[['Fresh',null],['Nitrogen',0]]);
const one=family('Pancake','direct','pcs',cat('Makan'),[['Original',15000]]);
const water={id:id(),name:'Crystaline',sku:'WATER',itemType:'direct',stockUnit:'pcs',salePrice:5000,posCategoryIds:[cat('Minuman')]};
const prep={id:id(),name:'Cendol prepare',itemType:'prep',stockUnit:'g'},raw={id:id(),name:'Gula',itemType:'raw',stockUnit:'g'};
const lot=(p,qty)=>({id:id(),productId:p.id,storeId:'A',qty,date:today()});
let state={...emptyState(),products:[...bawor,...fruit,...recipes,...coral,...one,water,prep,raw],posCategories:cats,posCategoryMembershipVersion:2,stores:[{id:'A',name:'Outlet A'}],suppliers:[{id:'supplier',name:'Supplier A'}],orders:[],cashierVersion:54,discounts:[],opsVersion:19,orderStockVersion:11,orderRoutingVersion:13,access:{master:true,sell:true},unitLots:[lot(bawor[0],2),lot(bawor[1],1),lot(one[0],3),lot(water,5),lot(prep,30)],lots:[{id:id(),productId:fruit[0].id,storeId:'A',supplierId:'supplier',kg:10,pieces:4,quality:'ready',date:today()}],recipes:recipes.map((p,i)=>({id:id(),outputId:p.id,yieldQty:1,ingredients:[{productId:prep.id,qty:i?40:20}]}))};
assert.equal(posMenuEntries(state).length,6);assert.equal(posMenuEntries(state,cat('Durpas')).length,1);assert.equal(posMenuEntries(state,promo)[0].products.length,1);
const renamed=structuredClone(state);renamed.products[0].variantGroupName='New label';assert(menuCatalogChanged(state,renamed));
const newOptions=structuredClone(state);newOptions.products[0].variantOptions[0].value='New option';assert(menuCatalogChanged(state,newOptions));
const stocked=structuredClone(state);stocked.unitLots[0].qty++;assert(!menuCatalogChanged(state,stocked));
const m=makeModal(),root=new Node(),posted=[];
const originals={document:globalThis.document,FormData:globalThis.FormData,fetch:globalThis.fetch,requestAnimationFrame:globalThis.requestAnimationFrame};
const descriptors={elements:Object.getOwnPropertyDescriptor(Node.prototype,'elements'),replaceWith:Node.prototype.replaceWith,dispatchEvent:Node.prototype.dispatchEvent,scrollIntoView:Node.prototype.scrollIntoView};
Object.defineProperty(Node.prototype,'elements',{configurable:true,get(){return new Proxy({namedItem:name=>this.querySelector(`[name="${name}"]`)},{get:(target,k)=>k in target?target[k]:this.querySelector(`[name="${k}"]`)});}});
Node.prototype.replaceWith=function(other){const i=this.parent.children.indexOf(this);other.parent=this.parent;this.parent.children[i]=other;};
Node.prototype.dispatchEvent=function(ev){this['on'+ev.type]?.(ev);for(const fn of this.listeners[ev.type]||[])fn(ev);};Node.prototype.scrollIntoView=function(){};
globalThis.requestAnimationFrame=fn=>fn();globalThis.FormData=FormDataAdapter;
globalThis.document={querySelector:q=>root.querySelector(q),querySelectorAll:q=>root.querySelectorAll(q),createElement:tag=>{const n=new Node(tag);if(tag==='template')n.content=n;return n;}};
globalThis.fetch=()=>{throw Error('Opening/filtering variants must not fetch');};
const ctx={modal:m.modal,getState:()=>state,mutate:async(action,payload)=>{posted.push({action,payload});if(action==='pos_category_save'){const next=structuredClone(state);savePosCategory(next,payload);state=next;}return true;},render,refresh(){},toast(){}};
function render(){root.innerHTML=opsPage('orders',state,'A');bindOps('orders',state,'A',ctx);}
const choose=async category=>root.querySelector('.order-categories').listeners.click[0]({target:root.querySelector(`[data-order-category="${category}"]`)});
const card=p=>root.querySelector(`[data-menu-key="${menuKey(p)}"]`);
const open=async p=>{await root.querySelector('#order-products').listeners.click[0]({target:card(p)});return m.latest;};
const pick=async(d,p)=>{const input=d.querySelector(`[data-sale-variant="${p.id}"]`);assert(input&&!input.disabled,'Choice must be available');input.checked=true;await d.querySelector('[data-sale-variants]').listeners.change[0]({target:input});};
const submit=d=>d.querySelector('form').fire('submit');
const poll=async next=>{await root.querySelector('#order-products').listeners['stock-refresh'][0]({detail:next});state=next;};
const cartSize=()=>root.querySelectorAll('[data-remove-line]').length;
try{
 clearOrderDraft();render();assert.equal(root.querySelectorAll('[data-menu-key]').length,6);assert.equal(root.querySelectorAll('[data-order-group]').length,5);
 assert.equal(root.querySelector(`[data-order-category="${cat('Durpas')}"]`).querySelector('small').textContent,'1','Count products, not variants');
 await choose(cat('Durpas'));assert.equal(root.querySelectorAll('[data-menu-key]').filter(c=>!c.hidden).length,1);
 let d=await open(bawor[0]);assert.equal(d.querySelectorAll('[data-sale-variant]').length,2);assert(d.querySelector('[type="submit"]').disabled);assert.equal(cartSize(),0);assert.equal(posted.length,0);
 await submit(d);assert.equal(cartSize(),0,'No default variant');await pick(d,bawor[1]);assert.equal(cartSize(),0,'Selection needs confirmation');assert.match(d.querySelector('[data-variant-confirmation]').textContent,/1 kg/);
 await submit(d);await submit(d);assert.equal(cartSize(),1,'Double confirmation cannot add twice');assert.match(root.querySelector('#order-draft').textContent,/Durpas Bawor 1 kg/);assert.match(root.querySelector('#order-draft').textContent,/75.000/);
 d=await open(bawor[0]);assert(d.querySelector(`[data-sale-variant="${bawor[1].id}"]`).disabled,'Cart reserves final 1 kg pack');await pick(d,bawor[0]);d.close();assert.equal(cartSize(),1,'Cancel does not add');
 await choose(promo);d=await open(bawor[0]);assert.equal(d.querySelectorAll('[data-sale-variant]').length,1,'Only included variants in this category');await pick(d,bawor[0]);await submit(d);assert.equal(cartSize(),2);assert.match(root.querySelector('#order-draft').textContent,/500 gr/);
 d=await open(bawor[0]);await pick(d,bawor[0]);let next=structuredClone(state);next.products.find(p=>p.id===bawor[0].id).posCategoryIds=[cat('Durpas')];await poll(next);assert(d.querySelector('[type="submit"]').disabled);await submit(d);assert.equal(cartSize(),2);assert.equal(card(bawor[0]).hidden,true);d.close();
 await choose(cat('Durpas'));d=await open(bawor[0]);await pick(d,bawor[0]);next=structuredClone(state);next.products.find(p=>p.id===bawor[0].id).salePrice=45000;await poll(next);assert(d.querySelector('[type="submit"]').disabled);assert.match(d.querySelector('#form-error').textContent,/berubah/);await submit(d);assert.equal(cartSize(),2);
 await pick(d,bawor[0]);next=structuredClone(state);next.unitLots.find(l=>l.productId===bawor[0].id).qty=1;await poll(next);assert(d.querySelector(`[data-sale-variant="${bawor[0].id}"]`).disabled);assert(d.querySelector('[type="submit"]').disabled);d.close();
 await choose(cat('Coral'));assert.equal(card(coral[0]).disabled,true,'An entirely unavailable group cannot open');const closedModal=m.latest;await open(coral[0]);assert.equal(m.latest,closedModal);assert.match(card(coral[0]).textContent,/Harga.*belum diisi/);assert.equal(cartSize(),2);
 await choose(cat('Dessert'));d=await open(recipes[0]);assert(!d.querySelector(`[data-sale-variant="${recipes[0].id}"]`).disabled);assert(d.querySelector(`[data-sale-variant="${recipes[1].id}"]`).disabled,'Recipe variant checks its own ingredients');await pick(d,recipes[0]);await submit(d);assert.equal(cartSize(),3);
 await choose(cat('Buah'));d=await open(fruit[0]);assert(d.querySelector(`[data-sale-variant="${fruit[1].id}"]`).disabled);await pick(d,fruit[0]);await submit(d);assert.equal(root.querySelector('#order-line').hidden,false);assert.equal(root.querySelector('#order-line').elements.productId.value,fruit[0].id);assert.equal(cartSize(),3,'Fruit still needs actual weight/pieces');
 await choose(cat('Makan'));d=await open(one[0]);assert.equal(d.querySelectorAll('[data-sale-variant]').length,1,'Single remaining variant still confirms');d.close();
 await choose(cat('Minuman'));await open(water);assert.equal(cartSize(),4,'Nonvariant direct product keeps existing flow');
 // Restore the fixture master price before paying an older draft; the new checkout rejects stale prices.
 const aligned=structuredClone(state);aligned.products.find(p=>p.id===bawor[0].id).salePrice=40000;await poll(aligned);
 // Actual payment payload retains leaf IDs/prices; group IDs never enter stock logic.
 root.querySelector('#order-note').value='Meja 07';await root.querySelector('#save-order').fire('click');const payment=m.latest;await submit(payment);assert.equal(posted.length,0);await submit(m.latest);
 assert.equal(posted.length,1);assert.equal(posted[0].action,'order_create');assert.equal(posted[0].payload.note,'Meja 07');assert.deepEqual(posted[0].payload.lines.map(l=>l.productId),[bawor[1].id,bawor[0].id,recipes[0].id,water.id]);assert.deepEqual(posted[0].payload.lines.map(l=>l.price),[75000,40000,20000,5000]);assert.equal(cartSize(),0);
 // Removing the whole group from a category keeps it in All and keeps master rows.
 await choose(cat('Durpas'));root.querySelector('#order-search').value='Bawor';await root.querySelector('#order-search').fire('input');
 const before=structuredClone(state.products);await root.querySelector('#manage-pos-categories').fire('click');await m.latest.querySelector(`[data-edit-pos-category="${cat('Durpas')}"]`).fire('click');
 const management=m.latest,removeGroup=management.querySelector('[data-category-group]');removeGroup.checked=true;await management.querySelector('[data-category-members]').listeners.change[0]({target:removeGroup});await management.querySelector('[data-category-remove]').fire('click');
 assert.equal(posted.at(-1).action,'pos_category_save');assert.equal(posted.at(-1).payload.mode,'remove');assert.deepEqual(new Set(posted.at(-1).payload.productIds),new Set(bawor.map(p=>p.id)));management.close();
 assert.equal(posMenuEntries(state,cat('Durpas')).length,0);assert(posMenuEntries(state).some(x=>x.key===menuKey(bawor[0])));assert.deepEqual(state.products.map(({posCategoryIds,...p})=>p),before.map(({posCategoryIds,...p})=>p));
 assert.equal(root.querySelector(`[data-order-category="${cat('Durpas')}"]`).attrs['aria-pressed'],'true','Category save must preserve active filter');
 assert.equal(root.querySelector('#order-search').value,'Bawor');assert.equal(card(bawor[0]).hidden,true,'Removed group must disappear from active category immediately');
 await choose('all');assert.equal(card(bawor[0]).hidden,false,'Removed group remains available in Semua');
 assert(!root.querySelector('[data-order-category="unassigned"]'),'No separate uncategorized tab');
 // Deleting the selected category falls back to Semua and retains local inputs.
 await choose(cat('Durpas'));root.querySelector('#order-note').value='Meja 09';
 const searchBeforeDelete=root.querySelector('#order-search'),noteBeforeDelete=root.querySelector('#order-note');
 await root.querySelector('#manage-pos-categories').fire('click');const deleteManager=m.latest;
 await deleteManager.querySelector(`[data-delete-pos-category="${cat('Durpas')}"]`).fire('click');await submit(deleteManager);
 assert(!root.querySelector(`[data-order-category="${cat('Durpas')}"]`));
 assert.equal(root.querySelector('[data-order-category="all"]').attrs['aria-pressed'],'true');assert.equal(card(bawor[0]).hidden,false);
 assert.equal(root.querySelector('#order-search'),searchBeforeDelete);assert.equal(root.querySelector('#order-note'),noteBeforeDelete);assert.equal(noteBeforeDelete.value,'Meja 09');deleteManager.close();
 // State may change between polling and submit; confirmation revalidates it.
 // Legacy products with one free-text variant also require confirmation, without guessing groups by name.
 const legacy={...water,id:id(),name:'Pancake coklat',variant:'Coklat'};const legacyState={...state,products:[legacy],unitLots:[lot(legacy,2)]};
 assert(posMenuEntries(legacyState)[0].hasVariants);let legacyConfirmed=0;
 const legacyPopup=posVariantDialog({key:menuKey(legacy),getState:()=>legacyState,getDraft:()=>[],store:'A',modal:m.modal,onConfirm:p=>{assert.equal(p.id,legacy.id);legacyConfirmed++;return true;}});assert.equal(legacyConfirmed,0);await pick(legacyPopup.dialog,legacy);await submit(legacyPopup.dialog);assert.equal(legacyConfirmed,1);
 const isolated=structuredClone(state);let latest=isolated,confirmed=0;
 const popup=posVariantDialog({key:menuKey(one[0]),getState:()=>latest,getDraft:()=>[],store:'A',modal:m.modal,onConfirm:()=>{confirmed++;return true;}});await pick(popup.dialog,one[0]);latest=structuredClone(latest);latest.products.find(p=>p.id===one[0].id).salePrice=18000;await submit(popup.dialog);assert.equal(confirmed,0);assert(popup.dialog.querySelector('[type="submit"]').disabled);
 console.log('PASS POS sale variants: one card/group, category-specific variants, confirm/cancel/double submit, exact cart/payment leaf IDs/prices, stock/price refresh and stale guard, recipe ingredients, fruit weighing, unavailable groups, single-variant groups, nonvariant sale, scoped removal, no extra reads.');
}finally{
 clearOrderDraft();Object.assign(globalThis,originals);Object.defineProperty(Node.prototype,'elements',descriptors.elements);for(const key of ['replaceWith','dispatchEvent','scrollIntoView']){if(descriptors[key])Node.prototype[key]=descriptors[key];else delete Node.prototype[key];}
}

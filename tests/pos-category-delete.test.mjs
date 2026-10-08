import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {emptyState} from '../pos/core.mjs';
import {categoryPayload,defaultPosCategories,savePosCategory,posCategoryIds} from '../pos/pos-categories.mjs';
import {posCategoryManager,posCategoryTabs} from '../pos/pos-categories-ui.mjs';
import {posMenuEntries} from '../pos/pos-menu.mjs';
import {makeModal} from './variant-dom.mjs';
const cats=defaultPosCategories(),target=cats.find(c=>c.name==='Durpas'),other=cats.find(c=>c.name==='Dessert');
const group=id(),products=['500 gr','1 kg'].map((variant,i)=>({id:id(),name:'Durpas Bawor '+variant,sku:'BW-'+i,itemType:'finished',stockUnit:'pcs',salePrice:40000+i*30000,variantGroupId:group,variantGroupName:'Durpas Bawor',variant,posCategoryIds:[target.id,...(i?[other.id]:[])]}));
let state={...emptyState(),products,posCategories:cats,posCategoryMembershipVersion:2,unitLots:products.map(p=>({id:id(),productId:p.id,storeId:'A',qty:8,date:'2026-10-08'}))};
const initial=structuredClone(state),m=makeModal(),posted=[],renders=[],messages=[];let fail=false,hold;
const ctx={state,getState:()=>state,modal:m.modal,render:s=>renders.push(s),toast:s=>messages.push(s),mutate:async(action,payload,options)=>{
 assert.equal(action,'pos_category_save');assert.equal(options.throwOnError,true);posted.push(structuredClone(payload));
 if(fail)throw Error('Hak akses tidak mencukupi');if(hold)await hold;
 const next=structuredClone(state);savePosCategory(next,payload);state=next;return true;
}};
posCategoryManager(ctx);const d=m.latest;
assert.equal(d.querySelectorAll('[data-delete-pos-category]').length,6);assert(!d.querySelector('[data-delete-pos-category="all"]'));assert(d.querySelector('[type="submit"]').hidden);
const open=category=>d.querySelector(`[data-delete-pos-category="${category.id}"]`).fire('click');
await open(target);assert(!d.querySelector('[data-category-delete-step]').hidden);assert.match(d.querySelector('[data-category-delete-title]').textContent,/Durpas/);assert.match(d.querySelector('[data-category-delete-count]').textContent,/1 produk · 2 pilihan/);assert.match(d.querySelector('[data-category-delete-step]').textContent,/semua outlet/);assert.equal(posted.length,0);
await d.querySelector('[data-category-delete-back]').fire('click');assert(d.querySelector('[data-category-delete-step]').hidden);assert.equal(posted.length,0,'Back must not delete');
await open(target);fail=true;await d.querySelector('form').fire('submit');assert.equal(d.querySelector('#form-error').textContent,'Hak akses tidak mencukupi');assert.deepEqual(state,initial);assert.equal(renders.length,0);assert(!d.querySelector('[type="submit"]').disabled);
fail=false;let release;hold=new Promise(resolve=>release=resolve);const submit=d.querySelector('form').fire('submit');await d.querySelector('form').fire('submit');assert.equal(posted.length,2,'Double confirmation sends once');release();await submit;hold=null;
assert.deepEqual(posted[0],posted[1],'Retry retains exact operation');assert.equal(posted[1].mode,'delete');assert.deepEqual(posted[1].productIds,[]);assert.equal(renders.length,1);assert.match(messages[0],/Produk tetap tersedia di Semua/);
assert(!d.querySelector(`[data-delete-pos-category="${target.id}"]`));assert(d.querySelector('[data-category-delete-step]').hidden);assert.equal(posMenuEntries(state).length,1);assert.equal(posMenuEntries(state)[0].products.length,2);
assert.deepEqual(posCategoryIds(state,state.products[0]),[]);assert.deepEqual(posCategoryIds(state,state.products[1]),[other.id]);assert.equal(posMenuEntries(state,other.id)[0].products.length,1);assert(!posCategoryTabs(state).includes(`data-order-category="${target.id}"`));
assert.deepEqual(state.products.map(({posCategoryIds,...p})=>p),initial.products.map(({posCategoryIds,...p})=>p));assert.deepEqual(state.unitLots,initial.unitLots);
savePosCategory(state,posted[1]);assert.equal(state.events.length,1,'Exact replay after deletion is safe');assert.throws(()=>savePosCategory(state,{...posted[1],name:'Other'}),/ID pengiriman/);
assert.throws(()=>categoryPayload(state,{id:id(),categoryId:'all',name:'Semua',mode:'delete'}),/nama kategori lain/);
assert.throws(()=>categoryPayload(state,{id:id(),categoryId:other.id,name:other.name,mode:'delete',productIds:[products[0].id]}),/tidak menerima pilihan/);
// Versions protect against deleting a category whose membership changed elsewhere.
const stale=categoryPayload(state,{id:id(),categoryId:other.id,name:other.name,mode:'delete'});
savePosCategory(state,categoryPayload(state,{id:id(),categoryId:other.id,name:other.name,mode:'add',productIds:[products[0].id]}));assert.throws(()=>savePosCategory(state,stale),/Kategori sudah berubah/);
// Delete all remaining categories, including empty defaults. Never recreate defaults.
d.close();posCategoryManager(ctx);const final=m.latest;
for(const category of [...state.posCategories]){await final.querySelector(`[data-delete-pos-category="${category.id}"]`).fire('click');await final.querySelector('form').fire('submit');}
assert.deepEqual(state.posCategories,[]);assert.equal(final.querySelectorAll('[data-delete-pos-category]').length,0);assert.match(final.textContent,/Seluruh produk jual tetap tampil di Semua/);assert.equal(posCategoryTabs(state).match(/data-order-category=/g).length,1);assert(state.products.every(p=>p.posCategoryIds.length===0));assert.equal(posMenuEntries(state)[0].products.length,2);assert.deepEqual(state.unitLots,initial.unitLots);
assert(final.querySelector('[data-create-pos-category]'),'Can add a new category after deleting all');
console.log('PASS category delete UI/model: row action, confirmation/back, empty/filled/global categories, exact retry/double submit, visible failure, version guard, no Semua deletion, no default resurrection, master/stock/other memberships preserved.');

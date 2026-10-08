import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {emptyState} from '../pos/core.mjs';
import {defaultPosCategories,posCategoryIds,savePosCategory} from '../pos/pos-categories.mjs';
import {posMenuEntries,menuKey} from '../pos/pos-menu.mjs';
import {posCategoryTabs,posCategoryDialog,posProductCards} from '../pos/pos-categories-ui.mjs';
import {Node,makeModal} from './variant-dom.mjs';
const categories=defaultPosCategories(),durpas=categories.find(c=>c.name==='Durpas').id,other=categories.find(c=>c.name==='Dessert').id;
const groups=Array.from({length:29},()=>id());
const products=Array.from({length:57},(_,i)=>{
 const groupName=`Durpas Kelompok ${String(Math.floor(i/2)+1).padStart(2,'0')}`,variant=i%2?'1 kg':'500 gr';
 return {id:id(),name:`${groupName} ${variant}`,sku:`DP-${i}`,itemType:'finished',stockUnit:'pcs',salePrice:i%2?75000:40000,variantGroupId:groups[Math.floor(i/2)],variantGroupName:groupName,variant,variantOptions:[{name:'Ukuran',value:variant}],posCategoryIds:[durpas,other],cost:25000};
});
const loose={id:id(),name:'Air mineral',sku:'WATER',itemType:'direct',stockUnit:'pcs',salePrice:5000,posCategoryIds:[]};
const raw={id:id(),name:'Gula',itemType:'raw',stockUnit:'g',posCategoryIds:[]};
const prep={id:id(),name:'Cendol',itemType:'prep',stockUnit:'g',posCategoryIds:[]};
let state={...emptyState(),products:[...products,loose,raw,prep],posCategories:categories,posCategoryMembershipVersion:2,unitLots:products.map(p=>({id:id(),productId:p.id,storeId:'A',qty:8,date:'2026-10-08'}))};
const before=structuredClone(state),allKeys=posMenuEntries(state).map(e=>e.key),m=makeModal(),posted=[];let failing=false;
const ctx={state,getState:()=>state,modal:m.modal,render(){},toast(){},mutate:async(action,payload)=>{
 assert.equal(action,'pos_category_save');posted.push(structuredClone(payload));if(failing)return false;
 const next=structuredClone(state);savePosCategory(next,payload);state=next;return true;
}};
const bulk=async(d,kind,checked)=>{const input=d.querySelector(`[data-category-select-all-${kind}]`);input.checked=checked;await input.fire('change');};
const leaf=async(d,kind,p,checked)=>{const input=d.querySelector(`[data-category-${kind}="${p.id}"]`);assert(input);input.checked=checked;await d.querySelector(kind==='member'?'[data-category-members]':'[data-category-picker]').listeners.change[0]({target:input});};
const search=async(d,q)=>{d.querySelector('[data-category-search]').value=q;await d.querySelector('[data-category-search]').fire('input');};
const submit=d=>d.querySelector('form').fire('submit');
posCategoryDialog({...ctx,categoryId:durpas});const d=m.latest;
assert.equal(d.querySelectorAll('[data-category-member]').length,57);
assert(!d.querySelector('[data-category-select-all-members]').checked);assert(d.querySelector('[data-category-remove]').disabled);
await bulk(d,'members',true);assert(d.querySelectorAll('[data-category-member]').every(n=>n.checked));assert(d.querySelectorAll('[data-category-group]').every(n=>n.checked));assert.match(d.querySelector('[data-category-remove-count]').textContent,/57 pilihan/);
await bulk(d,'members',false);assert(d.querySelectorAll('[data-category-member]').every(n=>!n.checked));assert(d.querySelector('[data-category-remove]').disabled);
await bulk(d,'members',true);await leaf(d,'member',products[0],false);
assert(d.querySelector('[data-category-select-all-members]').indeterminate);assert(d.querySelector(`[data-category-group="${menuKey(products[0])}"]`).indeterminate);
await leaf(d,'member',products[1],false);assert(!d.querySelector(`[data-category-group="${menuKey(products[0])}"]`).checked);assert.match(d.querySelector('[data-category-remove-count]').textContent,/55 pilihan/);assert.equal(posted.length,0);
await d.querySelector('[data-category-remove]').fire('click');assert.equal(posted.length,1);assert.equal(posted[0].mode,'remove');assert.deepEqual(new Set(posted[0].productIds),new Set(products.slice(2).map(p=>p.id)));
assert.equal(d.querySelectorAll('[data-category-member]').length,2);assert.equal(posMenuEntries(state,durpas).length,1);assert.equal(posMenuEntries(state,durpas)[0].products.length,2);assert.deepEqual(posMenuEntries(state).map(e=>e.key),allKeys);
assert(state.products.slice(0,57).every(p=>posCategoryIds(state,p).includes(other)));assert.equal(posMenuEntries(state,other).flatMap(e=>e.products).length,57);
// Failed save leaves the selection and memberships intact and can be retried.
await bulk(d,'members',true);failing=true;await d.querySelector('[data-category-remove]').fire('click');assert.match(d.querySelector('#form-error').textContent,/belum terkonfirmasi/);assert(d.querySelectorAll('[data-category-member]').every(n=>n.checked));assert.equal(posMenuEntries(state,durpas).length,1);
failing=false;await d.querySelector('[data-category-remove]').fire('click');assert.deepEqual(posted[1],posted[2]);assert.equal(d.querySelectorAll('[data-category-member]').length,0);assert(d.querySelector('[data-category-select-all-members]').disabled);assert(!d.querySelector('[data-category-select-all-members]').checked);assert(d.querySelector('[data-category-remove]').disabled);
assert.equal(posMenuEntries(state,durpas).length,0);assert.deepEqual(posMenuEntries(state).map(e=>e.key),allKeys);
// All includes every saleable SKU, including unassigned ones; raw/prep stay out.
const visible=posMenuEntries(state).flatMap(e=>e.products);assert.equal(visible.length,58);assert(visible.some(p=>p.id===loose.id));assert(!visible.some(p=>[raw.id,prep.id].includes(p.id)));
const tabs=posCategoryTabs(state);assert(!tabs.includes('unassigned'));assert(!tabs.includes('Belum dikategorikan'));
const cards=new Node();cards.innerHTML=posProductCards(state,'A');assert.equal(cards.querySelector(`[data-order-add="${loose.id}"]`).querySelector('.order-product-category').textContent,'Semua');
assert.deepEqual(state.products.map(({posCategoryIds,...p})=>p),before.products.map(({posCategoryIds,...p})=>p));assert.deepEqual(state.unitLots,before.unitLots);
// Add-side bulk selection follows the visible search, while keeping other selections.
await d.querySelector('[data-category-add]').fire('click');assert.equal(d.querySelectorAll('[data-category-product]').length,58);assert(!d.querySelector('[data-category-select-all-products]').checked);
await search(d,'Kelompok 01');await bulk(d,'products',true);assert.match(d.querySelector('[data-category-selection-count]').textContent,/2 pilihan/);assert.match(d.querySelector('[data-category-select-all-products-label]').textContent,/hasil pencarian \(2\)/);
await leaf(d,'product',products[0],false);assert(d.querySelector('[data-category-select-all-products]').indeterminate);await leaf(d,'product',products[0],true);assert(d.querySelector('[data-category-select-all-products]').checked);
await search(d,'500 gr');assert(d.querySelector('[data-category-select-all-products]').indeterminate);await bulk(d,'products',true);assert.match(d.querySelector('[data-category-selection-count]').textContent,/30 pilihan/);
await bulk(d,'products',false);assert.match(d.querySelector('[data-category-selection-count]').textContent,/1 pilihan/);
await search(d,'does not exist');assert(d.querySelector('[data-category-select-all-products]').disabled);assert(!d.querySelector('[data-category-select-all-products]').checked);assert.match(d.querySelector('[data-category-selection-count]').textContent,/1 pilihan/);
await search(d,'');assert(d.querySelector('[data-category-select-all-products]').indeterminate);await d.querySelector('[data-category-clear]').fire('click');assert(!d.querySelector('[data-category-select-all-products]').indeterminate);assert.equal(d.querySelectorAll('[data-category-product]').filter(n=>n.checked).length,0);
await bulk(d,'products',true);assert.equal(posted.length,3,'Selecting never writes to the server');await submit(d);assert.equal(posted.at(-1).mode,'add');assert.equal(posted.at(-1).productIds.length,58);assert.equal(d.querySelectorAll('[data-category-member]').length,58);assert.deepEqual(posMenuEntries(state).map(e=>e.key),allKeys);
await d.querySelector('[data-category-add]').fire('click');assert(d.querySelector('[data-category-select-all-products]').disabled);assert(d.querySelector('[type="submit"]').disabled);
assert.deepEqual(state.products.map(({posCategoryIds,...p})=>p),before.products.map(({posCategoryIds,...p})=>p));assert.deepEqual(state.unitLots,before.unitLots);
console.log('PASS category filters/bulk: select all/none/partial groups, 55 of 57 scoped removal, empty category, all saleable products in Semua, other memberships/master/stock preserved, filtered selection, empty search, failed save/retry.');

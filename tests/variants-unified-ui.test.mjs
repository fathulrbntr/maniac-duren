import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {emptyState} from '../pos/core.mjs';
import {inventoryPanel,bindInventory} from '../pos/inventory-ui.mjs';
import {productVariantDialog,variantGroupDialog} from '../pos/variant-editor.mjs';
import {saveVariantProducts} from '../pos/product-variants.mjs';
import {Node,makeModal} from './variant-dom.mjs';
const source={id:id(),name:'Coral Cumasi',sku:'COR-CUM',itemType:'finished',stockUnit:'kg',category:'Olahan Duren',variant:'',barcode:'CC',buyPrice:12000,salePrice:27000,photo:'data:image/png;base64,AAAA',durianSourceId:'cumasi-fruit',durianOutput:'coral'};
const state={...emptyState(),stores:[{id:'A',name:'Outlet A'}],products:[structuredClone(source)]};
const groupId=id();for(const condition of ['Fresh','Nitrogen'])state.products.push({id:id(),name:'Coral Black Thorn '+condition,sku:'CBT-'+condition,itemType:'finished',stockUnit:'kg',category:'Olahan Duren',variantGroupId:groupId,variantGroupName:'Coral Black Thorn',variantOptions:[{name:'Kondisi',value:condition}],variant:condition});
const before=structuredClone(state.products[0]);
const markup=inventoryPanel(state,'A',{},'products');
assert.equal((markup.match(/class="inv-catalog-card /g)||[]).length,2);
assert.equal((markup.match(/class="inv-variant-group"/g)||[]).length,2);
assert.equal((markup.match(/data-add-product-variant=/g)||[]).length,1);
assert(!markup.includes('<details class="inv-variant-group" open'));
assert(markup.includes('Belum memiliki varian'));assert(markup.includes('2 varian'));
const stock=inventoryPanel(state,'A',{},'stock');assert(!stock.includes('inv-catalog-card'));assert(!stock.includes('data-add-product-variant'));assert.equal((stock.match(/class="inv-card"/g)||[]).length,3);
// Real click delegation: adding from a single product reaches the correct ID.
const root=new Node();root.innerHTML='<form></form><button data-add-product-variant="'+source.id+'">Tambah varian</button>';
const previousDocument=globalThis.document;globalThis.document={querySelector:()=>root};let clicked;
bindInventory(state,'A',{},'products',{addProductVariant:key=>clicked=key});
let prevented=false;await root.listeners.click[0]({target:root.querySelector('button'),preventDefault(){prevented=true;}});assert.equal(clicked,source.id);assert(prevented);globalThis.document=previousDocument;
const m=makeModal(),posted=[];
const ctx={state,modal:m.modal,mutate:async(action,payload)=>{posted.push({action,payload});saveVariantProducts(state,payload);return true},render(){},toast(){}};
productVariantDialog({...ctx,productId:source.id});const d=m.latest;
assert.match(d.querySelector('.variant-notice').textContent,/menjadi varian pertama/);
let axis=d.querySelector('[data-axis-row]');axis.querySelector('[data-axis-name]').value='Kualitas';axis.querySelector('[data-axis-current]').value='Standar';axis.querySelector('[data-axis-values]').value='Premium';
await d.querySelector('[data-build-variants]').fire('click');assert.equal(d.querySelectorAll('[data-variant-row]').length,2);assert.equal(d.querySelector('[data-variant-row]').dataset.variantRow,source.id);assert.match(d.querySelector('[data-variant-row]').textContent,/Coral Cumasi/);assert(!d.querySelector('[data-variant-row]').textContent.includes('Coral Cumasi Standar'));
// Changing the current option requires rebuilding and is never silently submitted.
axis.querySelector('[data-axis-current]').value='Reguler';await d.querySelector('form').fire('submit');assert.equal(posted.length,0);assert.match(d.querySelector('#form-error').textContent,/Susun daftar/);
await d.querySelector('[data-build-variants]').fire('click');d.querySelector('[data-value="salePrice"]').value='30000';await d.querySelector('form').fire('submit');assert.equal(posted.length,1);assert.equal(posted[0].payload.variants.length,1);assert.deepEqual(posted[0].payload.expectedIds,[source.id]);assert.equal(posted[0].payload.adopt.productId,source.id);
const adopted=state.products.find(p=>p.id===source.id),{variantGroupId,variantGroupName,variantOptions,...untouched}=adopted;assert.deepEqual(untouched,before);assert.deepEqual(variantOptions,[{name:'Kualitas',value:'Reguler'}]);assert.equal(variantGroupName,'Coral Cumasi');assert(state.products.some(p=>p.name==='Coral Cumasi Premium'));
// Subsequent adds must keep the original name and ID in the preview too.
variantGroupDialog({...ctx,groupId:variantGroupId});const later=m.latest;assert.match(later.querySelector('[data-variant-row]').textContent,/Coral Cumasi/);later.querySelector('[data-axis-values]').value='Reguler, Premium, Pilihan';await later.querySelector('[data-build-variants]').fire('click');await later.querySelector('form').fire('submit');assert.equal(posted[1].payload.variants.length,1);assert.equal(state.products.find(p=>p.id===source.id).name,source.name);
// Users can establish two attributes without duplicating the source SKU.
const raw={id:id(),name:'Bubuk minuman',sku:'RAW-POWDER',itemType:'raw',stockUnit:'g',category:null,variant:''};state.products.push(raw);
productVariantDialog({...ctx,productId:raw.id});const multi=m.latest;let a=multi.querySelector('[data-axis-row]');a.querySelector('[data-axis-name]').value='Rasa';a.querySelector('[data-axis-current]').value='Original';a.querySelector('[data-axis-values]').value='Cokelat';await multi.querySelector('[data-add-axis]').fire('click');a=multi.querySelectorAll('[data-axis-row]')[1];a.querySelector('[data-axis-name]').value='Ukuran';a.querySelector('[data-axis-current]').value='Kecil';a.querySelector('[data-axis-values]').value='Besar';await multi.querySelector('[data-build-variants]').fire('click');assert.equal(multi.querySelectorAll('[data-variant-row]').length,4);await multi.querySelector('form').fire('submit');assert.equal(posted[2].payload.variants.length,3);assert.equal(state.products.filter(p=>p.id===raw.id).length,1);
console.log('PASS unified catalog: matching closed cards, single-product action delegation, preserved source ID/name/metadata, adoption preview/save, subsequent variants and multi-attribute adoption.');

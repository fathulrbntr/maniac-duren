import assert from 'node:assert/strict';
import {emptyState} from '../pos/core.mjs';
import {productDialog} from '../pos/product-dialog.mjs';
import {saveProduct} from '../pos/catalog.mjs';
import {saveVariantProducts} from '../pos/product-variants.mjs';
import {defaultPosCategories,savePosCategory,posCategoryIds} from '../pos/pos-categories.mjs';
import {makeModal,FormDataAdapter} from './variant-dom.mjs';

const original=globalThis.FormData;
globalThis.FormData=FormDataAdapter;
function setup(){
 let state={...emptyState(),posCategories:defaultPosCategories(),posCategoryMembershipVersion:2,opsVersion:19,productCostVersion:77,stores:[{id:'outlet',name:'Outlet'}]};
 let categoryFailure='',failProduct=false;
 const modal=makeModal(),calls=[];
 const ctx={state,store:'outlet',modal:modal.modal,getState:()=>state,render(){},toast(){},mutate:async(action,payload)=>{
  calls.push({action,payload:structuredClone(payload)});
  if(action==='product_save'&&failProduct)return false;
  if(action==='pos_category_save'&&categoryFailure==='before')throw Error('Koneksi terputus');
  const next=structuredClone(state);
  if(action==='product_save')saveProduct(next,payload,payload.editing);
  else if(action==='product_variants_save')saveVariantProducts(next,payload);
  else if(action==='pos_category_save')savePosCategory(next,payload);
  else throw Error(action);
  state=next;
  if(action==='pos_category_save'&&categoryFailure==='after')throw Error('Respons terputus');
  return true;
 }};
 productDialog(ctx);
 const d=modal.latest,f=d.querySelector('form'),c=name=>f.elements.namedItem(name);
 const fill=()=>{for(const [name,value] of Object.entries({name:'Monthong',sku:'MT-1',buyPrice:'60000',buyPricePiece:'80000',priceKg:'100000',pricePiece:'150000',barcode:'0001'}))c(name).value=value;};
 return {d,f,c,fill,calls,state:()=>state,failCategory:value=>categoryFailure=value,failProduct:value=>failProduct=value,fruitCategory:state.posCategories.find(c=>c.name==='Buah').id};
}
try {
 // The visible Add Variant button uses the existing editor without submitting
 // the product. Returning to one product preserves all entered values.
 let h=setup();h.fill();
 const toggle=h.d.querySelector('[data-toggle-product-variants]');
 await toggle.fire('click');
 assert.equal(h.c('hasVariants').checked,true);
 assert.equal(toggle.attrs['aria-expanded'],'true');
 assert.equal(h.d.querySelector('#single-product-fields').disabled,true);
 assert.equal(h.calls.length,0);
 await toggle.fire('click');
 assert.equal(h.c('hasVariants').checked,false);
 assert.equal(toggle.attrs['aria-expanded'],'false');
 assert.equal(h.c('priceKg').value,'100000');
 assert.equal(h.c('buyPricePiece').value,'80000');
 await h.f.fire('submit');
 assert.deepEqual(h.calls.map(c=>c.action),['product_save']);
 assert.equal(h.state().products[0].barcode,'0001');
 assert.equal(h.state().products[0].photo,'','Dummy preview must never be saved as an upload');

 // A category failure after a successful product save must never create or
 // adjust the product again. Retry retains the exact category operation ID.
 for(const failure of ['before','after']){
  h=setup();h.fill();h.c('posCategory').value=h.fruitCategory;
  h.failCategory(failure);await h.f.fire('submit');
  assert.equal(h.state().products.length,1);
  assert(!h.d.closed);assert(h.d.querySelector('.product-entry-fields').disabled);
  assert.match(h.d.querySelector('#form-error').textContent,/Barang sudah tersimpan/);
  assert.equal(h.d.querySelector('[data-finish-product]').hidden,false);
  h.failCategory('');await h.f.fire('submit');
  assert.deepEqual(h.calls.map(c=>c.action),['product_save','pos_category_save','pos_category_save']);
  assert.deepEqual(h.calls[1].payload,h.calls[2].payload);
  assert.equal(h.state().products.length,1);
  assert.deepEqual(posCategoryIds(h.state(),h.state().products[0]),[h.fruitCategory]);
  assert(h.d.closed);assert.deepEqual(h.state().lots,[]);assert.deepEqual(h.state().unitLots,[]);
 }

 // Failed product writes cannot issue a category write.
 h=setup();h.fill();h.c('posCategory').value=h.fruitCategory;
 h.failProduct(true);await h.f.fire('submit');
 assert.equal(h.calls.length,1);assert.equal(h.state().products.length,0);
 assert.equal(h.d.querySelector('.product-entry-fields').disabled,false);

 // A category may be left for later without losing the confirmed product.
 h=setup();h.fill();h.c('posCategory').value=h.fruitCategory;
 h.failCategory('before');await h.f.fire('submit');
 await h.d.querySelector('[data-finish-product]').fire('click');
 assert(h.d.closed);assert.equal(h.state().products.length,1);

 // All new variants receive the selected shared category in one operation.
 h=setup();h.c('name').value='Monthong';h.c('posCategory').value=h.fruitCategory;
 await h.d.querySelector('[data-toggle-product-variants]').fire('click');
 h.d.querySelector('[data-axis-values]').value='Kecil, Besar';
 await h.d.querySelector('[data-build-variants]').fire('click');
 for(const key of ['priceKg','pricePiece'])h.d.querySelector(`[data-bulk="${key}"]`).value='100000';
 await h.d.querySelector('[data-apply-prices]').fire('click');
 await h.f.fire('submit');
 assert.deepEqual(h.calls.map(c=>c.action),['product_variants_save','pos_category_save']);
 assert.equal(h.state().products.length,2);
 assert(h.state().products.every(p=>posCategoryIds(h.state(),p).includes(h.fruitCategory)));

 // Raw/prep stock stays outside sale categories; selecting another unit
 // removes the per-piece field from the submitted payload.
 h=setup();h.c('name').value='Gula';h.c('sku').value='GULA';h.c('posCategory').value=h.fruitCategory;
 h.c('itemType').value='raw';await h.c('itemType').fire('change');
 h.c('stockUnit').value='g';await h.c('stockUnit').fire('change');
 assert(h.c('posCategory').disabled);assert(h.c('buyPricePiece').disabled);
 assert.equal(h.d.querySelector('.product-buy-field span').textContent,'Harga Beli /g');
 await h.f.fire('submit');
 assert.deepEqual(h.calls.map(c=>c.action),['product_save']);
 assert.equal(h.state().products[0].category,null);
 assert.equal(h.state().products[0].stockUnit,'g');
 console.log('PASS product popup: real Add Variant toggle, retained values, category assignment for products/variants, partial-save recovery before/after commit, stable retry IDs, raw exclusion, barcode and photo preservation.');
}finally{globalThis.FormData=original;}

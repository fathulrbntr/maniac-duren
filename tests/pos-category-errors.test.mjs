import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {emptyState} from '../pos/core.mjs';
import {defaultPosCategories} from '../pos/pos-categories.mjs';
import {posCategoryDialog} from '../pos/pos-categories-ui.mjs';
import {makeModal} from './variant-dom.mjs';
// Execute the application's actual mutation function, with server responses injected.
// This keeps legacy boolean callers and the category's error propagation under test.
const app=fs.readFileSync(new URL('../pos/app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('async function mutate('),app.indexOf('\nfunction login('));
const build=new Function('env',`let {busy=false,mode='live',state,stateRevision=0,document,prepareRetry,settleRetry,request,toast,localStorage,applyAction,saveVariantProducts,savePosCategory}=env;${source};return {mutate,getState:()=>state,isBusy:()=>busy};`);
const category=defaultPosCategories().find(c=>c.name==='Durpas'),product={id:id(),name:'Durpas Bawor 500 gr',sku:'DP-BAWOR-500',itemType:'finished',stockUnit:'pcs',salePrice:40000,posCategoryIds:[category.id]};
const initial={...emptyState(),products:[product],posCategories:[category],posCategoryMembershipVersion:2};
const serverError=(message,code,definitive=true)=>Object.assign(Error(message),{code,definitive});
function harness(failure,extra={}){
 const control={disabled:false,isConnected:true},settled=[],messages=[],requests=[];
 const api=build({state:structuredClone(initial),document:{querySelectorAll:()=>[control],querySelector:()=>null},prepareRetry:(a,p)=>p,settleRetry:(...x)=>settled.push(x),request:async(path,body)=>{requests.push({path,body});if(failure)throw failure;return structuredClone(initial);},toast:s=>messages.push(s),...extra});
 return {...api,settled,messages,requests,control};
}
for(const failure of [
 serverError('Pilihan produk tidak valid atau terlalu banyak','P0001'),
 serverError('Kategori sudah berubah. Tutup form dan perbarui data.','P0001'),
 serverError('Hak akses tidak mencukupi','P0001'),
 serverError('Could not find the function public.pos_menu_category_save(payload) in the schema cache','PGRST202'),
 serverError('relation "public.md_pos_menu_category_products" does not exist','42P01'),
 serverError('Failed to fetch',undefined,false),
]){
 const h=harness(failure),m=makeModal();posCategoryDialog({state:h.getState(),getState:h.getState,categoryId:category.id,modal:m.modal,mutate:h.mutate,render(){throw Error('Failed save cannot render success');},toast(){throw Error('Failed save cannot toast success');}});
 const d=m.latest,all=d.querySelector('[data-category-select-all-members]');all.checked=true;await all.fire('change');await d.querySelector('[data-category-remove]').fire('click');
 assert(d.querySelector('#form-error').textContent.includes(failure.message));
 assert(!d.querySelector('#form-error').textContent.includes('Periksa pesan kesalahan'),'No hidden toast dependency');
 if(['PGRST202','42P01'].includes(failure.code))assert.match(d.querySelector('#form-error').textContent,/database\/pos-menu-categories.sql/);
 if(!failure.definitive)assert.match(d.querySelector('#form-error').textContent,/Status simpan belum pasti/);
 assert(d.querySelector('[data-category-member]').checked,'Keep selection to retry');assert(!d.querySelector('[data-category-remove]').disabled);
 assert.deepEqual(h.getState(),initial);assert(!h.isBusy());assert(!h.control.disabled);
 assert.deepEqual(h.settled,[['pos_category_save',!failure.definitive]]);assert.equal(h.requests[0].path,'/rest/v1/rpc/pos_menu_category_save');assert.equal(h.requests[0].body.payload.mode,'remove');
}
const blocked=harness(null,{prepareRetry(){throw Error('Pengiriman sebelumnya belum pasti. Klik Perbarui stok untuk memeriksa status sebelum membuat transaksi berbeda.');}});
await assert.rejects(blocked.mutate('pos_category_save',{},{throwOnError:true}),/Pengiriman sebelumnya belum pasti/);assert.equal(blocked.requests.length,0);assert.equal(blocked.settled.length,0);
const busy=harness(null,{busy:true});await assert.rejects(busy.mutate('pos_category_save',{},{throwOnError:true}),/Tunggu proses/);assert.equal(await busy.mutate('sale',{}),false);assert.equal(busy.requests.length,0);
const legacy=harness(serverError('Penjualan gagal','P0001'));assert.equal(await legacy.mutate('sale',{}),false,'Existing boolean callers do not start throwing');assert.deepEqual(legacy.settled,[['sale',false]]);
const ok=harness(null);assert.equal(await ok.mutate('pos_category_save',{}, {throwOnError:true}),true);assert.deepEqual(ok.settled,[['pos_category_save']]);assert(!ok.isBusy());assert(!ok.control.disabled);
console.log('PASS actual app → category error flow: exact SQL/network/permission/schema/retry errors visible inside dialog, no false success, selection retained, uncertain operation retained, controls restored, legacy callers unchanged.');

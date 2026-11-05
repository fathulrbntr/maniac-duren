import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../pos/core.mjs';
import {defaultPosCategories} from '../pos/pos-categories.mjs';
import {dashboardStock,filterDashboardStock} from '../pos/dashboard-data.mjs';
import {dashboardPage,bindDashboard,resetDashboard,followDashboardStore} from '../pos/dashboard-ui.mjs';
import {Node} from './variant-dom.mjs';
function fixture(){
 const cats=defaultPosCategories(),cat=name=>cats.find(c=>c.name===name).id;
 const product=(id,name,group,extra={})=>({id,name,itemType:'finished',stockUnit:'pcs',category:'Olahan Duren',posCategoryIds:group?[cat(group)]:[],...extra});
 const s={...emptyState(),me:{id:'u',role:'owner',name:'Kasir'},access:{stock:true,reports:true},stores:[{id:'a',name:'Depok'},{id:'b',name:'Bekasi'}],posCategories:cats};
 s.products=[product('fruit','Monthong','Buah',{itemType:'direct',stockUnit:'kg_butir'}),product('durpas1','Durpas 500 gr','Durpas'),product('durpas2','Durpas 1 kg','Durpas'),product('empty','Durpas kosong','Durpas'),product('coral','Coral Bawor','Coral',{stockUnit:'kg'}),product('food','Nasi goreng','Makan'),product('drink','Air mineral','Minuman'),product('dessert','Puding','Dessert'),product('multi','Paket campur','Durpas',{posCategoryIds:[cat('Durpas'),cat('Dessert')]}),product('raw','Gula',null,{itemType:'raw',stockUnit:'g'}),product('unassigned','Durpas belum dikategorikan',null),product('recipe','Es duren','Dessert',{itemType:'recipe',stockUnit:'porsi'})];
 s.lots=[{id:'l1',productId:'fruit',storeId:'a',kg:10,pieces:4},{id:'l2',productId:'fruit',storeId:'forbidden',kg:999,pieces:999}];
 s.unitLots=[['durpas1',30],['durpas2',5],['coral',2],['food',6],['drink',20],['dessert',3],['multi',1],['raw',500]].map(([productId,qty])=>({id:'l-'+productId,productId,qty,storeId:'a'}));
 s.unitLots.push({id:'b-lot',storeId:'b',productId:'durpas1',qty:7});
 return s;
}
const pick=(s,category,sort='ready',store='a')=>filterDashboardStock(s,dashboardStock(s,store),{category,sort});
test('dashboard stock uses shared category memberships, Makan alias, multi-category membership and authorized outlet totals',()=>{
 const s=fixture(),before=structuredClone(s);
 assert.deepEqual(pick(s,'buah').rows.map(r=>r.id),['fruit']);assert.equal(pick(s,'buah').units.get('kg'),10);assert.equal(pick(s,'buah').rows[0].pieces,4);
 assert.deepEqual(pick(s,'makanan').rows.map(r=>r.id),['food']);
 assert.deepEqual(pick(s,'coral').rows.map(r=>r.id),['coral']);assert.equal(pick(s,'minuman').units.get('pcs'),20);
 assert(pick(s,'dessert').rows.some(r=>r.id==='multi'));assert(!pick(s,'durpas').rows.some(r=>r.id==='unassigned'));
 assert.equal(pick(s,'durpas').units.get('pcs'),36);assert.equal(pick(s,'durpas','ready','').units.get('pcs'),43);
 assert.equal(pick(s,'all').rows.length,11);assert.equal(pick(s,'all').units.get('g'),500);assert(!pick(s,'all').rows.some(r=>r.id==='recipe'));
 assert.deepEqual(s,before);
 s.posCategories=s.posCategories.map(c=>c.name==='Makan'?{...c,name:'Makanan'}:c);assert.equal(pick(s,'makanan').rows.length,1);
 s.posCategories=s.posCategories.filter(c=>c.name!=='Durpas');assert.equal(pick(s,'durpas').rows.length,0,'Deleted categories do not resurrect stale memberships');
 const old={...s,posCategories:undefined,products:[{id:'old',name:'Durpas Bawor',itemType:'finished',stockUnit:'pcs'}],unitLots:[]};assert.equal(pick(old,'durpas').rows.length,1,'Legacy state follows the existing category inference');
});
test('sort is stable, keeps available items first by default and compares quantities within each unit',()=>{
 const s=fixture();assert.equal(pick(s,'durpas').rows.at(-1).id,'empty');
 assert.deepEqual(pick(s,'durpas','qty-desc').rows.map(r=>r.id),['durpas1','durpas2','multi','empty']);
 assert.deepEqual(pick(s,'durpas','qty-asc').rows.map(r=>r.id),['empty','multi','durpas2','durpas1']);
 assert.deepEqual(pick(s,'durpas','za').rows.map(r=>r.id),pick(s,'durpas','az').rows.map(r=>r.id).reverse());
 const rows=pick(s,'all','qty-desc').rows;assert.deepEqual(rows.slice(0,3).map(r=>[r.id,r.unit]),[['fruit','kg'],['coral','kg'],['raw','g']]);
 assert.equal(pick(s,'bad','bad').category,'all');assert.equal(pick(s,'bad','bad').sort,'ready');
});
test('category and sort handlers update list/totals locally and retain selections across tabs and outlets, resetting for a new session',async()=>{
 const s=fixture(),root=new Node(),original=globalThis.document;let active='a',busy=false;
 globalThis.document={querySelector:q=>root.querySelector(q),querySelectorAll:q=>root.querySelectorAll(q)};
 const ctx={render,isBusy:()=>busy,changeStore:id=>{active=id;followDashboardStore();render();return true;},toast(){},refresh:async()=>{}};
 function render(){root.innerHTML=dashboardPage(s,active);bindDashboard(s,active,ctx);}
 const click=async q=>{assert(root.querySelector(q),q);await root.querySelector(q).fire('click');};
 const ids=()=>root.querySelectorAll('[data-dash-stock-product]').map(x=>x.dataset.dashStockProduct);
 try{
  resetDashboard();render();await click('[data-dash-tab="stock"]');assert.equal(root.querySelectorAll('[data-dash-stock-category]').length,7);
  await click('[data-dash-stock-category="durpas"]');assert.equal(root.querySelector('.dash-unit-chips').textContent,'36 pcs');
  root.querySelector('#dash-stock-sort').value='qty-desc';await root.querySelector('#dash-stock-sort').fire('change');assert.deepEqual(ids(),['durpas1','durpas2','multi','empty']);
  await click('[data-dash-tab="transactions"]');await click('[data-dash-tab="stock"]');assert.equal(root.querySelector('#dash-stock-sort').value,'qty-desc');
  root.querySelector('#dash-store').value='b';await root.querySelector('#dash-store').fire('change');assert.equal(root.querySelector('.dash-unit-chips').textContent,'7 pcs');
  busy=true;await click('[data-dash-stock-category="buah"]');assert.equal(root.querySelector('[data-dash-stock-category="durpas"]').attrs['aria-pressed'],'true');busy=false;
  s.posCategories=s.posCategories.filter(c=>c.name!=='Durpas');render();assert.match(root.querySelector('.dash-stock-panel').textContent,/Belum ada produk Durpas/);
  resetDashboard();render();await click('[data-dash-tab="stock"]');assert.equal(root.querySelector('[data-dash-stock-category="all"]').attrs['aria-pressed'],'true');assert.equal(root.querySelector('#dash-stock-sort').value,'ready');
 }finally{resetDashboard();globalThis.document=original;}
});

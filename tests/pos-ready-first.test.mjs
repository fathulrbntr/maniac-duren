import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {emptyState,today} from '../pos/core.mjs';
import {defaultPosCategories} from '../pos/pos-categories.mjs';
import {posProductCards,updatePosCards,posVariantDialog,menuKey} from '../pos/pos-menu.mjs';
import {opsPage,bindOps,clearOrderDraft} from '../pos/operations-ui.mjs';
import {Node,makeModal,FormDataAdapter} from './variant-dom.mjs';
const cats=defaultPosCategories(),coral=cats.find(c=>c.name==='Coral').id,dessert=cats.find(c=>c.name==='Dessert').id;
const p=(name,extra={})=>({id:id(),name,sku:id(),itemType:'finished',stockUnit:'pcs',salePrice:50000,posCategoryIds:[coral],...extra});
const a=p('A Kosong'),z=p('Z Siap',{photo:'data:image/png;base64,AAAA'}),group=id(),b0=p('B Varian Kecil',{variantGroupId:group,variantGroupName:'B Varian',variant:'Kecil'}),b1=p('B Varian Besar',{variantGroupId:group,variantGroupName:'B Varian',variant:'Besar',posCategoryIds:[dessert]}),c=p('C Belum ada harga',{salePrice:null}),prep=p('Bahan internal',{itemType:'prep',stockUnit:'g',salePrice:null}),d=p('D Menu resep',{itemType:'recipe',stockUnit:'porsi'}),e=p('E Kedaluwarsa'),f=p('F Outlet lain'),g=p('G Buah',{itemType:'direct',stockUnit:'kg_butir',priceKg:50000,pricePiece:100000}),h=p('H Belum datang');
const day=today(),tomorrow=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10),yesterday=new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10);
const lot=(product,qty,extra={})=>({id:id(),productId:product.id,storeId:'A',date:day,qty,...extra});
let state={...emptyState(),products:[z,h,c,b1,f,d,a,prep,e,g,b0],posCategories:cats,orderStockVersion:11,opsVersion:19,orderRoutingVersion:13,access:{master:true,sell:true},stores:[{id:'A',name:'Outlet A'}],suppliers:[],unitLots:[lot(z,1),lot(b1,1),lot(c,4),lot(prep,2),lot(e,5,{expiry:yesterday}),lot(f,7,{storeId:'B'}),lot(h,8,{date:tomorrow})],recipes:[{id:id(),outputId:d.id,yieldQty:1,ingredients:[{productId:prep.id,qty:3}]}],lots:[{id:id(),productId:g.id,storeId:'A',date:day,quality:'ready',kg:4,pieces:1}]};
const before=structuredClone(state),grid=new Node('div',{id:'order-products'});grid.innerHTML=posProductCards(state,'A');
const names=root=>root.querySelectorAll('[data-menu-key]').filter(n=>!n.hidden).map(n=>n.querySelector('.order-product-info strong').textContent);
const ready=root=>root.querySelectorAll('[data-menu-key]').filter(n=>!n.hidden&&!n.disabled).map(n=>n.dataset.menuKey);
assert.deepEqual(names(grid),['B Varian','G Buah','Z Siap','A Kosong','C Belum ada harga','D Menu resep','E Kedaluwarsa','F Outlet lain','H Belum datang']);
const cards=new Map(grid.querySelectorAll('[data-menu-key]').map(n=>[n.dataset.menuKey,n])),image=cards.get(menuKey(z)).querySelector('img');
for(const card of cards.values()) {
 assert(card.querySelector('.order-product-footer .order-stock-status'));
 const icon=card.querySelector('.order-product-footer .order-product-add svg');assert(icon);assert.equal(icon.attrs.viewBox,'0 0 24 24');
 assert.equal(card.attrs['aria-disabled'],String(card.disabled));
}
const draft=[{productId:z.id,qty:1,price:z.salePrice}];updatePosCards(grid,state,'A',draft);
assert.deepEqual(names(grid),['B Varian','G Buah','A Kosong','C Belum ada harga','D Menu resep','E Kedaluwarsa','F Outlet lain','H Belum datang','Z Siap']);
assert.equal(cards.get(menuKey(z)).querySelector('img'),image,'Sorting preserves the image node');
updatePosCards(grid,state,'A',[],coral);
assert(cards.get(menuKey(b0)).disabled,'A stocked sibling in a different category cannot enable the current category');
assert.deepEqual(ready(grid),[menuKey(g),menuKey(z)]);
updatePosCards(grid,state,'A',[],dessert);assert(!cards.get(menuKey(b0)).disabled);
updatePosCards(grid,state,'A',[],'all','Kosong');assert.deepEqual(names(grid),['A Kosong']);assert(cards.get(menuKey(a)).disabled);
updatePosCards(grid,state,'A',[],'all','Tidak ada');assert.equal(names(grid).length,0);
assert.deepEqual(state,before,'Ordering and filtering cannot mutate stock or product data');
state=structuredClone(state);state.unitLots.push(lot(a,2));state.unitLots.find(l=>l.productId===prep.id).qty=3;state.unitLots.find(l=>l.productId===b1.id).qty=0;
updatePosCards(grid,state,'A',[]);
assert.deepEqual(names(grid),['A Kosong','D Menu resep','G Buah','Z Siap','B Varian','C Belum ada harga','E Kedaluwarsa','F Outlet lain','H Belum datang']);
for(const [key,card] of cards)assert.equal(grid.querySelector(`[data-menu-key="${key}"]`),card,'Dynamic stock update reuses every card');
const m=makeModal();assert.equal(posVariantDialog({key:menuKey(b0),getState:()=>state,getDraft:()=>[],store:'A',modal:m.modal,onConfirm(){throw Error('No sale');}}),null,'Opening also rejects unavailable groups, even with a stale button');

// Exercise the actual click/cart/poll/category handlers with real node reordering.
const root=new Node(),original={document:globalThis.document,FormData:globalThis.FormData,fetch:globalThis.fetch};
const elements=Object.getOwnPropertyDescriptor(Node.prototype,'elements'),replace=Node.prototype.replaceWith;
Object.defineProperty(Node.prototype,'elements',{configurable:true,get(){return new Proxy({namedItem:name=>this.querySelector(`[name="${name}"]`)},{get:(obj,k)=>k in obj?obj[k]:this.querySelector(`[name="${k}"]`)});}});
Node.prototype.replaceWith=function(other){const index=this.parent.children.indexOf(this);other.parent=this.parent;this.parent.children[index]=other;};
globalThis.document={querySelector:s=>root.querySelector(s),querySelectorAll:s=>root.querySelectorAll(s),createElement:tag=>{const n=new Node(tag);if(tag==='template')n.content=n;return n;}};globalThis.FormData=FormDataAdapter;globalThis.fetch=()=>{throw Error('No request is needed to sort or open variants');};
const ctx={getState:()=>state,modal:m.modal,toast(){},mutate(){throw Error('No persistence during cart edits');},render(){}};
const click=product=>root.querySelector('#order-products').listeners.click[0]({target:root.querySelector(`[data-menu-key="${menuKey(product)}"]`)});
try {
 clearOrderDraft();root.innerHTML=opsPage('orders',state,'A');bindOps('orders',state,'A',ctx);
 const input=root.querySelector('#order-search'),note=root.querySelector('#order-note');note.value='Meja depan';
 await click(b0);assert.equal(m.latest,undefined,'Unavailable group click cannot open a modal');
 await click(z);assert.equal(root.querySelectorAll('[data-remove-line]').length,1);assert.equal(names(root.querySelector('#order-products')).at(-1),'Z Siap');
 const remove=root.querySelector('[data-remove-line]');await root.querySelector('#order-draft').listeners.click[0]({target:remove});assert(!root.querySelector(`[data-menu-key="${menuKey(z)}"]`).disabled);
 const next=structuredClone(state);next.unitLots.find(l=>l.productId===b1.id).qty=2;state=next;
 const priorCard=root.querySelector(`[data-menu-key="${menuKey(z)}"]`),priorImage=priorCard.querySelector('img');await root.querySelector('#order-products').listeners['stock-refresh'][0]({detail:next});
 assert.equal(root.querySelector(`[data-menu-key="${menuKey(z)}"]`),priorCard);assert.equal(priorCard.querySelector('img'),priorImage);assert.equal(root.querySelector('#order-search'),input);assert.equal(root.querySelector('#order-note'),note);assert.equal(note.value,'Meja depan');
 await click(b0);const popup=m.latest;assert(popup);assert(popup.querySelector(`[data-sale-variant="${b0.id}"]`).disabled);assert(!popup.querySelector(`[data-sale-variant="${b1.id}"]`).disabled);
 const picked=popup.querySelector(`[data-sale-variant="${b1.id}"]`);picked.checked=true;await popup.querySelector('[data-sale-variants]').listeners.change[0]({target:picked});
 state=structuredClone(state);state.unitLots.find(l=>l.productId===b1.id).qty=0;await root.querySelector('#order-products').listeners['stock-refresh'][0]({detail:state});
 assert(root.querySelector(`[data-menu-key="${menuKey(b0)}"]`).disabled);assert(popup.querySelector('[type="submit"]').disabled);await popup.querySelector('form').fire('submit');assert.equal(root.querySelectorAll('[data-remove-line]').length,0,'A stock change while the popup is open cannot sell an unavailable variant');
 console.log('PASS ready-first POS: initial/live ordering, alphabetical ties, category-specific variants, unavailable click/race guards, ingredients/outlet/date/expiry, cart consume/restore, SVG footer structure, reused cards/images and preserved local inputs without network reads.');
}finally{clearOrderDraft();Object.assign(globalThis,original);Object.defineProperty(Node.prototype,'elements',elements);if(replace)Node.prototype.replaceWith=replace;else delete Node.prototype.replaceWith;}

import assert from 'node:assert/strict';
import {createStockDemo,applyStockDemoAction,readStockDemo} from '../pos/stock-demo.mjs';
import {documentsPage,bindDocuments} from '../pos/documents-ui.mjs';
import {Node,makeModal,FormDataAdapter} from './variant-dom.mjs';
import {fixture,qty} from './stock-demo-fixture.mjs';
const f=fixture();Object.assign(f.state.access,{finance:true,stock:true,reports:true});
let state=createStockDemo(f.state);const root=new Node(),m=makeModal(),actions=[],prints=[],messages=[];
const globals={document:globalThis.document,FormData:globalThis.FormData,fetch:globalThis.fetch,confirm:globalThis.confirm,window:globalThis.window};
globalThis.document={querySelector:q=>root.querySelector(q),querySelectorAll:q=>root.querySelectorAll(q)};
globalThis.FormData=class extends FormDataAdapter{*[Symbol.iterator](){yield* super[Symbol.iterator]();for(const n of this.form.querySelectorAll('textarea'))if(n.name&&!n.disabled)yield [n.name,n.value];}};
globalThis.fetch=()=>{throw Error('Document demo must never access the network');};
globalThis.confirm=()=>true;
globalThis.window={open:()=>({document:{write:html=>prints.push(html),close(){},getElementById:()=>({})},print(){}})};
const ctx={modal:m.modal,getState:()=>state,rpc:async(name,p)=>readStockDemo(state,name,p),mutate:async(action,p)=>{actions.push(action);state=applyStockDemoAction(state,action,p);return true;},render,refresh:async()=>{},toast:x=>messages.push(x)};
function render(){root.innerHTML=documentsPage(state,f.store);bindDocuments(state,f.store,ctx);}
try{
 render();assert(!root.querySelector('[data-new-document="PO"]').disabled);assert(!root.querySelector('#letterhead').disabled);
 await root.querySelector('#documents-examples').fire('click');assert.equal(state.documents.length,4);assert(root.querySelector('#documents-examples').disabled);
 for(const doc of state.documents){
  await root.querySelector(`[data-open-document="${doc.id}"]`).fire('click');assert.match(m.latest.textContent,/DEMO · BUKAN DOKUMEN RESMI/);await m.latest.querySelector('#doc-print').fire('click');m.latest.close();
 }
 assert.equal(prints.length,4);assert(prints.every(html=>html.includes('DEMO · BUKAN DOKUMEN RESMI')));
 await root.querySelector('[data-new-document="PO"]').fire('click');let form=m.latest.querySelector('form');
 form.elements.namedItem('supplierId').value=state.stockDemo.supplierId;
 const select=m.latest.querySelector('[data-col="productId"]');select.value=f.water.id;await select.fire('change');
 m.latest.querySelector('[data-col="qty"]').value='3';m.latest.querySelector('[data-col="price"]').value='150000';form.elements.namedItem('shipping').value='10000';
 await form.fire('submit');assert(m.latest.querySelector('#doc-edit'));assert.match(m.latest.textContent,/460.000/);
 await m.latest.querySelector('#doc-issue').fire('click');assert(m.latest.querySelector('#doc-purchase'));assert.match(m.latest.textContent,/DEMO\/MD\/PO/);
 await m.latest.querySelector('#doc-purchase').fire('click');form=m.latest.querySelector('form');assert.equal(form.elements.namedItem('sourceType').value,'po');
 await form.fire('submit');await m.latest.querySelector('#doc-issue').fire('click');assert.equal(qty(state,f.water,f.store),103);assert(!m.latest.querySelector('#doc-cancel'));
 m.latest.close();await root.querySelector('#letterhead').fire('click');form=m.latest.querySelector('form');form.elements.namedItem('name').value='Kop Demo';form.elements.namedItem('address').value='Alamat latihan';await form.fire('submit');
 assert.equal(readStockDemo(state,'pos_letterhead_get',{store_id:f.store}).name,'Kop Demo');
 assert(actions.includes('document_save'));assert(actions.includes('document_issue'));assert(actions.includes('letterhead_save'));
 assert.equal(messages.filter(x=>/tidak|gagal/i.test(x)).length,0);
 console.log('PASS document demo UI: examples, four detail/print views, PO draft/issue → purchase → local stock, letterhead; no network.');
}finally{Object.assign(globalThis,globals);}

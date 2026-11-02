// Current app navigates from one loaded snapshot; no retired bootstrap/cache API.
import assert from 'node:assert/strict';
import {Node} from './variant-dom.mjs';
import {emptyState} from '../pos/core.mjs';
import {createSessionManager} from '../pos/session.mjs';
const root=new Node('body'),app=new Node('div',{id:'app'});app.parent=root;root.children.push(app);root.classList.remove=()=>{};
const disk=new Map(),storage={getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)};
globalThis.localStorage=storage;globalThis.HTMLInputElement=class{get value(){return '';}set value(v){}};globalThis.MutationObserver=class{observe(){}};
globalThis.document={body:root,documentElement:{dataset:{theme:'light'}},addEventListener(){},querySelector:q=>q==='#toast'?{textContent:'',style:{}}:root.querySelector(q),querySelectorAll:q=>root.querySelectorAll(q)};
let scrolled=0;
globalThis.window={localStorage:storage,addEventListener(){},scrollTo(){scrolled++;},matchMedia:()=>({matches:false,addEventListener(){}})};
globalThis.confirm=()=>true;globalThis.setInterval=()=>0;
const url='https://fixture.invalid',manager=createSessionManager({url,key:'fixture',storage,locks:null});
const session=manager.save({access_token:'fixture',refresh_token:'fixture',expires_in:3600,user:{id:'owner'}});manager.location(session.sessionId,'a','stores');
const state={...emptyState(),me:{id:'owner',name:'Owner',role:'owner'},access:{master:true},stores:[{id:'a',name:'Outlet A'},{id:'b',name:'Outlet B'}],suppliers:[{id:'supplier',name:'Supplier A'}]};
let reads=0;
globalThis.fetch=async target=>{
 if(target==='/api/pos-config')return new Response(JSON.stringify({configured:true,url,key:'fixture'}));
 assert.equal(target,url+'/rest/v1/rpc/pos_read');reads++;return new Response(JSON.stringify(state));
};
await import('../pos/app.js?navigation-regression');assert.equal(reads,1);
for(const view of ['suppliers','stores','devices','guide']){
 await root.querySelector(`#pos-navigation [data-view="${view}"]`).fire('click');
 assert.equal(manager.read().view,view);assert.equal(reads,1);assert(!app.textContent.includes('Membuka menu'));
}
assert.equal(scrolled,4,'each menu starts at the top');
const select=root.querySelector('#active-store');select.value='b';await select.fire('change');assert.equal(manager.read().store,'b');assert.equal(reads,1);
await root.querySelector('#logout').fire('click');assert(root.querySelector('#login-form'));assert.equal(manager.read(),null);
console.log('PASS current navigation: no extra requests, reset scroll, outlet persistence and logout.');

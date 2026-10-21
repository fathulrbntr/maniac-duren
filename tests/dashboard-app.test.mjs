// Integration against app.js: loaded data, active outlet and demo isolation.
import assert from 'node:assert/strict';
import {Node} from './variant-dom.mjs';
import {emptyState,today} from '../pos/core.mjs';
import {createSessionManager} from '../pos/session.mjs';
const root=new Node('body'),app=new Node('div',{id:'app'});app.parent=root;root.children.push(app);
root.classList.remove=()=>{};const disk=new Map(),listeners={};
const storage={getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)};
globalThis.localStorage=storage;globalThis.HTMLInputElement=class{get value(){return this.raw||'';}set value(v){this.raw=v;}};globalThis.MutationObserver=class{observe(){}};
globalThis.document={body:root,documentElement:{dataset:{theme:'dark'}},addEventListener:(key,fn)=>(listeners[key]??=[]).push(fn),querySelector:q=>q==='#toast'?{textContent:'',style:{}}:root.querySelector(q),querySelectorAll:q=>root.querySelectorAll(q)};
globalThis.window={localStorage:storage,addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}})};globalThis.confirm=()=>true;globalThis.setInterval=()=>0;globalThis.setTimeout=()=>0;
const url='https://fixture.invalid',manager=createSessionManager({url,key:'test',storage,locks:null});const session=manager.save({access_token:'test',refresh_token:'test',expires_in:3600,user:{id:'owner'}});manager.location(session.sessionId,'a','dashboard');
const s={...emptyState(),me:{id:'owner',name:'Owner Test',role:'owner'},access:{reports:true,sell:true,finance:true,master:true,stock:true,waste:true},stores:[{id:'a',name:'Outlet A'},{id:'b',name:'Outlet B'}],employees:[],orders:[],events:[],journal:[],documents:[],rejectRecords:[]};
s.products=[{id:'water',name:'Air mineral',itemType:'direct',stockUnit:'pcs',salePrice:5000,category:'Minuman'}];
s.orders=[{id:'sale-a',store_id:'a',business_date:today(),paid_date:today(),created_at:today()+'T03:00:00Z',status:'paid',payment_status:'paid',payment:'Tunai',total:5000,lines:[{productId:'water',qty:1,price:5000,unit:'pcs'}]}];
let reads=0;
globalThis.fetch=async endpoint=>{
 if(endpoint==='/api/pos-config')return new Response(JSON.stringify({configured:true,url,key:'test'}));
 if(endpoint===url+'/rest/v1/rpc/pos_read'){reads++;return new Response(JSON.stringify(s));}
 throw Error('Unexpected network request: '+endpoint);
};
await import('../pos/app.js?dashboard-integration');
assert(root.querySelector('.dashboard-shell'));assert(root.querySelector('.dash-dock'));assert.equal(reads,1);assert(root.querySelector('.dash-metric').textContent.includes('5.000'));
const select=async(selector,value)=>{const el=root.querySelector(selector);el.value=value;await el.fire('change');};
await select('#dash-store','b');assert.equal(root.querySelector('#active-store').value,'b');assert.equal(manager.read().store,'b');assert.equal(reads,1);
await select('#dash-store','');assert(root.querySelector('.dash-metric').textContent.includes('5.000'));assert.equal(root.querySelector('#active-store').value,'b');
await select('#active-store','a');assert.equal(root.querySelector('#dash-store').value,'a');assert.equal(reads,1);
await select('#dash-period','month');await root.querySelector('[data-dash-tab="stock"]').fire('click');assert(root.querySelector('#dash-period').disabled);assert.equal(reads,1);
await root.querySelector('[data-dash-home]').fire('click');await root.querySelector('#dash-refresh').fire('click');assert.equal(reads,2);
await root.querySelector('#stock-demo-toggle').fire('click');assert(root.textContent.includes('MODE DEMO'));assert.equal(reads,2);assert(root.querySelector('.dash-chart-empty'));
await root.querySelector('#dash-refresh').fire('click');await root.querySelector('[data-dash-tab="suppliers"]').fire('click');assert.equal(reads,2,'Dashboard demo must not read the real database');
await root.querySelector('#stock-demo-toggle').fire('click');assert.equal(reads,3);await root.querySelector('[data-dash-home]').fire('click');assert(root.querySelector('.dash-metric').textContent.includes('5.000'));
console.log('PASS dashboard app integration: session restore, shared outlet selector, all-store scope, local navigation, refresh, demo and live restoration.');

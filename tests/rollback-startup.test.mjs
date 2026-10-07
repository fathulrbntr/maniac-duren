// Runs real application startup with a minimal login DOM, without a database/browser.
import assert from 'node:assert/strict';
const listeners={},windowListeners={},button={disabled:false,textContent:''},error={textContent:''};
const form={querySelector:()=>button,setAttribute(){},removeAttribute(){}};
const label={textContent:''};
const themeButton={setAttribute(){},querySelector:()=>label};
const app={innerHTML:''};
const nav=['stores','suppliers'].map(view=>({dataset:{view}}));
const elements={'#active-store':{value:'A'},'#logout':{}};
const original={document:globalThis.document,window:globalThis.window,localStorage:globalThis.localStorage,fetch:globalThis.fetch,FormData:globalThis.FormData,setInterval:globalThis.setInterval};
globalThis.HTMLInputElement=class {get value(){return this.raw||""}set value(v){this.raw=v}};
globalThis.MutationObserver=class{observe(){}};
globalThis.document={documentElement:{dataset:{theme:'light'}},addEventListener:(type,cb)=>{(listeners[type]??=[]).push(cb)},querySelector:selector=>({'#app':app,'#login-form':form,'#login-error':error}[selector]??elements[selector]??null),querySelectorAll:selector=>selector==='[data-theme-toggle]'?[themeButton]:selector==='[data-view]'?nav:[]};
globalThis.window={posConfigReady:Promise.resolve({configured:true,url:'https://fixture.invalid',key:'fixture'}),addEventListener:(type,cb)=>windowListeners[type]=cb};
globalThis.localStorage={setItem(){},getItem(){return null}};
globalThis.setInterval=()=>0;
globalThis.FormData=class{*[Symbol.iterator](){yield ['identifier','test'];yield ['password','test-password'];}};
let calls=0,reads=0,accepted=false;
const {emptyState}=await import('../pos/core.mjs');
const state={...emptyState(),me:{id:'test',name:'Test',role:'owner'},access:{master:true},stores:[{id:'A',name:'Outlet A'},{id:'B',name:'Outlet B'}],suppliers:[{id:'supplier',name:'Supplier A'}]};
globalThis.fetch=async(url,opts)=>{
 if(url==='/api/pos-config')return new Response(JSON.stringify({configured:true,url:'https://fixture.invalid',key:'fixture'}));
 if(url==='https://fixture.invalid/rest/v1/rpc/pos_read'){reads++;return new Response(JSON.stringify(state));}
 assert.equal(url,'/api/pos-login');assert.equal(opts.method,'POST');calls++;
 return accepted ? new Response(JSON.stringify({access_token:'fixture',refresh_token:'fixture',expires_in:3600,user:{id:'test'}})) : new Response(JSON.stringify({error:'Login salah'}),{status:401});
};
try{
 await import('../pos/app.js?startup-regression');
 assert.match(app.innerHTML,/login-form/);
 assert.equal(typeof form.onsubmit,'function');
 for(const cb of listeners.click||[])cb({target:{closest:selector=>selector==='[data-theme-toggle]'?themeButton:null}});
 assert.equal(document.documentElement.dataset.theme,'dark');
 windowListeners.storage({key:'maniac-pos-theme',newValue:'light'});
 assert.equal(document.documentElement.dataset.theme,'light');
 let prevented=false;await form.onsubmit({currentTarget:form,preventDefault(){prevented=true}});
 assert(prevented);assert.equal(calls,1);assert.equal(error.textContent,'Login salah');assert.equal(button.disabled,false);
 accepted=true;
 await form.onsubmit({currentTarget:form,preventDefault(){}});
 assert.match(app.innerHTML,/sidebar-header/);assert.match(app.innerHTML,/sidebar-account/);
 assert.equal(reads,1);
 nav[0].onclick();assert.match(app.innerHTML,/Master Store/);
 nav[1].onclick();assert.match(app.innerHTML,/Master Supplier/);
 assert.equal(reads,1,'menu navigation reuses loaded data without waiting for another request');
 assert(!app.innerHTML.includes('Membuka menu'));
 elements['#active-store'].onchange({target:{value:'B'}});
 assert.equal(reads,1,'switching outlet reuses the loaded state');
 elements['#logout'].onclick();assert.match(app.innerHTML,/login-form/);
 console.log('PASS patch 027 real startup, failed/successful login, theme, navigation without another read, outlet switch and logout');
}finally{Object.assign(globalThis,original)}

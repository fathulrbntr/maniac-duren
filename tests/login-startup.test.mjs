// Runs real application startup with a minimal login DOM, without a database/browser.
import assert from 'node:assert/strict';
const listeners={},windowListeners={},button={disabled:false,textContent:''},error={textContent:''};
const form={querySelector:()=>button,setAttribute(){},removeAttribute(){}};
const label={textContent:''};
const themeButton={setAttribute(){},querySelector:()=>label};
const app={innerHTML:''};
const original={document:globalThis.document,window:globalThis.window,localStorage:globalThis.localStorage,fetch:globalThis.fetch,FormData:globalThis.FormData,setInterval:globalThis.setInterval};
globalThis.HTMLInputElement=class {get value(){return this.raw||""}set value(v){this.raw=v}};
globalThis.MutationObserver=class{observe(){}};
globalThis.document={documentElement:{dataset:{theme:'light'}},addEventListener:(type,cb)=>{(listeners[type]??=[]).push(cb)},querySelector:selector=>({'#app':app,'#login-form':form,'#login-error':error}[selector]??null),querySelectorAll:selector=>selector==='[data-theme-toggle]'?[themeButton]:[]};
globalThis.window={posConfigReady:Promise.resolve({configured:true,url:'https://fixture.invalid',key:'fixture'}),addEventListener:(type,cb)=>windowListeners[type]=cb};
globalThis.localStorage={setItem(){},getItem(){return null}};
globalThis.setInterval=()=>0;
globalThis.FormData=class{*[Symbol.iterator](){yield ['identifier','test'];yield ['password','test-password'];}};
let calls=0;
globalThis.fetch=async(url,opts)=>{assert.equal(url,'/api/pos-login');assert.equal(opts.method,'POST');calls++;return new Response(JSON.stringify({error:'Login salah'}),{status:401})};
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
 assert(window.posLoginTiming.totalMs>=0);
 console.log('PASS real startup without sidebar, login theme/storage events, form submission and failed-login recovery');
}finally{Object.assign(globalThis,original)}

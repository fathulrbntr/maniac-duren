// Exercise the shipped app with controlled storage/network and a minimal DOM.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {emptyState} from '../pos/core.mjs';
import {createSessionManager} from '../pos/session.mjs';
const scenario=process.argv[2];
if(!scenario) {
  for(const name of ['login-progress','restore','expired','network-retry','invalid','unauthorized-retry','cross-tab-logout']) {
    const result=spawnSync(process.execPath,[fileURLToPath(import.meta.url),name],{encoding:'utf8',env:{...process.env,NODE_NO_WARNINGS:'1'}});
    assert.equal(result.status,0,result.stdout+result.stderr);
    process.stdout.write(result.stdout);
  }
} else {
  const data={access_token:'access-old',refresh_token:'refresh-old',expires_in:3600,user:{id:'test'}};
  const url='https://fixture.invalid',disk=new Map();
  const storage={getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)};
  globalThis.localStorage=storage;
  const manager=createSessionManager({url,key:'fixture',storage,locks:null});
  if(scenario!=='login-progress') {
    const saved=manager.save(data);manager.location(saved.sessionId,'B','stores');
    if(['expired','invalid'].includes(scenario))storage.setItem(manager.storageKey,JSON.stringify({...manager.read(),expiresAt:0}));
  }
  const listeners={},windowListeners={},button={disabled:false,textContent:''},error={textContent:''},progress={hidden:true},progressText={textContent:''};
  const inputs=[{readOnly:false},{readOnly:false}];
  const form={querySelector:s=>s==='[data-auth-progress]'?progress:s==='[data-auth-progress-text]'?progressText:button,querySelectorAll:()=>inputs,setAttribute(){},removeAttribute(){}};
  const label={textContent:''},themeButton={setAttribute(){},querySelector:()=>label};
  const app={innerHTML:''},elements={'#active-store':{value:'B'},'#logout':{},'#auth-retry':{},'#auth-switch':{},'#toast':{textContent:'',style:{}}};
  globalThis.HTMLInputElement=class {get value(){return this.raw||'';}set value(v){this.raw=v;}};
  globalThis.MutationObserver=class{observe(){}};
  globalThis.document={documentElement:{dataset:{theme:'light'}},addEventListener:(type,cb)=>(listeners[type]??=[]).push(cb),querySelector:s=>({'#app':app,'#login-form':form,'#login-error':error}[s]??elements[s]??null),querySelectorAll:s=>s==='[data-theme-toggle]'?[themeButton]:[]};
  globalThis.window={localStorage:storage,addEventListener:(type,cb)=>(windowListeners[type]??=[]).push(cb)};
  globalThis.setInterval=()=>0;
  globalThis.FormData=class{*[Symbol.iterator](){yield ['identifier','test'];yield ['password','fixture-password'];}};
  const state={...emptyState(),me:{id:'test',name:'Test',role:'owner'},access:{master:true},stores:[{id:'A',name:'Outlet A'},{id:'B',name:'Outlet B'}],suppliers:[]};
  let loginCalls=0,readCalls=0,refreshCalls=0,networkFails=scenario==='network-retry';
  let loginResolve,readResolve;
  const reply=(value,status=200)=>new Response(JSON.stringify(value),{status});
  globalThis.fetch=async(target,options)=>{
    if(target==='/api/pos-config')return reply({configured:true,url,key:'fixture'});
    if(target==='/api/pos-login'){loginCalls++;return new Promise(resolve=>loginResolve=()=>resolve(reply(data)));}
    if(target.endsWith('/auth/v1/token?grant_type=refresh_token')){
      refreshCalls++;
      return scenario==='invalid'?reply({error:'invalid token'},400):reply({...data,access_token:'access-new',refresh_token:'refresh-new'});
    }
    if(target===url+'/rest/v1/rpc/pos_read'){
      readCalls++;
      if(networkFails)throw Error('Jaringan terputus');
      if(scenario==='unauthorized-retry'&&options.headers.Authorization==='Bearer access-old')return reply({message:'expired'},401);
      if(scenario==='login-progress')return new Promise(resolve=>readResolve=()=>resolve(reply(state)));
      return reply(state);
    }
    throw Error('Unexpected request '+target);
  };
  await import('../pos/app.js?auth-fixture');
  if(scenario==='login-progress') {
    assert.match(app.innerHTML,/login-form/);
    const action=form.onsubmit({currentTarget:form,preventDefault(){}});
    assert(button.disabled);assert(!progress.hidden);assert.equal(progressText.textContent,'Memeriksa akun…');
    await form.onsubmit({currentTarget:form,preventDefault(){}});assert.equal(loginCalls,1);
    loginResolve();
    for(let i=0;i<30&&!readResolve;i++)await new Promise(resolve=>setImmediate(resolve));
    assert.equal(progressText.textContent,'Memuat data outlet…');assert(inputs.every(input=>input.readOnly));
    readResolve();await action;
    assert.match(app.innerHTML,/sidebar-header/);assert(manager.read());
    assert(!storage.getItem(manager.storageKey).includes('fixture-password'));
    elements['#logout'].onclick();assert.equal(manager.read(),null);assert.match(app.innerHTML,/login-form/);
  } else if(scenario==='network-retry') {
    assert.match(app.innerHTML,/Sesi masih tersimpan/);assert(manager.read());assert.equal(loginCalls,0);
    networkFails=false;await elements['#auth-retry'].onclick();
    assert.match(app.innerHTML,/Data toko/);assert.equal(loginCalls,0);
  } else if(scenario==='invalid') {
    assert.match(app.innerHTML,/login-form/);assert.match(app.innerHTML,/Sesi sudah berakhir/);
    assert.equal(manager.read(),null);assert.equal(loginCalls,0);
  } else {
    assert.match(app.innerHTML,/Data toko/);assert.match(app.innerHTML,/<option value="B" selected/);
    assert.equal(loginCalls,0,'refresh must not call the password login endpoint');
    if(scenario==='expired'||scenario==='unauthorized-retry'){assert.equal(refreshCalls,1);assert.equal(manager.read().refreshToken,'refresh-new');}
    else assert.equal(refreshCalls,0,'valid session must avoid needless refresh requests');
    if(scenario==='cross-tab-logout') {
      storage.removeItem(manager.storageKey);
      for(const fn of windowListeners.storage||[])fn({key:manager.storageKey,newValue:null});
      assert.match(app.innerHTML,/login-form/);assert.equal(manager.read(),null);
    }
  }
  console.log('PASS app '+scenario);
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionManager} from '../pos/session.mjs';
const url='https://fixture.supabase.co',key='fixture';
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
const data=(suffix='1')=>({access_token:'access-'+suffix,refresh_token:'refresh-'+suffix,expires_in:3600,user:{id:'user-A'},password:'never-store-this'});
const response=(body,status=200)=>new Response(JSON.stringify(body),{status});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(options={}) { return createSessionManager({url,key,storage:storage(),locks:null,...options}); }

test('refresh survives a new page; only tokens, user ID and location are persisted',async()=>{
  const disk=storage();let now=0,calls=0;
  const first=fixture({storage:disk,now:()=>now});const saved=first.save(data());
  first.location(saved.sessionId,'B','reports');
  assert(!disk.getItem(first.storageKey).includes('never-store-this'));
  const next=fixture({storage:disk,now:()=>now,fetcher:async(u,init)=>{
    calls++;assert.equal(u,url+'/auth/v1/token?grant_type=refresh_token');
    assert.deepEqual(JSON.parse(init.body),{refresh_token:'refresh-1'});return response(data('2'));
  }});
  assert.equal(await next.accessToken(saved.sessionId),'access-1');assert.equal(calls,0);
  now=3600000;
  assert.equal(await next.accessToken(saved.sessionId),'access-2');assert.equal(calls,1);
  assert.equal(next.read().store,'B');assert.equal(next.read().view,'reports');
  assert.equal(fixture({storage:disk}).read().refreshToken,'refresh-2');
});

test('parallel requests and tabs share one refresh through Web Locks',async()=>{
  const disk=storage();let now=0,calls=0,chain=Promise.resolve();
  const locks={request(_key,_options,task){const work=chain.then(task);chain=work.catch(()=>{});return work;}};
  const fetcher=async()=>{calls++;return response(data('2'));};
  const a=fixture({storage:disk,now:()=>now,locks,fetcher}),b=fixture({storage:disk,now:()=>now,locks,fetcher});
  const saved=a.save(data());now=3600000;
  assert.deepEqual(await Promise.all([a.accessToken(saved.sessionId),a.accessToken(saved.sessionId),b.accessToken(saved.sessionId)]),['access-2','access-2','access-2']);
  assert.equal(calls,1);
});

test('invalid refresh clears session; network/server failures preserve it for retry',async()=>{
  for(const status of [400,401,403,429,503]) {
    let now=0;const m=fixture({now:()=>now,fetcher:async()=>response({error:'failure'},status)});
    const saved=m.save(data());now=3600000;
    await assert.rejects(m.accessToken(saved.sessionId));
    assert.equal(!!m.read(),![400,401,403].includes(status));
  }
  let now=0;const m=fixture({now:()=>now,fetcher:async()=>{throw Error('network offline');}});
  const saved=m.save(data());now=3600000;
  await assert.rejects(m.accessToken(saved.sessionId),/offline/);assert(m.read());
});

test('a late refresh cannot resurrect logout or replace another account',async()=>{
  for(const replacement of [false,true]){
    let now=0;const reply=deferred(),started=deferred();
    const m=fixture({now:()=>now,fetcher:()=>{started.resolve();return reply.promise;}});
    const saved=m.save(data());now=3600000;
    const request=m.accessToken(saved.sessionId);await started.promise;
    m.clear(saved.sessionId);
    if(replacement)m.save({...data('other'),user:{id:'user-B'}});
    reply.resolve(response(data('late')));
    await assert.rejects(request,error=>error.sessionChanged);
    assert.equal(m.read()?.userId,replacement?'user-B':undefined);
    if(replacement){assert.equal(m.clear(saved.sessionId),false);assert.equal(m.read().accessToken,'access-other');}
  }
});

test('forced token retry uses latest rotated credentials and corrupt storage is ignored',async()=>{
  const disk=storage();let calls=0;
  const m=fixture({storage:disk,fetcher:async()=>{calls++;return response(data('2'));}});
  const saved=m.save(data());
  assert.equal(await m.accessToken(saved.sessionId,{force:true,rejectedToken:'access-1'}),'access-2');
  assert.equal(await m.accessToken(saved.sessionId,{force:true,rejectedToken:'access-1'}),'access-2');assert.equal(calls,1);
  disk.setItem(m.storageKey,'bad-json');assert.equal(m.read(),null);
  disk.setItem(m.storageKey,JSON.stringify({...saved,url:'https://other.supabase.co'}));assert.equal(m.read(),null);
});

test('restricted storage falls back to memory and reports that persistence is unavailable',async()=>{
  const disk={getItem:()=>null,setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
  const m=fixture({storage:disk}),saved=m.save(data());
  assert.equal(m.persistent,false);assert.equal(await m.accessToken(saved.sessionId),'access-1');
  m.clear(saved.sessionId);assert.equal(m.read(),null);
});

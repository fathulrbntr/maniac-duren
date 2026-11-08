import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {WirelessDisplayHost} from '../pos/customer-display-wireless-host.mjs';
import {WirelessDisplayViewer,wirelessState} from '../pos/customer-display-wireless-viewer.mjs';
import {visibleSnapshot} from '../pos/customer-display-channel.mjs';
const handler=createRequire(import.meta.url)('../api/pos-display.js');
const tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
let tasks=[],calls=[],pending=deferred(),status=[];
const host=new WirelessDisplayHost(async p=>{calls.push(p);if(p.p_action==='publish'&&calls.filter(x=>x.p_action==='publish').length===1)return pending.promise;return {status:'waiting'};},{onChange:s=>status.push(s),schedule:fn=>{tasks.push(fn);return 1;},cancel:()=>{}});
host.snapshot={total:100};await host.start('store');host.publish({total:200});host.publish({total:300});
assert.equal(calls.filter(x=>x.p_action==='publish').length,1,'Coalesce while publish is in flight');
pending.resolve({status:'waiting'});await tick();assert.equal(calls.at(-1).p_data.snapshot.total,300);assert.equal(calls.at(-1).p_data.seq,2);
await host.stop();assert.equal(calls.at(-1).p_action,'stop');assert.equal(host.session,null);
// Cancelling while create is still in flight must revoke the eventual session too.
const create=deferred();calls=[];const racing=new WirelessDisplayHost(async p=>{calls.push(p);if(p.p_action==='create')return create.promise;return {status:'closed'};},{schedule:()=>1,cancel:()=>{}});
const start=racing.start('store');await tick();await racing.stop();create.resolve({status:'waiting'});await start;assert.equal(racing.session,null);assert.equal(calls.at(-1).p_action,'stop');assert(!calls.some(x=>x.p_action==='publish'));

let events=[],stored=new Map(),queue=[],apiCalls=[],poll=deferred();
const viewer=new WirelessDisplayViewer({storage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},schedule:fn=>{queue.push(fn);return 1;},cancel:()=>{},onChange:d=>events.push(d),api:async(action,arg)=>{apiCalls.push({action,arg});if(action==='pair')return {status:'pending',token:'a'.repeat(64),verificationCode:'ABCDEF'};if(action==='poll')return poll.promise;return {status:'gone'};}});
viewer.resume();assert.equal(events.at(-1).status,'idle');await viewer.pair('ABCDF-12345');assert.equal(events.at(-1).status,'pending');assert.equal(stored.size,1);
const reading=queue.pop()();viewer.leave();poll.resolve({status:'connected',seq:9,snapshot:{qr:'OLD'}});await reading;assert.equal(events.at(-1).status,'idle','Old responses cannot reattach after disconnect');assert.equal(stored.size,0);
assert(apiCalls.some(x=>x.action==='leave'));
const state=wirelessState({status:'connected',seq:5,serverNow:50000,updatedAt:48000,snapshot:{phase:'payment',qr:{payload:'QR',expiresAt:60000}}},1000);
assert.equal(state.seenAt,-1000);assert.equal(state.snapshot.qr.expiresAt,11000,'QR uses remaining server lifetime despite tablet clock skew');
assert.equal(visibleSnapshot(state,16001),null);
assert.equal(wirelessState({status:'offline'}),null,'Network loss hides QR immediately');

const saved={fetch:globalThis.fetch,url:process.env.POS_SUPABASE_URL,key:process.env.POS_SUPABASE_SERVICE_ROLE_KEY};
try {
 process.env.POS_SUPABASE_URL='https://example.supabase.co';process.env.POS_SUPABASE_SERVICE_ROLE_KEY='SERVER_SECRET';let outbound;
 globalThis.fetch=async(url,options)=>{outbound={url,...options};return {ok:true,json:async()=>({status:'pending',token:'b'.repeat(64),verificationCode:'ABCDEF'})};};
 const request=async(overrides={})=>{const r={headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.code=s;return this;},json(b){this.body=b;return this;}};await handler({method:'POST',headers:{host:'maniacduren.com',origin:'https://maniacduren.com','x-pos-display':'1','x-vercel-forwarded-for':'203.0.113.1'},body:{action:'pair',code:'ABCDE-12345'},...overrides},r);return r;};
 let r=await request();assert.equal(r.code,200);assert.match(r.headers['Cache-Control'],/no-store/);assert(!JSON.stringify(r).includes('SERVER_SECRET'));let args=JSON.parse(outbound.body);assert.equal(args.p_code,'ABCDE12345');assert.match(args.p_bucket,/^[a-f0-9]{64}$/);assert(!outbound.body.includes('203.0.113.1'));assert.equal(outbound.headers.Authorization,'Bearer SERVER_SECRET');
 assert.equal((await request({method:'GET'})).code,405);
 assert.equal((await request({headers:{host:'maniacduren.com',origin:'https://evil.example','x-pos-display':'1'}})).code,403);
 assert.equal((await request({body:{action:'publish',snapshot:{total:1}}})).code,400);
 assert.equal((await request({body:{action:'poll'}})).code,401);
 r=await request({headers:{host:'maniacduren.com','x-pos-display':'1',authorization:'Bearer '+'b'.repeat(64)},body:{action:'poll',p_action:'publish',p_bucket:'evil'}});assert.equal(r.code,200);args=JSON.parse(outbound.body);assert.equal(args.p_action,'poll');assert.equal(args.p_bucket,null);
 globalThis.fetch=async()=>({ok:true,json:async()=>({status:'rate_limited'})});r=await request();assert.equal(r.code,429);assert.equal(r.headers['Retry-After'],'60');
 globalThis.fetch=async()=>{throw Error('secret internal database details');};r=await request();assert.equal(r.code,503);assert(!JSON.stringify(r).includes('secret internal'));
}finally{globalThis.fetch=saved.fetch;if(saved.url===undefined)delete process.env.POS_SUPABASE_URL;else process.env.POS_SUPABASE_URL=saved.url;if(saved.key===undefined)delete process.env.POS_SUPABASE_SERVICE_ROLE_KEY;else process.env.POS_SUPABASE_SERVICE_ROLE_KEY=saved.key;}
console.log('PASS wireless transport: coalescing, cancellation races, viewer token lifecycle, late response rejection, clock skew, API input/origin/rate-limit and secret isolation.');

import assert from 'node:assert/strict';
import {createPageCache,mayApplyPage} from '../pos/page-cache.mjs';
let now=100,calls=[],release=[];
const cache=createPageCache((page,branch)=>{calls.push([page,branch]);return new Promise(resolve=>release.push(resolve))},{now:()=>now,maxAge:20});
const first=cache.load('stock','A'),second=cache.load('employees','A');await Promise.resolve();
assert.equal(calls.length,1);assert.equal(cache.peek('stock','A'),undefined);
const full={revision:'full'};release.shift()(full);assert.equal(await first,full);assert.equal(await second,full);
assert.equal(cache.peek('stock','B'),full);assert.equal(await cache.load('finance','B'),full);assert.equal(calls.length,1);
cache.invalidate();const old=cache.load('stock','A');await Promise.resolve();
cache.invalidate();const sale={revision:'after-sale'};cache.put('orders','A',sale);
release.shift()({revision:'before-sale'});assert.equal(await old,null);assert.equal(cache.peek('orders','A'),sale);
assert.equal(cache.peek('orders','B'),full); // outlet A's service data cannot leak into B.
now+=30;const pending=cache.load('orders','A');await Promise.resolve();cache.reset();release.shift()({private:true});assert.equal(await pending,null);assert.equal(cache.peek('orders','A'),undefined);assert.equal(cache.peek('stock','A'),undefined);
const expected={revision:2,page:'stock',branch:'A'};
assert(mayApplyPage(expected,{...expected,live:true,busy:false}));
for(const changed of [{revision:3},{page:'kitchen'},{branch:'B'},{live:false},{busy:true}])assert(!mayApplyPage(expected,{...expected,live:true,busy:false,...changed}));
console.log('PASS shared reads, instant cached access, stale-response rejection, outlet isolation, mutation invalidation and logout clearing');

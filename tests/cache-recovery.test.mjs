import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {recoverPos} from '../pos-recovery.mjs';
let removed=[],unregistered=[];
const registration=scope=>({scope,unregister:async()=>{unregistered.push(scope);return true}});
const result=await recoverPos({origin:'https://shop.test',serviceWorker:{getRegistrations:async()=>[registration('https://shop.test/pos/'),registration('https://shop.test/menu/')]},cacheStorage:{keys:async()=>['maniac-pos-shell-old','other-app-cache'],delete:async key=>{removed.push(key);return true}}});
assert.deepEqual(unregistered,['https://shop.test/pos/']);assert.deepEqual(removed,['maniac-pos-shell-old']);assert.deepEqual(result,{workers:1,assets:1});
await recoverPos({origin:'https://shop.test'});
await assert.rejects(recoverPos({origin:'https://shop.test',serviceWorker:{getRegistrations:async()=>[{scope:'https://shop.test/pos/',unregister:async()=>false}]}}),/Pemulihan belum/);
const handlers={},deleted=[];let unregisteredWorker=false,skipWaiting=false;
vm.runInNewContext(fs.readFileSync('pos/sw.js','utf8'),{
 self:{addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{skipWaiting=true},registration:{unregister:async()=>{unregisteredWorker=true}}},
 caches:{keys:async()=>['maniac-pos-shell-old','other-app'],delete:async key=>{deleted.push(key);return true}}
});
let installed,activated;
handlers.install({waitUntil:promise=>installed=promise});await installed;
handlers.activate({waitUntil:promise=>activated=promise});await activated;
assert(skipWaiting);assert(unregisteredWorker);assert.deepEqual(deleted,['maniac-pos-shell-old']);assert.equal(handlers.fetch,undefined);
console.log('PASS recovery scope/cache isolation and retirement worker: no fetch interception, no unrelated cache deletion');

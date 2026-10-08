import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {clearOfflineSnapshots,inspectPending,inspectRetries,recoverPos} from '../pos-recovery.mjs';
const {IDBFactory}=await import(process.env.FAKE_IDB_MODULE || 'fake-indexeddb');
const handler=createRequire(import.meta.url)('../api/pos-clean-cache.js');
const name='maniac-pos-offline-v1';
const open=(idb,dbName=name)=>new Promise((resolve,reject)=>{
 const request=idb.open(dbName,1);
 request.onupgradeneeded=()=>request.result.createObjectStore('records');
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
async function seed(idb,rows,dbName=name){
 const db=await open(idb,dbName);
 await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');
  for(const [key,value]of Object.entries(rows))tx.objectStore('records').put(value,key);
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
 });db.close();
}
async function read(idb,dbName=name){
 const db=await open(idb,dbName),values={};
 await new Promise((resolve,reject)=>{const tx=db.transaction('records');const req=tx.objectStore('records').openCursor();
  req.onsuccess=()=>{const cur=req.result;if(cur){values[cur.key]=cur.value;cur.continue();}};
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
 });db.close();return values;
}
const storage=entries=>({length:Object.keys(entries).length,key:i=>Object.keys(entries)[i],getItem:key=>entries[key]??null});
const empty={snapshot:{products:[{id:'fruit'}]},queue:[],syncedAt:'2026-10-07'};
const pending={snapshot:{lots:[{id:'lot'}]},queue:[{id:'pending',status:'pending',envelope:{sale:{id:'pending'}}},{id:'conflict',status:'conflict',envelope:{sale:{id:'conflict'}}}],syncedAt:null};
const retries={'maniac-pos-pending-operation-v1:account':JSON.stringify({id:'retry',action:'sale'}),'other-key':'preserve'};
const noDB=new IDBFactory();assert.equal((await clearOfflineSnapshots(noDB)).checked,true);assert.deepEqual(await noDB.databases(),[]);
const noList=new IDBFactory();noList.databases=undefined;
await clearOfflineSnapshots(noList);assert.deepEqual(await IDBFactory.prototype.databases.call(noList),[],'fallback cannot create a new DB');

const idb=new IDBFactory();
const rows={'account:empty':empty,'account:pending':pending,session:{token:'preserve'},device:'device-id'};
await seed(idb,rows);await seed(idb,{other:'unrelated'},'other-app');
const report=await inspectPending({indexedDB:idb,sessionStorage:storage(retries)});
assert.equal(report.pending,2);assert.equal(report.retry.count,1);assert.deepEqual(await read(idb),rows,'inspection is read-only');
const result=await clearOfflineSnapshots(idb);
assert.equal(result.snapshots,1);assert.equal(result.pending,2);assert.equal(result.sessions,0);
assert.deepEqual(await read(idb),{'account:pending':pending,session:{token:'preserve'},device:'device-id'});
assert.deepEqual(await read(idb,'other-app'),{other:'unrelated'});
assert.equal(result.backup[0].account,'account:pending');assert.deepEqual(result.backup[0].queue,pending.queue);
assert(!JSON.stringify(result.backup).includes('token'));
assert.deepEqual(inspectRetries(storage(retries)).retries[0].data,{id:'retry',action:'sale'});
assert.equal((await clearOfflineSnapshots(idb)).pending,2,'repeat cleanup cannot lose pending/conflict records');

const cleanDB=new IDBFactory();await seed(cleanDB,{'account:empty':empty,session:{token:'old'},device:'stable'});
const cleared=await clearOfflineSnapshots(cleanDB);assert.equal(cleared.sessions,1);
assert.deepEqual(await read(cleanDB),{device:'stable'});
const unknownDB=new IDBFactory();const unknown={snapshot:{},queue:[],draft:{id:'keep'}};
await seed(unknownDB,{'account:future':unknown,session:{token:'retain'}});
assert.equal((await clearOfflineSnapshots(unknownDB)).protectedAccounts,1);
assert.deepEqual(await read(unknownDB),{'account:future':unknown,session:{token:'retain'}});

const lockedDB=new IDBFactory();await seed(lockedDB,{'account:empty':empty});
await assert.rejects(recoverPos({origin:'https://pos.test',indexedDB:lockedDB,locks:{request:async(key,options,callback)=>{
 assert.equal(key,'maniac-pos-terminal');assert(options.ifAvailable);return callback(null);
}}}),/POS masih terbuka/);
assert.deepEqual(await read(lockedDB),{'account:empty':empty});
let removed=[];await recoverPos({origin:'https://pos.test',localStorage:{removeItem:key=>removed.push(key)}});
assert.deepEqual(removed,['maniac-pos-demo-v1']);assert.equal(retries['other-key'],'preserve');

function response(){return {headers:{},setHeader(key,value){this.headers[key]=value},status(code){this.code=code;return this},json(value){this.body=value;return this}};}
let res=response();await handler({method:'POST',headers:{'x-pos-cache-reset':'1','sec-fetch-site':'same-origin'}},res);
assert.equal(res.code,200);assert.equal(res.headers['Clear-Site-Data'],'"cache"');assert.equal(res.headers['Cache-Control'],'no-store');
for(const req of [{method:'GET',headers:{}},{method:'POST',headers:{}},{method:'POST',headers:{'x-pos-cache-reset':'1','sec-fetch-site':'cross-site'}}]){
 res=response();await handler(req,res);assert(res.code===403||res.code===405);assert.equal(res.headers['Clear-Site-Data'],undefined);
}
console.log('PASS fresh cleanup: read-only checks, missing DB, empty snapshots, pending/conflict/retry preservation, unknown formats, repeat cleanup, terminal lock, other-app isolation and cache-only HTTP header');

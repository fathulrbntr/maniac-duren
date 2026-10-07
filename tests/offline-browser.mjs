// Real HTTP server + Chromium networking offline. No mocked service worker or IndexedDB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';
import {demoState} from '../pos/core.mjs';
const root=path.resolve('.'),state=demoState();
for(const l of state.lots)l.quality='ready';
Object.assign(state,{offlineSyncVersion:21,opsVersion:9,orderStockVersion:12,orderRoutingVersion:13,orderPaymentVersion:12,orders:[],events:[],money:[],people:[],journal:[],attendance:[],workHours:[],me:{id:'owner',name:'Owner Test',role:'owner'},employees:[],access:Object.fromEntries(['sell','kitchen','stock','produce','waste','reports','finance','trace','employees','attendance','master','cancel'].map(x=>[x,true]))});
state.products.push({id:'water',name:'Air Mineral',sku:'AIR',barcode:'0899000000001',itemType:'direct',stockUnit:'pcs',salePrice:5000});
state.unitLots=[{id:'water-lot',productId:'water',storeId:'depok',qty:10,date:'2026-01-01'}];
let syncCalls=0,commits=0,loseResponse=false,conflict=false,expire=false;
const acknowledged=new Map();
let origin;
const server=http.createServer(async(req,res)=>{
 let raw='';for await(const part of req)raw+=part;
 const body=raw?JSON.parse(raw):null;
 const url=new URL(req.url,origin);
 const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 if(url.pathname==='/api/pos-config')return json({configured:true,url:origin,key:'public-test'});
 if(url.pathname==='/api/pos-login')return json({access_token:'fixture',refresh_token:'refresh',expires_in:3600,user:{id:'owner'}});
 if(url.pathname==='/rest/v1/rpc/pos_read')return expire?json({message:'JWT expired'},401):json(state);
 if(url.pathname==='/rest/v1/rpc/pos_sync_order'){
  syncCalls++;
  const envelope=body.payload,p=envelope.sale;
  if(expire)return json({message:'JWT expired'},401);
  if(conflict)return json({message:'Stok kurang: Air Mineral'},400);
  if(!acknowledged.has(p.id)){
   commits++;acknowledged.set(p.id,envelope);
   state.unitLots[0].qty-=p.lines.filter(l=>l.productId==='water').reduce((a,l)=>a+l.qty,0);
   state.orders.unshift({id:p.id,store_id:p.storeId,business_date:p.date,paid_date:p.date,created_at:envelope.clientCreatedAt,status:'paid',payment_status:'paid',payment:p.payment,paid:p.paid,total:p.lines.reduce((a,l)=>a+l.qty*l.price,0),lines:p.lines.map(l=>({...l,name:state.products.find(p=>p.id===l.productId).name,unit:'pcs',itemType:'direct'})),note:p.note,consumption:[],reserved:{}});
  }else assert.deepEqual(envelope,acknowledged.get(p.id));
  if(loseResponse){loseResponse=false;req.socket.destroy();return;}
  return json(state);
 }
 if(url.pathname==='/rest/v1/rpc/pos_mutate')return json(state);
 let file=path.join(root,url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 try{
  const ext=path.extname(file);res.writeHead(200,{'Content-Type':({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'})[ext]||'application/octet-stream'});res.end(fs.readFileSync(file));
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--disable-gpu']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',err=>errors.push(err.message));
 await page.goto(origin+'/pos/');await page.locator('#login-form').waitFor();
 await page.locator('[name=identifier]').fill('owner');await page.locator('[name=password]').fill('password');await page.locator('#login-form button').click();
 await page.locator('#save-order').waitFor();
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const cacheKeys=await page.evaluate(async()=>{const all=[];for(const k of await caches.keys())for(const r of await(await caches.open(k)).keys())all.push(r.url);return all;});
 assert(cacheKeys.length>25);assert(!cacheKeys.some(k=>k.includes('/api/')||k.includes('/rest/')));
 const buy=async()=>{
  await page.locator('#order-search').fill('0899000000001');await page.locator('#order-search').press('Enter');
  await page.locator('#save-order').click();await page.locator('dialog [type=submit]').click();
  await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 };
 const until=async check=>{const end=Date.now()+20000;while(!await check()){if(Date.now()>end)throw Error('Timed out waiting for persistent queue');await new Promise(r=>setTimeout(r,100));}};
 const queue=()=>page.evaluate(async()=>{const m=await import('/pos/offline.mjs?v=28');return(await new m.OfflinePOS(location.origin+':owner').bundle()).queue;});
 await context.setOffline(true);await buy();await buy();
 assert.equal((await queue()).length,2);assert.equal(commits,0);
 await page.reload();await page.locator('#save-order').waitFor();assert.equal((await queue()).length,2);
 assert((await page.locator('#sync-status').innerText()).includes('2 transaksi'));
 await page.locator('[data-op=order_receipt]').first().click();assert((await page.locator('.receipt-print').innerText()).includes('BELUM TERSINKRON'));await page.locator('dialog .close').first().click();
 await page.locator('#logout').click();assert(await page.locator('#save-order').isVisible());
 // Another tab must not sell against the same offline balances.
 const second=await context.newPage();await second.goto(origin+'/pos/');await second.locator('#login-form').waitFor();assert((await second.locator('#login-error').innerText()).includes('tab lain'));await second.close();
 await context.setOffline(false);await until(async()=>(await queue()).length===0);
 assert.equal(commits,2);assert.equal(state.unitLots[0].qty,8);
 // Server commits then TCP response disappears. Same ID is replayed, once.
 loseResponse=true;await buy();assert.equal(commits,3);
 await page.reload();await page.locator('#save-order').waitFor();
 await until(async()=>(await queue()).length===0);
 assert.equal(commits,3);assert.equal(state.unitLots[0].qty,7);assert(syncCalls>=4);
 conflict=true;await buy();assert.equal((await queue())[0].status,'conflict');
 await page.locator('#sync-status').click();assert((await page.locator('dialog').innerText()).includes('Stok kurang'));
 conflict=false;await page.locator('#retry-sync').click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert.equal((await queue()).length,0);assert.equal(commits,4);
 // Pending payment survives expiration, then resumes with same actor after login.
 await context.setOffline(true);await buy();expire=true;await context.setOffline(false);
 await page.locator('#login-form').waitFor({timeout:20000});assert.equal((await queue()).length,1);
 expire=false;await page.locator('[name=identifier]').fill('owner');await page.locator('[name=password]').fill('password');await page.locator('#login-form button').click();await page.locator('#save-order').waitFor();
 await until(async()=>(await queue()).length===0);
 assert.equal(commits,5);
 // IDB write abort must not be reported as a successful payment.
 await page.evaluate(()=>{window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){if(key?.startsWith('account:')&&value.queue?.length)throw new DOMException('Storage full','QuotaExceededError');return window.originalPut.call(this,value,key);};});
 await page.locator('[data-order-add=water]').click();await page.locator('#save-order').click();await page.locator('dialog [type=submit]').click();
 await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Storage full'));
 assert(await page.locator('dialog[open]').isVisible());assert.equal(commits,5);
 await page.evaluate(()=>{IDBObjectStore.prototype.put=window.originalPut;});await page.locator('dialog .close').first().click();
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'offline-pos-mobile.png')});}
 assert.deepEqual(errors,[]);
 console.log('PASS real browser: PWA precache, barcode, offline checkout/reload, duplicate-tab lock, reconnect, lost-response replay, conflict retry, expired-session recovery, storage failure, mobile layout.');
}finally{await browser.close();await new Promise(r=>server.close(r));}

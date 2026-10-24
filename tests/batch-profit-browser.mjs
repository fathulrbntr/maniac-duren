import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {fixture} from './stock-demo-fixture.mjs';
import {createStockDemo} from '../pos/stock-demo.mjs';
import {batchMetricsFixture} from './batch-metrics-fixture.mjs';
const state={...createStockDemo(fixture().state),...batchMetricsFixture()};delete state.stockDemo;
Object.assign(state.products[0],{priceKg:100000,pricePiece:300000});
for(const p of state.products.slice(1))p.salePrice=({coral:80000,durpas1:90000,durpas05:45000})[p.id];
let reads=0,offline=false,holdRead=false,releaseRead=null,onHold=null;
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],mutations=[];
 page.on('pageerror',e=>errors.push(e.message));await page.clock.install();
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url()),reply=json=>route.fulfill({json});
  if(u.pathname==='/api/pos-config')return reply({configured:true,url:'https://test.invalid/backend',key:'fixture'});
  if(u.pathname==='/api/pos-login')return reply({access_token:'fixture',refresh_token:'fixture',expires_in:3600,user:{id:state.me.id}});
  if(u.pathname.endsWith('/pos_read')){reads++;if(holdRead){holdRead=false;const snapshot=structuredClone(state);await new Promise(resolve=>{releaseRead=resolve;onHold?.();});releaseRead=null;return reply(snapshot);}return offline?route.fulfill({status:503,json:{message:'Offline fixture'}}):reply(state);}
  if(u.pathname.includes('/rpc/')){mutations.push(u.pathname);return route.fulfill({status:400,json:{message:'Unexpected write'}});}
  const file=path.join(process.cwd(),u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname);
  if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/png'});
 });
 await page.goto('https://test.invalid/pos/');await page.locator('[name=identifier]').fill('owner');await page.locator('[name=password]').fill('fixture');await page.locator('#login-form [type=submit]').click();
 await page.locator('nav [data-view=reports]').click();await page.locator('[data-report-tab=batches]').click();
 await page.locator('#batch-supplier').selectOption('sup');await page.locator('#batch-from').fill('2026-10-21');await page.locator('#batch-search').fill('Monthong');
 assert.match(await page.locator('[data-batch-profit=total-realized]').innerText(),/1\.693\.440/);
 await page.locator('[data-batch-detail=original]').click();const dialog=page.locator('dialog[open]');
 assert.match(await dialog.locator('[data-batch-profit=realized]').innerText(),/1\.693\.440/);
 assert.match(await dialog.locator('[data-batch-profit=projected]').innerText(),/7\.160\.000/);
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');await dialog.locator('.batch-profit').scrollIntoViewIfNeeded();await page.screenshot({path:'../batch-profit-088-dark.png'});
 // A second device sells stock. The shipped 5-second timer must update the open
 // detail, summary, quantities and subsequent exports without resetting filters.
 state.lots[0].kg-=10;state.sales.push({id:'next',date:'2026-10-24',storeId:'a',total:1000000,paid:1000000,payment:'Tunai',lines:[{lotId:'original',productId:'fruit',supplierId:'sup',unit:'KG',qty:10,kg:10,pieces:4,price:100000,total:1000000}]});
 const priorReads=reads,scroll=await dialog.evaluate(d=>d.scrollTop);await page.clock.runFor(5100);
 await page.waitForFunction(()=>document.querySelector('dialog[open] [data-batch-profit=realized]')?.textContent.includes('2.253.440'));
 assert(reads>priorReads);assert.equal(await page.locator('#batch-search').inputValue(),'Monthong');assert.equal(await page.locator('#batch-supplier').inputValue(),'sup');assert.equal(await page.locator('#batch-from').inputValue(),'2026-10-21');assert(Math.abs(await dialog.evaluate(d=>d.scrollTop)-scroll)<3);
 assert.match(await dialog.locator('[data-batch-profit=capital]').innerText(),/20\.229\.440/);assert.match(await dialog.locator('[data-batch-ratio=whole_stock] b').innerText(),/59,76 kg/);
 assert.match(await dialog.locator('[data-batch-profit=projected]').innerText(),/7\.160\.000/);
 offline=true;await page.clock.runFor(5100);await page.waitForFunction(()=>document.querySelector('.batch-sync')?.textContent.includes('Koneksi terputus'));assert.match(await dialog.locator('[data-batch-profit=realized]').innerText(),/2\.253\.440/);
 offline=false;await page.clock.runFor(5100);await page.waitForFunction(()=>document.querySelector('.batch-sync')?.textContent.includes('Diperbarui'));
 for(const width of [390,360]){await page.setViewportSize({width,height:844});await page.evaluate(()=>document.documentElement.dataset.theme='light');await dialog.locator('[data-batch-profit=realized]').scrollIntoViewIfNeeded();assert(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth+1),`dialog overflow at ${width}`);}
 await page.setViewportSize({width:390,height:844});await dialog.locator('[data-batch-profit=realized]').scrollIntoViewIfNeeded();await page.screenshot({path:'../batch-profit-088-mobile.png'});
 await dialog.locator('[type=submit]').click();await page.setViewportSize({width:1600,height:1000});await page.locator('#report-refresh').click();assert.equal(await page.locator('#batch-search').inputValue(),'Monthong');
 const downloadWait=page.waitForEvent('download');await page.locator('#report-excel').click();const download=await downloadWait,bytes=fs.readFileSync(await download.path());assert(bytes.includes(Buffer.from('Laba rugi batch')));assert(bytes.includes(Buffer.from('<v>2253440</v>')));
 const popupWait=page.waitForEvent('popup');await page.locator('#report-pdf').click();const print=await popupWait;await print.waitForLoadState('domcontentloaded');assert.match(await print.locator('body').innerText(),/Laba rugi batch/);await print.close();
 // A slow poll started before a manual refresh must not overwrite newer data.
 const heldStarted=new Promise(resolve=>onHold=resolve);holdRead=true;await page.bringToFront();await page.clock.runFor(5100);await heldStarted;assert(releaseRead);
 state.lots[0].kg-=1;state.sales.push({id:'newest',date:'2026-10-24',storeId:'a',total:100000,lines:[{lotId:'original',productId:'fruit',kg:1,pieces:1,total:100000}]});
 await page.locator('#batch-refresh').click();await page.waitForFunction(()=>document.querySelector('[data-batch-profit=total-realized]')?.textContent.includes('2.309.440'));
 const slowResponse=page.waitForResponse(r=>r.url().endsWith('/pos_read'));releaseRead();await (await slowResponse).finished();await page.clock.runFor(100);
 assert.match(await page.locator('[data-batch-profit=total-realized]').innerText(),/2\.309\.440/);
 await page.locator('[data-batch-detail=original]').click();
 state.products[0].priceKg=null;await page.clock.runFor(5100);await page.waitForFunction(()=>document.querySelector('dialog[open] [data-batch-profit=projected]')?.textContent.includes('Belum lengkap'));assert.match(await dialog.innerText(),/harga per butir tidak digunakan/);
 for(const sale of state.sales)for(const line of sale.lines)line.total=0;
 await page.clock.runFor(5100);await page.waitForFunction(()=>!!document.querySelector('dialog[open] [data-batch-profit=realized] .negative'));assert.match(await dialog.locator('[data-batch-profit=realized]').innerText(),/Rugi/);
 state.access.finance=false;await page.clock.runFor(5100);await page.waitForFunction(()=>!document.querySelector('dialog[open] [data-batch-profit]'));assert.equal(await page.locator('[data-batch-profit]').count(),0);assert.equal(await dialog.locator('[data-batch-unit-cost]').count(),0);assert.equal(await dialog.locator('[data-batch-ratio]').count(),6);
 await dialog.locator('[type=submit]').click();await page.locator('[data-report-tab=summary]').click();const stopped=reads;await page.clock.runFor(5100);assert.equal(reads,stopped,'batch polling stops after leaving its tab');
 await page.locator('#logout').click();await page.clock.runFor(5100);assert.equal(reads,stopped,'polling stops after logout');
 assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);
 console.log('PASS batch profit browser: real polling, open detail/scroll/filter preservation, live exports, offline recovery, missing price, loss, revoked finance access, timer lifecycle, mobile/dark/light, no database writes');
}finally{await browser.close();}

import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {chromium} from 'playwright';
import {fixture} from './stock-demo-fixture.mjs';
import {createStockDemo} from '../pos/stock-demo.mjs';
import {batchMetricsFixture} from './batch-metrics-fixture.mjs';
const state={...createStockDemo(fixture().state),...batchMetricsFixture()};delete state.stockDemo;
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],mutations=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url()),reply=json=>route.fulfill({json});
  if(u.pathname==='/api/pos-config')return reply({configured:true,url:'https://test.invalid/backend',key:'fixture'});
  if(u.pathname==='/api/pos-login')return reply({access_token:'fixture',refresh_token:'fixture',expires_in:3600,user:{id:state.me.id}});
  if(u.pathname.endsWith('/pos_read'))return reply(state);
  if(u.pathname.includes('/rpc/')){mutations.push(u.pathname);return route.fulfill({status:400,json:{message:'Unexpected write'}});}
  const file=path.join(process.cwd(),u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname);
  if(!fs.existsSync(file))return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(file),contentType:/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/png'});
 });
 await page.goto('https://test.invalid/pos/');await page.locator('[name=identifier]').fill('owner');await page.locator('[name=password]').fill('fixture');await page.locator('#login-form [type=submit]').click();
 await page.locator('nav [data-view=reports]').click();await page.locator('[data-report-tab=batches]').click();await page.locator('[data-batch-detail=original]').click();
 const dialog=page.locator('dialog[open]');
 for(const [key,expected] of [['whole_stock','13,95%'],['whole_sold','6,05%'],['processed','80,00%'],['output','45,40%'],['skin','34,60%'],['reject','80,00%']])assert.equal(await dialog.locator(`[data-batch-ratio=${key}] strong`).innerText(),expected);
 assert.match(await dialog.locator('.batch-yield').innerText(),/56,75% hasil/);assert.match(await dialog.locator('.batch-yield').innerText(),/43,25% kulit/);
 assert.match(await dialog.locator('[data-batch-unit-cost=out-durpas1]').innerText(),/77\.533,04.*pcs/);assert.match(await dialog.locator('[data-batch-unit-cost=out-durpas05]').innerText(),/38\.766,52.*pcs/);assert.match(await dialog.locator('[data-batch-unit-cost=out-coral]').innerText(),/77\.533,04.*kg/);
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');await dialog.locator('.batch-ratios').scrollIntoViewIfNeeded();await page.screenshot({path:'../batch-ratios-087-dark.png'});
 await dialog.locator('[data-batch-unit-cost=out-durpas05]').scrollIntoViewIfNeeded();await page.screenshot({path:'../batch-costs-087-desktop.png'});
 for(const width of [390,360]){await page.setViewportSize({width,height:844});await dialog.locator('.batch-ratios').scrollIntoViewIfNeeded();assert(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth+1),`dialog overflow ${width}`);assert.equal(await dialog.locator('[data-batch-ratio]').count(),6);}
 await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.setViewportSize({width:390,height:844});await dialog.locator('[data-batch-ratio=processed]').scrollIntoViewIfNeeded();await page.screenshot({path:'../batch-ratios-087-mobile.png'});await dialog.locator('[type=submit]').click();
 await page.setViewportSize({width:1600,height:1000});const downloaded=page.waitForEvent('download');await page.locator('#report-excel').click();const download=await downloaded;const bytes=fs.readFileSync(await download.path());assert(bytes.includes(Buffer.from('Rasio batch')));assert(bytes.includes(Buffer.from('<v>34.6</v>')));assert(bytes.includes(Buffer.from('Modal per satuan produk')));
 const popupWait=page.waitForEvent('popup');await page.locator('#report-pdf').click();const print=await popupWait;await print.waitForLoadState('domcontentloaded');assert.match(await print.locator('body').innerText(),/Rasio batch/);assert.match(await print.locator('body').innerText(),/Modal per satuan produk/);await print.close();
 // Restricted staff can inspect physical ratios but no unit-cost column.
 await page.locator('#logout').click();state.me.role='kitchen';state.access={trace:true,waste:true,finance:false,kitchen:true};await page.locator('[name=identifier]').fill('kitchen');await page.locator('[name=password]').fill('fixture');await page.locator('#login-form [type=submit]').click();await page.locator('nav [data-view=reports]').click();await page.locator('[data-report-tab=batches]').click();await page.locator('[data-batch-detail=original]').click();assert.equal(await page.locator('dialog[open] [data-batch-ratio]').count(),6);assert.equal(await page.locator('dialog[open] [data-batch-unit-cost]').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);console.log('PASS batch metrics browser: shipped modal, six physical ratios, yield basis, pcs/kg costs, role restriction, Excel/PDF, desktop/mobile and dark/light; no database writes');
}finally{await browser.close();}

import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {chromium} from 'playwright';
import {fixture} from './stock-demo-fixture.mjs';
import {createStockDemo} from '../pos/stock-demo.mjs';
import {rejectReportFixture} from './reject-report-fixture.mjs';
const state={...createStockDemo(fixture().state),...rejectReportFixture()};delete state.stockDemo;
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
 await page.locator('nav [data-view=reports]').click();await page.locator('[data-report-tab=stock]').click();
 await page.locator('#report-from').fill('2026-10-01');await page.locator('#report-to').fill('2026-10-31');await page.locator('#report-to').press('Tab');
 const row=page.locator('#report-result > section table tbody tr').filter({hasText:'Durian Monthong'});
 assert.equal(await row.locator('td').nth(3).innerText(),'500');assert.equal(await row.locator('td').nth(4).innerText(),'30,24');assert.equal(await row.locator('td').nth(5).innerText(),'400');assert.equal(await row.locator('td').nth(10).innerText(),'69,76');
 await page.locator('#report-result details summary').click();assert.equal(await page.getByText('Ditandai reject (stok asal)',{exact:true}).count(),1);assert.equal(await page.getByText('Reject dipakai untuk olahan',{exact:true}).count(),1);assert.equal(await page.getByText('Hasil olahan reject',{exact:true}).count(),3);
 await page.screenshot({path:'../reject-report-086-desktop.png',fullPage:true});
 const downloaded=page.waitForEvent('download');await page.locator('#report-excel').click();const download=await downloaded;const bytes=fs.readFileSync(await download.path());assert(bytes.includes(Buffer.from('<v>400</v>')));assert(!bytes.includes(Buffer.from('<v>800</v>')));
 const popupWait=page.waitForEvent('popup');await page.locator('#report-pdf').click();const print=await popupWait;await print.waitForLoadState('domcontentloaded');assert.match(await print.locator('body').innerText(),/Reject dipakai untuk olahan/);assert.equal(await print.locator('td').filter({hasText:/^800$/}).count(),0);await print.close();
 for(const width of [390,360]){await page.setViewportSize({width,height:844});await page.keyboard.press('Escape');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${width}`);}
 assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);console.log('PASS reject report browser: shipped app, 400 kg single count, 69.76 kg balance, 11 journal rows with stages, Excel/PDF corrected, desktop/mobile, no mutation RPCs');
}finally{await browser.close();}

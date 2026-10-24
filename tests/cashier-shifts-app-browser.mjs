// Exercises the shipped entry point and its real RPC routing with a local backend fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {fixture} from './stock-demo-fixture.mjs';
import {createStockDemo,applyStockDemoAction as apply} from '../pos/stock-demo.mjs';
import {readShiftsDemo} from '../pos/cashier-shifts.mjs';
const f=fixture();f.state.access={...f.state.access,reports:true,finance:true};let state=createStockDemo(f.state);
const live=()=>{const value=structuredClone(state);delete value.stockDemo;return value;};
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],calls=[];page.on('pageerror',x=>errors.push(x.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',async r=>{
  const u=new URL(r.request().url()),reply=json=>r.fulfill({json});
  if(u.pathname==='/api/pos-config')return reply({configured:true,url:'https://test.invalid/backend',key:'fixture'});
  if(u.pathname==='/api/pos-login')return reply({access_token:'fixture',refresh_token:'fixture',expires_in:3600,user:{id:state.me.id}});
  if(u.pathname.endsWith('/pos_read'))return reply(live());
  if(u.pathname.endsWith('/pos_cashier_shifts_read')){calls.push('read');return reply(readShiftsDemo(state,r.request().postDataJSON().filters));}
  if(u.pathname.endsWith('/pos_cashier_shift_mutate')){const {action,payload}=r.request().postDataJSON();calls.push(action);state=apply(state,action,payload);return reply(live());}
  const file=path.join(process.cwd(),u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname);
  if(!fs.existsSync(file))return r.fulfill({status:404,body:''});
  return r.fulfill({body:fs.readFileSync(file),contentType:/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/png'});
 });
 await page.goto('https://test.invalid/pos/');await page.locator('[name=identifier]').fill('owner');await page.locator('[name=password]').fill('fixture');await page.locator('#login-form [type=submit]').click();
 await page.locator('nav [data-view=shifts]').click();await page.locator('[data-shift-open]').click();await page.locator('[name=openingCash]').fill('50000');await page.locator('dialog[open] [type=submit]').click();await page.locator('.shift-card').waitFor();
 assert(calls.includes('cashier_shift_open'));await page.locator('nav [data-view=orders]').click();assert.match(await page.locator('.shift-banner').innerText(),/Kasir buka/);
 await page.reload();await page.locator('nav [data-view=orders]').waitFor();await page.locator('nav [data-view=orders]').click();assert.match(await page.locator('.shift-banner').innerText(),/Kasir buka/);
 await page.locator('.shift-banner [data-shift-close]').click();await page.locator('[name=closingCash]').fill('50000');await page.locator('dialog[open] [type=submit]').click();await page.locator('[data-shift-open]').waitFor();assert(calls.includes('cashier_shift_close'));
 await page.locator('#logout').click();await page.locator('#login-form').waitFor();assert.deepEqual(errors,[]);
 console.log('PASS app browser: real entry point, login, navigation, dedicated shift RPCs, checkout banner, persisted shift after reload, close and logout');
}finally{await browser.close();}

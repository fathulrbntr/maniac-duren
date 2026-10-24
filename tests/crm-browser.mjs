import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {fixture} from './stock-demo-fixture.mjs';
import {createStockDemo,applyStockDemoAction as apply} from '../pos/stock-demo.mjs';
import {readCrmDemo} from '../pos/crm.mjs';
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
  if(u.pathname.endsWith('/pos_crm_read'))return reply(readCrmDemo(state,r.request().postDataJSON()));
  if(u.pathname.endsWith('/pos_read'))return reply(live());
  if(u.pathname.endsWith('/pos_cashier_shifts_read'))return reply(readShiftsDemo(state,r.request().postDataJSON().filters));
  if(u.pathname.endsWith('/pos_payment_settings_save')){const {payload}=r.request().postDataJSON();calls.push('payment_settings_save');state=apply(state,'payment_settings_save',payload);return reply(live());}
  if(u.pathname.endsWith('/pos_cashier_shift_mutate')||u.pathname.endsWith('/pos_mutate_027')){const {action,payload}=r.request().postDataJSON();calls.push(action);state=apply(state,action,payload);return reply(live());}
  const file=path.join(process.cwd(),u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname);
  if(!fs.existsSync(file))return r.fulfill({status:404,body:''});
  return r.fulfill({body:fs.readFileSync(file),contentType:/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/png'});
 });
 await page.goto('https://test.invalid/pos/');await page.locator('[name=identifier]').fill('owner');await page.locator('[name=password]').fill('fixture');await page.locator('#login-form [type=submit]').click();
 await page.locator('nav [data-view=crm]').click();await page.locator('#crm-members').getByText('Belum ada member yang sesuai.').waitFor();
 await page.locator('[data-crm-tab=rules]').click();await page.locator(`[data-point-rule="${f.water.id}"]`).click();await page.locator('dialog[open] [name=points]').fill('5');await page.locator('dialog[open] [name=stepQty]').fill('1');await page.locator('dialog[open] [type=submit]').click();
 assert.equal(state.pointRules[0].points,5);
 await page.locator('nav [data-view=orders]').click();await page.evaluate(async()=>{const mod=await import('/pos/device-settings.mjs?v=58');const settings=mod.readDeviceSettings();settings.printer.autoPrint=false;mod.saveDeviceSettings(settings);});
 await page.locator('[data-shift-open]').click();await page.locator('[name=openingCash]').fill('0');await page.locator('dialog[open] [type=submit]').click();
 await page.locator(`[data-menu-key="product:${f.water.id}"]`).click();
 await page.locator('[data-member-search]').fill('Nadia');await page.locator('[data-member-find]').click();await page.locator('[data-member-results]').getByText('Belum ditemukan.',{exact:false}).waitFor();
 await page.locator('[data-member-new]').click();assert.equal(await page.locator('dialog[open] [name=waOptIn]').isChecked(),false);
 await page.locator('dialog[open] [name=name]').fill('Nadia <Test>');await page.locator('dialog[open] [name=phone]').fill('081234567890');await page.locator('dialog[open] [name=email]').fill('nadia@example.com');await page.locator('dialog[open] [name=waOptIn]').check();
 await page.screenshot({path:'../crm-member-modal.png'});await page.locator('dialog[open] [type=submit]').click();await page.locator('[data-member-selected]').waitFor();
 assert.match(await page.locator('[data-member-points]').innerText(),/5 poin/);assert.equal(await page.locator('[data-member-selected] test').count(),0);
 await page.locator('#save-order').click();assert.match(await page.locator('dialog[open]').innerText(),/Member: Nadia <Test>/);await page.locator('dialog[open] [type=submit]').click();await page.locator('dialog[open] [type=submit]').click();
 await page.locator('#result-receipt').click();assert.match(await page.locator('.receipt-print').innerText(),/Member: Nadia <Test>/);assert.match(await page.locator('.receipt-print').innerText(),/Poin diperoleh: 5/);await page.locator('dialog[open] [type=submit]').click();
 assert.equal(state.orders[0].pointsEarned,5);assert.equal(calls.filter(x=>x==='crm_member_save').length,1);
 // Empty optional field permits guest checkout, while lookup finds the stored member.
 await page.locator('[data-member-search]').fill('081234567890');await page.locator('[data-member-find]').click();await page.locator('[data-pick-member]').click();assert.match(await page.locator('[data-member-selected]').innerText(),/Saldo 5 poin/);await page.locator('[data-member-clear]').click();
 await page.locator(`[data-menu-key="product:${f.water.id}"]`).click();await page.locator('#save-order').click();await page.locator('dialog[open] [type=submit]').click();await page.locator('dialog[open] [type=submit]').click();await page.locator('dialog[open] [type=submit]').click();assert.equal(state.orders[1].customer,null);
 await page.locator('nav [data-view=crm]').click();await page.locator('[data-member-detail]').waitFor();
 for(const width of [360,390,1440]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`CRM overflow ${width}`);}
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.screenshot({path:'../crm-desktop.png',fullPage:true});
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:'../crm-dark.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.keyboard.press('Escape');await page.locator('#pos-sidebar[aria-hidden=true]').waitFor();await page.screenshot({path:'../crm-mobile.png',fullPage:true,animations:'disabled'});await page.setViewportSize({width:1440,height:1000});
 await page.locator('[data-member-detail]').click();await page.locator('[data-member-history]').getByText('Pembelian',{exact:false}).waitFor();assert.match(await page.locator('dialog[open]').innerText(),/5 poin/);assert.match(await page.locator('[data-member-history]').innerText(),/Air mineral: 1 pcs → 5 poin/);await page.locator('dialog[open] [type=submit]').click();
 await page.locator('[data-crm-tab=whatsapp]').click();const download=page.waitForEvent('download');await page.locator('#crm-export').click();const dl=await download;const csv=fs.readFileSync(await dl.path(),'utf8');assert.match(csv,/6281234567890/);assert.match(csv,/Nadia <Test>/);assert.match(await page.locator('[data-export-status]').innerText(),/1 kontak/);
 await page.locator('[data-crm-tab=members]').click();await page.locator('[data-member-detail]').click();await page.locator('[data-member-edit]').click();await page.locator('dialog[open] [name=waOptIn]').uncheck();await page.locator('dialog[open] [type=submit]').click();await page.locator('[data-crm-tab=whatsapp]').click();await page.locator('#crm-export').click();await page.locator('[data-export-status]').getByText('Belum ada member aktif',{exact:false}).waitFor();
 await page.reload();await page.locator('nav [data-view=crm]').click();await page.locator('[data-member-detail]').waitFor();assert.equal(state.members[0].waOptIn,false);assert.equal(state.pointLedger.length,1);
 await page.locator('#logout').click();state.me.role='cashier';state.access={sell:true};await page.locator('[name=identifier]').fill('cashier');await page.locator('[name=password]').fill('fixture');await page.locator('#login-form [type=submit]').click();await page.locator('nav [data-view=orders]').waitFor();assert.equal(await page.locator('nav [data-view=crm]').count(),0);await page.locator('nav [data-view=orders]').click();await page.locator('[data-member-search]').waitFor();
 assert.deepEqual(errors,[]);console.log('PASS CRM browser: shipped app, owner product rule, optional member, new-member modal, no default consent, lookup, guest checkout, earned points/receipt, history, eligible export/opt-out, reload, role visibility, desktop/mobile and dark/light');
}finally{await browser.close();}

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
  if(u.pathname.endsWith('/pos_cashier_shifts_read'))return reply(readShiftsDemo(state,r.request().postDataJSON().filters));
  if(u.pathname.endsWith('/pos_payment_settings_save')){const {payload}=r.request().postDataJSON();calls.push('payment_settings_save');state=apply(state,'payment_settings_save',payload);return reply(live());}
  if(u.pathname.endsWith('/pos_cashier_shift_mutate')||u.pathname.endsWith('/pos_mutate_027')){const {action,payload}=r.request().postDataJSON();calls.push(action);state=apply(state,action,payload);return reply(live());}
  const file=path.join(process.cwd(),u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname);
  if(!fs.existsSync(file))return r.fulfill({status:404,body:''});
  return r.fulfill({body:fs.readFileSync(file),contentType:/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/png'});
 });
 await page.goto('https://test.invalid/pos/');await page.locator('[name=identifier]').fill('owner');await page.locator('[name=password]').fill('fixture');await page.locator('#login-form [type=submit]').click();
 await page.locator('nav [data-view=payments]').click();await page.locator('#payment-settings-form').waitFor();
 await page.locator('[data-group=ewallet]').check();await page.locator('[data-group=ecommerce]').check();await page.locator('[data-group=card]').check();await page.locator('[data-group=delivery]').check();
 await page.locator('[data-method=bca]').check();await page.locator('[data-payment-edit=bca]').click();
 await page.locator('dialog[open] [name=accountName]').fill('Pemilik <Toko>');await page.locator('dialog[open] [name=accountNumber]').fill('0012345678');await page.locator('dialog[open] [type=submit]').click();
 assert.match(await page.locator('[data-method-info=bca]').innerText(),/0012345678/);assert.equal(await page.locator('[data-method-info=bca] toko').count(),0);
 await page.locator('#payment-settings-form [type=submit]').click();assert.equal(calls.filter(x=>x==='payment_settings_save').length,1);
 await page.reload();await page.locator('nav [data-view=payments]').click();assert.equal(await page.locator('[data-method=bca]').isChecked(),true);
 assert.equal(state.paymentSettings[0].config.methods.bca.accountNumber,'0012345678');
 for(const width of [360,390,1440]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`settings overflow ${width}`);}
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.screenshot({path:'../payment-settings-desktop.png',fullPage:true});
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:'../payment-settings-dark.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('#pos-sidebar').getAttribute('aria-hidden')==='true');await page.screenshot({path:'../payment-settings-mobile.png',fullPage:false,animations:'disabled'});await page.setViewportSize({width:1440,height:1000});
 // Outlet switch presents independent defaults and returning preserves saved values.
 await page.locator('#active-store').selectOption(f.otherStore);assert.equal(await page.locator('[data-group=ewallet]').isChecked(),false);await page.locator('#active-store').selectOption(f.store);assert.equal(await page.locator('[data-group=ewallet]').isChecked(),true);
 // Prevent disabling every payment method.
 for(const group of ['cash','qris','bank','card','ewallet','ecommerce','delivery'])await page.locator(`[data-group=${group}]`).uncheck();
 await page.locator('#payment-settings-form [type=submit]').click();assert.match(await page.locator('#payment-settings-error').innerText(),/minimal satu/);assert.equal(calls.filter(x=>x==='payment_settings_save').length,1);
 await page.reload();await page.locator('nav [data-view=orders]').click();
 await page.evaluate(async()=>{const {saveDeviceSettings,defaultDeviceSettings}=await import('/pos/device-settings.mjs?v=58');const settings=defaultDeviceSettings();settings.printer.autoPrint=false;saveDeviceSettings(settings);});
 await page.locator('[data-shift-open]').click();await page.locator('[name=openingCash]').fill('50000');await page.locator('dialog[open] [type=submit]').click();
 await page.locator(`[data-menu-key="product:${f.water.id}"]`).click();await page.locator('#save-order').click();
 await page.locator('[name=payment]').selectOption('Transfer BCA');assert.match(await page.locator('[data-payment-info]').innerText(),/0012345678/);
 await page.locator('[name=payment]').selectOption('ShopeePay');assert(await page.locator('[name=paid]').getAttribute('readonly')!==null);
 await page.locator('dialog[open] [type=submit]').click();assert.equal(calls.filter(x=>x==='order_create').length,0,'noncash confirmation required');
 await page.locator('[name=paymentConfirmed]').check();await page.setViewportSize({width:390,height:844});assert(await page.locator('dialog[open]').evaluate(d=>d.scrollWidth<=d.clientWidth+1));await page.screenshot({path:'../payment-checkout-mobile.png',fullPage:true});
 await page.locator('dialog[open] [type=submit]').click();await page.locator('dialog[open] [type=submit]').click();await page.locator('#result-receipt').click();assert.match(await page.locator('.receipt-print').innerText(),/ShopeePay/);assert.match(await page.locator('.receipt-print').innerText(),/Kasir: Owner demo/);await page.locator('dialog[open] [type=submit]').click();
 await page.setViewportSize({width:1440,height:1000});await page.locator('nav [data-view=reports]').click();await page.locator('[data-report-tab=payments]').click();assert.match(await page.locator('#report-result').innerText(),/ShopeePay/);assert.match(await page.locator('#report-result').innerText(),/150.000/);
 await page.locator('nav [data-view=shifts]').click();await page.locator('[data-shift-detail]').first().click();assert.match(await page.locator('dialog[open]').innerText(),/ShopeePay bersih/);assert.match(await page.locator('dialog[open]').innerText(),/50.000/);await page.locator('dialog[open] [type=submit]').click();
 assert.equal(state.orders.length,1);assert.equal(state.orders[0].payment,'ShopeePay');assert.equal(state.cashierShifts[0].summary.expectedCash,50000);assert.deepEqual(errors,[]);
 // Cashier cannot see owner settings in navigation after a fresh session.
 await page.locator('#logout').click();state.me.role='cashier';state.access={sell:true};await page.locator('[name=identifier]').fill('kasir');await page.locator('[name=password]').fill('fixture');await page.locator('#login-form [type=submit]').click();await page.locator('nav [data-view=orders]').waitFor();assert.equal(await page.locator('nav [data-view=payments]').count(),0);
 console.log('PASS browser: shipped app, owner settings RPC, reload, account details escaping/leading zeros, outlet isolation, zero-method prevention, noncash confirmation, receipt, payment report, shift totals, mobile/desktop, dark/light and cashier restriction');
}finally{await browser.close();}

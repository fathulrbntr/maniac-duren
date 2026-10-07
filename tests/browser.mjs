// Browser smoke tests exercise actual shipped modules, login, navigation and employee dialogs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {demoState} from '../pos/core.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',err=>errors.push(err.message));
 const state=demoState();Object.assign(state,{employeeVersion:16,employeeAccountVersion:2,opsVersion:9,orderRoutingVersion:13,orderPaymentVersion:12,orderStockVersion:12,orders:[],events:[],people:[],money:[],journal:[],attendance:[],workHours:[],me:{id:'owner',name:'Owner Test',role:'owner'},employees:[{id:'owner',name:'Owner Test',email:'owner@test.local',phone:'081234567890',username:'owner',user_id:'owner',role:'owner',active:true,store_ids:[],permissions:[]}],access:Object.fromEntries(['sell','kitchen','stock','produce','waste','reports','finance','trace','employees','attendance','master','cancel'].map(x=>[x,true]))});
 let failLogin=true,saves=[];
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url()),reply=json=>route.fulfill({json});
  if(u.pathname==='/api/pos-config')return reply({configured:true,url:'https://test.invalid/backend',key:'public-fixture'});
  if(u.pathname==='/api/pos-login'){const p=route.request().postDataJSON();assert.equal(typeof p.identifier,'string');assert.equal(typeof p.password,'string');return failLogin?route.fulfill({status:401,json:{error:'Login salah'}}):reply({access_token:'fixture',refresh_token:'fixture',expires_in:3600,user:{id:'owner'}});}
  if(u.pathname==='/api/pos-employee'){saves.push(route.request().postDataJSON());return reply({ok:true});}
  if(u.pathname.endsWith('/pos_read'))return reply(state);
  if(u.pathname.endsWith('/pos_account_target'))return reply({linked:true,userId:'owner',email:'owner@test.local'});
  if(u.pathname.endsWith('/pos_mutate')){saves.push(route.request().postDataJSON());return reply(state);}
  try {const f=path.join(root,u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname);return route.fulfill({body:fs.readFileSync(f),contentType:/\.m?js$/.test(f)?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.html')?'text/html':'image/png'});}catch{return route.fulfill({status:404,body:''});}
 });
 await page.goto('https://test.invalid/pos/');await page.locator('#login-form').waitFor();
 assert.equal(await page.locator('#demo-enter').count(),0);
 await page.locator('[name=identifier]').fill('owner');await page.locator('[name=password]').fill('password-fixture');await page.locator('#login-form button').click();await page.waitForFunction(()=>document.querySelector('#login-error')?.textContent==='Login salah');
 failLogin=false;await page.locator('#login-form button').click();await page.locator('nav').waitFor();
 assert.equal(await page.locator('.topbar h1,.breadcrumb').count(),0);
 assert.equal(await page.locator('#logout').innerText(),'Logout');assert(await page.locator('.sidebar #logout').isVisible());
 assert(await page.locator('.account-profile').isVisible());assert((await page.locator('.account-profile').innerText()).includes('Owner Test'));
 assert(await page.locator('.account-profile').evaluate(el=>!!(el.compareDocumentPosition(document.querySelector('.sidebar-store'))&Node.DOCUMENT_POSITION_PRECEDING)));
 const nav=async view=>{await page.locator(`nav [data-view="${view}"]`).click();};
 const views=await page.locator('nav [data-view]').evaluateAll(bs=>bs.map(b=>b.dataset.view));
 for(const theme of ['light','dark']) {
  if(await page.evaluate(()=>document.documentElement.dataset.theme)!==theme)await page.locator('[data-theme-toggle]').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('maniac-pos-theme')||document.documentElement.dataset.theme),theme);
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});for(const view of views){await nav(view);assert(await page.locator('main').isVisible(),view);assert.notEqual(await page.locator('nav button.active').evaluate(el=>getComputedStyle(el).color),await page.locator('nav button.active').evaluate(el=>getComputedStyle(el).backgroundColor));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),theme+' '+view+' overflows '+width);}}
  await page.setViewportSize({width:1440,height:1000});
  if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});for(const view of ['employees','orders','stock','kitchen','salesreport']){await nav(view);await page.locator('.brand img').evaluate(img=>img.decode().catch(()=>{}));await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,view+'-'+theme+'.png')});}}
 }
 await nav('employees');await page.locator('[data-employee-card=owner] .employee-card-copy').click();assert(await page.locator('dialog [name=email]').isEditable()===false);assert(await page.locator('[data-profile]').isVisible());await page.locator('dialog .close').first().click();
 await page.locator('[data-employee-card=owner] .employee-more summary').click();await page.locator('[data-password=owner]').click();await page.locator('dialog [name=password]').fill('replacement-password');await page.locator('dialog [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert(saves.some(x=>x.action==='reset'&&x.employeeId==='owner'));
 await page.locator('[data-employee-new]').click();assert.equal(await page.locator('dialog [name=role]').inputValue(),'staff');await page.locator('dialog [name=name]').fill('New employee');await page.locator('dialog [name=username]').fill('new.employee');await page.evaluate(()=>document.querySelector('[data-theme-toggle]').click());assert.equal(await page.locator('dialog [name=username]').inputValue(),'new.employee');await page.locator('dialog [name=phone]').fill('081111111111');
 const png=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=20;canvas.height=20;canvas.getContext('2d').fillRect(0,0,10,10);return canvas.toDataURL('image/png').split(',')[1];}),'base64');
 await page.locator('[data-profile]').setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:png});await page.locator('[data-profile-preview]').waitFor({state:'visible'});await page.locator('dialog [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert(saves.some(x=>x.action==='employee_save'&&x.payload.username==='new.employee'&&/^data:image\/(png|webp);/.test(x.payload.profilePhoto)));
 await page.locator('[data-employee-new]').click();
 await page.locator('dialog [name=role]').selectOption('owner');assert(await page.locator('[data-owner-access-note]').isVisible());assert(await page.locator('[data-employee-access]').isHidden());assert(await page.locator('dialog [name=permissions]').first().isDisabled());
 await page.locator('dialog [name=role]').selectOption('staff');assert(await page.locator('[data-employee-access]').isVisible());
 await page.locator('dialog [name=name]').fill('Login employee');
 await page.locator('dialog [name=email]').fill('new.login@test.local');
 await page.locator('dialog [name=initialPassword]').fill('abc123');
 await page.locator('[data-toggle-initial-password]').click();assert.equal(await page.locator('dialog [name=initialPassword]').getAttribute('type'),'text');
 await page.locator('[data-toggle-initial-password]').click();
 await page.locator('dialog [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 const employeeSave=saves.find(x=>x.action==='employee_save'&&x.payload.name==='Login employee');
 assert(employeeSave);assert(!Object.hasOwn(employeeSave.payload,'initialPassword'));
 assert(saves.some(x=>x.action==='create'&&x.employeeId===employeeSave.payload.employeeId&&x.password==='abc123'));
 assert.deepEqual(errors,[]);
 const savedTheme=await page.evaluate(()=>document.documentElement.dataset.theme);await page.reload();await page.locator('nav').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),savedTheme);
 // Also render the public site and menu; all local scripts must load without exceptions.
 for(const url of ['/','/menu/','/menu/kelola.html']){await page.goto('https://test.invalid'+url);await page.waitForLoadState('load');assert(await page.locator('body').innerText());}
 assert.deepEqual(errors,[]);
 console.log('PASS browser: actual login boot/error/success, all POS pages desktop/mobile, employee forms/photo/default role, owner reset endpoint, public site/menu.');
}finally{await browser.close();}

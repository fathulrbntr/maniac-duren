import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID as id} from 'node:crypto';
import {chromium} from 'playwright';
import {warehouseDatabase} from './helpers/warehouse-db.mjs';
const db=await warehouseDatabase(),root=process.cwd();
const owner=id(),warehouseUser=id(),cashier=id(),waitress=id(),cutter=id(),store=id(),supplier=id();
const wh=(await db.query("select id from public.md_pos_stores where location_type='warehouse'")).rows[0].id;
const product=(await db.query("select id from public.md_pos_products where sku='MD-MONTHONG-BUAH'")).rows[0].id;
await db.query("insert into public.md_pos_stores(id,name) values($1,'Maniac Duren Depok')",[store]);
for(const [user,role,st] of [[owner,'owner',store],[warehouseUser,'warehouse',wh],[cashier,'cashier',store],[waitress,'waitress',store],[cutter,'cutter',store]]){await db.query('insert into auth.users values($1,$2)',[user,user+'@fixture.local']);await db.query('insert into public.md_pos_staff values($1)',[user]);await db.query('insert into public.md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$2,$3)',[user,role,[st]]);}
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
await db.query("insert into public.md_pos_suppliers(id,name) values($1,'Supplier Uji')",[supplier]);
await db.query("update public.md_pos_products set barcode='0001' where id=$1",[product]);
const invoke=async(action,payload)=>(await db.query('select public.pos_warehouse_mutate($1,$2::jsonb) s',[action,JSON.stringify(payload)])).rows[0].s;
const plan={id:id(),storeId:wh,supplierId:supplier,date:new Date().toISOString().slice(0,10),invoiceNo:'SUP-BROWSER',shippingCost:20000,lines:[{productId:product,purchaseCost:200000}]};
await invoke('receipt_plan_save',plan);
await invoke('transfer_price_save',{id:id(),productId:product,unit:'kg',price:65000});
const code=n=>'9201131126'+String(n).padStart(6,'0')+'0001002000';
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const users={owner,warehouse:warehouseUser,cashier,waitress,cutter};
 await page.route('**/*',async r=>{
  const u=new URL(r.request().url()),json=x=>r.fulfill({json:x});
  if(u.pathname==='/api/pos-config')return json({configured:true,url:'https://test.invalid',key:'fixture'});
  if(u.pathname==='/api/pos-login'){const actor=users[r.request().postDataJSON().identifier];return json({access_token:actor,refresh_token:actor,expires_in:3600,user:{id:actor}});}
  if(u.pathname.startsWith('/rest/v1/rpc/')){
   const actor=r.request().headers().authorization?.replace('Bearer ','');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
   const p=r.request().postDataJSON(),rpc=u.pathname.split('/').at(-1);
   try{
    let result;
    if(rpc==='pos_read')result=(await db.query('select public.pos_read() s')).rows[0].s;
    else if(rpc==='pos_warehouse_mutate')result=await invoke(p.action,p.payload);
    else if(rpc==='pos_receive_shipment')result=(await db.query('select public.pos_receive_shipment($1::jsonb) s',[JSON.stringify(p.payload)])).rows[0].s;
    else if(rpc==='pos_fruit_history')result=(await db.query('select public.pos_fruit_history($1) s',[p.code])).rows[0].s;
    else if(rpc==='pos_product_photos')result=[];
    else if(rpc==='pos_store_logo')result={logo:null};
    else throw Error('Unexpected RPC '+rpc);
    return json(result);
   }catch(e){return r.fulfill({status:400,json:{message:e.message,code:e.code||'P0001'}});}
  }
  const file=path.join(root,u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname);
  if(!fs.existsSync(file))return r.fulfill({status:404,body:''});return r.fulfill({body:fs.readFileSync(file),contentType:/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/png'});
 });
 const login=async role=>{await page.goto('https://test.invalid/pos/');if(await page.locator('#logout').count()){await page.locator('#logout').click();}await page.locator('[name=identifier]').fill(role);await page.locator('[name=password]').fill('fixture');await page.locator('#login-form [type=submit]').click();await page.waitForSelector('#active-store');};
 const nav=async name=>{const b=page.locator('.nav-item[data-view='+name+']');if(!await b.isVisible())await b.locator('xpath=ancestor::details/summary').click();await b.click();};
 await login('warehouse');await nav('supplierNotes');await page.locator('[data-note-receive]').click();
 assert.equal(await page.locator('[data-purchase]').getAttribute('readonly'),'');assert.equal(await page.locator('[name=invoiceNo]').inputValue(),'SUP-BROWSER');
 await page.locator('[data-weigh-open]').click();assert(await page.locator('.weigh-manual').isHidden());
 for(const n of [1,2,3]){await page.locator('#receipt-weigh-scan').fill(code(n));await page.locator('#receipt-weigh-scan').press('Enter');}
 assert.match(await page.locator('[data-total]').innerText(),/6 kg/);await page.locator('.weighing-dialog [data-close]').last().click();
 await page.locator('.receipt-shipment-dialog [type=submit]').click();await page.waitForSelector('dialog',{state:'detached'});
 await nav('transfers');await page.locator('[data-transfer-new]').click();await page.locator('[name=toStoreId]').selectOption(store);await page.locator('[name=carrier]').fill('Budi / B 1234');
 for(const n of [1,2]){await page.locator('[data-dispatch-scan]').fill(code(n));await page.locator('[data-dispatch-scan]').press('Enter');}
 assert.match(await page.locator('[data-dispatch-summary]').innerText(),/260\.000/);
 for(const width of [360,390,1440]){await page.setViewportSize({width,height:1000});assert(await page.locator('dialog').evaluate(d=>d.scrollWidth<=d.clientWidth+1),'dispatch dialog fits '+width);}
 await page.locator('dialog [type=submit]').click();await page.waitForSelector('dialog',{state:'detached'});
 await page.locator('[data-transfer]').click();assert.match(await page.locator('dialog').innerText(),/Dalam perjalanan/);
 const popupWait=page.waitForEvent('popup');await page.locator('[data-print-delivery]').click();const popup=await popupWait;await popup.waitForLoadState('domcontentloaded');assert.match(await popup.locator('body').innerText(),new RegExp(code(1)));assert.match(await popup.locator('body').innerText(),/SURAT JALAN/);await popup.pdf({path:'test-results/warehouse-delivery-qa.pdf',format:'A4'});await popup.close();await page.locator('dialog [type=submit]').click();
 await login('cashier');assert.equal(await page.locator('.nav-item[data-view=pricing]').count(),0);assert.equal(await page.locator('.nav-item[data-view=products]').count(),0);await nav('receiving');await page.locator('[data-transfer-search]').fill('SJ-ARN');await page.locator('[data-transfer]').click();
 await page.locator('[data-receive-code]').fill(code(3));await page.locator('[data-receive-code]').press('Enter');await page.waitForFunction(()=>document.querySelector('[data-receive-message]').textContent.includes('tidak tercantum'));
 await page.locator('[data-receive-code]').fill(code(1));await page.locator('[data-receive-code]').press('Enter');await page.waitForFunction(()=>document.querySelector('[data-receive-message]').textContent.includes('1 / 2'));
 await page.locator('[name=confirmed]').check();await page.locator('dialog [type=submit]').click();assert.match(await page.locator('#form-error').innerText(),/belum dipindai/);
 await page.reload();await nav('receiving');await page.locator('[data-transfer]').click();assert.match(await page.locator('[data-receive-list]').innerText(),/Cocok/);
 await page.locator('[data-receive-code]').fill(code(2));await page.locator('[data-receive-code]').press('Enter');await page.waitForFunction(()=>document.querySelector('[data-receive-message]').textContent.includes('2 / 2'));
 await page.locator('[name=confirmed]').check();await page.locator('dialog [type=submit]').click();await page.waitForSelector('dialog',{state:'detached'});assert.equal(await page.locator('[data-transfer]').count(),0,'received shipment leaves pending list');
 await login('owner');await page.locator('[data-workspace=backoffice]').click();await page.screenshot({path:'test-results/warehouse-backoffice-desktop.png',fullPage:true});
 for(const width of [360,390,1440]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'home fits '+width);}
 await page.setViewportSize({width:390,height:900});await page.screenshot({path:'test-results/warehouse-backoffice-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await nav('pricing');await page.locator('[data-transfer-price="'+product+'"]').click();await page.locator('[name=price]').fill('70000');await page.locator('dialog [type=submit]').click();await page.waitForSelector('dialog',{state:'detached'});
 await login('waitress');assert.equal(await page.locator('.nav-item[data-view=orders]').count(),0);await nav('service');assert.match(await page.locator('main').innerText(),/Pelayanan meja/);
 await login('cutter');await nav('cutting');await page.locator('[name=barcode]').fill(code(1));await page.locator('[name=tableNo]').fill('7');await page.locator('[data-cut-form] [type=submit]').click();await page.waitForFunction(()=>document.querySelector('.supply-workspace').textContent.includes('Pemeriksaan 7 hari'));
 assert.deepEqual(errors,[]);console.log('PASS browser + real SQL: admin note → warehouse scan → dispatch → documents → partial scan/reload → full receive → role workspaces, price form and responsive widths.');
}finally{await browser.close();await db.close();}

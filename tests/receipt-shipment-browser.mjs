import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
const root=process.cwd(),browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',r=>{
  const u=new URL(r.request().url());
  if(u.pathname==='/fixture')return r.fulfill({contentType:'text/html',body:'<!doctype html><html data-theme="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/pos/pos.css"><link rel="stylesheet" href="/pos/ui-tokens.css"><link rel="stylesheet" href="/pos/ui-system.css"><link rel="stylesheet" href="/pos/receipt-shipment.css"><body></body></html>'});
  const file=path.join(root,u.pathname);return r.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.css')?'text/css':'text/javascript'});
 });
 await page.goto('https://test.invalid/fixture');
 await page.evaluate(async()=>{
  const {openWeighingReceipt}=await import('/pos/receipt-weighing.mjs');const {installMoneyInputs}=await import('/pos/money-input.mjs');installMoneyInputs();
  const s={receiptShipmentVersion:82,lots:[],stores:[{id:'s',name:'MANIAC DUREN JABABEKA'}],suppliers:[{id:'v',name:'adi'}],products:['Bawor','Monthong','Musang King'].map((name,i)=>({id:String(i),name:'Durian '+name,itemType:'direct',category:'Buah',stockUnit:'kg_butir'}))};
  window.saved=[];window.openReceipt=()=>openWeighingReceipt(s,'s',{modal:(title,body,label)=>{
   const d=document.createElement('dialog');d.className='modal';d.innerHTML=`<div class="modal-head"><h2>${title}</h2><button type="button" class="close">×</button></div><form>${body}<p id="form-error" class="error"></p><div class="modal-actions"><button type="button" class="close">Batal</button><button type="submit" class="primary">${label}</button></div></form>`;document.body.append(d);d.querySelectorAll('.close').forEach(b=>b.onclick=()=>d.close());d.onclose=()=>d.remove();d.showModal();return d;
  },mutate:async(action,payload)=>{window.saved.push({action,payload});return true;},render(){},toast(){}});window.openReceipt();
 });
 const card=i=>page.locator('.receipt-product').nth(i);
 const weigh=async(i,kg,pieces)=>{await card(i).locator('[data-weigh-open]').click();await page.locator('.weighing-dialog [name=kg]').fill(String(kg));await page.locator('.weighing-dialog [name=pieces]').fill(String(pieces));await page.locator('.weighing-dialog [type=submit]').click();await page.locator('.weighing-dialog [data-close]').last().click();};
 await page.locator('[name=invoiceNo]').fill('NOTA-082');await card(0).locator('[data-purchase]').fill('1000000');await weigh(0,20,5);
 await page.locator('[data-add-product]').click();assert.equal(await page.locator('.receipt-product').count(),2);assert.equal(await card(1).locator('option[value="0"]').evaluate(el=>el.disabled),true);
 await card(1).locator('[data-purchase]').fill('600000');await weigh(1,10,5);await page.locator('[name=shippingCost]').fill('300000');
 assert.match(await card(0).innerText(),/200.000/);assert.match(await card(1).innerText(),/100.000/);assert.match(await page.locator('[data-weigh-summary]').innerText(),/1.900.000/);
 // Editing one product keeps the other product's measurements intact.
 await card(0).locator('[data-weigh-open]').click();await page.locator('.weighing-dialog [data-edit]').click();await page.locator('.weighing-dialog [name=kg]').fill('25');await page.locator('.weighing-dialog [type=submit]').click();await page.locator('.weighing-dialog [data-close]').last().click();assert.match(await card(0).innerText(),/25 kg/);assert.match(await card(1).innerText(),/10 kg/);
 await page.locator('[data-add-product]').click();assert.equal(await page.locator('[data-add-product]').isDisabled(),true);await card(2).locator('[data-remove-product]').click();assert.equal(await page.locator('[data-add-product]').isDisabled(),false);assert.match(await card(0).innerText(),/25 kg/);
 for(const width of [360,390,1440]){
  await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>{const d=document.querySelector('.receipt-shipment-dialog');return d.scrollWidth<=d.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth;}),`no horizontal overflow at ${width}`);
 }
 await page.setViewportSize({width:390,height:1000});await page.evaluate(()=>document.querySelector('.receipt-shipment-dialog').scrollTop=0);await page.screenshot({path:'../receipt-mobile-qa.png'});
 await page.setViewportSize({width:1440,height:1100});assert((await page.locator('.receipt-shipment-dialog').boundingBox()).width>700);await page.evaluate(()=>document.querySelector('.receipt-shipment-dialog').scrollTop=0);await page.screenshot({path:'../receipt-desktop-qa.png'});
 await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.screenshot({path:'../receipt-light-qa.png'});
 await page.locator('.receipt-shipment-dialog [type=submit]').click();const saved=await page.evaluate(()=>window.saved);assert.equal(saved.length,1);assert.equal(saved[0].action,'receipt_batch');assert.equal(saved[0].payload.invoiceNo,'NOTA-082');assert.deepEqual(saved[0].payload.lines.map(l=>[l.productId,l.purchaseCost,l.weighings[0].kg]),[['0','1000000',25],['1','600000',10]]);assert.equal(saved[0].payload.shippingCost,'300000');
 await page.evaluate(()=>window.openReceipt());await card(0).locator('[data-purchase]').fill('10');await weigh(0,1,1);await page.locator('.receipt-shipment-dialog [type=submit]').click();assert.equal(await page.evaluate(()=>window.saved.length),1,'blank invoice blocked');assert.deepEqual(errors,[]);
 console.log('PASS browser: multiple products, independent weighing edits, grouped money, removal, invoice validation, raw payload, 360/390/1440 widths and dark/light');
}finally{await browser.close();}

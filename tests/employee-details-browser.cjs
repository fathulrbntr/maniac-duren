const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="id" data-theme="light"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/pos/pos.css"><link rel="stylesheet" href="/pos/employees.css"><main id="test"></main></html>'});
   const file=path.join(root,url.pathname);
   return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.css')?'text/css':'text/javascript'});
  });
  await page.goto('https://test.invalid/fixture');
  await page.evaluate(async()=>{
   const ui=await import('/pos/employees-ui.mjs');
   const {installMoneyInputs}=await import('/pos/money-input.mjs');installMoneyInputs();
   window.s={employeeVersion:16,employeeDetailsVersion:70,me:{id:'owner',name:'Owner',role:'owner'},stores:[{id:'store',name:'Depok'}],employees:[{id:'staff',name:'Karyawan Test',email:'staff@test.local',role:'staff',active:true,store_ids:['store'],permissions:[],emergency_contact_name:'Ibu Test',emergency_contact_phone:'081234567890',bank_name:'BCA',bank_account_name:'Karyawan Test',bank_account_number:'001234567890'}],attendance:[]};
   window.saved=[];
   window.ctx={
    modal:(title,html)=>{const d=document.createElement('dialog');d.className='modal';d.innerHTML='<div class="modal-head"><h2>'+title+'</h2></div><form>'+html+'<p id="form-error"></p><div class="modal-actions"><button type="submit">Simpan</button></div></form>';document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();return d;},
    toast:()=>{},refresh:async()=>{},render:()=>{},
    mutate:async(action,payload)=>{saved.push({action,payload});return true;}
   };
   window.draw=()=>{document.querySelector('#test').innerHTML=ui.employeesPage('employees',s,'store');ui.bindEmployees('employees',s,'store',ctx);};draw();
  });
  await page.locator('[data-employee-card]').click();
  const fields={emergencyContactName:'Ibu Test',emergencyContactPhone:'081234567890',bankName:'BCA',bankAccountName:'Karyawan Test',bankAccountNumber:'001234567890'};
  for(const [key,value] of Object.entries(fields))assert.equal(await page.locator(`[name=${key}]`).inputValue(),value);
  assert.equal(await page.locator('[name=bankAccountNumber]').getAttribute('type'),'text');
  assert.equal(await page.locator('[name=bankAccountNumber]').getAttribute('data-money-input'),null);
  await page.locator('[name=bankAccountNumber]').fill('1e10');
  await page.locator('[type=submit]').click();assert.equal(await page.evaluate(()=>saved.length),0);
  await page.locator('[name=bankAccountNumber]').fill('000123456789');
  await page.locator('[name=emergencyContactPhone]').fill('123');
  await page.locator('[type=submit]').click();assert.equal(await page.evaluate(()=>saved.length),0);
  await page.locator('[name=emergencyContactPhone]').fill('+62 812-3333-4444');
  await page.locator('[name=emergencyContactName]').fill('Ayah Test');
  await page.locator('[type=submit]').click();
  await page.waitForFunction(()=>saved.length===1&&!document.querySelector('dialog[open]'));
  const edit=await page.evaluate(()=>saved[0]);assert.equal(edit.action,'employee_save');assert.equal(edit.payload.emergencyContactName,'Ayah Test');assert.equal(edit.payload.bankAccountNumber,'000123456789');assert.equal(edit.payload.bankAccountName,'Karyawan Test');
  await page.locator('[data-employee-card]').click();
  for(const key of Object.keys(fields))await page.locator(`[name=${key}]`).fill('');
  await page.locator('[type=submit]').click();await page.waitForFunction(()=>saved.length===2);
  const cleared=await page.evaluate(()=>saved[1].payload);for(const key of Object.keys(fields))assert.equal(cleared[key],'');
  await page.locator('[data-employee-new]').click();await page.locator('[name=name]').fill('Karyawan Baru');
  for(const [key,value] of Object.entries(fields))await page.locator(`[name=${key}]`).fill(value);
  await page.locator('[type=submit]').click();await page.waitForFunction(()=>saved.length===3);
  const created=await page.evaluate(()=>saved[2].payload);assert.equal(created.bankAccountNumber,'001234567890');assert.equal(created.role,'staff');
  await page.locator('.employee-more summary').click();await page.locator('[data-detail]').click();
  assert((await page.locator('dialog').innerText()).includes('001234567890'));assert((await page.locator('dialog').innerText()).includes('Ibu Test'));
  await page.evaluate(()=>document.querySelector('dialog').remove());
  await page.locator('[data-employee-card]').click();
  const layout=()=>page.evaluate(()=>{const d=document.querySelector('dialog');return d.scrollWidth<=d.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth;});
  assert(await layout());
  if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.locator('[name=emergencyContactName]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'employee-details-desktop.png')});}
  await page.setViewportSize({width:390,height:844});assert(await layout());
  if(process.env.SCREENSHOT_DIR){await page.locator('[name=bankAccountNumber]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'employee-details-mobile.png')});}
  await page.evaluate(()=>{document.querySelector('dialog').remove();s.employeeDetailsVersion=undefined;draw();});
  await page.locator('[data-employee-card]').click();assert(await page.locator('[name=bankAccountNumber]').isDisabled());
  assert((await page.locator('dialog').innerText()).includes('employee-details-070.sql'));
  await page.locator('[type=submit]').click();await page.waitForFunction(()=>saved.length===4);
  assert.equal(await page.evaluate(()=>Object.hasOwn(saved[3].payload,'bankAccountNumber')),false);
  assert.deepEqual(errors,[]);
  console.log('PASS employee details browser: edit/add/detail/clear, validation, money-input compatibility, exact payloads, missing migration, desktop/mobile layout.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

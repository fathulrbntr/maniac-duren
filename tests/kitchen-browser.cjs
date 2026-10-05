const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const {demoState}=await import(root+'/pos/core.mjs');const {requirements}=await import(root+'/pos/order-stock.mjs');
 const state=demoState();const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
 state.opsVersion=9;state.orderStockVersion=12;state.orderPaymentVersion=12;state.orderRoutingVersion=13;state.orders=[];state.events=[];state.stores=[{id:'branch',name:'Maniac Duren Depok'}];
 state.products=[{id:'dessert',name:'Es Cendol Durian',itemType:'recipe',stockUnit:'porsi',salePrice:28000,category:'Dessert'},{id:'other',name:'Es Duren',itemType:'recipe',stockUnit:'porsi',salePrice:30000,category:'Dessert'},{id:'prep',name:'Cendol',stockUnit:'g',itemType:'prep'},{id:'water',name:'Crystaline',itemType:'direct',stockUnit:'pcs',salePrice:5000,category:'Minuman'},{id:'empty',name:'Air Mineral',itemType:'direct',stockUnit:'pcs',salePrice:5000,category:'Minuman'}];
 state.recipes=[{id:'r',outputId:'dessert',yieldQty:1,version:1,ingredients:[{productId:'prep',qty:50}]},{id:'r2',outputId:'other',yieldQty:1,version:1,ingredients:[{productId:'prep',qty:50}]}];state.unitLots=[{id:'stock',productId:'prep',storeId:'branch',qty:100,date:day,expiry:day}];state.unitLots.push({id:'water-stock',productId:'water',storeId:'branch',qty:3,date:day});state.lots=[];
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});
 try{
 const errors=[];
 async function setup(email){const page=await browser.newPage({viewport:{width:1440,height:950}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async r=>{const u=new URL(r.request().url());const reply=data=>r.fulfill({json:data});
 if(u.pathname==='/api/pos-config')return reply({configured:true,url:'https://pos-test.invalid/mock',key:'test'});
 if(u.pathname==='/api/pos-login')return reply({access_token:email,refresh_token:'test',expires_in:3600,user:{id:email}});
 const snapshot=()=>({...state,access:{sell:email==='cashier',kitchen:email==='cook',cancel:true}});
 if(u.pathname.endsWith('/pos_read'))return reply(snapshot());
 if(u.pathname.endsWith('/pos_mutate')){const {action,payload}=r.request().postDataJSON();
 if(action==='order_create'){const lines=payload.lines.map(l=>({...l,itemType:state.products.find(p=>p.id===l.productId).itemType,name:state.products.find(p=>p.id===l.productId).name,unit:state.products.find(p=>p.id===l.productId).stockUnit}));for(const l of lines.filter(l=>l.itemType!=='recipe'))state.unitLots.find(x=>x.productId===l.productId).qty-=l.qty;state.orders.push({id:payload.id,store_id:'branch',business_date:day,created_at:new Date().toISOString(),status:lines.some(l=>l.itemType==='recipe')?'queued':'paid',payment_status:'paid',payment:payload.payment,paid:payload.paid,paid_date:day,note:payload.note,lines,total:lines.reduce((a,l)=>a+l.qty*l.price,0),reserved:Object.fromEntries(requirements(state,lines.filter(l=>l.itemType==='recipe')))});}
 else{const o=state.orders.find(o=>o.id===payload.orderId);if(action==='order_start'){state.unitLots[0].qty-=o.reserved['product:prep'].qty;o.status='preparing';}if(action==='order_ready')o.status='ready';if(action==='order_complete')o.status='paid';}
 return reply(snapshot());}
 try{const file=path.join(root,u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname);return r.fulfill({body:fs.readFileSync(file),contentType:/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/png'});}catch{return r.fulfill({status:404,body:''});}});
 await page.goto('https://pos-test.invalid/pos/');await page.locator('[name=identifier]').fill(email+'@test.local');await page.locator('[name=password]').fill('fixture');await page.locator('#login-form button').click();await page.locator('nav').waitFor();return page;}
 const cashier=await setup('cashier'),cook=await setup('cook');
 assert.equal(await cook.locator('main h1').innerText(),'Antrean Kitchen');assert.equal(await cook.locator('nav [data-view=cashier]').count(),0);
 await cook.locator('#kitchen-sound').click();assert.equal(await cook.locator('#kitchen-sound').getAttribute('aria-pressed'),'true');
 assert(await cashier.locator('[data-order-add=empty]').isDisabled());
 await cashier.locator('[data-order-add=dessert]').click();await cashier.locator('[data-delta="1"]').click();assert(await cashier.locator('[data-order-add=other]').isDisabled());
 await cashier.locator('[data-delta="-1"]').click();assert(await cashier.locator('[data-order-add=other]').isEnabled());
 await cashier.locator('[data-order-add=water]').click();await cashier.locator('#order-note').fill('Meja 05 — tanpa es');await cashier.locator('#save-order').click();
 assert.equal(state.orders.length,0);assert.equal(await cook.locator('.kitchen-ticket').count(),0);
 await cashier.locator('dialog [name=paid]').fill('35000');
 assert((await cashier.locator('[data-change]').innerText()).includes('2.000'));
 if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await cashier.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'checkout-desktop.png'),fullPage:true});}
 await cashier.locator('dialog [type=submit]').click();await cashier.locator('dialog[open]').waitFor({state:'hidden'});
 assert.equal(state.orders[0].payment_status,'paid');
 assert.equal(state.unitLots[0].qty,100);
 await cook.locator('.kitchen-ticket').waitFor({timeout:12000});assert((await cook.locator('.kitchen-note').innerText()).includes('Meja 05'));assert(!(await cook.locator('.kitchen-ticket').innerText()).includes('Crystaline'));
 await cook.locator('[data-op=order_start]').click();await cook.locator('[data-op=order_ready]').waitFor();await cook.locator('[data-op=order_ready]').click();
 await cook.getByText('Siap disajikan / diserahkan',{exact:true}).waitFor();
 await cashier.locator('[data-order-add=other]').click();await cashier.locator('#order-note').fill('Catatan tetap ada');
 await cashier.waitForTimeout(5500);assert.equal(await cashier.locator('#order-note').inputValue(),'Catatan tetap ada');assert.equal(await cashier.locator('[data-op=pay]').count(),0);assert(await cashier.locator('[data-op=order_complete]').isVisible());assert(await cashier.locator('[data-order-add=dessert]').isDisabled());
 await cashier.locator('[data-op=order_receipt]').click();assert((await cashier.locator('.receipt-print').innerText()).includes('Lunas'));await cashier.locator('dialog .close').first().click();
 if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await cook.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'kitchen-desktop.png'),fullPage:true});}
 for(const page of [cashier,cook]){await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 if(process.env.SCREENSHOT_DIR)await cook.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'kitchen-mobile.png'),fullPage:true});await cashier.locator('[data-op=order_complete]').click();await cashier.locator('[data-op=order_complete]').waitFor({state:'hidden'});await cook.locator('#ops-refresh').click();await cook.locator('.kitchen-ticket').waitFor({state:'detached'});assert.equal(await cook.locator('.kitchen-ticket').count(),0);await cashier.locator('[data-remove-line]').click();await cashier.locator('[data-order-add=water]').click();await cashier.locator('#save-order').click();await cashier.locator('dialog [type=submit]').click();await cashier.locator('dialog[open]').waitFor({state:'hidden'});
 assert.equal(state.orders.at(-1).status,'paid');assert.equal(state.unitLots.find(x=>x.productId==='water').qty,1);
 await cook.locator('#ops-refresh').click();assert.equal(await cook.locator('.kitchen-ticket').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS browser: disabled stock, combined draft, separate kitchen login, sound toggle, two-session notification, pay first, cash change, paid receipt, start/ready/delivered, preserved draft, mobile.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {orderMargins} from '../pos/finance.mjs';
import {PGlite} from '@electric-sql/pglite';
for(const install of ['fresh','upgrade']){
 const db=new PGlite();
 try{
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 const sql=fs.readFileSync('database/pos.sql','utf8');
 const owner=id();
 if(install==='upgrade'){
  await db.exec(sql.split('-- Upgrade setelah 008.')[0]);
  await db.query('insert into auth.users values($1,$2)',[owner,'owner@test.local']);
  await db.query('insert into public.md_pos_staff values($1)',[owner]);
  await db.exec(fs.readFileSync('database/009-integrated-operations.sql','utf8'));
  await db.exec(fs.readFileSync('database/011-order-stock-kitchen.sql','utf8'));
  await db.exec(fs.readFileSync('database/012-pay-first-kitchen.sql','utf8'));
 await db.exec(fs.readFileSync('database/013-kitchen-recipes-only.sql','utf8'));
 }else{
  await db.exec(sql);
  await db.query('insert into auth.users values($1,$2)',[owner,'owner@test.local']);
  await db.query('insert into public.md_pos_staff values($1)',[owner]);
  await db.query("insert into public.md_pos_employees(id,user_id,name,email,role) values($1,$1,'Owner','owner@test.local','owner')",[owner]);
 }
 const as=async u=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);await as(owner);
 const read=async()=> (await db.query('select public.pos_read() s')).rows[0].s;
 const mut=async(action,p)=>(await db.query('select public.pos_mutate($1,$2::jsonb) s',[action,JSON.stringify(p)])).rows[0].s;
 const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'}),store=id(),other=id(),supplier=id(),fruit=id(),raw=id(),prep=id(),dessert=id();
 for(const [key,name]of[[store,'Depok'],[other,'Bogor']])await mut('master',{id:key,kind:'stores',name});
 await mut('master',{id:supplier,kind:'suppliers',name:'Supplier A'});
 await mut('product_save',{id:fruit,name:'Monthong',sku:'M',itemType:'direct',category:'Buah',stockUnit:'kg_butir',priceKg:100,pricePiece:200});
 for(const [key,type,unit,name]of[[raw,'raw','g','Tepung'],[prep,'prep','g','Cendol'],[dessert,'recipe','porsi','Es duren']])await mut('product_save',{id:key,name,sku:name,itemType:type,stockUnit:unit,category:type==='recipe'?'Dessert':null,salePrice:type==='recipe'?100:null});
 const lot=id();await mut('receipt',{id:lot,storeId:store,supplierId:supplier,productId:fruit,date,kg:100,pieces:40,totalCost:1000});
 assert.equal((await read()).lots[0].quality,'unsorted');
 await assert.rejects(mut('sale',{id:id(),storeId:store,date,paid:100,payment:'Tunai',lines:[{lotId:lot,kg:1,pieces:1,unit:'KG',price:100}]}),/matang/);
 const ready=id(),reject=id();
 await assert.rejects(mut('sort',{id:id(),lotId:lot,date,parts:[{id:id(),quality:'ready',kg:90,pieces:40}]}),/sama/);
 await mut('sort',{id:id(),lotId:lot,date,parts:[{id:ready,quality:'ready',kg:80,pieces:30},{id:reject,quality:'reject',kg:20,pieces:10}]});
 let s=await read();assert.equal(s.lots.find(l=>l.id===ready).unitCost,10);
 await mut('inventory_loss',{id:id(),lotId:ready,date,qty:2,pieces:0,cause:'shrinkage',reason:'Timbang ulang'});
 const rlot=id();await mut('unit_receipt',{id:rlot,storeId:store,date,productId:raw,qty:1000,totalCost:1000,supplierId:supplier,kind:'purchase'});
 const recipe=id();await mut('recipe_save',{id:recipe,name:'Cendol',version:0,outputId:prep,yieldQty:500,ingredients:[{productId:raw,qty:200}]});
 s=await read();const production=id();await mut('produce',{id:production,storeId:store,date,recipeId:recipe,recipeVersion:s.recipes.find(r=>r.id===recipe).version,batches:1,actualQty:500});
 s=await read();assert.equal(s.unitLots.find(l=>l.id===production).unitCost,.4);
 const dessertRecipe=id();await mut('recipe_save',{id:dessertRecipe,name:'Es duren',version:0,outputId:dessert,yieldQty:1,ingredients:[{productId:prep,qty:50}]});


 const water=id(),waterLot=id();
 await mut('product_save',{id:water,name:'Air mineral',sku:'AIR',itemType:'direct',stockUnit:'pcs',salePrice:10});
 await mut('unit_receipt',{id:waterLot,storeId:store,date,productId:water,qty:10,totalCost:20,supplierId:supplier,kind:'purchase'});
 const fruitLine={productId:fruit,lotId:ready,kg:2,pieces:1,unit:'KG',price:100};
 const mix=id(),request={id:mix,storeId:store,date,paid:420,payment:'Tunai',lines:[fruitLine,{productId:water,qty:2,price:10},{productId:dessert,qty:2,price:100}]};
 await mut('order_create',request);await mut('order_create',request);
 s=await read();let o=s.orders.find(x=>x.id===mix);
 assert.equal(o.status,'queued');assert.equal(o.consumption.length,2);
 assert.deepEqual(Object.keys(o.reserved),['product:'+prep]);assert.equal(o.reserved['product:'+prep].qty,100);
 assert.equal(s.lots.find(l=>l.id===ready).kg,76);assert.equal(s.lots.find(l=>l.id===ready).pieces,29);
 assert.equal(s.unitLots.find(l=>l.id===waterLot).qty,8);assert.equal(s.unitLots.find(l=>l.id===production).qty,500);
 assert.equal(s.money.filter(m=>m.event_id===mix).length,1);
 const start={id:id(),orderId:mix,date};await mut('order_start',start);await mut('order_start',start);
 s=await read();o=s.orders.find(x=>x.id===mix);assert.equal(o.cost,64);assert.equal(o.consumption.length,3);
 assert.equal(s.lots.find(l=>l.id===ready).kg,76);assert.equal(s.unitLots.find(l=>l.id===waterLot).qty,8);assert.equal(s.unitLots.find(l=>l.id===production).qty,400);
 assert.equal(s.money.find(m=>m.event_id===mix).cost,64);
 const direct=id(),directRequest={id:direct,storeId:store,date,paid:110,payment:'QRIS',lines:[{...fruitLine,kg:1},{productId:water,qty:1,price:10}]};
 await mut('order_create',directRequest);await mut('order_create',directRequest);
 s=await read();o=s.orders.find(x=>x.id===direct);assert.equal(o.status,'paid');assert.equal(o.cost,12);assert.equal(o.payment_status,'paid');
 assert.equal(s.lots.find(l=>l.id===ready).kg,75);assert.equal(s.unitLots.find(l=>l.id===waterLot).qty,7);
 await assert.rejects(mut('order_start',{id:id(),orderId:direct,date}),/siap jual/);
 const before=s;await assert.rejects(mut('order_create',{id:id(),storeId:store,date,paid:1000,payment:'Tunai',lines:[{productId:water,qty:100,price:10}]}),/cukup|kurang/);
 assert.equal((await read()).orders.length,before.orders.length);assert.equal((await read()).money.length,before.money.length);
 // Legacy paid fruit queue: cashier finishes once, and never needs kitchen.
 const legacy=id(),legacyPayload={...directRequest,id:legacy,lines:[{...fruitLine,kg:1}],paid:100};
 await db.query('select public.pos_mutate_v12($1,$2::jsonb)',['order_create',JSON.stringify(legacyPayload)]);
 const finish={id:id(),orderId:legacy,date};await mut('order_direct',finish);await mut('order_direct',finish);
 s=await read();assert.equal(s.orders.find(x=>x.id===legacy).status,'paid');assert.equal(s.lots.find(l=>l.id===ready).kg,74);
 // Legacy already consumed fruit: completing cannot deduct again.
 const preparing=id();await db.query('select public.pos_mutate_v12($1,$2::jsonb)',['order_create',JSON.stringify({...legacyPayload,id:preparing})]);
 await db.query('select public.pos_mutate_v12($1,$2::jsonb)',['order_start',JSON.stringify({id:id(),orderId:preparing,date})]);
 await mut('order_direct',{id:id(),orderId:preparing,date});assert.equal((await read()).lots.find(l=>l.id===ready).kg,73);
 // Mixed cancellation before cooking: ready goods are already out; prep is untouched.
 const cancel=id();await mut('order_create',{id:cancel,storeId:store,date,paid:110,payment:'Tunai',lines:[{productId:water,qty:1,price:10},{productId:dessert,qty:1,price:100}]});
 const refund=id();await mut('order_cancel',{id:refund,orderId:cancel,date,reason:'Customer batal',refundConfirmed:true});
 s=await read();assert.equal(s.unitLots.find(l=>l.id===production).qty,400);assert.equal(s.unitLots.find(l=>l.id===waterLot).qty,6);
 assert.equal(s.money.find(m=>m.event_id===refund&&m.category==='loss').cost,2);
 assert.equal(s.money.find(m=>m.event_id===refund&&m.category==='reversal').cost,-2);
 assert.equal(s.money.find(m=>m.event_id===cancel).cost,2);
 await db.exec('set role authenticated');await assert.rejects(db.query("select public.pos_order_consume('[]',$1,$2,'[]')",[store,date]),/permission denied/);await db.exec('reset role');
 console.log('PASS '+install+': direct checkout, mixed split consumption, no duplicate stock/cost, legacy cashier completion, refund and helper permissions.');
 }finally{await db.close();}
}

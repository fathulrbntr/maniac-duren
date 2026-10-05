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
 const order=id();const create={id:order,storeId:store,date,paid:500,payment:'Tunai',lines:[{productId:dessert,qty:2,price:100},{productId:fruit,lotId:ready,kg:3,pieces:1,unit:'KG',price:100}]};
 await mut('order_create',create);await mut('order_create',create);
 assert.equal((await read()).orders.length,1);assert.equal((await read()).unitLots.find(l=>l.id===production).qty,500);
 await assert.rejects(mut('order_pay',{id:id(),orderId:order,date,paid:500,payment:'Tunai'}),/sudah dibayar/);
 const start={id:id(),orderId:order,date};await mut('order_start',start);await mut('order_start',start);
 s=await read();assert.equal(s.unitLots.find(l=>l.id===production).qty,400);assert.equal(s.orders[0].cost,70);assert.equal(s.orders[0].total,500);
 await mut('order_ready',{id:id(),orderId:order,date});await mut('order_complete',{id:id(),orderId:order,date});
 s=await read();assert.equal(s.money.find(m=>m.category==='sale').cost,70);
 // Insufficient stock rolls back every ingredient and status.
 const fail=id();await assert.rejects(mut('order_create',{...create,id:fail,paid:10000,lines:[{productId:dessert,qty:100,price:100}]}),/kurang/);
 assert.equal((await read()).orders.find(o=>o.id===fail),undefined);
 const cancel=id();await mut('order_create',{...create,id:cancel,lines:[{productId:dessert,qty:1,price:100}]});
 await mut('order_start',{id:id(),orderId:cancel,date});await mut('order_cancel',{id:id(),orderId:cancel,date,reason:'Salah buat',refundConfirmed:true});
 assert.equal((await read()).unitLots.find(l=>l.id===production).qty,350);
 assert.equal((await read()).money.filter(m=>m.category==='loss').length,2);
 // Reject recovery inherits exactly the input value across outputs.
 s=await read();const outputs=['durpas500','durpas1000','coral'].map((key,i)=>({key,productId:s.products.find(p=>p.name===['Durpas 500 gr','Durpas 1 kg','Coral'][i]).id,lotId:id(),qty:i===2?2:0}));
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1kAAAAASUVORK5CYII=';
 const waste={id:id(),storeId:store,sourceLotId:reject,receivedDate:date,date,kg:10,pieces:5,outputs,reason:'Buah pecah masih layak',processedBy:'nama manual',evidence:{reject:image,coral:image}};
 await mut('waste_process',waste);await mut('waste_process',waste);
 s=await read();assert.equal(s.unitLots.find(l=>l.id===outputs[2].lotId).unitCost,50);assert.equal(s.wasteRuns[0].processedBy,install==='fresh'?'Owner':'owner@test.local');

 // Arbitrary recovered flesh, recipe ancestry and item-level margin.
 const flesh=id();await mut('product_save',{id:flesh,name:'Daging',sku:'DG',itemType:'prep',stockUnit:'g'});
 const recovery=id();await mut('recover',{id:recovery,lotId:reject,date,kg:2,pieces:1,productId:flesh,qty:500,reason:'Daging layak pakai',expiry:date});
 s=await read();assert.equal(s.unitLots.find(x=>x.id===recovery).unitCost,.04);
 const current=s.recipes.find(x=>x.id===dessertRecipe);
 await mut('recipe_save',{id:dessertRecipe,name:'Es duren',version:current.version,outputId:dessert,yieldQty:1,ingredients:[{productId:prep,qty:50},{productId:flesh,qty:100}]});
 const dessertOrder=id();await mut('order_create',{id:dessertOrder,storeId:store,date,paid:100,payment:'Tunai',lines:[{productId:dessert,qty:1,price:100}]});
 await mut('order_start',{id:id(),orderId:dessertOrder,date});await mut('order_ready',{id:id(),orderId:dessertOrder,date});await mut('order_complete',{id:id(),orderId:dessertOrder,date});
 s=await read();const margin=orderMargins(s,[s.orders.find(x=>x.id===dessertOrder)])[0];
 assert.equal(margin.cost,24);assert.equal(margin.profit,76);assert.equal(margin.recovered,true);assert(Math.abs(margin.sources.reduce((a,x)=>a+x.cost,0)-24)<1e-8);
 // Product updates must not collide with the original entity ID in the audit log.
 const fp=s.products.find(x=>x.id===fruit);await mut('product_save',{...fp,editing:true,name:'Monthong baru'});assert.equal((await read()).products.find(x=>x.id===fruit).name,'Monthong baru');
 // Assigned stores + permissions enforced even when bypassing UI.
 const employee=id(),cashier=id();await mut('employee_save',{id:id(),employeeId:employee,name:'Kasir',email:'cashier@test.local',role:'cashier',storeIds:[store],permissions:[],active:true});
 await db.query('insert into auth.users values($1,$2)',[cashier,'cashier@test.local']);await mut('employee_link',{id:id(),employeeId:employee,userId:cashier});
 await as(cashier);s=await read();assert.equal(s.stores.length,1);assert.equal(s.money.length,0);assert.equal(s.events.length,0);assert.equal(s.employees.length,1);
 await assert.rejects(mut('receipt',{id:id(),storeId:other,supplierId:supplier,productId:fruit,date,kg:1,pieces:1,totalCost:10}),/Hak akses/);
 await assert.rejects(mut('employee_save',{id:id(),employeeId:employee,role:'owner'}),/Hak akses/);
 await mut('attendance_in',{id:id(),storeId:store,date});await assert.rejects(mut('attendance_in',{id:id(),storeId:store,date}),/unique/);await mut('attendance_out',{id:id(),date});
 await db.exec('set role authenticated');await assert.rejects(db.query('select public.pos_read_v8()'),/permission denied/);await db.exec('reset role');
 await as(owner);fs.writeFileSync('/tmp/maniac-ops-fixture.json',JSON.stringify(await read()));
 if(install==='upgrade'&&process.env.OPS_DUMP_PATH)fs.writeFileSync(process.env.OPS_DUMP_PATH,Buffer.from(await (await db.dumpDataDir()).arrayBuffer()));
 console.log(install+': stock, costs, mixed orders, waste, rollback, idempotency, role/store isolation, attendance OK');
 }catch(e){console.error(e.message,e.internalQuery||'',e.where||'');process.exitCode=1;break;}finally{await db.close()}
}

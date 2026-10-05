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

 const first=id(),second=id();
 const create=(key,qty)=>({id:key,storeId:store,date,lines:[{productId:dessert,qty,price:100}]});
 const before=await read();
 await assert.rejects(mut('order_create',create(id(),11)),/Stok kurang/);
 assert.equal((await read()).orders.length,before.orders.length);
 assert.equal((await read()).events.length,before.events.length);
 const request=create(first,6);await mut('order_create',request);await mut('order_create',request);
 assert.equal((await read()).unitLots.find(l=>l.id===production).qty,500);
 assert.equal((await read()).orders.find(o=>o.id===first).reserved['product:'+prep].qty,300);
 await assert.rejects(mut('order_create',create(id(),5)),/Stok kurang/);
 await mut('order_create',create(second,4));
 await assert.rejects(mut('order_create',create(id(),1)),/Stok kurang/);
 await mut('order_cancel',{id:id(),orderId:second,date,reason:'Pelanggan batal'});
 const replacement=id();await mut('order_create',create(replacement,4));
 const cook=id();await db.query('insert into auth.users values($1,$2)',[cook,'cook@test.local']);
 await db.query("insert into public.md_pos_employees(id,user_id,name,email,role,store_ids) values($1,$1,'Cook','cook@test.local','kitchen',array[$2]::uuid[])",[cook,store]);
 await db.query('insert into public.md_pos_staff values($1)',[cook]);
 await as(cook);
 await assert.rejects(mut('order_create',create(id(),1)),/Hak akses/);
 await mut('order_start',{id:id(),orderId:replacement,date});
 assert.equal((await read()).unitLots.find(l=>l.id===production).qty,300);
 await mut('order_start',{id:id(),orderId:first,date});
 assert.equal((await read()).unitLots.find(l=>l.id===production).qty,0);
 await mut('order_ready',{id:id(),orderId:first,date});
 assert.equal((await read()).orders.find(o=>o.id===first).status,'ready');
 await assert.rejects(mut('order_pay',{id:id(),orderId:first,date,paid:600,payment:'Tunai'}),/Hak akses/);
 await as(owner);await mut('order_pay',{id:id(),orderId:first,date,paid:600,payment:'Tunai'});
 assert.equal((await read()).orders.find(o=>o.id===first).status,'paid');
 await assert.rejects(mut('order_create',create(id(),1)),/Stok kurang/);
 // Raw ingredients exist, but absent prepared cendol cannot be sold as dessert.
 assert((await read()).unitLots.find(l=>l.id===rlot).qty>0);
 await db.exec(fs.readFileSync('database/011-order-stock-kitchen.sql','utf8'));
 assert.equal((await read()).orderStockVersion,11);
 console.log('PASS '+install+': oversell rollback, combined reservations, retry, cancellation, kitchen permissions, consume once, ready and paid, no auto-prep.');
 }finally{await db.close();}
}

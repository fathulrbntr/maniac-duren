import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {batchReport,rootContributions} from '../pos/batch-tracking.mjs';
const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1kAAAAASUVORK5CYII=';
for(const install of ['fresh','upgrade']){
 const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 const sql=fs.readFileSync('database/pos.sql','utf8');await db.exec(install==='fresh'?sql:sql.slice(0,sql.indexOf('-- Bagian: sections/operations/batch-tracking.sql')));
 await db.exec(fs.readFileSync('database/migrations/021-batch-tracking.sql','utf8'));
 await db.exec(fs.readFileSync('database/migrations/021-batch-tracking.sql','utf8'));
 const owner=id(),store=id(),other=id(),supplier=id(),fruit=id();
 await db.query('insert into auth.users values($1,$2)',[owner,'owner@test.local']);await db.query('insert into public.md_pos_staff values($1)',[owner]);
 await db.query("insert into public.md_pos_employees(id,user_id,name,email,role) values($1,$1,'Owner','owner@test.local','owner')",[owner]);
 const as=async user=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await as(owner);
 const mut=async(a,p)=>(await db.query('select public.pos_mutate($1,$2::jsonb) s',[a,JSON.stringify(p)])).rows[0].s;
 const read=async()=>(await db.query('select public.pos_read() s')).rows[0].s;
 for(const [key,name] of [[store,'Depok'],[other,'Bogor']])await mut('master',{id:key,kind:'stores',name});
 await mut('master',{id:supplier,kind:'suppliers',name:'Supplier A'});
 await mut('product_save',{id:fruit,name:'Monthong',sku:'MONTHONG',itemType:'direct',category:'Buah',stockUnit:'kg_butir',priceKg:100000,pricePiece:250000});
 const root=id(),reject=id(),shipment=id();
 const intake={id:shipment,storeId:store,supplierId:supplier,date,invoiceNo:'NOTA-001',shippingCost:0,unloadingComplete:true,lines:[{id:root,productId:fruit,purchaseCost:0,rejectKg:40,rejectPieces:16,rejectId:reject,weighings:[{id:id(),kg:60,pieces:24,createdAt:new Date().toISOString()},{id:id(),kg:40,pieces:16,createdAt:new Date().toISOString()}]}]};
 let s=await mut('receipt_intake',intake);assert.equal(s.batchTrackingVersion,21);assert.equal(s.lots.find(l=>l.id===root).kg,60);assert.equal(s.lots.find(l=>l.id===root).unitCost,null);assert.equal(s.lots.find(l=>l.id===reject).quality,'reject');
 await mut('receipt_intake',intake);await assert.rejects(mut('receipt_intake',{...intake,invoiceNo:'changed'}),/isi berbeda/);
 const pendingOrder={id:id(),storeId:store,date,payment:'Tunai',paid:1000000,lines:[{productId:fruit,lotId:root,kg:5,pieces:2,unit:'KG',price:100000}]};
 await assert.rejects(mut('order_create',pendingOrder),/matang|siap|stok/i);
 const reconcile={id:id(),storeId:store,date,shipmentId:shipment,shippingCost:1000000,lines:[{id:root,purchaseCost:4000000,expectedKg:120,expectedPieces:50}]};
 s=await mut('receipt_reconcile',reconcile);assert.equal(s.lots.find(l=>l.id===root).unitCost,50000);assert.equal(s.lots.find(l=>l.id===reject).unitCost,50000);assert.equal(s.lots.find(l=>l.id===root).expectedKg,120);
 assert.equal(batchReport(s,root).differenceKg,20);assert.equal(batchReport(s,root).differencePieces,10);
 await mut('receipt_reconcile',reconcile);await assert.rejects(mut('receipt_reconcile',{...reconcile,id:id()}),/modal sudah/);
 const daily=id();s=await mut('reject_mark',{id:daily,storeId:store,date,lotId:root,kg:5,pieces:2,reason:'Terlalu matang',cause:'overripe'});assert.equal(s.lots.find(l=>l.id===root).kg,55);assert.equal(s.lots.find(l=>l.id===daily).unitCost,50000);
 const a=s.products.find(p=>p.name==='Durpas 1 kg'),b=s.products.find(p=>p.name==='Durpas 500 gr'),c=s.products.find(p=>p.name==='Coral');
 const out1=id(),out2=id(),wasteId=id();
 const waste={id:wasteId,storeId:store,date,receivedDate:date,sourceLotId:reject,kg:40,pieces:16,shellKg:20,spoiledKg:2,additionalCost:0,reason:'Sortasi reject',processedBy:'Owner',outputs:[{key:'durpas500',productId:b.id,qty:0,lotId:id()},{key:'durpas1000',productId:a.id,qty:10,lotId:out1},{key:'coral',productId:c.id,qty:8,lotId:out2}],evidence:{reject:image,durpas1000:image,coral:image}};
 await assert.rejects(mut('waste_process',{...waste,id:id(),shellKg:19}),/Berat input/);
 s=await mut('waste_process',waste);assert.equal(s.unitLots.find(l=>l.id===out1).unitCost,100000);assert.equal(s.unitLots.find(l=>l.id===out2).unitCost,100000);assert.equal(s.money.find(m=>m.event_id===wasteId).cost,200000);
 await mut('waste_process',waste);
 const meat=id(),ice=id();await mut('product_save',{id:meat,name:'Daging durian',sku:'DAGING',itemType:'prep',stockUnit:'kg'});await mut('product_save',{id:ice,name:'Es durian',sku:'ES-DURIAN',itemType:'finished',stockUnit:'pcs',category:'Dessert',salePrice:25000});
 const meatLot=id(),iceLot=id(),processId=id();const process={id:processId,storeId:store,date,inputs:[{lotId:out2,qty:8}],seedKg:3,spoiledKg:0,additionalCost:50000,outputs:[{lotId:meatLot,productId:meat,qty:3,durianKg:3,additionalCost:0},{lotId:iceLot,productId:ice,qty:20,durianKg:2,additionalCost:10000}]};
 s=await mut('coral_process',process);assert.equal(s.unitLots.find(l=>l.id===out2).qty,0);assert.equal(s.unitLots.find(l=>l.id===meatLot).unitCost,170000);assert.equal(s.unitLots.find(l=>l.id===iceLot).unitCost,17500);
 assert.equal(rootContributions(s,iceLot,20)[0].lotId,root);assert.equal(batchReport(s,root).closed,false);
 await mut('coral_process',process);await assert.rejects(mut('coral_process',{...process,seedKg:2}),/isi berbeda/);
 await assert.rejects(mut('waste_void',{id:id(),wasteId,reason:'Uji pembatalan'}),/sudah dipakai|berubah/);
 const order={id:id(),storeId:store,date,payment:'Tunai',paid:25000,lines:[{productId:ice,qty:1,price:25000}]};s=await mut('order_create',order);assert.equal(s.unitLots.find(l=>l.id===iceLot).qty,19);assert(batchReport(s,root).sales.some(x=>x.id===order.id));
 await assert.rejects(mut('coral_void',{id:id(),storeId:store,date,processId,reason:'Salah input'}),/sudah digunakan/);
 // Mixed supplier inputs preserve both supplier/batch links.
 const supplierB=id(),rootB=id(),rejectB=id(),shipB=id();await mut('master',{id:supplierB,kind:'suppliers',name:'Supplier B'});
 await mut('receipt_batch',{id:shipB,storeId:store,supplierId:supplierB,date,invoiceNo:'NOTA-B',shippingCost:0,unloadingComplete:true,lines:[{id:rootB,productId:fruit,purchaseCost:100000,rejectKg:2,rejectPieces:1,rejectId:rejectB,weighings:[{id:id(),kg:2,pieces:1,createdAt:new Date().toISOString()}]}]});
 const makeWaste=async(source,kg,pieces,durpas,coral,shell)=>{const output=id();await mut('waste_process',{...waste,id:id(),sourceLotId:source,kg,pieces,shellKg:shell,spoiledKg:0,outputs:[{key:'durpas500',productId:b.id,qty:durpas,lotId:id()},{key:'durpas1000',productId:a.id,qty:0,lotId:id()},{key:'coral',productId:c.id,qty:coral,lotId:output}],evidence:{reject:image,durpas500:image,coral:image}});return output;};
 const coralA=await makeWaste(daily,5,2,2,1,3),coralB=await makeWaste(rejectB,2,1,1,.5,1),mixed=id();
 s=await mut('coral_process',{id:id(),storeId:store,date,inputs:[{lotId:coralA,qty:1},{lotId:coralB,qty:.5}],seedKg:.5,spoiledKg:0,additionalCost:0,outputs:[{lotId:mixed,productId:meat,qty:1,durianKg:1}]});
 assert.equal(s.unitLots.find(l=>l.id===mixed).unitCost,175000);assert.deepEqual(new Set(rootContributions(s,mixed,1).map(x=>x.lotId)),new Set([root,rootB]));
 fs.writeFileSync('/tmp/batch-ui-fixture.json',JSON.stringify(s));
 // Warehouse access cannot reconcile cost, produce, or read finance.
 const warehouse=id();await db.query('insert into auth.users values($1,$2)',[warehouse,'warehouse@test.local']);await db.query('insert into public.md_pos_staff values($1)',[warehouse]);await db.query("insert into public.md_pos_employees(id,user_id,name,email,role,store_ids) values($1,$1,'Stocker','warehouse@test.local','warehouse',array[$2]::uuid[])",[warehouse,store]);await as(warehouse);
 await assert.rejects(mut('receipt_reconcile',{...reconcile,id:id()}),/Hak akses/);await assert.rejects(mut('coral_process',{...process,id:id()}),/Hak akses/);
 s=await read();assert.equal(s.lots.find(l=>l.id===root).unitCost,null);assert.equal(s.batchProcesses[0].totalCost,undefined);
 const admin=id();await db.query('insert into auth.users values($1,$2)',[admin,'admin@test.local']);await db.query('insert into public.md_pos_staff values($1)',[admin]);await db.query("insert into public.md_pos_employees(id,user_id,name,email,role) values($1,$1,'Admin pusat','admin@test.local','admin')",[admin]);await as(admin);
 s=await read();assert.equal(s.stores.length,2);assert.equal(s.access.finance,true);assert.equal(s.access.employees,false);assert.equal(s.access.cancel,false);assert.equal(s.access.produce,false);assert.equal(s.lots.find(l=>l.id===root).unitCost,50000);
 await as(owner);
 // Once all descendant stock is used/discarded the supplier batch closes.
 s=await read();for(const l of batchReport(s,root).descendants.map(x=>x.lot).filter(l=>(l.kg??l.qty)>0))await mut('inventory_loss',{id:id(),lotId:l.id,date,qty:l.kg??l.qty,pieces:l.pieces??0,cause:'discard',reason:'Penutupan stok uji'});
 assert.equal(batchReport(await read(),root).closed,true);
 console.log('PASS batch tracking '+install+': actual intake/reject, pending stock, PO variance, actual HPP, daily reject, two-stage yield, cost conservation, supplier lineage, sales, retry, rollback, access, closure');
 }finally{await db.close();}
}

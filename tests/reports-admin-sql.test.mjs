import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const dbPath='/tmp/maniac-071-testdb';fs.rmSync(dbPath,{recursive:true,force:true});
const db=new PGlite(dbPath);
try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 for(const file of ['database/pos.sql','database/compress-pos-photos.sql','database/pos-menu-categories.sql','database/pos-cashier-controls.sql','database/link-durian-reject.sql','database/reject-flow-063.sql','database/store-receipt-064.sql','database/employee-details-070.sql','database/reports-admin-071.sql','database/reports-admin-071.sql']){
  if(file.endsWith('link-durian-reject.sql'))await db.exec(fs.readFileSync('database/seeds/import-durian-dan-turunan.sql','utf8').replace("null, null, null, null, '', ''","case when r.stock_unit='kg_butir' then 50000 end, case when r.stock_unit='kg_butir' then 100000 end, null, null, '', ''"));
  await db.exec(fs.readFileSync(file,'utf8'));
 }
 const owner=id(),manager=id(),cashier=id(),store=id(),other=id(),supplier=id(),fruit=id(),direct=id();
 await db.query("insert into md_pos_stores(id,name,location) values($1,'Depok','Jl. Depok'),($2,'Bekasi','Jl. Bekasi')",[store,other]);
 for(const [u,role] of [[owner,'owner'],[manager,'manager'],[cashier,'cashier']]){await db.query('insert into auth.users values($1,$2)',[u,u+'@test.local']);await db.query('insert into md_pos_staff values($1)',[u]);await db.query('insert into md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$2,$3)',[u,role,[store]]);}
 const as=u=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);await as(owner);await db.exec('set role authenticated');
 const mut=async(action,p)=>(await db.query('select pos_mutate_027($1,$2::jsonb) s',[action,JSON.stringify(p)])).rows[0].s;
 const read=async()=>(await db.query('select pos_read() s')).rows[0].s;
 const get=async key=>(await db.query('select pos_document_get($1) d',[key])).rows[0].d;
 const date='2026-10-01';
 await mut('master',{id:supplier,kind:'suppliers',name:'Supplier A'});
 await mut('product_save',{id:fruit,name:'Buah Test',sku:'FR071',itemType:'direct',category:'Buah',stockUnit:'kg_butir',priceKg:100,pricePiece:200});
 await mut('product_save',{id:direct,name:'Air Test',sku:'DR071',itemType:'direct',category:'Minuman',stockUnit:'pcs',salePrice:20});
 const save=async(kind,body,extra={})=>{const key=id();await mut('document_save',{id:id(),documentId:key,storeId:store,kind,date,version:0,body,...extra});return key;};
 const issue=async key=>mut('document_issue',{id:id(),documentId:key,storeId:store,version:(await get(key)).version});
 const lines=[{productId:fruit,qty:10,pieces:5,price:10},{productId:direct,qty:10,price:3}];
 const po=await save('PO',{supplierId:supplier,lines,shipping:20,party:'',sourceType:''});await issue(po);assert.match((await get(po)).number,/MD\/PO\/202610\/000001/);
 const pur=await save('PUR',{supplierId:supplier,lines,shipping:20,sourceType:'po',sourceId:po});
 const payload={id:id(),documentId:pur,storeId:store,version:1};let s=await mut('document_issue',payload);const count=s.lots.length+s.unitLots.length;await mut('document_issue',payload);s=await read();assert.equal(s.lots.length+s.unitLots.length,count);
 const purchased=await get(pur);assert.equal(purchased.total,150);assert.equal(purchased.body.lines.length,2);assert.equal(s.lots.find(l=>l.id===purchased.body.lines[0].receiptId).kg,10);
 assert.equal(s.unitLots.find(l=>l.id===purchased.body.lines[1].receiptId).qty,10);
 const over=await save('PUR',{supplierId:supplier,lines,sourceType:'po',sourceId:po});await assert.rejects(issue(over),/melebihi/);
 // New transfer moves both stock types once. Source and destination movements reconcile.
 const transfer=await save('DO',{sourceType:'transfer',toStoreId:other,lines:purchased.body.lines.map(l=>({lotId:l.receiptId,qty:2,pieces:1}))});await issue(transfer);s=await read();assert.equal(s.lots.find(l=>l.id===purchased.body.lines[0].receiptId).kg,8);assert.equal(s.unitLots.find(l=>l.id===purchased.body.lines[1].receiptId).qty,8);
 assert.equal(s.unitLots.find(l=>l.storeId===other&&l.productId===direct).sourceLotId,purchased.body.lines[1].receiptId);
 const order=id();await mut('order_create',{id:order,storeId:store,date,paid:100,payment:'Tunai',lines:[{productId:direct,qty:2,price:20}]});s=await read();
 const inv=await save('INV',{sourceType:'order',sourceId:order,party:'Pelanggan A',address:'Jl. Pelanggan'});const before=[s.orders.length,s.unitLots.find(l=>l.id===purchased.body.lines[1].receiptId).qty];await issue(inv);s=await read();assert.deepEqual([s.orders.length,s.unitLots.find(l=>l.id===purchased.body.lines[1].receiptId).qty],before);assert.equal((await get(inv)).total,40);
 const duplicate=await save('INV',{sourceType:'order',sourceId:order,party:'Pelanggan A'});await assert.rejects(issue(duplicate),/sudah ada/);
 const doSale=await save('DO',{sourceType:'order',sourceId:order,party:'Pelanggan A'});await issue(doSale);
 const saleDO=await get(doSale);assert.equal(saleDO.total,0);assert(!('price' in saleDO.body.lines[0]));
 const move=(await read()).movements.find(m=>m.kind==='Transfer');const oldDO=await save('DO',{sourceType:'movement',sourceId:move.id});await issue(oldDO);assert.equal((await get(oldDO)).body.party,'Bekasi');
 // Any failure in one line rolls back the entire transfer, including the valid first line.
 const failedTransfer=await save('DO',{sourceType:'transfer',toStoreId:other,lines:[{lotId:purchased.body.lines[0].receiptId,qty:1,pieces:1},{lotId:purchased.body.lines[1].receiptId,qty:999999}]});
 const pre=(await read()).lots.find(l=>l.id===purchased.body.lines[0].receiptId).kg;await assert.rejects(issue(failedTransfer),/Jumlah/);assert.equal((await read()).lots.find(l=>l.id===purchased.body.lines[0].receiptId).kg,pre);assert.equal((await get(failedTransfer)).status,'draft');
 const copy=await save('PUR',{sourceType:'receipt',sourceId:purchased.body.lines[0].receiptId});await issue(copy);assert.equal((await read()).lots.length,s.lots.length);
 await assert.rejects(mut('document_save',{id:id(),documentId:inv,storeId:store,kind:'INV',date,version:2,body:{sourceType:'order',sourceId:order}}),/terbit/);
 await mut('letterhead_save',{id:id(),storeId:store,version:0,header:{name:'KOP BARU',address:'Alamat baru'}});assert.notEqual((await get(inv)).header.name,'KOP BARU');
 await assert.rejects(mut('letterhead_save',{id:id(),storeId:store,version:0,header:{name:'Stale',address:'Alamat'}}),/berubah/);
 const ex=id();await mut('expense_save',{id:ex,storeId:store,date,amount:100,category:'Operasional',description:'Beli alat kebersihan',payment:'Tunai'});await mut('expense_void',{id:id(),expenseId:ex,storeId:store,reason:'Salah input'});assert((await read()).expenses.find(x=>x.id===ex).voided);
 await assert.rejects(mut('document_cancel',{id:id(),documentId:pur,storeId:store,version:2,reason:'Salah'}),/Stok/);
 await as(manager);await assert.rejects(mut('letterhead_save',{id:id(),storeId:store,version:1,header:{name:'X',address:'Y'}}),/owner/);await assert.rejects(mut('document_save',{id:id(),documentId:id(),storeId:other,kind:'PO',date,version:0,body:{}}),/Hak akses/);
 await as(cashier);await assert.rejects(get(inv),/Hak akses/);assert.equal((await read()).documents.length,0);
 await db.exec('set role anon');await assert.rejects(get(inv),/permission denied/);
 await db.exec('reset role');await as(owner);s=await read();fs.writeFileSync('/tmp/maniac-071-fixture.json',JSON.stringify(s));
 console.log('PASS migration repeat, document lifecycle, sequence, partial PO limit, atomic receipts, mixed transfers, invoice without duplicate sale, duplicate source prevention, letterhead snapshots, expenses, role/store isolation.');
}catch(err){console.error(err.message,err.where||'',err.internalQuery||'',err.stack);process.exitCode=1;}finally{await db.close();}

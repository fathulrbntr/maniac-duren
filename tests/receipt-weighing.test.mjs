import assert from 'node:assert/strict';
import { randomUUID as id } from 'node:crypto';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { weighingTotals } from '../pos/receipt-weighing.mjs';
const rows = [{id:id(),kg:12.5,pieces:5,createdAt:new Date().toISOString()},{id:id(),kg:7.5,pieces:3,createdAt:new Date().toISOString()}];
assert.deepEqual(weighingTotals(rows,1000000,200000),{kg:20,pieces:8,purchase:1000000,shipping:200000,total:1200000,purchaseKg:50000,purchasePiece:125000,costKg:60000,costPiece:150000});
assert.throws(()=>weighingTotals([{kg:2,pieces:1.5}]),/bilangan bulat/);
assert.throws(()=>weighingTotals([{kg:0,pieces:1}]),/berat/);
for(const install of ['fresh','upgrade']) {
 const db=new PGlite();
 try {
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
  const sql=fs.readFileSync('database/pos.sql','utf8');
  if(install==='fresh') await db.exec(sql);
  else {
   await db.exec(process.env.RECEIPT_BASELINE_SQL ? fs.readFileSync(process.env.RECEIPT_BASELINE_SQL,'utf8') : sql.slice(0,sql.indexOf('-- 018:')));
   await db.exec(fs.readFileSync('database/sections/operations/receipt-cost-breakdown.sql','utf8'));
   await db.exec(fs.readFileSync('database/sections/operations/receipt-weighing.sql','utf8'));
  }
  await db.exec(fs.readFileSync('database/sections/operations/receipt-weighing.sql','utf8')); // rerun
  await db.exec(fs.readFileSync('database/sections/operations/direct-stock-no-sorting.sql','utf8'));
  await db.exec(fs.readFileSync('database/sections/operations/direct-stock-no-sorting.sql','utf8'));
  const owner=id(),store=id(),supplier=id(),product=id();
  await db.query('insert into auth.users values($1,$2)',[owner,'owner@test.local']);
  await db.query('insert into public.md_pos_staff values($1)',[owner]);
  await db.query("insert into public.md_pos_employees(id,user_id,name,email,role) values($1,$1,'Owner','owner@test.local','owner')",[owner]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  const mut=async(action,p)=>(await db.query('select public.pos_mutate($1,$2::jsonb) s',[action,JSON.stringify(p)])).rows[0].s;
  await mut('master',{id:store,kind:'stores',name:'Depok'});
  await mut('master',{id:supplier,kind:'suppliers',name:'Supplier'});
  await mut('product_save',{id:product,name:'Monthong',sku:'M',itemType:'direct',category:'Buah',stockUnit:'kg_butir',priceKg:100,pricePiece:200});
  const p={id:id(),storeId:store,supplierId:supplier,productId:product,date:'2026-10-06',kg:'20',pieces:'8',purchaseCost:1000000,shippingCost:200000,totalCost:1200000,weighings:rows,unloadingComplete:true};
  await assert.rejects(mut('receipt',{...p,unloadingComplete:false}),/Konfirmasi/);
  await assert.rejects(mut('receipt',{...p,kg:'21'}),/Total/);
  await assert.rejects(mut('receipt',{...p,weighings:[{...rows[0],pieces:1.5}]}),/bilangan bulat/);
  await assert.rejects(mut('receipt',{...p,weighings:[rows[0],rows[0]]}),/terduplikasi/);
  let s=await mut('receipt',p),lot=s.lots.find(l=>l.id===p.id);
  assert.equal(s.incomingReadyVersion,19);assert.equal(lot.quality,'ready');assert.equal(s.receiptWeighingVersion,18);assert.deepEqual(lot.weighings,rows);assert.equal(lot.receivedKg,20);assert.equal(lot.receivedPieces,8);assert.equal(lot.totalCost,1200000);assert.equal(lot.unitCost,60000);
  s=await mut('receipt',p);assert.equal(s.lots.filter(l=>l.id===p.id).length,1);assert.deepEqual(s.lots.find(l=>l.id===p.id).weighings,rows);
  await assert.rejects(mut('sort',{id:id(),lotId:p.id,date:p.date,parts:[]}),/dinonaktifkan/);
  const sold=await mut('sale',{id:id(),storeId:store,date:p.date,paid:100,payment:'Tunai',lines:[{lotId:p.id,kg:1,pieces:1,unit:'KG',price:100}]});
  assert.equal(sold.lots.find(l=>l.id===p.id).kg,19);
  await db.query("update public.md_pos_lots set quality='unsorted' where id=$1",[p.id]);
  await db.exec(fs.readFileSync('database/sections/operations/direct-stock-no-sorting.sql','utf8'));
  assert.equal((await db.query('select quality from public.md_pos_lots where id=$1',[p.id])).rows[0].quality,'ready');
  console.log('PASS weighing receipt '+install+': confirmation, totals, history, costs, retry, migration rerun');
 } finally { await db.close(); }
}

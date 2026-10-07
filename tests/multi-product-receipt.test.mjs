import assert from 'node:assert/strict';
import { randomUUID as id } from 'node:crypto';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { weighingTotals, shipmentTotals } from '../pos/receipt-weighing.mjs';
const rows = [{id:id(),kg:12.5,pieces:5,createdAt:new Date().toISOString()},{id:id(),kg:7.5,pieces:3,createdAt:new Date().toISOString()}];
assert.deepEqual(weighingTotals(rows,1000000,200000),{kg:20,pieces:8,purchase:1000000,shipping:200000,total:1200000,purchaseKg:50000,purchasePiece:125000,costKg:60000,costPiece:150000});
assert.throws(()=>weighingTotals([{kg:2,pieces:1.5}]),/bilangan bulat/);
assert.throws(()=>weighingTotals([{kg:0,pieces:1}]),/berat/);
const split=shipmentTotals([{weighings:[{kg:20,pieces:5}],purchaseCost:1000000},{weighings:[{kg:10,pieces:5}],purchaseCost:600000}],300000);
assert.equal(split.items[0].shipping,200000);assert.equal(split.items[1].shipping,100000);assert.equal(split.total,1900000);
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

  await db.exec(fs.readFileSync('database/sections/operations/multi-product-receipt.sql','utf8'));
  await db.exec(fs.readFileSync('database/sections/operations/multi-product-receipt.sql','utf8'));
  const product2=id();
  await mut('product_save',{id:product2,name:'Bawor',sku:'B',itemType:'direct',category:'Buah',stockUnit:'kg_butir',priceKg:100,pricePiece:200});
  const line=(pid,kg,cost)=>({id:id(),productId:pid,purchaseCost:cost,weighings:[{id:id(),kg,pieces:5,createdAt:new Date().toISOString()}]});
  const p={id:id(),storeId:store,supplierId:supplier,date:'2026-10-07',note:'SJ-001',shippingCost:300000,unloadingComplete:true,lines:[line(product,20,1000000),line(product2,10,600000)]};
  let s=await mut('receipt_batch',p),lots=s.lots.filter(l=>l.shipmentId===p.id);
  assert.equal(s.multiReceiptVersion,20);assert.equal(lots.length,2);
  assert.equal(lots.find(l=>l.productId===product).shippingCost,200000);
  assert.equal(lots.find(l=>l.productId===product2).shippingCost,100000);
  assert.equal(lots.reduce((sum,l)=>sum+l.totalCost,0),1900000);assert.ok(lots.every(l=>l.quality==='ready'));
  s=await mut('receipt_batch',p);assert.equal(s.lots.filter(l=>l.shipmentId===p.id).length,2);
  await assert.rejects(mut('receipt_batch',{...p,shippingCost:400000}),/isi berbeda/);
  await assert.rejects(mut('receipt_batch',{...p,id:id(),lines:[line(product,5,100),line(product,5,100)]}),/terduplikasi/);
  const bad={...p,id:id(),lines:[line(product,5,100),line(product2,5,100)]};bad.lines[1].weighings[0].pieces=1.5;
  await assert.rejects(mut('receipt_batch',bad),/bilangan bulat/);
  assert.equal((await db.query('select count(*)::int n from public.md_pos_lots where id=$1',[bad.lines[0].id])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from public.md_pos_receipt_shipments where id=$1',[bad.id])).rows[0].n,0);
  const stranger=id();
  await db.query('insert into auth.users values($1,$2)',[stranger,'no-access@test.local']);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[stranger]);
  await assert.rejects(mut('receipt_batch',{...p,id:id()}));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  const zero={...p,id:id(),shippingCost:0,lines:[line(product,5,100)]};
  s=await mut('receipt_batch',zero);assert.equal(s.lots.find(l=>l.id===zero.lines[0].id).shippingCost,0);
  const uneven={...p,id:id(),shippingCost:100,lines:[line(product,1,100),line(product2,2,100)]};
  await mut('receipt_batch',uneven);
  assert.equal(Number((await db.query('select sum(shipping_cost)::text total from public.md_pos_lots where shipment_id=$1',[uneven.id])).rows[0].total),100);
  console.log('PASS multi-product '+install+': allocation, retry, changed retry, duplicate product, rollback, zero shipping, exact allocation, migration rerun');
 } finally { await db.close(); }
}

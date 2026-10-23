import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
for(const install of ['019','021']){
 const db=new PGlite();
 try{
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
  await db.exec(fs.readFileSync('database/pos.sql','utf8'));
  if(install==='021')for(const name of ['multi-product-receipt','batch-tracking'])await db.exec(fs.readFileSync(`database/sections/operations/${name}.sql`,'utf8'));
  const definition=(await db.query("select pg_get_functiondef('public.pos_mutate(text,jsonb)'::regprocedure) body")).rows[0].body;
  const sql=fs.readFileSync('database/receipt-shipment-082.sql','utf8');await db.exec(sql);await db.exec(sql);
  assert.equal((await db.query("select pg_get_functiondef('public.pos_mutate(text,jsonb)'::regprocedure) body")).rows[0].body,definition);
  const owner=id(),store=id(),supplier=id(),product=id(),product2=id();
  await db.query('insert into auth.users values($1,$2)',[owner,'owner@test.local']);
  await db.query('insert into public.md_pos_staff values($1)',[owner]);
  await db.query("insert into public.md_pos_employees(id,user_id,name,email,role) values($1,$1,'Owner','owner@test.local','owner')",[owner]);
  const as=async user=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await as(owner);
  const mut=async(action,p)=>(await db.query('select public.pos_mutate_027($1,$2::jsonb) s',[action,JSON.stringify(p)])).rows[0].s;
  const receive=async p=>(await db.query('select public.pos_receive_shipment($1::jsonb) s',[JSON.stringify(p)])).rows[0].s;
  await mut('master',{id:store,kind:'stores',name:'Depok'});await mut('master',{id:supplier,kind:'suppliers',name:'Supplier'});
  for(const [key,name] of [[product,'Bawor'],[product2,'Monthong']])await mut('product_save',{id:key,name,sku:name,itemType:'direct',category:'Buah',stockUnit:'kg_butir',priceKg:100,pricePiece:200});
  const line=(productId,kg,cost)=>({id:id(),productId,purchaseCost:cost,weighings:[{id:id(),kg,pieces:5,createdAt:new Date().toISOString()}]});
  const p={id:id(),storeId:store,supplierId:supplier,date:'2026-10-01',invoiceNo:'NOTA-001',note:'Surat jalan 08',shippingCost:300000,unloadingComplete:true,lines:[line(product,20,1000000),line(product2,10,600000)]};
  let s=await receive(p),lots=s.lots.filter(l=>l.shipmentId===p.id);
  assert.equal(s.receiptShipmentVersion,82);assert.equal(lots.length,2);assert(lots.every(l=>l.invoiceNo==='NOTA-001'&&l.quality==='ready'));
  assert.equal(lots.find(l=>l.productId===product).shippingCost,200000);assert.equal(lots.find(l=>l.productId===product2).shippingCost,100000);assert.equal(lots.reduce((n,l)=>n+l.totalCost,0),1900000);
  assert.deepEqual(lots.find(l=>l.id===p.lines[0].id).weighings,p.lines[0].weighings);
  s=await receive(p);assert.equal(s.lots.filter(l=>l.shipmentId===p.id).length,2);
  await assert.rejects(receive({...p,invoiceNo:'CHANGED'}),/isi berbeda/);
  const fresh=()=>({...p,id:id(),lines:[line(product,5,100),line(product2,5,100)]});
  await assert.rejects(receive({...fresh(),invoiceNo:' '}),/Nomor nota/);
  await assert.rejects(receive({...fresh(),lines:[line(product,5,100),line(product,5,100)]}),/terduplikasi/);
  const bad=fresh();bad.lines[1].weighings[0].pieces=1.5;await assert.rejects(receive(bad),/bilangan bulat/);
  const later=fresh();later.lines[1].productId=id();await assert.rejects(receive(later));
  assert.equal((await db.query('select count(*)::int n from public.md_pos_lots where id=$1',[later.lines[0].id])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from public.md_pos_receipt_shipments where id=$1',[later.id])).rows[0].n,0);
  const one={...fresh(),shippingCost:0};one.lines.pop();s=await receive(one);assert.equal(s.lots.find(l=>l.id===one.lines[0].id).shippingCost,0);
  const uneven={...fresh(),shippingCost:100,lines:[line(product,1,0),line(product2,2,0)]};await receive(uneven);
  assert.equal(Number((await db.query('select sum(shipping_cost)::text total from public.md_pos_lots where shipment_id=$1',[uneven.id])).rows[0].total),100);
  const stranger=id();await db.query('insert into auth.users values($1,$2)',[stranger,'outsider@test.local']);await as(stranger);await assert.rejects(receive(fresh()),/akses/i);
  console.log(`PASS SQL ${install}: invoice persistence, exact costs, atomic rollback, idempotency, access, safe rerun, existing mutation preserved`);
 }finally{await db.close();}
}

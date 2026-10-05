import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
  await db.exec(fs.readFileSync(process.env.POS_UPGRADE_BASE || 'database/pos.sql', 'utf8'));
  const migration = fs.readFileSync('database/010-store-name.sql', 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  const owner = id(), store = id(), cashier = id(), product = id(), supplier = id(), lot = id();
  await db.query('insert into auth.users values($1,$2),($3,$4)', [owner, 'owner@test.local', cashier, 'cashier@test.local']);
  await db.query('insert into public.md_pos_staff values($1)', [owner]);
  await db.query("insert into public.md_pos_employees(id,user_id,name,email,role) values($1,$1,'Owner','owner@test.local','owner'),($2,$2,'Cashier','cashier@test.local','cashier')", [owner,cashier]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.query("insert into public.md_pos_stores(id,name,location) values($1,'Toko lama','Depok')", [store]);
  await db.query("insert into public.md_pos_suppliers(id,name) values($1,'Supplier')", [supplier]);
  await db.query("insert into public.md_pos_products(id,name,sku,price_kg,price_piece) values($1,'Monthong','DUR-TEST',50000,100000)", [product]);
  await db.query("insert into public.md_pos_lots(id,store_id,supplier_id,product_id,received_date,received_kg,received_pieces,kg,pieces) values($1,$2,$3,$4,current_date,10,5,10,5)", [lot,store,supplier,product]);
  const originalLots = (await db.query('select * from public.md_pos_lots')).rows;
  const mutate = payload => db.query("select public.pos_mutate('master_details',$1::jsonb) as state", [JSON.stringify(payload)]);
  for (const name of ['Maniac Duren Depok','Nama sementara','Maniac Duren Depok']) {
    const payload = {id:store,kind:'stores',name,location:'Depok baru',editRequestId:id()};
    const result = await mutate(payload);
    assert.equal(result.rows[0].state.stores.find(x=>x.id===store).name,name);
    await mutate(payload); // Same request can be retried safely.
  }
  assert.deepEqual((await db.query('select * from public.md_pos_lots')).rows, originalLots);
  for (const name of ['', '   ', 'x'.repeat(101), null]) {
    await assert.rejects(mutate({id:store,kind:'stores',name,location:'Depok',editRequestId:id()}), /Nama toko wajib/);
  }
  await mutate({id:store,kind:'stores',location:'Lokasi saja',editRequestId:id()});
  assert.equal((await db.query('select name from public.md_pos_stores where id=$1',[store])).rows[0].name,'Maniac Duren Depok');
  await assert.rejects(mutate({id:id(),kind:'stores',name:'Tidak ada',editRequestId:id()}), /Master tidak ditemukan/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [cashier]);
  await assert.rejects(mutate({id:store,kind:'stores',name:'Tidak diizinkan',editRequestId:id()}), /Hak akses/);
  assert.equal((await db.query("select has_function_privilege('authenticated','public.pos_mutate_v8(text,jsonb)','EXECUTE') as allowed")).rows[0].allowed,false);
  console.log('PASS store settings: rename, retry, rename back, stock links, validation, permissions, repeat migration.');
} finally { await db.close(); }

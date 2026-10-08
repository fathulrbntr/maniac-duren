import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID as id} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const db=new PGlite();
try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 await db.exec(fs.readFileSync(process.env.POS_BASELINE_SQL||path.join(root,'database/pos.sql'),'utf8'));
 const owner=id(),cashier=id(),store=id(),otherStore=id(),photo='data:image/png;base64,'+'A'.repeat(256*1024);
 for(const [user,email]of[[owner,'owner@test.local'],[cashier,'cashier@test.local']]){
  await db.query('insert into auth.users values($1,$2)',[user,email]);
  await db.query('insert into public.md_pos_staff values($1)',[user]);
 }
 await db.query("insert into public.md_pos_stores(id,name) values($1,'Outlet A'),($2,'Outlet B')",[store,otherStore]);
 await db.query("insert into public.md_pos_employees(id,user_id,name,email,role,store_ids,profile_photo) values($1,$1,'Owner','owner@test.local','owner','{}',$4),($2,$2,'Kasir','cashier@test.local','cashier',array[$3::uuid],$4)",[owner,cashier,store,photo]);
 for(let i=0;i<18;i++)await db.query("insert into public.md_pos_employees(id,name,role,store_ids,profile_photo) values($1,$2,'staff',array[$3::uuid],$4)",[id(),'Employee '+i,otherStore,photo]);
 for(let i=0;i<5;i++)await db.query("insert into public.md_pos_products(id,name,sku,price_kg,price_piece,item_type,stock_unit,category,photo,buy_price) values($1,$2,$3,100,200,'direct','kg_butir','Buah',$4,50)",[id(),'Product '+i,'PHOTO-'+i,photo]);
 const as=async user=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
 const read=async()=>(await db.query('select public.pos_read() s')).rows[0].s;
 const timed=async()=>{const start=performance.now();await db.query('select md5(public.pos_read()::text) digest');return performance.now()-start};
 await as(owner);const beforeOwner=await read();await timed();const beforeMs=await timed();
 await as(cashier);const beforeCashier=await read();
 await db.exec(fs.readFileSync(path.join(root,'database/fix-pos-read-photos.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'database/fix-pos-read-photos.sql'),'utf8'));
 await as(owner);assert.deepEqual(await read(),beforeOwner);await timed();const afterMs=await timed();
 await as(cashier);assert.deepEqual(await read(),beforeCashier);
 assert.equal(beforeCashier.employees.length,1);assert.equal(beforeCashier.stores.length,1);
 assert.equal(beforeCashier.employees[0].profile_photo,photo);
 assert(beforeCashier.products.every(p=>!Object.hasOwn(p,'buyPrice')));
 await db.exec('set role authenticated');
 for(const fn of ['pos_read_compact_040','pos_read_before_photo_fix','pos_read_v8_before_photo_fix','pos_read_v10_before_photo_fix']){
  await assert.rejects(db.query('select public.'+fn+'()'),/permission denied/);
 }
 await db.exec('reset role');await as('');await assert.rejects(read(),/akses POS/);
 await as(owner);
 const diagnostic=await db.exec(fs.readFileSync(path.join(root,'database/check-pos-read.sql'),'utf8'));
 assert.equal(diagnostic[2].rows[0].perbaikan_foto_terpasang,true);
 assert(diagnostic[3].rows.every(row=>!row.circular));
 await db.exec(fs.readFileSync(path.join(root,'database/undo-pos-read-photos.sql'),'utf8'));
 assert.deepEqual(await read(),beforeOwner);
 await db.exec(fs.readFileSync(path.join(root,'database/fix-pos-read-photos.sql'),'utf8'));
 assert.deepEqual(await read(),beforeOwner);
 console.log(JSON.stringify({status:'PASS exact response/photos, role/store/cost isolation, private helper grants, no-login denial, rerun, undo/reapply',fixturePayloadBytes:Buffer.byteLength(JSON.stringify(beforeOwner)),beforeMs:Math.round(beforeMs),afterMs:Math.round(afterMs),speedup:Number((beforeMs/afterMs).toFixed(2))}));
}catch(error){console.error(error.message,error.code||'',error.where||'');process.exitCode=1;}
finally{await db.close()}

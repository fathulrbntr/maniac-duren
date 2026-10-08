import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {categoryPayload,defaultPosCategories} from '../pos/pos-categories.mjs';
const db=new PGlite(),migration=fs.readFileSync('database/pos-menu-categories.sql','utf8');
try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 await db.exec(fs.readFileSync(process.env.POS_TEST_SQL||'database/pos.sql','utf8'));
 await db.exec(fs.readFileSync('database/rollback-027-compat.sql','utf8'));
 if(process.env.POS_PHOTO_READ_FIX_SQL)await db.exec(fs.readFileSync(process.env.POS_PHOTO_READ_FIX_SQL,'utf8'));
 await db.exec(fs.readFileSync('database/compress-pos-photos.sql','utf8'));
 const owner=id(),cashier=id(),store=id(),supplier=id(),date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
 for(const [user,role] of [[owner,'owner'],[cashier,'cashier']]){
  await db.query('insert into auth.users values($1,$2)',[user,role+'@test.invalid']);await db.query('insert into public.md_pos_staff values($1)',[user]);
  await db.query('insert into public.md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$2,$3)',[user,role,[store]]);
 }
 await db.query("insert into public.md_pos_stores(id,name) values($1,'Outlet A')",[store]);await db.query("insert into public.md_pos_suppliers(id,name) values($1,'Supplier A')",[supplier]);
 const as=who=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);await as(owner);
 const read=async()=>(await db.query('select public.pos_read() s')).rows[0].s,save=async p=>(await db.query('select public.pos_menu_category_save($1) s',[p])).rows[0].s;
 let seed=fs.readFileSync('database/seeds/import-durian-dan-turunan.sql','utf8').replace("null, null, null, null, '', ''","case when r.stock_unit='kg_butir' then 50000 end, case when r.stock_unit='kg_butir' then 100000 end, null, null, '', ''");await db.exec(seed);
 await db.exec(fs.readFileSync('database/link-durian-reject.sql','utf8'));await db.exec(fs.readFileSync('database/product-variants.sql','utf8'));
 const add=async(name,itemType,stockUnit,category,price)=>{const p={id:id(),name,sku:'TEST-'+id().slice(0,10),itemType,stockUnit,category,salePrice:price};await db.query("select public.pos_mutate_027('product_save',$1)",[p]);return p;};
 const raw=await add('Gula untuk kitchen','raw','g',null,null),prep=await add('Cendol prepare','prep','g',null,null),water=await add('Crystaline','direct','pcs','Minuman',5000),dessert=await add('Es cendol','recipe','porsi','Dessert',25000);
 const beforeState=await read(),fruit=beforeState.products.find(p=>p.sku==='MD-MK-FRESH-BUAH'),coral=beforeState.products.find(p=>p.sku==='MD-MK-FRESH-CORAL');
 await db.query("insert into public.md_pos_lots(id,store_id,supplier_id,product_id,received_date,received_kg,received_pieces,kg,pieces,quality,unit_cost) values($1,$2,$3,$4,$5,100,40,100,40,'ready',10000)",[id(),store,supplier,fruit.id,date]);
 await db.query("insert into public.md_pos_unit_lots(id,product_id,store_id,unit,received_qty,qty,received_date,kind,supplier_id,unit_cost) values($1,$2,$3,'pcs',10,8,$4,'opening',$5,3000)",[id(),water.id,store,date,supplier]);
 const recipe=id();await db.query("insert into public.md_pos_recipes(id,name,output_id,yield_qty) values($1,'Es cendol',$2,1)",[recipe,dessert.id]);await db.query('insert into public.md_pos_recipe_items(recipe_id,product_id,qty) values($1,$2,20)',[recipe,prep.id]);
 const inventory=async()=>({lots:(await db.query('select * from public.md_pos_lots order by id')).rows,units:(await db.query('select * from public.md_pos_unit_lots order by id')).rows,recipes:(await db.query('select * from public.md_pos_recipe_items order by recipe_id,product_id')).rows});
 const inventoryBefore=await inventory(),productsBefore=(await db.query('select * from public.md_pos_products order by id')).rows;
 const root=(await db.query("select pg_get_functiondef('public.pos_read()'::regprocedure) d")).rows[0].d;
 await db.exec(migration);await db.exec(migration);
 const initial=await read(),cat=name=>initial.posCategories.find(c=>c.name===name).id;
 assert.deepEqual(initial.posCategories,defaultPosCategories());
 assert.equal(initial.products.find(p=>p.id===fruit.id).posCategoryId,cat('Buah'));assert.equal(initial.products.find(p=>p.id===coral.id).posCategoryId,cat('Coral'));
 assert(initial.products.filter(p=>['durpas500','durpas1000'].includes(p.durianOutput)).every(p=>p.posCategoryId===cat('Durpas')));
 assert.equal(initial.products.find(p=>p.id===water.id).posCategoryId,cat('Minuman'));assert.equal(initial.products.find(p=>p.id===dessert.id).posCategoryId,cat('Dessert'));assert.equal(initial.products.find(p=>p.id===raw.id).posCategoryId,null);assert.equal(initial.products.find(p=>p.id===prep.id).posCategoryId,null);
 assert.equal((await db.query("select pg_get_functiondef('public.pos_read()'::regprocedure) d")).rows[0].d,root);
 assert.deepEqual((await db.query('select * from public.md_pos_products order by id')).rows.map(({pos_category_id,...p})=>p),productsBefore);
 if(process.env.POS_TEST_SQL){const service=(await db.query('select public.pos_read_service($1,true) s',[store])).rows[0].s;assert.deepEqual(service.posCategories,initial.posCategories);assert.equal(service.products.find(p=>p.id===fruit.id).posCategoryId,cat('Buah'));}
 const make=(s,name,ids,categoryId=id())=>categoryPayload(s,{id:id(),categoryId,name,productIds:ids});
 const payload=make(initial,'Paket Pilihan',[water.id,fruit.id]);
 await as(cashier);assert.deepEqual((await read()).posCategories,initial.posCategories);await assert.rejects(save(payload),/Hak akses/);await as(owner);
 await db.exec('set role anon');await assert.rejects(save(payload),/permission denied/);await db.exec('reset role');await db.exec('set role authenticated');await assert.rejects(db.query('select * from public.md_pos_menu_categories'),/permission denied/);
 const saved=await save(payload);await save(payload);await db.exec('reset role');
 assert.equal(saved.posCategories.length,7);assert(saved.products.filter(p=>[water.id,fruit.id].includes(p.id)).every(p=>p.posCategoryId===payload.categoryId));
 assert.equal((await db.query('select count(*) n from public.md_pos_events where id=$1',[payload.id])).rows[0].n,1);
 await assert.rejects(save({...payload,name:'Nama lain'}),/ID pengiriman/);
 const count=async()=>(await db.query('select (select count(*) from public.md_pos_menu_categories) categories,(select count(*) from public.md_pos_events) events')).rows[0];
 const n=await count();
 for(const kind of ['raw','prep','missing','duplicates','name','reserved','snapshot','version']){
  const bad=make(saved,'Uji '+kind,[coral.id]);
  if(kind==='raw')bad.productIds=[raw.id];if(kind==='prep')bad.productIds=[prep.id];if(kind==='missing')bad.productIds=[id()];if(kind==='duplicates')bad.productIds.push(coral.id);
  if(kind==='name')bad.name='bUaH';if(kind==='reserved')bad.name='Semua';if(kind==='snapshot')bad.expectedAssignments=[];if(kind==='version')bad.expectedVersion=99;
  await assert.rejects(save(bad));assert.deepEqual(await count(),n,'No writes on '+kind);
 }
 const stale=make(saved,'Kategori baru',[coral.id]);const move=make(saved,'Paket Pilihan',[water.id,fruit.id,coral.id],payload.categoryId);const moved=await save(move);
 await assert.rejects(save(stale),/sudah berubah/);
 const oldTarget=make(saved,'Paket Pilihan',[water.id],payload.categoryId);await assert.rejects(save(oldTarget),/Kategori sudah berubah/);
 const remove=make(moved,'Pilihan kasir',[water.id],payload.categoryId);const removed=await save(remove);
 assert.equal(removed.products.find(p=>p.id===fruit.id).posCategoryId,null);assert.equal(removed.products.find(p=>p.id===coral.id).posCategoryId,null);
 const empty=await save(make(removed,'Makan malam',[]));assert(empty.posCategories.some(c=>c.name==='Makan malam'));
 const beforeRerun=await read();await db.exec(migration);assert.deepEqual((await read()).posCategories,beforeRerun.posCategories);assert.equal((await read()).products.find(p=>p.id===fruit.id).posCategoryId,null,'Rerun does not restore removed membership');
 assert.deepEqual(await inventory(),inventoryBefore);
 assert.deepEqual((await db.query('select * from public.md_pos_products order by id')).rows.map(({pos_category_id,...p})=>p),productsBefore);
 assert.equal((await db.query("select public.pos_waste_output_product($1,'coral') id",[fruit.id])).rows[0].id,coral.id);
 console.log('PASS POS categories SQL: six seeded categories, master-only mappings, read/service metadata, roles/RLS, atomic create/move/rename/remove, duplicates, replay and stale guards, repeated installation, unchanged product IDs/names/prices/groups, stock/cost/supplier/recipe/reject lineage.');
}finally{await db.close();}

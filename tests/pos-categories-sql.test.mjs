import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {categoryPayload,defaultPosCategories,posCategoryIds} from '../pos/pos-categories.mjs';
import {posMenuEntries,posProductCards} from '../pos/pos-menu.mjs';
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
 let legacy,priorModern;
 if(process.env.POS_PREVIOUS_CATEGORY_SQL){
  await db.exec(fs.readFileSync(process.env.POS_PREVIOUS_CATEGORY_SQL,'utf8'));
  const old=await read(),categoryId=id(),productIds=[water.id,fruit.id].sort();
  if(old.posCategoryMembershipVersion===2){
   priorModern=await save(categoryPayload(old,{id:id(),categoryId,name:'Kategori sebelum upgrade',productIds:[]}));
   await assert.rejects(save(categoryPayload(priorModern,{id:id(),categoryId,name:'Kategori sebelum upgrade',mode:'delete'})),/Muat ulang POS/);
  }else{
  legacy=await save({id:id(),categoryId,name:'Kategori lama',expectedVersion:0,productIds,expectedAssignments:old.products.filter(p=>productIds.includes(p.id)).map(p=>({id:p.id,categoryId:p.posCategoryId})).sort((a,b)=>a.id.localeCompare(b.id))});
  // A 050 web payload reaches this 046 function without expectedAssignments.
  // Reproduce that rejection before applying the non-destructive SQL upgrade.
  await assert.rejects(save(categoryPayload(legacy,{id:id(),categoryId,name:'Kategori lama',mode:'remove',productIds})),/Pilihan produk tidak valid atau terlalu banyak/);
  assert.deepEqual(await read(),legacy,'Rejected modern payload cannot change legacy category membership');
  }
 }
 await db.exec(migration);await db.exec(migration);
 const initial=await read(),cat=name=>initial.posCategories.find(c=>c.name===name).id,ids=(s,p)=>posCategoryIds(s,s.products.find(x=>x.id===p.id));
 assert.equal(initial.posCategoryMembershipVersion,2);
 const baworMenu=posMenuEntries(initial,cat('Durpas')).filter(e=>e.name==='Durpas Bawor');assert.equal(baworMenu.length,1);assert.equal(baworMenu[0].products.length,2);assert(baworMenu[0].hasVariants);assert(baworMenu[0].products.every(p=>p.variantOptions.length===1));assert(posProductCards(initial,store).includes('data-order-group=\"'+baworMenu[0].products[0].variantGroupId));
 if(legacy){
  assert.deepEqual(initial.posCategories,legacy.posCategories);
  for(const p of legacy.products)assert.deepEqual(ids(initial,p),p.posCategoryId?[p.posCategoryId]:[],'Upgrade retains exact old assignment, including moves');
 }else if(priorModern){
  assert.deepEqual(initial.posCategories,priorModern.posCategories);
  assert.deepEqual(initial.products,priorModern.products,'Upgrade preserves configured categories and all product memberships');
 }else{
  assert.deepEqual(initial.posCategories,defaultPosCategories());
  assert.deepEqual(ids(initial,fruit),[cat('Buah')]);assert.deepEqual(ids(initial,coral),[cat('Coral')]);
  assert(initial.products.filter(p=>['durpas500','durpas1000'].includes(p.durianOutput)).every(p=>p.posCategoryIds.includes(cat('Durpas'))));
  assert.deepEqual(ids(initial,water),[cat('Minuman')]);assert.deepEqual(ids(initial,dessert),[cat('Dessert')]);
 }
 assert.deepEqual(ids(initial,raw),[]);assert.deepEqual(ids(initial,prep),[]);
 assert.equal((await db.query("select pg_get_functiondef('public.pos_read()'::regprocedure) d")).rows[0].d,root);
 assert.deepEqual((await db.query('select * from public.md_pos_products order by id')).rows.map(({pos_category_id,...p})=>p),productsBefore);
 const rowsBefore=(await db.query('select * from public.md_pos_products order by id')).rows;
 if(process.env.POS_TEST_SQL){const service=(await db.query('select public.pos_read_service($1,true) s',[store])).rows[0].s;assert.deepEqual(service.posCategories,initial.posCategories);assert.deepEqual(ids(service,fruit),ids(initial,fruit));assert.equal(service.posCategoryMembershipVersion,2);}
 const make=(s,name,productIds,categoryId=id(),mode='add')=>categoryPayload(s,{id:id(),categoryId,name,productIds,mode});
 const payload=make(initial,'Paket Pilihan',[water.id,fruit.id]);
 await as(cashier);assert.deepEqual((await read()).posCategories,initial.posCategories);await assert.rejects(save(payload),/Hak akses/);await as(owner);
 await db.exec('set role anon');await assert.rejects(save(payload),/permission denied/);await db.exec('reset role');await db.exec('set role authenticated');
 for(const table of ['md_pos_menu_categories','md_pos_menu_category_products'])await assert.rejects(db.query('select * from public.'+table),/permission denied/);
 const saved=await save(payload);await save(payload);await db.exec('reset role');
 assert.equal(saved.posCategories.length,initial.posCategories.length+1);
 for(const p of [water,fruit])assert.deepEqual(ids(saved,p),[...ids(initial,p),payload.categoryId].sort(),'Add preserves every prior category');
 assert.deepEqual(saved.posCategories.filter(c=>c.id!==payload.categoryId),initial.posCategories,'Other category versions unchanged');
 assert.equal((await db.query('select count(*) n from public.md_pos_events where id=$1',[payload.id])).rows[0].n,1);
 await assert.rejects(save({...payload,name:'Nama lain'}),/ID pengiriman/);
 const count=async()=>(await db.query('select (select count(*) from public.md_pos_menu_categories) categories,(select count(*) from public.md_pos_menu_category_products) links,(select count(*) from public.md_pos_events) events')).rows[0];
 const n=await count();
 for(const kind of ['raw','prep','missing','duplicates','name','reserved','mode','version','null']){
  const bad=make(saved,'Uji '+kind,[coral.id]);
  if(kind==='raw')bad.productIds=[raw.id];if(kind==='prep')bad.productIds=[prep.id];if(kind==='missing')bad.productIds=[id()];if(kind==='duplicates')bad.productIds.push(coral.id);
  if(kind==='name')bad.name='bUaH';if(kind==='reserved')bad.name='Semua';if(kind==='mode')delete bad.mode;if(kind==='version')bad.expectedVersion=99;if(kind==='null')bad.productIds=[null];
  await assert.rejects(save(bad));assert.deepEqual(await count(),n,'No writes on '+kind);
 }
 // Two categories can independently add the same master product from one read.
 const independent=make(saved,'Pilihan kedua',[coral.id]);
 const first=make(saved,'Paket Pilihan',[coral.id],payload.categoryId),firstSaved=await save(first);
 const secondSaved=await save(independent);
 assert.deepEqual(ids(secondSaved,coral),[...ids(initial,coral),payload.categoryId,independent.categoryId].sort());
 const stale=make(saved,'Paket Pilihan',[fruit.id],payload.categoryId,'remove');await assert.rejects(save(stale),/Kategori sudah berubah/);
 // Adding a member again creates no duplicate link; rename changes no links.
 const repeated=await save(make(secondSaved,'Paket Pilihan',[coral.id],payload.categoryId));
 assert.deepEqual(ids(repeated,coral),ids(secondSaved,coral));
 const renamed=await save(make(repeated,'Pilihan kasir',[],payload.categoryId,'rename'));
 assert.deepEqual(renamed.products,repeated.products);
 const badRename=make(renamed,'Pilihan kasir',[],payload.categoryId,'rename');badRename.productIds=[fruit.id];await assert.rejects(save(badRename),/Ubah nama/);
 const removed=await save(make(renamed,'Pilihan kasir',[fruit.id,coral.id],payload.categoryId,'remove'));
 assert.deepEqual(ids(removed,fruit),ids(initial,fruit));assert.deepEqual(ids(removed,coral),[...ids(initial,coral),independent.categoryId].sort());assert(ids(removed,water).includes(payload.categoryId));
 // Remove the migrated original membership, then rerun: it must stay removed.
 const original=removed.posCategories.find(c=>c.id===ids(initial,water)[0]);
 const noOriginal=await save(make(removed,original.name,[water.id],original.id,'remove'));
 assert.deepEqual(ids(noOriginal,water),[payload.categoryId]);
 const empty=await save(make(noOriginal,'Makan malam',[]));assert(empty.posCategories.some(c=>c.name==='Makan malam'));
 const beforeRerun=await read();await db.exec(migration);const afterRerun=await read();assert.deepEqual(afterRerun.posCategories,beforeRerun.posCategories);assert.deepEqual(afterRerun.products,beforeRerun.products,'Rerun must not reseed or restore removed links');
 if(process.env.POS_TEST_SQL){const service=(await db.query('select public.pos_read_service($1,true) s',[store])).rows[0].s;assert.deepEqual(ids(service,water),[payload.categoryId]);assert.deepEqual(ids(service,coral),ids(afterRerun,coral));}
 assert.deepEqual(await inventory(),inventoryBefore);
 assert.deepEqual((await db.query('select * from public.md_pos_products order by id')).rows,rowsBefore,'No master product row changes');
 assert.equal((await db.query("select public.pos_waste_output_product($1,'coral') id",[fruit.id])).rows[0].id,coral.id);
 // Delete removes only category records/links. Whole master stock survives.
 const allBeforeDelete=posMenuEntries(afterRerun).map(e=>[e.key,e.products.map(p=>p.id)]);
 const victim=afterRerun.posCategories.find(c=>c.id===payload.categoryId);
 const staleDelete=make(afterRerun,victim.name,[],victim.id,'delete');
 const changedBeforeDelete=await save(make(afterRerun,victim.name,[fruit.id],victim.id));
 await assert.rejects(save(staleDelete),/Kategori sudah berubah/);
 const deletion=make(changedBeforeDelete,victim.name,[],victim.id,'delete');
 await assert.rejects(save({...deletion,id:id(),productIds:[water.id]}),/Hapus kategori tidak menerima pilihan/);
 await as(cashier);await assert.rejects(save(deletion),/Hak akses/);await as(owner);
 const deleted=await save(deletion);await save(deletion);
 assert(!deleted.posCategories.some(c=>c.id===victim.id));
 for(const p of changedBeforeDelete.products)assert.deepEqual(ids(deleted,p),ids(changedBeforeDelete,p).filter(c=>c!==victim.id));
 assert.deepEqual(deleted.posCategories,changedBeforeDelete.posCategories.filter(c=>c.id!==victim.id));
 assert.deepEqual(posMenuEntries(deleted).map(e=>[e.key,e.products.map(p=>p.id)]),allBeforeDelete);
 assert.equal((await db.query('select count(*) n from public.md_pos_events where id=$1',[deletion.id])).rows[0].n,1);
 await assert.rejects(save({...deletion,name:'Other'}),/ID pengiriman/);
 await assert.rejects(save({...deletion,id:id(),mode:'add'}),/Kategori sudah berubah/);
 let remaining=deleted;
 for(const c of [...remaining.posCategories])remaining=await save(make(remaining,c.name,[],c.id,'delete'));
 assert.deepEqual(remaining.posCategories,[]);assert(remaining.products.every(p=>p.posCategoryIds.length===0));
 await db.exec(migration);const noCategories=await read();
 assert.deepEqual(noCategories.posCategories,[],'Rerun cannot recreate deleted default categories');
 assert(noCategories.products.every(p=>p.posCategoryIds.length===0));
 assert.deepEqual(posMenuEntries(noCategories).map(e=>[e.key,e.products.map(p=>p.id)]),allBeforeDelete);
 assert.deepEqual((await db.query('select * from public.md_pos_products order by id')).rows.map(({pos_category_id,...p})=>p),rowsBefore.map(({pos_category_id,...p})=>p),'Only obsolete category reference may be cleared by FK');
 assert.deepEqual(await inventory(),inventoryBefore);
 assert.equal((await db.query('select count(*) n from public.md_pos_menu_category_products')).rows[0].n,0);
 console.log('PASS POS category membership SQL: '+(legacy?'upgrade 046':priorModern?'upgrade 051':'fresh install')+', additive links, scoped removal, category deletion with links/empty/all categories, exact retry, no resurrection, permissions/RLS, stale guards, read/service metadata, unchanged products/stock/cost/recipe/reject lineage.');
}finally{await db.close();}

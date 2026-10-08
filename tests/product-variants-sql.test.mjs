import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {buildVariantRows,variantPayload,variantSourceSnapshot} from '../pos/product-variants.mjs';
const db=new PGlite();
const migration=fs.readFileSync('database/product-variants.sql','utf8');
try {
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 await db.exec(fs.readFileSync(process.env.POS_TEST_SQL||'database/pos.sql','utf8'));
 await db.exec(fs.readFileSync('database/rollback-027-compat.sql','utf8'));
 if(process.env.POS_PHOTO_READ_FIX_SQL)await db.exec(fs.readFileSync(process.env.POS_PHOTO_READ_FIX_SQL,'utf8'));
 await db.exec(fs.readFileSync('database/compress-pos-photos.sql','utf8'));
 const owner=id(),cashier=id(),store=id();
 for(const [user,role] of [[owner,'owner'],[cashier,'cashier']]){
  await db.query('insert into auth.users(id,email) values($1,$2)',[user,user+'@test.invalid']);
  await db.query('insert into public.md_pos_staff values($1)',[user]);
  await db.query('insert into public.md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$2,$3)',[user,role,[store]]);
 }
 await db.query("insert into public.md_pos_stores(id,name) values($1,'Outlet A')",[store]);
 const as=who=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);await as(owner);
 const read=async()=>(await db.query('select public.pos_read() state')).rows[0].state;
 const save=async p=>(await db.query('select public.pos_product_variants_save($1) state',[p])).rows[0].state;
 const seed=fs.readFileSync('database/seeds/import-durian-dan-turunan.sql','utf8').replace("null, null, null, null, '', ''","case when r.stock_unit='kg_butir' then 50000 end, case when r.stock_unit='kg_butir' then 100000 end, null, null, '', ''");
 await db.exec(seed);await db.exec(fs.readFileSync('database/link-durian-reject.sql','utf8'));
 const before=(await db.query('select * from public.md_pos_products order by id')).rows,rootBefore=(await db.query("select pg_get_functiondef('public.pos_read()'::regprocedure) d")).rows[0].d;
 const result=(await db.exec(migration)).flatMap(r=>r.rows).find(r=>Object.hasOwn(r,'kelompok_varian'));
 assert.deepEqual(result,{kelompok_varian:19,barang_dalam_kelompok:42});
 await db.exec(migration);
 const after=(await db.query('select * from public.md_pos_products order by id')).rows;
 assert.deepEqual(after.map(({variant_group_id,variant_group_name,variant_options,...p})=>p),before,'Only grouping metadata may change');
 assert.equal((await db.query("select pg_get_functiondef('public.pos_read()'::regprocedure) d")).rows[0].d,rootBefore,'Root photo reader unchanged');
 const current=await read();assert.equal(current.products.filter(p=>p.variantGroupId).length,42);
 for(const source of after.filter(p=>p.stock_unit==='kg_butir'))for(const output of ['durpas500','durpas1000','coral']){
  const target=(await db.query('select public.pos_waste_output_product($1,$2) id',[source.id,output])).rows[0].id;
  assert.equal(target,before.find(p=>p.durian_source_id===source.id&&p.durian_output===output).id);
 }
 if(process.env.POS_TEST_SQL)assert.equal((await db.query('select public.pos_read_service($1,true) s',[store])).rows[0].s.products.filter(p=>p.variantGroupId).length,42);
 const make=(name='Bahan uji',existing=[],extra={})=>{
  const groupId=existing[0]?.variantGroupId||id();
  const common={name,itemType:'raw',stockUnit:'g',category:null,...extra};
  const rows=buildVariantRows({name,axes:[{name:'Ukuran',values:existing.length?['Kecil','Besar','Jumbo']:['Kecil','Besar']}],existing,groupId,products:current.products});
  return variantPayload({id:id(),groupId,name,common,rows,existing,products:current.products});
 };
 const initial=make();
 await as(cashier);await assert.rejects(save(initial),/Hak akses/);await as(owner);
 await db.exec('set role anon');await assert.rejects(save(initial),/permission denied/);await db.exec('reset role');
 await db.exec('set role authenticated');const saved=await save(initial);await save(initial);await db.exec('reset role');
 assert.equal(saved.products.filter(p=>p.variantGroupId===initial.groupId).length,2);
 assert.equal((await db.query('select count(*) n from public.md_pos_events where id=$1',[initial.id])).rows[0].n,1);
 const forged=structuredClone(initial);forged.name='Lain';await assert.rejects(save(forged),/ID pengiriman/);
 const counts=async()=>(await db.query('select (select count(*) from public.md_pos_products) products,(select count(*) from public.md_pos_events) events')).rows[0];
 const n=await counts();
 for(const kind of ['sku','barcode','options','name','price','unit','stock','photo','id']) {
  const bad=make('Gagal '+kind);
  if(kind==='sku')bad.variants[1].sku=bad.variants[0].sku.toLowerCase();
  if(kind==='barcode')bad.variants.forEach(p=>p.barcode='DUPLICATE-CODE');
  if(kind==='options')Object.assign(bad.variants[1],{name:bad.variants[0].name,variant:bad.variants[0].variant,variantOptions:bad.variants[0].variantOptions});
  if(kind==='name')bad.variants[1].name='Nama salah';
  if(kind==='price')bad.variants[1].buyPrice=-1;
  if(kind==='unit')bad.variants[1].stockUnit='ml';
  if(kind==='stock')bad.variants[1].stock={qty:1};
  if(kind==='photo')bad.variants[1].photo='data:test';
  if(kind==='id')bad.variants[1].id=initial.variants[0].id;
  await assert.rejects(save(bad));assert.deepEqual(await counts(),n,'Atomic rollback on '+kind);
 }
 const exists=saved.products.filter(p=>p.variantGroupId===initial.groupId),addition=make('Bahan uji',exists);
 assert.equal(addition.variants.length,1);await save(addition);await save(addition);
 const stale=make('Bahan uji',exists);await assert.rejects(save(stale),/sudah berubah/);
 const dupGroup=make('Bahan uji');await assert.rejects(save(dupGroup),/Kelompok barang sudah ada/);
 const old=exists[0];
 await assert.rejects(db.query("select public.pos_mutate_027('product_save',$1)",[{...old,name:'Nama asing',editing:true}]),/Identitas varian/);
 const edited={...old,sku:'CUSTOM-SKU',buyPrice:35000,editing:true};
 await db.query("select public.pos_mutate_027('product_save',$1)",[edited]);
 const fetched=(await read()).products.find(p=>p.id===old.id);assert.equal(fetched.buyPrice,35000);assert.equal(fetched.variantGroupId,initial.groupId);
 await db.exec(migration);assert.equal((await read()).products.find(p=>p.id===old.id).sku,'CUSTOM-SKU');
 for(const [name,extra] of [['Buah baru',{itemType:'direct',stockUnit:'kg_butir',category:'Buah',priceKg:50000,pricePiece:100000}],['Olahan baru',{itemType:'finished',stockUnit:'pcs',category:'Olahan Duren'}],['Bahan produksi',{itemType:'prep',stockUnit:'ml'}],['Menu baru',{itemType:'recipe',stockUnit:'porsi',category:'Dessert',salePrice:25000}],['Minuman botol',{itemType:'direct',stockUnit:'ml',category:'Minuman',salePrice:15000}]])await save(make(name,[],extra));

 // Existing products can acquire siblings atomically, preserving operational IDs.
 const supplier=id(),fruitLot=id(),unitLot=id(),recipe=id(),date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
 await db.query("insert into public.md_pos_suppliers(id,name) values($1,'Supplier Cumasi')",[supplier]);
 const loaded=await read(),fruit=loaded.products.find(p=>p.sku==='MD-CUMASI-BUAH'),coral=loaded.products.find(p=>p.sku==='MD-CUMASI-CORAL');
 await db.query("insert into public.md_pos_lots(id,store_id,supplier_id,product_id,received_date,received_kg,received_pieces,kg,pieces,quality,unit_cost) values($1,$2,$3,$4,$5,100,40,100,40,'ready',10000)",[fruitLot,store,supplier,fruit.id,date]);
 await db.query("insert into public.md_pos_unit_lots(id,product_id,store_id,unit,received_qty,qty,received_date,kind,supplier_id,unit_cost) values($1,$2,$3,'kg',10,8,$4,'opening',$5,30000)",[unitLot,coral.id,store,date,supplier]);
 await db.query("insert into public.md_pos_recipes(id,name,output_id,yield_qty) values($1,'Resep Cumasi',$2,1)",[recipe,loaded.products.find(p=>p.sku==='MD-CUMASI-DAGING').id]);
 await db.query('insert into public.md_pos_recipe_items(recipe_id,product_id,qty) values($1,$2,0.5)',[recipe,coral.id]);
 const adopt=source=>{
  const groupId=id(),opts=[{name:'Kualitas',value:'Reguler'}],existing=[{...source,variantOptions:opts}];
  const rows=buildVariantRows({name:source.name,axes:[{name:'Kualitas',values:['Reguler','Premium','Pilihan']}],existing,groupId,products:loaded.products});
  for(const row of rows)if(!row.existing)Object.assign(row,{priceKg:60000,pricePiece:150000});
  return {...variantPayload({id:id(),groupId,name:source.name,common:source,rows,existing,products:loaded.products}),adopt:{productId:source.id,expected:variantSourceSnapshot(source),variantOptions:opts}};
 };
 const stockState=async()=>({lots:(await db.query('select * from public.md_pos_lots order by id')).rows,units:(await db.query('select * from public.md_pos_unit_lots order by id')).rows,recipes:(await db.query('select * from public.md_pos_recipe_items order by recipe_id,product_id')).rows});
 const stockBefore=await stockState();
 const sourceBefore=(await db.query('select * from public.md_pos_products where id=$1',[coral.id])).rows[0];
 const good=adopt(coral),sizeBefore=await counts();
 await as(cashier);await assert.rejects(save(good),/Hak akses/);await as(owner);
 await db.exec('set role authenticated');await assert.rejects(db.query('select public.pos_variant_option_labels($1)',[[{name:'X',value:'Y'}]]),/permission denied/);await db.exec('reset role');
 for(const kind of ['duplicate-sku','duplicate-option','empty-option','duplicate-axis','stale-name','stale-type','wrong-ids','existing-group','different-unit']){
  const bad=adopt(coral);
  if(kind==='duplicate-sku')bad.variants[1].sku=bad.variants[0].sku;
  if(kind==='duplicate-option'){bad.adopt.variantOptions=bad.variants[0].variantOptions;}
  if(kind==='empty-option')bad.adopt.variantOptions=[];
  if(kind==='duplicate-axis')bad.adopt.variantOptions=[...bad.adopt.variantOptions,...bad.adopt.variantOptions];
  if(kind==='stale-name')bad.adopt.expected.name='Wrong name';
  if(kind==='stale-type')bad.adopt.expected.itemType='raw';
  if(kind==='wrong-ids')bad.expectedIds=[];
  if(kind==='existing-group')bad.groupId=initial.groupId;
  if(kind==='different-unit')bad.variants[1].stockUnit='pcs';
  await assert.rejects(save(bad));assert.deepEqual(await counts(),sizeBefore);assert.deepEqual((await db.query('select * from public.md_pos_products where id=$1',[coral.id])).rows[0],sourceBefore,'No partial adoption on '+kind);
 }
 await db.exec('set role authenticated');await save(good);await save(good);await db.exec('reset role');
 const adopted=(await db.query('select * from public.md_pos_products where id=$1',[coral.id])).rows[0];
 const {variant_group_id,variant_group_name,variant_options,...preserved}=adopted;
 assert.deepEqual({...preserved,variant_group_id:null,variant_group_name:null,variant_options:[]},sourceBefore);
 assert.equal(variant_group_id,good.groupId);assert.equal(variant_group_name,coral.name);
 assert.equal((await db.query('select count(*) n from public.md_pos_events where id=$1',[good.id])).rows[0].n,1);
 const again=adopt(coral);await assert.rejects(save(again),/sudah berubah/);
 await save(adopt(fruit));assert.deepEqual(await stockState(),stockBefore,'Lots, suppliers, costs and recipes unchanged');
 assert.equal((await db.query("select public.pos_waste_output_product($1,'coral') id",[fruit.id])).rows[0].id,coral.id);
 // Later product price changes stay independent from the original stale modal.
 const another=(await read()).products.find(p=>p.sku==='MD-MIMANG-CORAL');const pending=adopt(another);
 await db.query('update public.md_pos_products set buy_price=56789 where id=$1',[another.id]);await save(pending);assert.equal((await db.query('select buy_price from public.md_pos_products where id=$1',[another.id])).rows[0].buy_price,'56789');
 await db.exec(migration);assert.deepEqual(await stockState(),stockBefore);
 console.log('PASS SQL: 19 groups / 42 existing IDs preserved, atomic writes, duplicate SKU/barcode/combination guards, permissions, replay, stale additions, all item types, old product editing, reject links, photo/read contract, idempotent installation, existing-product adoption, rollback, stale data, original names/SKUs/photos, stock/cost/supplier/recipe/reject lineage and price edits preserved.');
}finally{await db.close();}

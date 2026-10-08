import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {buildVariantRows,variantPayload} from '../pos/product-variants.mjs';
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
 console.log('PASS SQL: 19 groups / 42 existing IDs preserved, atomic writes, duplicate SKU/barcode/combination guards, permissions, replay, stale additions, all item types, old product editing, reject links, photo/read contract and idempotent installation.');
}finally{await db.close();}

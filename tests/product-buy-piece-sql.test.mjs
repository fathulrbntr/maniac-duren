import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {buildVariantRows,variantPayload} from '../pos/product-variants.mjs';
const db=new PGlite();
const sql=name=>fs.readFileSync(new URL(`../database/${name}`,import.meta.url),'utf8');
try {
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 for(const name of ['pos.sql','rollback-027-compat.sql','compress-pos-photos.sql'])await db.exec(sql(name));
 await db.exec(sql('seeds/import-durian-dan-turunan.sql').replace("null, null, null, null, '', ''","case when r.stock_unit='kg_butir' then 50000 end, case when r.stock_unit='kg_butir' then 100000 end, null, null, '', ''"));
 for(const name of ['link-durian-reject.sql','product-variants.sql','pos-menu-categories.sql','pos-cashier-controls.sql','reject-flow-063.sql','store-receipt-064.sql','employee-details-070.sql','reports-admin-071.sql'])await db.exec(sql(name));
 const owner=id(),cashier=id(),store=id();
 await db.query("insert into public.md_pos_stores(id,name) values($1,'Outlet A')",[store]);
 for(const [user,role] of [[owner,'owner'],[cashier,'cashier']]){
  await db.query('insert into auth.users(id,email) values($1,$2)',[user,user+'@test.invalid']);
  await db.query('insert into public.md_pos_staff values($1)',[user]);
  await db.query('insert into public.md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$2,$3)',[user,role,[store]]);
 }
 const as=user=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
 const read=async()=>(await db.query('select public.pos_read() state')).rows[0].state;
 const save=async p=>(await db.query("select public.pos_mutate_027('product_save',$1) state",[p])).rows[0].state;
 const variants=async p=>(await db.query('select public.pos_product_variants_save($1) state',[p])).rows[0].state;
 await as(owner);
 const fruit={id:id(),name:'Durian uji',sku:'DURIAN-UJI',itemType:'direct',stockUnit:'kg_butir',category:'Buah',priceKg:100000,pricePiece:150000,buyPrice:60000};
 await save(fruit);
 const supplier=id();await db.query("insert into public.md_pos_suppliers(id,name) values($1,'Supplier uji')",[supplier]);
 await db.query("insert into public.md_pos_lots(id,store_id,supplier_id,product_id,received_date,received_kg,received_pieces,kg,pieces,quality,unit_cost) values($1,$2,$3,$4,'2026-10-01',20,10,18,9,'ready',10000)",[id(),store,supplier,fruit.id]);
 const lotsBefore=(await db.query('select * from public.md_pos_lots order by id')).rows;
 const before=(await db.query('select * from public.md_pos_products where id=$1',[fruit.id])).rows[0];
 await db.exec(sql('product-buy-piece-077.sql'));await db.exec(sql('product-buy-piece-077.sql'));
 const {buy_price_piece,...unchanged}=(await db.query('select * from public.md_pos_products where id=$1',[fruit.id])).rows[0];
 assert.equal(buy_price_piece,null);assert.deepEqual(unchanged,before);
 await db.exec('set role authenticated');
 const state=await save({...fruit,editing:true,buyPricePiece:80000});
 assert.equal(state.productCostVersion,77);assert.equal(state.products.find(p=>p.id===fruit.id).buyPricePiece,80000);
 assert.equal(state.reportsAdminVersion,71,'The installed reader contract is preserved');
 await assert.rejects(db.query('select public.pos_save_product_details($1)',[fruit]),/permission denied/);
 await assert.rejects(db.query('select public.pos_save_product_details_before_077($1)',[fruit]),/permission denied/);
 await assert.rejects(db.query('select public.pos_read_before_product_cost_077()'),/permission denied/);
 await save({...fruit,editing:true});assert.equal((await read()).products.find(p=>p.id===fruit.id).buyPricePiece,80000);
 for(const value of [0,null,'','  ','95000.50']){
  await save({...fruit,editing:true,buyPricePiece:value});
  assert.equal((await read()).products.find(p=>p.id===fruit.id).buyPricePiece,value===null||String(value).trim()===''?null:Number(value));
 }
 for(const value of [-1,1e12+1,'NaN','Infinity','bad',true,{},[]]){
  await assert.rejects(save({...fruit,editing:true,buyPricePiece:value}));
  assert.equal((await read()).products.find(p=>p.id===fruit.id).buyPricePiece,95000.5,'An invalid write rolls back');
 }
 const pieceProduct={...fruit,id:id(),sku:'PCS',stockUnit:'pcs',salePrice:150000,buyPricePiece:50000};
 await assert.rejects(save(pieceProduct),/khusus/);assert(!(await read()).products.some(p=>p.id===pieceProduct.id));
 const common={name:'Varian buah',itemType:'direct',category:'Buah',stockUnit:'kg_butir',priceKg:100000,pricePiece:200000,buyPrice:50000};
 const make=()=>{const groupId=id(),rows=buildVariantRows({name:common.name,axes:[{name:'Ukuran',values:['A','B']}],groupId});rows.forEach((r,i)=>r.buyPricePiece=80000+i*10000);return variantPayload({id:id(),groupId,name:common.name,common,rows});};
 const invalid=make();invalid.variants[1].buyPricePiece=-1;await assert.rejects(variants(invalid));
 assert(!(await read()).products.some(p=>p.variantGroupId===invalid.groupId),'Batch fails atomically');
 const payload=make();await variants(payload);await variants(payload);
 assert.deepEqual((await read()).products.filter(p=>p.variantGroupId===payload.groupId).map(p=>p.buyPricePiece).sort(),[80000,90000]);
 await as(cashier);const cashierState=await read();
 assert(cashierState.products.every(p=>!Object.hasOwn(p,'buyPricePiece')),'Costs never leak through the full reader');
 assert(cashierState.products.every(p=>!Object.hasOwn(p,'buyPrice')));
 await assert.rejects(save({...fruit,editing:true,buyPricePiece:1}),/Hak akses/);
 await as(owner);await db.exec('reset role');
 const persisted=(await db.query('select * from public.md_pos_products order by id')).rows;
 await db.exec(sql('product-buy-piece-077.sql'));assert.deepEqual((await db.query('select * from public.md_pos_products order by id')).rows,persisted);
 assert.deepEqual((await db.query('select * from public.md_pos_lots order by id')).rows,lotsBefore,'Stock quantities, existing unit costs and receipt history are preserved');
 const loose={...fruit,id:id(),sku:'LOOSE',buyPricePiece:50000};await save(loose);
 const {buyPricePiece:removed,...oldClient}=loose;
 await save({...oldClient,editing:true,stockUnit:'pcs',salePrice:150000});
 assert.equal((await read()).products.find(p=>p.id===loose.id).buyPricePiece,null,'Changing away from dual units clears obsolete cost');
 await db.exec('set role anon');await assert.rejects(read(),/permission denied/);await db.exec('reset role');
 console.log('PASS SQL per-piece cost: repeatable migration, legacy values preserved, save/read, null/zero/omitted, validation and atomic rollback, variant batch/retry, cleared obsolete units, and access restrictions.');
}finally{await db.close();}

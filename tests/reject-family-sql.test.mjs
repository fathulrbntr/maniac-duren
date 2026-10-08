import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const migration=fs.readFileSync('database/link-durian-reject.sql','utf8');
try {
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
  await db.exec(fs.readFileSync(process.env.POS_TEST_SQL || 'database/pos.sql','utf8'));
  await db.exec(fs.readFileSync('database/rollback-027-compat.sql','utf8'));
  if(process.env.POS_PHOTO_READ_FIX_SQL) await db.exec(fs.readFileSync(process.env.POS_PHOTO_READ_FIX_SQL,'utf8'));
  await db.exec(fs.readFileSync('database/compress-pos-photos.sql','utf8'));
  const owner=id(),cashier=id(),store=id(),otherStore=id(),supplier=id(),date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
  for(const [user,role] of [[owner,'owner'],[cashier,'cashier']]) {
    await db.query('insert into auth.users values($1,$2)',[user,role+'@test.local']);
    await db.query('insert into public.md_pos_staff values($1)',[user]);
    await db.query('insert into public.md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$2,$3)',[user,role,[store]]);
  }
  await db.query("insert into public.md_pos_stores(id,name) values($1,'Outlet A'),($2,'Outlet B')",[store,otherStore]);
  await db.query("insert into public.md_pos_suppliers(id,name) values($1,'Supplier asal')",[supplier]);
  const as=async user=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
  await as(owner);
  const read=async()=> (await db.query('select public.pos_read() result')).rows[0].result;
  const mut=async(action,payload)=> (await db.query('select public.pos_mutate_027($1,$2) result',[action,payload])).rows[0].result;
  // Old/new baselines require positive fruit prices. Only the test fixture gets prices.
  let seed=fs.readFileSync('database/seeds/import-durian-dan-turunan.sql','utf8');
  assert.equal(seed.split("null, null, null, null, '', ''").length,2);
  seed=seed.replace("null, null, null, null, '', ''", "case when r.stock_unit='kg_butir' then 50000 end, case when r.stock_unit='kg_butir' then 100000 end, null, null, '', ''");
  const beforeDefinition=(await db.query("select pg_get_functiondef('public.pos_waste_action(text,jsonb)'::regprocedure) def")).rows[0].def;
  // No master data -> entire migration rolls back, including added columns.
  await assert.rejects(db.exec(migration),/Master/);await db.exec('rollback');
  assert.equal((await db.query("select count(*) n from information_schema.columns where table_name='md_pos_products' and column_name='durian_source_id'")).rows[0].n,0);
  assert.equal((await db.query("select pg_get_functiondef('public.pos_waste_action(text,jsonb)'::regprocedure) def")).rows[0].def,beforeDefinition);
  await db.exec(seed);
  const products=(await db.query('select * from public.md_pos_products')).rows;
  const product=sku=>products.find(p=>p.sku===sku);
  const mk=product('MD-MK-FRESH-BUAH'),nitrogen=product('MD-MK-NITROGEN-BUAH');
  const fruitLot=async(source,branch=store)=>{
    const lot=id();await db.query("insert into public.md_pos_lots(id,store_id,supplier_id,product_id,received_date,received_kg,received_pieces,kg,pieces,quality,unit_cost) values($1,$2,$3,$4,$5,100,40,100,40,'ready',10000)",[lot,branch,supplier,source.id,date]);return lot;
  };
  const mkLot=await fruitLot(mk),nLot=await fruitLot(nitrogen);
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1kAAAAASUVORK5CYII=';
  const make=(lot,code)=>({id:id(),storeId:store,sourceLotId:lot,receivedDate:date,date,kg:10,pieces:4,reason:'Olah reject',processedBy:'Owner',evidence:{reject:image,durpas500:image,durpas1000:image,coral:image},outputs:[['durpas500','DP500',4],['durpas1000','DP1KG',2],['coral','CORAL',1]].map(([key,suffix,qty])=>({key,productId:product('MD-'+code+'-'+suffix).id,qty,lotId:id()}))});
  // Capture an old generic operation, to verify historical retry/void after installation.
  const oldPayload=make(mkLot,'MK-FRESH');
  oldPayload.outputs.forEach((o,i)=>o.productId=products.find(p=>p.sku===['MD-DURPAS-500','MD-DURPAS-1000','MD-CORAL-KG'][i]).id);
  await mut('waste_process',oldPayload);
  const pre=(await db.query('select * from public.md_pos_products order by id')).rows;
  const beforeRead=await read();
  const rootBefore=(await db.query("select pg_get_functiondef('public.pos_read()'::regprocedure) def")).rows[0].def;
  const result=(await db.exec(migration)).flatMap(r=>r.rows).find(r=>Object.hasOwn(r,'jenis_durian'));
  assert.deepEqual(result,{jenis_durian:15,hasil_olah_reject:45,master_daging:15});
  await db.exec(migration);
  assert.equal((await db.query("select pg_get_functiondef('public.pos_read()'::regprocedure) def")).rows[0].def,rootBefore,'Root photo reader unchanged');
  const after=(await db.query('select * from public.md_pos_products order by id')).rows;
  assert.deepEqual(after.map(({durian_source_id,durian_output,...p})=>p),pre,'Only two metadata columns changed');
  const afterRead=await read();
  assert.deepEqual({...afterRead,products:afterRead.products.map(({durianSourceId,durianOutput,...p})=>p)},beforeRead);
  assert.equal(afterRead.products.filter(p=>p.durianSourceId&&p.durianOutput).length,60);
  if(process.env.POS_TEST_SQL) {
    const service=(await db.query('select public.pos_read_service($1,true) data',[store])).rows[0].data;
    assert.equal(service.products.filter(p=>p.durianSourceId).length,60);
  }
  const saved=(await db.query('select snapshot from public.md_pos_waste_runs where id=$1',[oldPayload.id])).rows[0].snapshot;
  await mut('waste_process',oldPayload);
  assert.deepEqual((await db.query('select snapshot from public.md_pos_waste_runs where id=$1',[oldPayload.id])).rows[0].snapshot,saved);
  await mut('waste_void',{id:id(),wasteId:oldPayload.id,date,reason:'Koreksi riwayat'});
  assert.equal((await db.query('select kg from public.md_pos_lots where id=$1',[mkLot])).rows[0].kg,'100');
  // All fifteen families resolve exact output IDs, independent of their display names.
  for(const source of after.filter(p=>p.stock_unit==='kg_butir'))for(const key of ['durpas500','durpas1000','coral']) {
    const match=after.find(p=>p.durian_source_id===source.id&&p.durian_output===key);
    assert.equal((await db.query('select public.pos_waste_output_product($1,$2) id',[source.id,key])).rows[0].id,match.id);
  }
  await db.query("update public.md_pos_products set name='Musang King display changed',sku='CUSTOM-RENAMED' where id=$1",[mk.id]);
  await db.query("update public.md_pos_products set name='Kemasan premium',sku='CUSTOM-PACK' where id=$1",[product('MD-MK-FRESH-DP500').id]);
  await db.exec(migration); // Rerun preserves links even after names and SKUs change.
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select public.pos_waste_output_product($1,$2)',[mk.id,'coral']),/permission denied/);
  await db.exec('reset role');
  const wrong=make(mkLot,'MK-FRESH');wrong.outputs[2].productId=product('MD-MK-NITROGEN-CORAL').id;
  await assert.rejects(mut('waste_process',wrong),/tidak sesuai durian/);
  const generic=make(mkLot,'MK-FRESH');generic.outputs[2].productId=products.find(p=>p.sku==='MD-CORAL-KG').id;
  await assert.rejects(mut('waste_process',generic),/tidak sesuai durian/);
  const size=make(mkLot,'MK-FRESH');size.outputs[0].productId=product('MD-MK-FRESH-DP1KG').id;
  await assert.rejects(mut('waste_process',size),/tidak sesuai durian/);
  assert.equal((await db.query('select kg from public.md_pos_lots where id=$1',[mkLot])).rows[0].kg,'100');
  assert.equal((await db.query('select count(*) n from public.md_pos_waste_runs where id=any($1::uuid[])',[[wrong.id,generic.id,size.id]])).rows[0].n,0);
  // No spoofed outlet or role can reach the private helper through the public mutation.
  await assert.rejects(mut('waste_process',{...make(mkLot,'MK-FRESH'),storeId:otherStore}),/store|cabang/i);
  await as(cashier);await assert.rejects(mut('waste_process',make(mkLot,'MK-FRESH')),/Hak akses/);await as(owner);
  await db.exec('set role authenticated');
  for(const [lot,code] of [[mkLot,'MK-FRESH'],[nLot,'MK-NITROGEN']]) {
    const payload=make(lot,code);
    await mut('waste_process',payload);await mut('waste_process',payload);
    const state=await read(),run=state.wasteRuns.find(r=>r.id===payload.id);
    assert.equal(run.sourceLotId,lot);assert.equal(run.supplierId,supplier);assert.equal(run.outputKg,5);
    const lots=state.unitLots.filter(l=>payload.outputs.some(o=>o.lotId===l.id));
    assert.equal(lots.length,3);assert(lots.every(l=>l.supplierId===supplier&&l.storeId===store));
    assert.equal(lots.reduce((sum,l)=>sum+l.qty*l.unitCost,0),100000);
    for(const o of payload.outputs)assert.equal(lots.find(l=>l.id===o.lotId).productId,o.productId);
    await mut('waste_void',{id:id(),wasteId:payload.id,date,reason:'Koreksi olahan'});
    assert.equal((await read()).lots.find(l=>l.id===lot).kg,100);
  }
  const zero=make(mkLot,'MK-FRESH');zero.outputs.forEach(o=>{o.qty=0;o.productId='';});
  await mut('waste_process',zero);assert.equal((await read()).wasteRuns.find(r=>r.id===zero.id).outputKg,0);
  await db.exec('reset role');
  console.log('PASS: 60 stable links, 45 reject outputs, atomic/repeated installation, read metadata, no photo/login change, rename-safe lookup, Fresh/Nitrogen isolation, size/generic-output rejection, ACL, supplier/cost lineage, legacy retry/void, new processing/void and total waste.');
} finally { await db.close(); }

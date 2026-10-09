import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),logo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1kAAAAASUVORK5CYII=';
try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 for(const file of ['database/pos.sql','database/compress-pos-photos.sql','database/pos-menu-categories.sql','database/pos-cashier-controls.sql','database/link-durian-reject.sql','database/reject-flow-063.sql']){
  if(file.endsWith('link-durian-reject.sql'))await db.exec(fs.readFileSync('database/seeds/import-durian-dan-turunan.sql','utf8').replace("null, null, null, null, '', ''","case when r.stock_unit='kg_butir' then 50000 end, case when r.stock_unit='kg_butir' then 100000 end, null, null, '', ''"));
  await db.exec(fs.readFileSync(file,'utf8'));
 }
 const owner=id(),manager=id(),cashier=id(),outlet=id(),other=id();
 await db.query("insert into public.md_pos_stores(id,name,location) values($1,'Toko lama','Alamat lama'),($2,'Outlet lain','Bogor')",[outlet,other]);
 for(const [user,role] of [[owner,'owner'],[manager,'manager'],[cashier,'cashier']]){
  await db.query('insert into auth.users values($1,$2)',[user,user+'@test.local']);await db.query('insert into public.md_pos_staff values($1)',[user]);
  await db.query('insert into public.md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$2,$3)',[user,role,[outlet]]);
 }
 const as=who=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);await as(owner);
 const migration=fs.readFileSync('database/store-receipt-064.sql','utf8');await db.exec(migration);await db.exec(migration);
 await db.exec('set role authenticated');
 const read=async()=>(await db.query('select public.pos_read() s')).rows[0].s;
 const save=async(p,endpoint='pos_mutate_027')=>(await db.query(`select public.${endpoint}('store_save',$1::jsonb) s`,[JSON.stringify(p)])).rows[0].s;
 const getLogo=async(store,version=null)=>(await db.query('select public.pos_store_logo($1,$2) logo',[store,version])).rows[0].logo;
 let s=await read();assert.equal(s.stores.find(x=>x.id===outlet).address,'Alamat lama');assert.equal(s.stores.find(x=>x.id===outlet).name,'Toko lama');assert.equal(s.storeProfileVersion,64);assert.equal(s.rejectFlowVersion,63);assert.equal(s.cashierVersion,54);
 const original={lots:s.lots,sales:s.sales,orders:s.orders};
 const p={id:id(),storeId:outlet,creating:false,baseVersion:null,name:'MANIAC DUREN JABABEKA',address:'Jl. Durian No. 10\nCikarang',phone:'0812-3456-7890',logo};
 s=await save(p);const row=s.stores.find(x=>x.id===outlet);
 assert.equal(row.name,p.name);assert.equal(row.location,p.address);assert.equal(row.address,p.address);assert.equal(row.phone,p.phone);assert(row.hasLogo);assert.equal(row.logoVersion,p.id);assert.equal(row.profileVersion,p.id);assert(!JSON.stringify(s).includes(logo),'Login/read must never include logo bytes, even in audit');assert.equal(await getLogo(outlet,p.id),logo);
 assert.deepEqual({lots:s.lots,sales:s.sales,orders:s.orders},original);await save(p,'pos_mutate');
 await assert.rejects(save({...p,phone:'999'}),/ID pengiriman/);
 await assert.rejects(save({...p,id:id(),baseVersion:null}),/Data toko berubah/);
 const edit={...p,id:id(),baseVersion:p.id,name:'MANIAC DUREN CIKARANG'};delete edit.logo;
 s=await save(edit);assert.equal(s.stores.find(x=>x.id===outlet).logoVersion,p.id);assert.equal(await getLogo(outlet),logo);
 for(const [key,value] of [['name',''],['address',' '],['phone',''],['name','x'.repeat(101)],['address','x'.repeat(301)],['phone','x'.repeat(41)],['logo','https://outside.test/image.png'],['logo','data:image/svg+xml;base64,PHN2Zz4='],['logo','data:image/png;base64,YWJjZA=='],['logo','data:image/png;base64,'+Buffer.alloc(71681,0).toString('base64')]])
  await assert.rejects(save({...edit,id:id(),baseVersion:edit.id,[key]:value}));
 await assert.rejects(db.query('select public.pos_store_save($1::jsonb)',[JSON.stringify(edit)]),/permission denied/);
 await as(cashier);assert.equal(await getLogo(outlet),logo);await assert.rejects(getLogo(other),/tidak tersedia/);await assert.rejects(save({...edit,id:id(),baseVersion:edit.id}),/Hak akses/);assert.deepEqual((await read()).stores.map(x=>x.id),[outlet]);
 await as(manager);await assert.rejects(save({...edit,id:id(),storeId:other}),/Hak akses/);
 const managerEdit={...edit,id:id(),baseVersion:edit.id,phone:'+62 812 3456'};s=await save(managerEdit);assert.equal(s.stores[0].phone,managerEdit.phone);
 await assert.rejects(save({...p,id:id(),storeId:id(),creating:true}),/Hanya owner/);
 await as(owner);const remove={...managerEdit,id:id(),baseVersion:managerEdit.id,logo:''};s=await save(remove);assert(!s.stores.find(x=>x.id===outlet).hasLogo);assert.equal(await getLogo(outlet),'');await assert.rejects(getLogo(outlet,p.id),/Logo toko berubah/);
 const create={...p,id:id(),storeId:id(),creating:true};s=await save(create);await save(create);assert.equal(s.stores.filter(x=>x.id===create.storeId).length,1);assert.equal(await getLogo(create.storeId),logo);
 assert.equal(s.stores.find(x=>x.id===other).name,'Outlet lain');
 // Legacy supplier writes still pass through the same public endpoints.
 const supplier=id();await db.query("select public.pos_mutate_027('master',$1::jsonb)",[JSON.stringify({id:supplier,kind:'suppliers',name:'Supplier tetap'})]);assert((await read()).suppliers.some(x=>x.id===supplier));
 await db.exec('reset role');
 const audit=(await db.query("select payload,details from public.md_pos_events where action='store_save'")).rows;
 assert.equal(audit.length,5);assert(!JSON.stringify(audit).includes(logo));
 await db.query('update public.md_pos_employees set active=false where user_id=$1',[cashier]);await as(cashier);await db.exec('set role authenticated');await assert.rejects(getLogo(outlet),/tidak tersedia/);
 await db.exec('set role anon');await assert.rejects(getLogo(outlet),/permission denied/);
 console.log('PASS store receipt SQL: complete profile, old address preserved, logo omitted from reads/audit, scoped logo RPC, validation, ACL, retries, stale edits, removal, create, existing feature wrappers and stock unchanged.');
}catch(error){console.error(error.message,error.where||error.stack);process.exitCode=1;}finally{await db.close();}

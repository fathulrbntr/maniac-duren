import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID as id, createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const md5 = s => createHash('md5').update(s).digest('hex');
try {
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
  await db.exec(fs.readFileSync(process.env.POS_TEST_SQL || 'database/pos.sql','utf8'));
  if (process.env.POS_PHOTO_READ_FIX_SQL) await db.exec(fs.readFileSync(process.env.POS_PHOTO_READ_FIX_SQL,'utf8'));
  const install = fs.readFileSync('database/compress-pos-photos.sql','utf8');
  const rootRead = (await db.query("select pg_get_functiondef('public.pos_read()'::regprocedure) def")).rows[0].def;
  await db.exec(install);await db.exec(install);
  assert.equal((await db.query("select pg_get_functiondef('public.pos_read()'::regprocedure) def")).rows[0].def, rootRead);
  const owner=id(),cashier=id(),product=id(),store=id(),supplier=id(),lot=id(),waste=id();
  for (const [user,role] of [[owner,'owner'],[cashier,'cashier']]) {
    await db.query('insert into auth.users values($1,$2)',[user,role+'@test.local']);
    await db.query('insert into public.md_pos_staff values($1)',[user]);
    await db.query('insert into public.md_pos_employees(id,user_id,name,role) values($1,$1,$2,$2)',[user,role]);
  }
  const original='data:image/png;base64,'+Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(4096)]).toString('base64');
  const small='data:image/webp;base64,'+Buffer.concat([Buffer.from('RIFF0000WEBP'),Buffer.alloc(20)]).toString('base64');
  const edited='data:image/png;base64,'+Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(5000,1)]).toString('base64');
  await db.query("insert into public.md_pos_products(id,sku,name,price_kg,price_piece,photo) values($1,'MD-TEST','Test',100,100,$2)",[product,original]);
  await db.query('update public.md_pos_employees set profile_photo=$1 where id=$2',[original,owner]);
  await db.query('insert into public.md_pos_employee_documents(employee_id,ktp_photo) values($1,$2)',[owner,original]);
  await db.query("insert into public.md_pos_stores(id,name) values($1,'Test')",[store]);
  await db.query("insert into public.md_pos_suppliers(id,name) values($1,'Test')",[supplier]);
  await db.query("insert into public.md_pos_lots(id,store_id,supplier_id,product_id,received_date,received_kg,received_pieces,kg,pieces) values($1,$2,$3,$4,current_date,20,10,20,10)",[lot,store,supplier,product]);
  const snapshot={kg:2,pieces:1,outputs:[],reason:'Test evidence',evidence:{reject:original,processed:original}};
  await db.query('insert into public.md_pos_waste_runs(id,store_id,source_lot_id,waste_date,snapshot) values($1,$2,$3,current_date,$4)',[waste,store,lot,snapshot]);
  const as=async user=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
  const rpc=async (action,payload={})=>(await db.query('select public.pos_photo_maintain($1,$2) result',[action,payload])).rows[0].result;
  const acl=(await db.query("select has_function_privilege('anon','public.pos_photo_maintain(text,jsonb)','execute') anon,has_function_privilege('authenticated','public.pos_photo_maintain(text,jsonb)','execute') member")).rows[0];
  assert.deepEqual(acl,{anon:false,member:true});
  await as(null);await assert.rejects(rpc('check'),/owner aktif/);
  await as(cashier);await assert.rejects(rpc('get',{kind:'ktp',id:owner}),/owner aktif/);
  await as(owner);await db.exec('set role authenticated');assert.equal((await rpc('check')).ready,true);
  const business = async () => (await db.query('select public.pos_read() result')).rows[0].result;
  await db.exec('reset role');
  const event=id(),audit={id:event,name:'Unchanged audit',photo:original,evidence:{reject:original},kg:20,amount:100};
  await db.query("insert into public.md_pos_events(id,action,actor,employee_id,business_date,payload,details) values($1,'product_save',$2,$2,current_date,$3,$4)",[event,owner,audit,{preserved:true}]);
  await db.exec('set role authenticated');
  const before = await business();
  assert.deepEqual(before.events.find(x=>x.id===event).payload,{id:event,name:'Unchanged audit',kg:20,amount:100});
  assert.deepEqual(before.events.find(x=>x.id===event).details,{preserved:true});
  for (const [kind,key,slot] of [['product',product,''],['profile',owner,''],['ktp',owner,''],['evidence',waste,'reject'],['evidence',waste,'processed']]) {
    const list=await rpc('list',{kind});assert(list.some(x=>x.id===key));assert(list.every(x=>Object.keys(x).join()==='id'));
    assert(!(await rpc('list',{kind,after:'ffffffff-ffff-ffff-ffff-ffffffffffff'})).length);
    const old=await rpc('get',{kind,id:key,slot});assert.equal(old.photo,original);assert.equal(old.digest,md5(original));
    assert.equal((await rpc('replace',{kind,id:key,slot,expected:'stale',photo:small})).status,'conflict');
    await assert.rejects(rpc('replace',{kind,id:key,slot,expected:old.digest,photo:'data:image/webp;base64,YmFk'}),/valid/);
    assert.equal((await rpc('replace',{kind,id:key,slot,expected:old.digest,photo:edited})).status,'unchanged');
    assert.equal((await rpc('replace',{kind,id:key,slot,expected:old.digest,photo:small})).status,'updated');
    assert.equal((await rpc('get',{kind,id:key,slot})).photo,small);
    assert.equal((await rpc('replace',{kind,id:key,slot,expected:old.digest,photo:small})).status,'conflict');
  }
  const after=await business();
  before.products.find(x=>x.id===product).photo=small;
  before.employees.find(x=>x.id===owner).profile_photo=small;
  if (before.me?.profile_photo) before.me.profile_photo=small;
  assert.deepEqual(after,before,'Stock, transactions, access, employees, and unrelated fields must remain identical');
  await db.exec('reset role');
  assert.deepEqual((await db.query('select payload from public.md_pos_events where id=$1',[event])).rows[0].payload,audit,'Original retry payload must remain byte-for-byte equivalent');
  const currentSnapshot=(await db.query('select snapshot from public.md_pos_waste_runs where id=$1',[waste])).rows[0].snapshot;
  assert.deepEqual(currentSnapshot,{...snapshot,evidence:{reject:small,processed:small}});
  await db.query('update public.md_pos_products set photo=$1 where id=$2',[edited,product]);
  assert.equal((await rpc('replace',{kind:'product',id:product,expected:md5(small),photo:small})).status,'conflict');
  assert.equal((await rpc('get',{kind:'product',id:product})).photo,edited);
  await db.query('update public.md_pos_employees set active=false where id=$1',[owner]);
  await assert.rejects(rpc('check'),/owner aktif/);
  console.log('PASS: SQL installation/re-run, owner-only access, no pos_read changes, all photo sources, size/signature guards, stale updates rejected, unrelated data unchanged.');
} catch (error) { console.error('FAIL:',error.message);process.exitCode=1; }
finally { await db.close(); }

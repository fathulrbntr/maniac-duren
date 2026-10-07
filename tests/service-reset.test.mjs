import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try {
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 await db.exec(fs.readFileSync('database/pos.sql','utf8'));
 await db.exec(fs.readFileSync('database/upgrade.sql','utf8'));
 const user='00000000-0000-4000-8000-000000000001',branch='00000000-0000-4000-8000-000000000002';
 await db.query('insert into auth.users values ($1,$2)',[user,'owner@test.example']);
 await db.query('insert into public.md_pos_staff values ($1)',[user]);
 await db.query("insert into public.md_pos_stores(id,name) values ($1,'Outlet')",[branch]);
 await db.query("insert into public.md_pos_employees(id,user_id,name,email,role,store_ids) values ($1,$1,'Owner','owner@test.example','owner',array[$2::uuid])",[user,branch]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
 const state=(await db.query('select public.pos_read_service($1,true) as data',[branch])).rows[0].data;
 assert.equal(state.me.id,user);assert.deepEqual(state.orders,[]);assert.equal(state.orderRoutingVersion,13);
 assert.equal(state.money,undefined);assert.equal(state.sales,undefined);
 await assert.rejects(db.query("select public.pos_read_service('00000000-0000-4000-8000-000000000099',true)"),/Outlet/);
 await db.query("insert into public.md_pos_suppliers(id,name) values ('00000000-0000-4000-8000-000000000003','Supplier')");
 await db.exec(fs.readFileSync('database/clear-operations.sql','utf8'));
 assert.equal((await db.query('select count(*)::int as n from public.md_pos_suppliers')).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int as n from public.md_pos_employees')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int as n from public.md_pos_stores')).rows[0].n,1);
 await db.query("select set_config('request.jwt.claim.sub','',false)");
 await assert.rejects(db.query('select public.pos_read_service($1,true)',[branch]),/akses POS/);
 console.log('PASS service read authorization, rerunnable upgrade, reset employee/account/outlet preservation');
}finally{await db.close()}

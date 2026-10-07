import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {periodDates,attendanceNote} from '../pos/employees-ui.mjs';
assert.deepEqual(periodDates('week','2026-10-05'),['2026-10-05']);
assert.equal(periodDates('month','2026-10-05').length,5);
assert.equal(attendanceNote({clock_in:'2026-10-05T02:01:00Z',scheduled_start:'09:00:00',scheduled_end:'17:00:00'}).tone,'late');
assert.equal(attendanceNote({clock_in:'2026-10-05T02:00:00Z',scheduled_start:'09:00:00',scheduled_end:'17:00:00'}).tone,'good');
const db=new PGlite();
try{
await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
await db.exec(fs.readFileSync(process.env.POS_UPGRADE_BASE || 'database/pos.sql','utf8'));
await db.exec(fs.readFileSync('database/sections/operations/employee-accounts.sql','utf8'));
const owner=id(),staff=id(),store=id(),other=id();
for(const u of [owner,staff])await db.query('insert into auth.users values($1,$2)',[u,u+'@test.local']);
await db.query("insert into md_pos_employees(id,user_id,name,role) values($1,$1,'Owner','owner')",[owner]);
await db.query('insert into md_pos_staff values($1)',[owner]);
const as=async u=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);
const mut=async(a,p)=>(await db.query('select pos_mutate($1,$2::jsonb) s',[a,JSON.stringify(p)])).rows[0].s;
await as(owner);for(const k of [store,other])await mut('master',{id:k,kind:'stores',name:k});
let s=await mut('employee_save',{id:id(),employeeId:staff,name:'Staff Test',email:'staff@test.local',phone:'081234567890',birthDate:'2000-01-02',active:true,storeIds:[store],permissions:[],ktpPhoto:'data:image/png;base64,aGVsbG8='});
assert.equal(s.employees.find(x=>x.id===staff).role,'staff');assert.equal(s.employees.find(x=>x.id===staff).birth_date,'2000-01-02');assert.ok(!JSON.stringify(s).includes('base64'));
assert.ok((await db.query('select pos_employee_document($1) d',[staff])).rows[0].d.ktpPhoto);
await db.query('update md_pos_employees set user_id=$1 where id=$1',[staff]);
await mut('work_hours_save',{id:id(),storeId:store,startTime:'09:00',endTime:'17:00'});
await db.query('insert into md_pos_staff values($1)',[staff]);
await as(staff);
await assert.rejects(db.query('select pos_employee_document($1)',[staff]));
await assert.rejects(mut('work_hours_save',{id:id(),storeId:store,startTime:'08:00',endTime:'18:00'}));
await assert.rejects(mut('attendance_in',{id:id(),storeId:other}));
await assert.rejects(mut('attendance_out',{id:id(),storeId:store}));
s=await mut('attendance_in',{id:id(),storeId:store,date:'2001-01-01'});const first=s.attendance[0].clock_in;assert.equal(s.attendance.length,1);assert.equal(s.attendance[0].scheduled_start,'09:00:00');assert.notEqual(s.attendance[0].work_date,'2001-01-01');
s=await mut('attendance_in',{id:id(),storeId:store});assert.equal(s.attendance.length,1);assert.equal(s.attendance[0].clock_in,first);
s=await mut('attendance_out',{id:id(),storeId:store});const out=s.attendance[0].clock_out;
s=await mut('attendance_out',{id:id(),storeId:store});assert.equal(s.attendance.length,1);assert.ok(s.attendance[0].clock_out>=out);
await as(owner);await mut('work_hours_save',{id:id(),storeId:store,startTime:'08:00',endTime:'18:00'});
assert.equal((await db.query('select scheduled_start from md_pos_attendance')).rows[0].scheduled_start,'09:00:00');
// Account/profile checks and idempotence with real PostgreSQL functions.
const profile='data:image/png;base64,aGVsbG8=';
const employeePayload={id:id(),employeeId:staff,name:'Staff Test',email:'staff@test.local',phone:'081234567890',username:'staff.one',active:true,storeIds:[store],permissions:[],profilePhoto:profile};
s=await mut('employee_save',employeePayload);
assert.equal(s.employees.find(x=>x.id===staff).username,'staff.one');
assert.equal(s.employees.find(x=>x.id===staff).profile_photo,profile);
assert(!JSON.stringify(s.events).includes(profile));
await mut('employee_save',{...employeePayload,id:id(),username:'staff.two',profilePhoto:''});
await mut('employee_save',employeePayload);
s=(await db.query('select pos_read() s')).rows[0].s;
assert.equal(s.employees.find(x=>x.id===staff).username,'staff.two');
assert.equal(s.employees.find(x=>x.id===staff).profile_photo,null);
await assert.rejects(mut('employee_save',{...employeePayload,username:'different'}),/ID|digunakan/);
await assert.rejects(mut('employee_save',{...employeePayload,id:id(),profilePhoto:'javascript:alert(1)'}),/Foto profil/);
await assert.rejects(mut('employee_save',{...employeePayload,id:id(),employeeId:id(),username:'staff.two'}),/digunakan/);
await assert.rejects(mut('employee_save',{...employeePayload,id:id(),employeeId:id(),username:'other',phone:'+62 812-3456-7890'}),/digunakan/);
for(const role of ['anon','authenticated']){
 await db.exec('set role '+role);
 await assert.rejects(db.query('select pos_login_identity($1)',['staff.two']),/permission denied/);
 await assert.rejects(db.query('select pos_read_v16()'),/permission denied/);
 await assert.rejects(db.query('select pos_mutate_v16($1,$2)',['employee_save','{}']),/permission denied/);
 await db.exec('reset role');
}
await db.exec('set role service_role');
for(const identifier of ['staff.two','STAFF.TWO','081234567890','+62 812 3456 7890'])assert.equal((await db.query('select pos_login_identity($1) x',[identifier])).rows[0].x.userId,staff);
assert.equal((await db.query('select pos_login_identity($1) x',['unknown'])).rows[0].x,null);
const bucket='login:'+'a'.repeat(64);
for(let i=0;i<10;i++)assert.equal((await db.query('select pos_login_throttle($1) x',[bucket])).rows[0].x,true);
assert.equal((await db.query('select pos_login_throttle($1) x',[bucket])).rows[0].x,false);
await db.exec('reset role');
await db.query('update md_pos_employees set active=false where id=$1',[staff]);
assert.equal((await db.query('select pos_account_target($1) x',[staff])).rows[0].x.userId,staff);
assert.equal((await db.query('select pos_login_identity($1) x',['staff.two'])).rows[0].x,null);
await db.query('update md_pos_employees set active=true where id=$1',[staff]);
await as(staff);await assert.rejects(db.query('select pos_account_target($1)',[owner]),/Hak akses/);await as(owner);
// Old duplicate shifts survive as one first-in/last-out record, with private originals archived.
await db.exec('drop index md_pos_attendance_one_day');
await db.query("insert into md_pos_attendance(id,employee_id,store_id,work_date,clock_in,clock_out) values($1,$2,$3,'2025-01-01','2025-01-01T01:00Z','2025-01-01T04:00Z'),($4,$2,$3,'2025-01-01','2025-01-01T05:00Z','2025-01-01T11:00Z')",[id(),staff,store,id()]);
await db.exec(fs.readFileSync('database/sections/operations/employees-attendance.sql','utf8'));
await db.exec(fs.readFileSync('database/sections/operations/employee-accounts.sql','utf8'));
await db.exec(fs.readFileSync('database/sections/operations/employee-accounts.sql','utf8'));
const legacy=(await db.query("select * from md_pos_attendance where work_date='2025-01-01'")).rows;
assert.equal(legacy.length,1);assert.equal(new Date(legacy[0].clock_in).getUTCHours(),1);assert.equal(new Date(legacy[0].clock_out).getUTCHours(),11);
assert.equal((await db.query('select * from md_pos_attendance_legacy')).rows.length,2);
assert.equal((await db.query('select pos_read() s')).rows[0].s.employeeAccountVersion,2);
console.log('PASS database: employee/profile retry, username/phone isolation, private login RPC, account targeting, rate limit, attendance, schedule snapshots, repeat migrations, archived duplicate consolidation.');
}finally{await db.close();}

// Test server endpoints without sending credentials or modifying any real account.
const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
const login=require('../api/pos-login.js'),accounts=require('../api/pos-employee.js');
const previousFetch=globalThis.fetch,previousEnv={...process.env};
process.env.POS_SUPABASE_URL='https://fixture.supabase.co';process.env.POS_SUPABASE_PUBLISHABLE_KEY='public-fixture';process.env.POS_SUPABASE_SERVICE_ROLE_KEY='private-fixture';
const userId=id(),employeeId=id();let calls=[],denyOwner=false,rateAllowed=true,loginValid=true,linked=true;
globalThis.fetch=async(url,options)=>{calls.push({url,options});const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
 if(url.endsWith('/pos_login_prepare'))return response({allowed:rateAllowed,target:{email:'staff@test.local',userId}});
 if(url.endsWith('/pos_login_throttle'))return response(rateAllowed);
 if(url.endsWith('/pos_login_identity'))return response({email:'staff@test.local',userId});
 if(url.includes('/token?'))return loginValid?response({user:{id:userId},access_token:'access-fixture',refresh_token:'refresh-fixture',expires_in:3600}):response({error:'invalid'},400);
 if(url.endsWith('/pos_account_target'))return denyOwner?response({message:'Hak akses ditolak'},403):response({userId:linked?userId:null,email:'staff@test.local',linked,active:true});
 if(url.includes('/admin/users'))return response({id:userId});
 if(url.endsWith('/pos_mutate'))return response({});throw Error('Unexpected fetch');};
async function invoke(handler,body,auth='Bearer owner-fixture'){const res={code:200,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await handler({method:'POST',body,headers:{authorization:auth,'x-forwarded-for':'127.0.0.1'}},res);return res;}
try{
 let response=await invoke(login,{identifier:'staff.two',password:'correct-password'});assert.equal(response.code,200);assert.equal(response.body.access_token,'access-fixture');assert(!JSON.stringify(response.body).includes('private-fixture'));assert(!JSON.stringify(response.body).includes('staff@test.local'));
 assert.equal(JSON.parse(calls.find(x=>x.url.includes('/token?')).options.body).password,'correct-password');
 calls=[];loginValid=false;response=await invoke(login,{identifier:'staff.two',password:'wrong'});assert.equal(response.code,401);loginValid=true;
 calls=[];rateAllowed=false;response=await invoke(login,{identifier:'staff.two',password:'correct-password'});assert.equal(response.code,429);assert(!calls.some(x=>x.url.includes('/token?')));rateAllowed=true;
 calls=[];denyOwner=true;response=await invoke(accounts,{employeeId,password:'new-password-123',action:'reset'});assert.equal(response.code,400);assert(!calls.some(x=>x.url.includes('/admin/')));denyOwner=false;
 calls=[];response=await invoke(accounts,{employeeId,password:'new-password-123',action:'reset'});assert.equal(response.code,200);assert(calls.some(x=>x.url.endsWith('/admin/users/'+userId)&&x.options.method==='PUT'));
 calls=[];linked=false;response=await invoke(accounts,{employeeId,password:'new-password-123',action:'reset'});assert.equal(response.code,400);assert(!calls.some(x=>x.url.includes('/admin/')));
 calls=[];response=await invoke(accounts,{employeeId,password:'new-password-123',action:'create'});assert.equal(response.code,200);assert(calls.some(x=>x.url.endsWith('/pos_mutate')));
 calls=[];response=await invoke(accounts,{employeeId,password:'abc123',action:'create'});assert.equal(response.code,200);assert(calls.some(x=>x.url.includes('/admin/users')&&JSON.parse(x.options.body).password==='abc123'));
 calls=[];response=await invoke(accounts,{employeeId,password:'abc12',action:'create'});assert.equal(response.code,400);assert.equal(calls.length,0);
 linked=true;response=await invoke(accounts,{employeeId,password:'abc123',action:'reset'});assert.equal(response.code,200);
 response=await invoke(accounts,'{bad JSON');assert.equal(response.code,400);
 console.log('PASS API: server login exchange, generic rejection, rate limiting, owner authorization, linked-ID password reset, account create/link, malformed input.');
}finally{globalThis.fetch=previousFetch;for(const key of ['POS_SUPABASE_URL','POS_SUPABASE_PUBLISHABLE_KEY','POS_SUPABASE_SERVICE_ROLE_KEY']){if(previousEnv[key]===undefined)delete process.env[key];else process.env[key]=previousEnv[key];}}

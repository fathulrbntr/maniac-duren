import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 for(const file of ['database/pos.sql','database/compress-pos-photos.sql','database/pos-menu-categories.sql','database/pos-cashier-controls.sql','database/link-durian-reject.sql','database/reject-flow-063.sql','database/store-receipt-064.sql']){
  if(file.endsWith('link-durian-reject.sql'))await db.exec(fs.readFileSync('database/seeds/import-durian-dan-turunan.sql','utf8').replace("null, null, null, null, '', ''","case when r.stock_unit='kg_butir' then 50000 end, case when r.stock_unit='kg_butir' then 100000 end, null, null, '', ''"));
  await db.exec(fs.readFileSync(file,'utf8'));
 }
 const owner=id(),staff=id(),other=id(),store=id();
 await db.query("insert into public.md_pos_stores(id,name) values($1,'Depok')",[store]);
 for(const [user,role] of [[owner,'owner'],[staff,'staff'],[other,'manager']]){
  await db.query('insert into auth.users values($1,$2)',[user,user+'@test.local']);
  await db.query('insert into md_pos_staff values($1)',[user]);
  await db.query('insert into md_pos_employees(id,user_id,name,email,role,store_ids) values($1,$1,$2,$3,$2,$4)',[user,role,user+'@test.local',[store]]);
 }
 const as=user=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
 const read=async()=>(await db.query('select public.pos_read() s')).rows[0].s;
 const save=async(payload,endpoint='pos_mutate_027')=>(await db.query(`select public.${endpoint}('employee_save',$1::jsonb) s`,[JSON.stringify(payload)])).rows[0].s;
 await as(owner);
 const before=await read(),migration=fs.readFileSync('database/employee-details-070.sql','utf8');
 await db.exec(migration);await db.exec(migration);
 await db.exec('set role authenticated');
 let s=await read();
 assert.equal(s.employeeDetailsVersion,70);
 assert.equal(s.storeProfileVersion,64);assert.equal(s.rejectFlowVersion,63);assert.equal(s.cashierVersion,54);
 assert.deepEqual(s.orders,before.orders);assert.deepEqual(s.lots,before.lots);
 assert.equal(s.employees.find(x=>x.id===staff).bank_account_number,'');
 const p={id:id(),employeeId:staff,name:'Staff test',email:staff+'@test.local',role:'staff',active:true,phone:'081234567890',storeIds:[store],permissions:[],emergencyContactName:' Ibu Test ',emergencyContactPhone:'+62 812-3333-4444',bankName:' BCA ',bankAccountName:' Staff Test ',bankAccountNumber:'001234567890'};
 s=await save(p);
 const employee=()=>s.employees.find(x=>x.id===staff);
 assert.equal(employee().emergency_contact_name,'Ibu Test');assert.equal(employee().emergency_contact_phone,p.emergencyContactPhone);
 assert.equal(employee().bank_name,'BCA');assert.equal(employee().bank_account_name,'Staff Test');assert.equal(employee().bank_account_number,p.bankAccountNumber);
 s=await read();assert.equal(employee().bank_account_number,p.bankAccountNumber);
 assert(!JSON.stringify(s.events).includes(p.bankAccountNumber));assert(!JSON.stringify(s.events).includes('Ibu Test'));
 await save(p,'pos_mutate');
 await assert.rejects(save({...p,bankAccountNumber:'999'}),/ID|digunakan/);
 // A retry after a later edit must not overwrite that edit.
 s=await save({...p,id:id(),bankAccountNumber:'0000123456789012345678901234567890'},'pos_mutate');
 await save(p);s=await read();assert.equal(employee().bank_account_number,'0000123456789012345678901234567890');
 const legacy={...p,id:id(),name:'Nama baru'};
 for(const key of ['emergencyContactName','emergencyContactPhone','bankName','bankAccountName','bankAccountNumber'])delete legacy[key];
 s=await save(legacy);assert.equal(employee().bank_name,'BCA');assert.equal(employee().bank_account_number,'0000123456789012345678901234567890');
 for(const [key,value] of [['emergencyContactPhone','123'],['emergencyContactPhone','0812abc345678'],['emergencyContactPhone','1'.repeat(16)],['bankAccountNumber','1e10'],['bankAccountNumber','001-123'],['bankAccountNumber','1'.repeat(35)],['bankAccountNumber',1234],['bankName','X'.repeat(101)],['bankAccountName','X'.repeat(101)],['emergencyContactName','X'.repeat(101)]]){
  await assert.rejects(save({...p,id:id(),[key]:value}));
 }
 s=await save({...p,id:id(),emergencyContactName:'',emergencyContactPhone:'',bankName:'',bankAccountName:'',bankAccountNumber:''});
 for(const key of ['emergency_contact_name','emergency_contact_phone','bank_name','bank_account_name','bank_account_number'])assert.equal(employee()[key],'');
 const fresh={...p,id:id(),employeeId:id(),email:'new@test.local',phone:'',username:'new.employee',birthDate:'2000-01-01'};
 s=await save(fresh);assert.equal(s.employees.find(x=>x.id===fresh.employeeId).bank_account_number,p.bankAccountNumber);
 for(const user of [staff,other]){
  await as(user);await assert.rejects(save({...p,id:id()}),/Hak akses/);
  const own=await read();assert.deepEqual(own.employees.map(x=>x.id),[user]);assert(!JSON.stringify(own).includes(p.bankAccountNumber));
 }
 await as(owner);
 for(const fn of ['pos_read_before_070()','pos_mutate_before_070(\'employee_save\',\'{}\'::jsonb)','pos_mutate_027_before_070(\'employee_save\',\'{}\'::jsonb)'])await assert.rejects(db.query('select public.'+fn),/permission denied/);
 // Unrelated actions still reach the pre-existing wrappers.
 await db.query("select public.pos_mutate_027('store_save',$1::jsonb)",[JSON.stringify({id:id(),storeId:store,name:'Depok baru',address:'Jl. Test',phone:'0812345678'})]);
 assert.equal((await read()).stores.find(x=>x.id===store).name,'Depok baru');
 await db.exec('set role anon');await assert.rejects(read(),/permission denied/);await assert.rejects(save(p),/permission denied/);
 await db.exec('reset role');await db.exec(migration);await db.exec('set role authenticated');s=await read();assert.equal(s.employees.find(x=>x.id===fresh.employeeId).bank_account_number,p.bankAccountNumber);assert.equal(s.storeProfileVersion,64);
 console.log('PASS employee details: create/edit/read/clear, leading zeros, old clients, both RPCs, retry safety, validation, private audit, permissions, repeat migration, existing store flow.');
}catch(error){console.error(error.message,error.where||error.stack);process.exitCode=1;}finally{await db.close();}

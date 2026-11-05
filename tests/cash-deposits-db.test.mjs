import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const proof='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 for(const f of ['pos.sql','rollback-027-compat.sql','compress-pos-photos.sql'])await db.exec(fs.readFileSync('database/'+f,'utf8'));
 await db.exec(fs.readFileSync('database/seeds/import-durian-dan-turunan.sql','utf8').replace("null, null, null, null, '', ''","case when r.stock_unit='kg_butir' then 50000 end, case when r.stock_unit='kg_butir' then 100000 end, null, null, '', ''"));
 for(const f of ['link-durian-reject.sql','product-variants.sql','pos-menu-categories.sql','pos-cashier-controls.sql','product-single-variant.sql','reject-flow-063.sql','store-receipt-064.sql','employee-details-070.sql','reports-admin-071.sql','product-buy-piece-077.sql','receipt-shipment-082.sql','cashier-shifts-083.sql','payment-methods-084.sql','crm-loyalty-085.sql','cash-deposits-092.sql','cash-deposits-092.sql'])await db.exec(fs.readFileSync('database/'+f,'utf8'));
 const owner=id(),cashier=id(),foreignCashier=id(),kitchen=id(),store=id(),foreign=id(),supplier=id(),product=id();
 await db.query("insert into public.md_pos_stores(id,name) values($1,'Depok'),($2,'Bogor')",[store,foreign]);
 for(const [user,role,st,name] of [[owner,'owner',store,'Owner'],[cashier,'cashier',store,'Siti <Kasir>'],[foreignCashier,'cashier',foreign,'Rina'],[kitchen,'kitchen',store,'Dapur']]){
  await db.query('insert into auth.users values($1,$2)',[user,user+'@test.local']);await db.query('insert into public.md_pos_staff values($1)',[user]);await db.query('insert into public.md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$3,$4)',[user,name,role,[st]]);
 }
 const as=who=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);
 const read=async()=>(await db.query('select public.pos_read() s')).rows[0].s;
 const mut=async(action,p,endpoint='pos_mutate_027')=>(await db.query('select public.'+endpoint+'($1,$2::jsonb) s',[action,JSON.stringify(p)])).rows[0].s;
 const save=p=>mut('cash_deposit_save',p,'pos_cash_deposit_mutate');
 const cancel=p=>mut('cash_deposit_void',p,'pos_cash_deposit_mutate');
 const deposits=async(filters={})=>(await db.query('select public.pos_cash_deposits_read($1::jsonb) s',[JSON.stringify(filters)])).rows[0].s;
 const evidence=async key=>(await db.query('select public.pos_cash_deposit_proof($1) s',[key])).rows[0].s;
 await as(owner);let s=await read();
 for(const [key,value] of Object.entries({cashDepositVersion:92,crmVersion:85,paymentMethodsVersion:84,cashierShiftVersion:83,reportsAdminVersion:71,storeProfileVersion:64}))assert.equal(s[key],value,key+' remains in wrapper chain');
 const date=s.cashDepositToday;await mut('master',{id:supplier,kind:'suppliers',name:'Supplier'});
 await mut('product_save',{id:product,name:'Air',sku:'AIR',itemType:'direct',stockUnit:'pcs',category:'Minuman',salePrice:10000});
 await mut('unit_receipt',{id:id(),storeId:store,date,productId:product,qty:100,totalCost:100000,supplierId:supplier,kind:'purchase'});
 await as(cashier);const sh=id();await mut('cashier_shift_open',{id:sh,storeId:store,openingCash:100000},'pos_cashier_shift_mutate');
 const cashOrder={id:id(),storeId:store,date,lines:[{productId:product,qty:2,price:10000}],payment:'Tunai',paid:50000};
 await mut('order_create',cashOrder);await mut('order_create',{...cashOrder,id:id(),payment:'QRIS',paid:20000});
 s=await read();assert.equal(s.cashDepositSummary.find(x=>x.storeId===store).pending,20000,'Exclude change, QRIS and float');
 const p={id:id(),storeId:store,amount:12000,bank:'Bank Mandiri',proof};
 for(const addition of [{date:'2000-01-01'},{cashierName:'Spoofed'},{createdAt:'2000-01-01'}])await assert.rejects(save({...p,...addition}),/server/);
 for(const amount of [0,-1,0.5,20001,'NaN','Infinity'])await assert.rejects(save({...p,amount}),/Rupiah|melebihi/);
 await assert.rejects(save({...p,bank:''}),/bank/);await assert.rejects(save({...p,proof:''}),/Bukti/);await assert.rejects(save({...p,proof:'data:image/png;base64,SGVsbG8gd29ybGQh'}),/format/);
 await assert.rejects(save({...p,proof:'data:image/png;base64,'+'A'.repeat(2796304)}),/maksimal/);
 s=await save(p);assert.equal(s.cashDepositSummary[0].pending,8000);assert.equal(s.cashDepositSummary[0].deposited,12000);assert.equal(s.orders.length,2);assert(!JSON.stringify(s).includes(proof),'Main state never downloads bank images');
 assert.equal((await save(p)).cashDepositSummary[0].deposited,12000);await assert.rejects(save({...p,amount:1}),/ID sudah/);
 const rows=(await deposits({storeId:store})).rows;assert.equal(rows.length,1);assert.equal(rows[0].date,date);assert.equal(rows[0].cashierName,'Siti <Kasir>');assert.equal(rows[0].cashierId,cashier);assert.equal((await evidence(p.id)).proof,proof);
 await assert.rejects(cancel({id:id(),depositId:p.id,reason:'Salah nominal'}),/pengelola/);
 // Two writes competing for the same remaining balance cannot both succeed.
 const competing=await Promise.allSettled([save({...p,id:id(),amount:6000}),save({...p,id:id(),amount:6000})]);assert.equal(competing.filter(x=>x.status==='fulfilled').length,1);assert.equal((await deposits({storeId:store})).summary[0].pending,2000);
 await as(foreignCashier);await assert.rejects(save({...p,id:id(),amount:1}),/akses/);await assert.rejects(deposits({storeId:store}),/diakses/);await assert.rejects(evidence(p.id),/diakses/);assert.equal((await deposits()).rows.length,0);
 await as(kitchen);assert.equal((await deposits()).summary.length,0);await assert.rejects(save({...p,id:id()}),/akses/);await assert.rejects(evidence(p.id),/diakses/);
 await as(owner);const voidPayload={id:id(),depositId:p.id,reason:'Koreksi nominal'};s=await cancel(voidPayload);assert.equal(s.cashDepositSummary.find(x=>x.storeId===store).pending,14000);await cancel(voidPayload);assert.equal((await evidence(p.id)).proof,proof);assert((await evidence(p.id)).deposit.voidedAt);
 const before=(await deposits({storeId:store})).summary;await db.exec(fs.readFileSync('database/cash-deposits-092.sql','utf8'));assert.deepEqual((await deposits({storeId:store})).summary,before,'rerun preserves rows and totals');
 await as(cashier);const originalName=(await deposits({storeId:store})).rows.find(x=>x.id===p.id).cashierName;await db.query("update public.md_pos_employees set name='Nama baru' where id=$1",[cashier]);assert.equal((await deposits({storeId:store})).rows.find(x=>x.id===p.id).cashierName,originalName);
 await assert.rejects(deposits({from:'2026-12-01',to:'2026-01-01'}),/Filter/);await assert.rejects(deposits({offset:-1}),/Filter/);
 const beforePeriod=(await deposits({storeId:store})).summary[0].pending;assert.equal((await deposits({storeId:store,from:'2999-01-01'})).rows.length,0);assert.equal((await deposits({storeId:store,from:'2999-01-01'})).summary[0].pending,beforePeriod);
 await db.exec('set role authenticated');
 for(const table of ['md_pos_cash_deposits','md_pos_cash_deposit_proofs','md_pos_cash_deposit_events'])await assert.rejects(db.query('select * from public.'+table),/permission denied/);
 for(const fn of ['pos_deposit_summary','pos_deposit_json','pos_deposit_allowed'])await assert.rejects(db.query('select public.'+fn+'($1)',[store]),/permission denied/);
 await assert.rejects(db.query('select public.pos_read_before_092()'),/permission denied/);assert((await evidence(p.id)).proof);
 await db.exec('reset role;set role anon');await assert.rejects(deposits(),/permission denied/);await assert.rejects(save({...p,id:id(),amount:1}),/permission denied/);await assert.rejects(evidence(p.id),/permission denied/);await db.exec('reset role');
 console.log('PASS deposit SQL: full feature chain, server date and cashier identity, proof validation/privacy, net cash, atomic balance limit, retries, permissions, cancellation audit, cumulative scope, migration rerun, and restricted RPC grants.');
}catch(error){console.error(error.message,error.code||'',error.where||'',error.stack);process.exitCode=1;}finally{await db.close();}

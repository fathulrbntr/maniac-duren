import {paymentMethods,paymentGroups,defaultPaymentSettings} from '../pos/payment-methods.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 for(const f of ['pos.sql','rollback-027-compat.sql','compress-pos-photos.sql','pos-menu-categories.sql','pos-cashier-controls.sql','receipt-shipment-082.sql','cashier-shifts-083.sql','payment-methods-084.sql','payment-methods-084.sql'])await db.exec(fs.readFileSync('database/'+f,'utf8'));
 const owner=id(),cashier=id(),other=id(),foreignCashier=id(),store=id(),foreign=id(),supplier=id(),product=id(),date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
 await db.query("insert into public.md_pos_stores(id,name) values($1,'Depok'),($2,'Bogor')",[store,foreign]);
 for(const [user,role,st,name] of [[owner,'owner',store,'Owner'],[cashier,'cashier',store,'Siti <Kasir>'],[other,'cashier',store,'Budi'],[foreignCashier,'cashier',foreign,'Rina']]){
  await db.query('insert into auth.users values($1,$2)',[user,user+'@test.local']);await db.query('insert into public.md_pos_staff values($1)',[user]);await db.query('insert into public.md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$3,$4)',[user,name,role,[st]]);
 }
 const as=who=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);
 const read=async()=>(await db.query('select public.pos_read() s')).rows[0].s;
 const mut=async(action,p,endpoint='pos_mutate_027')=>(await db.query('select public.'+endpoint+'($1,$2::jsonb) s',[action,JSON.stringify(p)])).rows[0].s;
 const shift=(action,p)=>mut('cashier_shift_'+action,p,'pos_cashier_shift_mutate');
 const monitor=async(f={})=>(await db.query('select public.pos_cashier_shifts_read($1::jsonb) s',[JSON.stringify(f)])).rows[0].s;
 await as(owner);await mut('master',{id:supplier,kind:'suppliers',name:'Supplier'});
 await mut('product_save',{id:product,name:'Air',sku:'AIR',itemType:'direct',stockUnit:'pcs',category:'Minuman',salePrice:10000});
 await mut('unit_receipt',{id:id(),storeId:store,date,productId:product,qty:100,totalCost:100000,supplierId:supplier,kind:'purchase'});
 const cart={storeId:store,date,lines:[{productId:product,qty:2,price:10000}],payment:'Tunai',paid:50000};
 const settings=async p=>(await db.query('select public.pos_payment_settings_save($1::jsonb) s',[JSON.stringify(p)])).rows[0].s;
 const config=defaultPaymentSettings();for(const g of paymentGroups)config.groups[g.id]=true;for(const m of paymentMethods)config.methods[m.id].enabled=true;
 config.methods.bca.accountNumber='0012345678';
 const p={id:id(),storeId:store,expectedRevision:0,config};
 let s=await settings(p);assert.equal(s.paymentMethodsVersion,84);assert.equal(s.paymentSettings[0].config.methods.bca.accountNumber,'0012345678');await settings(p);
 await assert.rejects(settings({...p,id:id()}),/Pengaturan berubah/);
 await assert.rejects(settings({...p,config:defaultPaymentSettings()}),/ID sudah/);
 const none=structuredClone(config);for(const g of paymentGroups)none.groups[g.id]=false;
 await assert.rejects(settings({...p,id:id(),expectedRevision:1,config:none}),/minimal satu/);
 const unknown=structuredClone(config);unknown.methods.fake={enabled:true};await assert.rejects(settings({...p,id:id(),expectedRevision:1,config:unknown}),/tidak dikenal/);
 await as(cashier);await assert.rejects(settings({...p,id:id(),expectedRevision:1}),/Hanya owner/);
 await as(foreignCashier);assert.equal((await read()).paymentSettings.length,0);
 await as(cashier);const opening={id:id(),storeId:store,openingCash:100000};await shift('open',opening);
 const sales=[];
 for(const method of paymentMethods){const payload={...cart,id:id(),payment:method.label,paid:method.id==='cash'?50000:20000};s=await mut('order_create',payload);await mut('order_create',payload);sales.push(payload);assert.equal(s.orders.find(x=>x.id===payload.id).payment,method.label);}
 let m=await monitor({shiftId:opening.id});assert.equal(m.shift.summary.payments.length,25);assert.equal(m.shift.summary.expectedCash,120000);assert.equal(m.shift.summary.salesCount,25);assert.equal(m.shift.summary.sales,500000);
 await assert.rejects(mut('order_create',{...cart,id:id(),payment:'GoPay',paid:25000}),/sesuai total/);
 await assert.rejects(mut('order_create',{...cart,id:id(),payment:'Unknown',paid:20000}),/sesuai total|tidak aktif/);
 await as(owner);const cfg=structuredClone(config);cfg.groups.ewallet=false;await settings({...p,id:id(),expectedRevision:1,config:cfg});
 await as(cashier);const go=sales.find(x=>x.payment==='GoPay');await mut('order_create',go);await assert.rejects(mut('order_create',{...go,id:id()}),/tidak aktif/);
 // Disabled methods remain valid for refunds, and do not change cash reconciliation.
 await as(owner);const vr={id:id(),storeId:store,date,kind:'void',orderId:go.id,reason:'Uji refund',returnStock:true};await mut('cashier_approval_request',vr);
 const sh={id:id(),storeId:store,openingCash:50000};await shift('open',sh);await mut('order_void',{id:id(),storeId:store,date,orderId:go.id,approvalId:vr.id,refundConfirmed:true});
 m=await monitor({shiftId:sh.id});assert.equal(m.shift.summary.expectedCash,50000);assert.equal(m.shift.summary.payments.find(x=>x.payment==='GoPay').refunds,20000);
 // Current and legacy settlement RPCs use the expanded whitelist.
 const unpaid=id();await db.query("insert into public.md_pos_order_runs(id,store_id,business_date,status,total,lines,created_by) values($1,$2,$3,'queued',20000,'[]',$4)",[unpaid,store,date,owner]);
 s=await mut('order_pay',{id:id(),storeId:store,date,orderId:unpaid,payment:'Shopee',paid:20000});assert.equal(s.orders.find(x=>x.id===unpaid).payment,'Shopee');
 const fruit=id(),lot=id();await mut('product_save',{id:fruit,name:'Bawor',sku:'BW',itemType:'direct',stockUnit:'kg_butir',priceKg:50000,pricePiece:100000});await mut('receipt',{id:lot,storeId:store,date,productId:fruit,supplierId:supplier,kg:10,pieces:5,totalCost:100000});
 const legacy={id:id(),storeId:store,date,payment:'Kartu Debit',paid:100000,lines:[{lotId:lot,kg:2,pieces:1,unit:'KG',price:50000}]};
 s=await mut('sale',legacy);assert.equal(s.sales.find(x=>x.id===legacy.id).payment,'Kartu Debit');
 await assert.rejects(mut('sale',{...legacy,id:id(),paid:100001}),/sesuai total/);
 // Direct public RPC and discount still persist correct net amount.
 await mut('order_create',{...cart,id:id(),payment:'Transfer BCA',paid:20000},'pos_mutate');
 const discount=id();await mut('discount_save',{id:id(),discountId:discount,expectedVersion:0,name:'10%',kind:'percent',value:10,active:true});
 const req={id:id(),storeId:store,date,kind:'discount',discountId:discount,expectedVersion:1,checkout:cart};await mut('cashier_approval_request',req);
 const disc={...cart,id:id(),payment:'Shopee',paid:18000,discountApprovalId:req.id};s=await mut('order_create',disc);assert.equal(s.orders.find(x=>x.id===disc.id).total,18000);
 const old=await read();await db.exec(fs.readFileSync('database/payment-methods-084.sql','utf8'));assert.deepEqual((await read()).paymentSettings,old.paymentSettings);assert.equal((await monitor({shiftId:opening.id})).shift.summary.salesCount,25);
 await as(cashier);m=await monitor({shiftId:opening.id});await shift('close',{id:id(),shiftId:opening.id,expectedRevision:m.shift.revision,closingCash:120000,note:''});m=await monitor({shiftId:opening.id});assert.equal(m.shift.summary.payments.length,25);
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from public.md_pos_payment_settings'),/permission denied/);await assert.rejects(db.query('select public.pos_payment_defaults()'),/permission denied/);await assert.rejects(db.query('select public.pos_read_before_084()'),/permission denied/);await db.exec('reset role');
 await as(owner);await db.exec('set role authenticated');await settings({...p,id:id(),expectedRevision:2});await db.exec('reset role;set role anon');await assert.rejects(settings({...p,id:id(),expectedRevision:3}),/permission denied/);await db.exec('reset role');
 console.log('PASS payment SQL: 25 methods, stored settings, authorization, outlet isolation, revisions, retry deduplication, disabled checkout, refund, legacy settlement, debit sale, discount, shift totals, migration rerun and RPC grants');
}catch(error){console.error(error.message,error.code||'',error.where||'',error.stack);process.exitCode=1;}finally{await db.close();}

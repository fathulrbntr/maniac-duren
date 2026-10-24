import {paymentMethods,paymentGroups,defaultPaymentSettings} from '../pos/payment-methods.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 for(const f of ['pos.sql','rollback-027-compat.sql','compress-pos-photos.sql','pos-menu-categories.sql','pos-cashier-controls.sql','receipt-shipment-082.sql','cashier-shifts-083.sql','payment-methods-084.sql','crm-loyalty-085.sql','crm-loyalty-085.sql'])await db.exec(fs.readFileSync('database/'+f,'utf8'));
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
 const lookup=async(p={})=>(await db.query('select public.pos_crm_read($1::jsonb) s',[JSON.stringify(p)])).rows[0].s;
 const memberId=id(),otherMember=id();const mp={id:id(),memberId,expectedRevision:0,name:'Nadia <Test>',phone:'0812-3456-7890',email:'Nadia@Example.com',active:true,waOptIn:true};
 await mut('crm_member_save',mp);await mut('crm_member_save',mp);let data=await lookup();assert.equal(data.total,1);assert.equal(data.members[0].phone,'6281234567890');assert.equal(data.members[0].email,'nadia@example.com');
 await assert.rejects(mut('crm_member_save',{...mp,id:id(),memberId:id(),phone:'+62 812 3456 7890'}),/sudah terdaftar/);
 await assert.rejects(mut('crm_member_save',{...mp,id:id(),memberId:id(),phone:'0812+345678'}),/telepon/);
 await assert.rejects(mut('crm_member_save',{...mp,id:id(),memberId:id(),email:'bad'}),/email/);
 await assert.rejects(mut('crm_member_save',{...mp,id:id()}),/berubah/);
 await mut('crm_member_save',{...mp,id:id(),memberId:otherMember,phone:'081234567891',waOptIn:false});assert.equal((await lookup({export:true})).members.length,1);
 const rule={id:id(),productId:product,unit:'pcs',stepQty:2,points:10,active:true,expectedRevision:0};await mut('crm_rule_save',rule);await mut('crm_rule_save',rule);
 await assert.rejects(mut('crm_rule_save',{...rule,id:id(),expectedRevision:1,stepQty:0}),/jumlah/);
 await assert.rejects(mut('crm_rule_save',{...rule,id:id(),expectedRevision:1,points:1.5}),/integer|Poin/);
 await assert.rejects(mut('crm_rule_save',{...rule,id:id(),expectedRevision:1,unit:'kg'}),/Satuan/);
 await as(cashier);assert.equal((await lookup()).members.length,0);assert.equal((await lookup({query:'Na'})).members.length,2);
 await assert.rejects(lookup({export:true}),/owner/);await assert.rejects(lookup({detail:true,memberId}),/owner/);
 await assert.rejects(mut('crm_rule_save',{...rule,id:id(),expectedRevision:1}),/owner/);await assert.rejects(mut('crm_member_save',{...mp,id:id(),expectedRevision:1,name:'Ubah'}),/owner/);
 await mut('crm_member_save',{...mp,id:id(),memberId:id(),phone:'081234567892',name:'Kasir baru',waOptIn:false});
 const opening={id:id(),storeId:store,openingCash:0};await shift('open',opening);
 const sale={...cart,id:id(),memberId,lines:[{productId:product,qty:1,price:10000},{productId:product,qty:2,price:10000}],paid:30000};
 let s=await mut('order_create',sale);const o=s.orders.find(x=>x.id===sale.id);assert.equal(o.customer.id,memberId);assert.equal(o.pointsEarned,10);assert.equal((await lookup({memberId})).members[0].balance,10);
 await mut('order_create',sale);assert.equal((await lookup({memberId})).members[0].balance,10);
 await assert.rejects(mut('order_create',{...sale,memberId:otherMember}),/ID|pengiriman|berbeda|digunakan/);
 const guest={...cart,id:id()};s=await mut('order_create',guest);assert.equal(s.orders.find(x=>x.id===guest.id).customer,null);
 await assert.rejects(mut('order_create',{...cart,id:id(),memberId:id()}),/Member/);
 assert.equal((await read()).orders.length,2,'invalid member rolls back stock, sale and points');
 // Direct public endpoint, cross-store member identity, and fractional kg aggregation.
 await as(owner);await shift('open',{id:id(),storeId:store,openingCash:0});
 const fruit=id(),lot=id();await mut('product_save',{id:fruit,name:'Bawor',sku:'BW',itemType:'direct',stockUnit:'kg_butir',priceKg:50000,pricePiece:100000});await mut('receipt',{id:lot,storeId:store,date,productId:fruit,supplierId:supplier,kg:10,pieces:10,totalCost:100000});
 await mut('crm_rule_save',{...rule,id:id(),productId:fruit,unit:'kg',stepQty:0.1,points:1});
 const fruits={id:id(),storeId:store,date,memberId,payment:'Tunai',paid:100000,lines:[{productId:fruit,lotId:lot,kg:0.1,pieces:1,unit:'KG',qty:0.1,price:50000},{productId:fruit,lotId:lot,kg:0.2,pieces:1,unit:'KG',qty:0.2,price:50000}]};
 s=await mut('order_create',fruits,'pos_mutate');assert.equal(s.orders.find(x=>x.id===fruits.id).pointsEarned,3);
 const legacy={id:id(),storeId:store,date,memberId,payment:'Tunai',paid:100000,lines:[{lotId:lot,kg:1,pieces:1,unit:'KG',price:50000}]};s=await mut('sale',legacy);assert.equal(s.sales.find(x=>x.id===legacy.id).pointsEarned,10);
 // Unpaid settlement gets points once when actually paid.
 const unpaid=id();await db.query("insert into public.md_pos_order_runs(id,store_id,business_date,status,total,lines,created_by) values($1,$2,$3,'queued',20000,$4,$5)",[unpaid,store,date,JSON.stringify([{productId:product,qty:2,price:10000,unit:'pcs',name:'Air'}]),owner]);
 s=await mut('order_pay',{id:id(),storeId:store,date,orderId:unpaid,memberId,payment:'Tunai',paid:20000});assert.equal(s.orders.find(x=>x.id===unpaid).pointsEarned,10);
 // Discount must use the final net amount in customer history.
 const discount=id();await mut('discount_save',{id:id(),discountId:discount,expectedVersion:0,name:'10%',kind:'percent',value:10,active:true});
 const req={id:id(),storeId:store,date,kind:'discount',discountId:discount,expectedVersion:1,checkout:cart};await mut('cashier_approval_request',req);
 const disc={...cart,id:id(),memberId,payment:'Tunai',paid:18000,discountApprovalId:req.id};s=await mut('order_create',disc);data=await lookup({memberId,detail:true});assert.equal(data.ledger.find(x=>x.sourceId===disc.id).total,18000);
 // New rules don't rewrite old points; inactive membership still reverses the original award.
 await mut('crm_rule_save',{...rule,id:id(),expectedRevision:1,points:100});await mut('crm_member_save',{...mp,id:id(),expectedRevision:1,name:'Nadia changed',active:false,waOptIn:false});
 const vr={id:id(),storeId:store,date,kind:'void',orderId:sale.id,reason:'Uji CRM refund',returnStock:true};await mut('cashier_approval_request',vr);
 const refund={id:id(),storeId:store,date,orderId:sale.id,approvalId:vr.id,refundConfirmed:true};s=await mut('order_void',refund);await mut('order_void',refund);
 assert.equal(s.orders.find(x=>x.id===sale.id).customer.name,'Nadia <Test>');assert.equal(s.orders.find(x=>x.id===sale.id).pointsReversed,true);
 data=await lookup({memberId,detail:true});assert.equal(data.ledger.filter(x=>x.sourceId===sale.id&&x.kind==='refund').length,1);assert.equal(data.ledger.find(x=>x.sourceId===sale.id&&x.kind==='refund').points,-10);
 assert.equal((await lookup({export:true})).members.length,0);assert.equal((await lookup({query:'Nadia',activeOnly:true})).members.length,1);await assert.rejects(mut('order_create',{...cart,id:id(),memberId}),/Member/);
 assert.equal((await db.query('select count(*) n from public.md_pos_member_consents where member_id=$1',[memberId])).rows[0].n,2);
 const balance=data.members[0].balance;await db.exec(fs.readFileSync('database/crm-loyalty-085.sql','utf8'));assert.equal((await lookup({memberId})).members[0].balance,balance);
 // Actual grants and RLS deny bypass, but public RPC remains callable.
 await db.exec('set role authenticated');await read();await lookup({memberId});
 for(const table of ['members','point_rules','point_ledger','member_consents','crm_receipts','crm_events'])await assert.rejects(db.query('select * from public.md_pos_'+table),/permission denied/);
 await assert.rejects(db.query("select public.pos_crm_record('order',$1,$2)",[sale.id,memberId]),/permission denied/);await assert.rejects(db.query('select public.pos_read_before_085()'),/permission denied/);
 await db.exec('reset role;set role anon');await assert.rejects(lookup(),/permission denied/);await db.exec('reset role');
 console.log('PASS CRM SQL: migrations, members, normalized duplicate phone, permissions, opt-in audit/export, rules, quantity aggregation, exact decimals, guest and invalid-member rollback, retries, settlement, legacy sale, discounts, immutable receipt, void reversal, RLS/RPC grants');
}catch(error){console.error(error.message,error.code||'',error.where||'',error.stack);process.exitCode=1;}finally{await db.close();}

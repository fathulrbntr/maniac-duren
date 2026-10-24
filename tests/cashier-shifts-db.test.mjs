import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 for(const f of ['pos.sql','rollback-027-compat.sql','compress-pos-photos.sql','pos-menu-categories.sql','pos-cashier-controls.sql','receipt-shipment-082.sql','cashier-shifts-083.sql','cashier-shifts-083.sql'])await db.exec(fs.readFileSync('database/'+f,'utf8'));
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
 await as(cashier);await assert.rejects(mut('order_create',{...cart,id:id()}),/Buka kasir/);
 assert.equal((await read()).unitLots[0].qty,100,'failed checkout rolls back stock');
 const opening={id:id(),storeId:store,openingCash:100000,note:'Modal pagi'};
 let s=await shift('open',opening);assert.equal(s.cashierShiftVersion,83);await shift('open',opening);
 await assert.rejects(shift('open',{...opening,openingCash:1}),/ID sudah/);
 await assert.rejects(shift('open',{...opening,id:id()}),/Masih ada shift/);
 await assert.rejects(shift('open',{id:id(),storeId:foreign,openingCash:1}),/akses/i);
 const sale={...cart,id:id(),cashierName:'Spoofed',cashierId:owner};s=await mut('order_create',sale);await mut('order_create',sale);
 let o=s.orders.find(x=>x.id===sale.id);assert.equal(o.cashierName,'Siti <Kasir>');assert.equal(o.cashierId,cashier);assert.equal(o.cashierShiftId,opening.id);
 let m=await monitor();assert.equal(m.active.length,1);assert.equal(m.entries.length,1);assert.equal(m.active[0].summary.expectedCash,120000,'cash received minus change');
 const qr={...cart,id:id(),payment:'QRIS',paid:20000};await mut('order_create',qr);
 await as(owner);const discount=id();await mut('discount_save',{id:id(),discountId:discount,expectedVersion:0,name:'10%',kind:'percent',value:10,active:true});
 await as(cashier);const req={id:id(),storeId:store,date,kind:'discount',discountId:discount,expectedVersion:1,checkout:cart};await mut('cashier_approval_request',req);
 await as(owner);await mut('cashier_approval_decide',{id:id(),approvalId:req.id,decision:'approved'});await as(cashier);
 const discounted={...cart,id:id(),paid:20000,discountApprovalId:req.id};await mut('order_create',discounted);
 m=await monitor();assert.equal(m.entries.length,3);assert.equal(m.active[0].summary.sales,58000);assert.equal(m.active[0].summary.expectedCash,138000);
 const closing={id:id(),shiftId:opening.id,expectedRevision:m.active[0].revision,closingCash:138000,note:''};
 await mut('order_create',{...cart,id:id(),payment:'Transfer',paid:20000});
 await assert.rejects(shift('close',closing),/Transaksi berubah/);
 closing.expectedRevision=(await monitor()).active[0].revision;
 await assert.rejects(shift('close',{...closing,closingCash:0}),/Catatan wajib/);
 await as(other);assert.equal((await monitor()).active.length,0);await assert.rejects(monitor({shiftId:opening.id}),/tidak dapat diakses/);await assert.rejects(shift('close',closing),/tidak dapat diakses/);
 const otherOpening={id:id(),storeId:store,openingCash:50000};await shift('open',otherOpening);
 await as(foreignCashier);await shift('open',{id:id(),storeId:foreign,openingCash:10000});assert.equal((await monitor()).active.length,1);
 await as(owner);assert.equal((await monitor()).active.length,3);await assert.rejects(shift('close',closing),/Catatan wajib/);
 await as(cashier);await shift('close',closing);await shift('close',closing);m=await monitor();assert.equal(m.active.length,0);assert.equal(m.history[0].summary.difference,0);
 await assert.rejects(mut('order_create',{...cart,id:id()}),/Buka kasir/);
 await db.query("update public.md_pos_employees set name='Nama Baru' where id=$1",[cashier]);assert.equal((await read()).orders.find(x=>x.id===sale.id).cashierName,'Siti <Kasir>');
 // Refund after original shift is closed belongs to processing cashier's open shift.
 await as(owner);const vr={id:id(),storeId:store,date,kind:'void',orderId:sale.id,reason:'Produk kembali',returnStock:true};await mut('cashier_approval_request',vr);
 await assert.rejects(mut('order_void',{id:id(),storeId:store,date,orderId:sale.id,approvalId:vr.id,refundConfirmed:true}),/Buka kasir/);
 const ownerOpening={id:id(),storeId:store,openingCash:100000};await shift('open',ownerOpening);
 const refund={id:id(),storeId:store,date,orderId:sale.id,approvalId:vr.id,refundConfirmed:true};await mut('order_void',refund);await mut('order_void',refund);
 m=await monitor({shiftId:ownerOpening.id});assert.equal(m.entries.length,1);assert.equal(m.entries[0].kind,'refund');assert.equal(m.entries[0].cashierName,'Owner');assert.equal(m.shift.summary.expectedCash,80000);
 assert.equal((await monitor({shiftId:opening.id})).shift.summary.expectedCash,138000,'closed reconciliation remains frozen');
 assert.equal((await read()).orders.find(x=>x.id===sale.id).cashierName,'Siti <Kasir>','refund does not replace receipt cashier');
 // Supervisor closure has an audit note and actor snapshot.
 const otherShift=(await monitor()).active.find(x=>x.id===otherOpening.id);
 await shift('close',{id:id(),shiftId:otherOpening.id,expectedRevision:otherShift.revision,closingCash:49000,note:'Dihitung bersama, kurang seribu'});
 assert.equal((await monitor({shiftId:otherOpening.id})).shift.closedName,'Owner');
 // Unpaid legacy orders attribute the cashier who actually receives payment.
 const unpaid=id();await db.query("insert into public.md_pos_order_runs(id,store_id,business_date,status,total,lines,created_by) values($1,$2,$3,'queued',20000,'[]',$4)",[unpaid,store,date,other]);
 await mut('order_pay',{id:id(),storeId:store,date,orderId:unpaid,payment:'Tunai',paid:50000});
 assert.equal((await read()).orders.find(x=>x.id===unpaid).cashierName,'Owner');
 assert.equal((await monitor({shiftId:ownerOpening.id})).entries.find(x=>x.sourceId===unpaid).amount,20000);
 // Legacy fruit checkout inserts zero first, then updates total; ledger holds final value once.
 const fruit=id(),lot=id();await mut('product_save',{id:fruit,name:'Bawor',sku:'BW',itemType:'direct',stockUnit:'kg_butir',priceKg:50000,pricePiece:100000});
 await mut('receipt',{id:lot,storeId:store,date,productId:fruit,supplierId:supplier,kg:10,pieces:5,totalCost:100000});
 const legacy={id:id(),storeId:store,date,payment:'Tunai',paid:200000,lines:[{lotId:lot,kg:2,pieces:1,unit:'KG',price:50000}]};
 await mut('sale',legacy);let legacyEntries=(await monitor({shiftId:ownerOpening.id})).entries.filter(x=>x.sourceId===legacy.id);
 assert.equal(legacyEntries.length,1);assert.equal(legacyEntries[0].amount,100000);assert.equal((await read()).sales.find(x=>x.id===legacy.id).cashierName,'Owner');
 await mut('void',{id:id(),saleId:legacy.id,storeId:store,date,reason:'Uji refund lama'});
 legacyEntries=(await monitor({shiftId:ownerOpening.id})).entries.filter(x=>x.sourceId===legacy.id);assert.equal(legacyEntries.length,2);assert.equal(legacyEntries.find(x=>x.kind==='refund').amount,100000);
 // More than one page is bounded and has no duplicate entry at the boundary.
 for(let i=0;i<22;i++)await mut('order_create',{...cart,id:id(),payment:'QRIS',paid:20000});
 const first=(await monitor()).entries,second=(await monitor({offset:20})).entries;assert.equal(first.length,21);assert(second.length>0);assert(!first.slice(0,20).some(x=>second.some(y=>y.id===x.id)));
 const previous=(await monitor({shiftId:opening.id})).shift;await db.exec(fs.readFileSync('database/cashier-shifts-083.sql','utf8'));assert.deepEqual((await monitor({shiftId:opening.id})).shift,previous);
 // Same-time pagination includes each entry once; invalid dates/filters fail.
 await assert.rejects(monitor({from:'2026-12-01',to:'2026-01-01'}),/Filter tidak valid/);
 await db.exec('set role authenticated');
 await assert.rejects(db.query('select * from public.md_pos_cashier_shifts'),/permission denied/);
 await assert.rejects(db.query('select public.pos_shift_current($1)',[store]),/permission denied/);
 await assert.rejects(db.query('select public.pos_read_before_083()'),/permission denied/);
 assert.equal((await monitor()).active.length,2);await db.exec('reset role;set role anon');await assert.rejects(monitor(),/permission denied/);await db.exec('reset role');
 console.log('PASS shift SQL: atomic payment guard, cashier snapshot, change/discount/net totals, refund in processing shift, frozen closure, revision conflict, retries, scoped access, supervisor audit, rerun and RPC permissions');
}catch(error){console.error(error.message,error.code||'',error.where||'',error.stack);process.exitCode=1;}finally{await db.close();}

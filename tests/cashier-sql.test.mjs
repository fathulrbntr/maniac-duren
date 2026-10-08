import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 for(const file of ['database/pos.sql','database/rollback-027-compat.sql','database/compress-pos-photos.sql','database/pos-menu-categories.sql'])await db.exec(fs.readFileSync(file,'utf8'));
 if(process.env.POS_TEST_LATER_MUTATION)await db.exec("alter function public.pos_mutate(text,jsonb) rename to pos_mutate_v20;revoke all on function public.pos_mutate_v20(text,jsonb) from public,anon,authenticated;create function public.pos_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin return public.pos_mutate_v20(action,payload);end$$;");
 for(let i=0;i<2;i++)await db.exec(fs.readFileSync('database/pos-cashier-controls.sql','utf8'));
 const owner=id(),cashier=id(),other=id(),store=id(),foreign=id(),supplier=id(),date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
 await db.query("insert into public.md_pos_stores(id,name) values($1,'Depok'),($2,'Bogor')",[store,foreign]);
 for(const [user,role] of [[owner,'owner'],[cashier,'cashier'],[other,'cashier']]){await db.query('insert into auth.users values($1,$2)',[user,user+'@test.local']);await db.query('insert into public.md_pos_staff values($1)',[user]);await db.query('insert into public.md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$2,$3)',[user,role,[store]]);}
 const as=who=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);
 const read=async()=>(await db.query('select public.pos_read() s')).rows[0].s;
 const mut=async(action,p,endpoint='pos_mutate_027')=>(await db.query('select public.'+endpoint+'($1,$2::jsonb) s',[action,JSON.stringify(p)])).rows[0].s;
 await as(owner);await mut('master',{id:supplier,kind:'suppliers',name:'Supplier'});
 const water=id(),fruit=id(),raw=id(),menu=id();
 for(const p of [{id:water,name:'Air',sku:'AIR',itemType:'direct',stockUnit:'pcs',category:'Minuman',salePrice:10000},{id:fruit,name:'Monthong',sku:'M',itemType:'direct',stockUnit:'kg_butir',category:'Buah',priceKg:50000,pricePiece:100000},{id:raw,name:'Cendol',sku:'C',itemType:'prep',stockUnit:'g'},{id:menu,name:'Es',sku:'E',itemType:'recipe',stockUnit:'porsi',category:'Dessert',salePrice:20000}])await mut('product_save',p);
 const wl=id(),fl=id(),rl=id(),recipe=id();
 await mut('unit_receipt',{id:wl,storeId:store,date,productId:water,qty:100,totalCost:100000,supplierId:supplier,kind:'purchase'});
 await mut('unit_receipt',{id:rl,storeId:store,date,productId:raw,qty:1000,totalCost:10000,kind:'opening',note:'Stok awal uji'});
 await mut('receipt',{id:fl,storeId:store,date,productId:fruit,kg:100,pieces:50,totalCost:1000000,supplierId:supplier});
 await mut('recipe_save',{id:recipe,name:'Es',version:0,outputId:menu,yieldQty:1,ingredients:[{productId:raw,qty:50}]});
 const discount=id(),policy={id:id(),discountId:discount,expectedVersion:0,name:'Owner 10%',kind:'percent',value:10,active:true};
 await as(cashier);await assert.rejects(mut('discount_save',policy),/owner/);await as(owner);await mut('discount_save',policy);await mut('discount_save',policy);
 await as(cashier);
 const checkout={storeId:store,date,tableNo:7,note:'Tanpa es',lines:[{productId:water,qty:2,price:10000},{productId:menu,qty:1,price:20000}]};
 const request={id:id(),storeId:store,date,kind:'discount',discountId:discount,expectedVersion:1,checkout};
 let s=await mut('cashier_approval_request',request);assert.equal(s.cashierApprovals[0].status,'pending');assert.equal(s.orders.length,0,'Request reserves/consumes nothing');
 await assert.rejects(mut('cashier_approval_decide',{id:id(),approvalId:request.id,decision:'approved'}),/owner/);
 const sale={...checkout,id:id(),discountApprovalId:request.id,payment:'QRIS',paid:36000};
 await assert.rejects(mut('order_create',sale),/belum disetujui/);
 await as(other);assert.equal((await read()).cashierApprovals.length,0);await assert.rejects(mut('order_create',sale),/belum disetujui/);
 await as(owner);await mut('cashier_approval_decide',{id:id(),approvalId:request.id,decision:'approved'});
 await as(cashier);await assert.rejects(mut('order_create',{...sale,note:'Changed'}),/pesanan berubah/);await assert.rejects(mut('order_create',{...sale,tableNo:8}),/pesanan berubah/);await assert.rejects(mut('order_create',{...sale,paid:35000}),/Pembayaran/);
 s=await mut('order_create',sale);s=await mut('order_create',sale);let o=s.orders.find(o=>o.id===sale.id);assert.equal(o.subtotal,40000);assert.equal(o.total,36000);assert.equal(o.table_no,7);assert.equal(o.note,'Tanpa es');assert.equal(o.discount.amount,4000);assert.equal(o.status,'queued');assert.equal(o.paid,36000);assert.equal(s.unitLots.find(l=>l.id===wl).qty,98);assert.equal(s.unitLots.find(l=>l.id===rl).qty,1000);assert.equal(s.cashierApprovals.find(a=>a.id===request.id).status,'used');
 await assert.rejects(mut('order_create',{...sale,id:id()}),/belum disetujui/);
 const money=async event=>(await db.query('select * from public.md_pos_money_journal where event_id=$1',[event])).rows;
 assert.equal(Number((await money(sale.id))[0].revenue),36000);
 // Lowering prices or using a legacy exposed RPC cannot bypass owner control.
 for(const endpoint of ['pos_mutate','pos_mutate_027'])await assert.rejects(mut('order_create',{...checkout,id:id(),lines:[{productId:water,qty:1,price:1}],payment:'Tunai',paid:1},endpoint),/Harga mengikuti/);
 await assert.rejects(mut('order_create',{...checkout,id:id(),lines:[{productId:fruit,lotId:fl,kg:2,pieces:1,unit:'KG',price:1}],paid:2,payment:'Tunai'}),/Harga mengikuti/);
 await assert.rejects(mut('order_create',{...checkout,id:id(),storeId:foreign,paid:40000,payment:'Tunai'}),/Hak akses/);
 await assert.rejects(mut('order_create',{...checkout,id:id(),tableNo:1.5,paid:40000,payment:'Tunai'}));
 // Void before cooking restores eligible ready goods, releases reservation, and refunds net only.
 const voidRequest={id:id(),storeId:store,date,kind:'void',orderId:sale.id,reason:'Salah meja',returnStock:true};await mut('cashier_approval_request',voidRequest);
 const undo={id:id(),storeId:store,date,orderId:sale.id,approvalId:voidRequest.id,refundConfirmed:true};await assert.rejects(mut('order_void',undo),/persetujuan owner/);
 await as(owner);await mut('cashier_approval_decide',{id:id(),approvalId:voidRequest.id,decision:'approved'});await as(cashier);
 await assert.rejects(mut('order_void',{...undo,refundConfirmed:false}),/pengembalian pembayaran/);
 s=await mut('order_void',undo);await mut('order_void',undo);o=s.orders.find(o=>o.id===sale.id);assert.equal(o.status,'cancelled');assert.equal(o.payment_status,'refunded');assert.equal(o.void_meta.approvedBy,owner);assert.equal(s.unitLots.find(l=>l.id===wl).qty,100);assert.equal(s.unitLots.find(l=>l.id===rl).qty,1000);assert.deepEqual(o.reserved,{});assert.equal(Number((await money(undo.id))[0].revenue),-36000);
 await assert.rejects(mut('order_void',{...undo,id:id()}),/sudah void/);
 // Completed direct sales are voidable; mixed prepared ingredients never return as raw stock.
 const completed={...checkout,id:id(),tableNo:2,note:'',lines:[{productId:fruit,lotId:fl,kg:2,pieces:1,unit:'KG',price:50000}],paid:100000,payment:'Tunai'};
 s=await mut('order_create',completed);assert.equal(s.orders.find(o=>o.id===completed.id).status,'paid');
 await as(owner);const ownReq={id:id(),storeId:store,date,kind:'void',orderId:completed.id,reason:'Produk kembali',returnStock:true};s=await mut('cashier_approval_request',ownReq);assert.equal(s.cashierApprovals.find(a=>a.id===ownReq.id).status,'approved');s=await mut('order_void',{id:id(),storeId:store,date,orderId:completed.id,approvalId:ownReq.id,refundConfirmed:true});assert.equal(s.lots.find(l=>l.id===fl).kg,100);assert.equal(s.lots.find(l=>l.id===fl).pieces,50);
 const mixed={...checkout,id:id(),paid:40000,payment:'Tunai'};await mut('order_create',mixed);await mut('order_start',{id:id(),storeId:store,date,orderId:mixed.id});
 const cookedReq={id:id(),storeId:store,date,kind:'void',orderId:mixed.id,reason:'Salah buat',returnStock:true};await mut('cashier_approval_request',cookedReq);const cookedVoid={id:id(),storeId:store,date,orderId:mixed.id,approvalId:cookedReq.id,refundConfirmed:true};s=await mut('order_void',cookedVoid);assert.equal(s.unitLots.find(l=>l.id===wl).qty,100);assert.equal(s.unitLots.find(l=>l.id===rl).qty,950);assert.equal(Number((await money(cookedVoid.id)).find(m=>m.category==='loss').cost),500);
 // Percent 100 supports zero net without corrupting gross prices/stock.
 const free=id();await mut('discount_save',{...policy,id:id(),discountId:free,name:'Gratis owner',value:100});const freeCart={...checkout,lines:[{productId:water,qty:1,price:10000}]},freeReq={...request,id:id(),discountId:free,checkout:freeCart};await mut('cashier_approval_request',freeReq);s=await mut('order_create',{...freeCart,id:id(),discountApprovalId:freeReq.id,paid:0,payment:'QRIS'});assert(s.orders.some(o=>o.total===0&&o.subtotal===10000));
 // Policy version changes invalidate previously approved requests.
 const pending={...request,id:id()};await mut('cashier_approval_request',pending);await mut('discount_save',{...policy,id:id(),expectedVersion:1,value:15});await assert.rejects(mut('order_create',{...sale,id:id(),discountApprovalId:pending.id}),/Diskon sudah berubah/);
 // Rejected/expired approvals and stock races must not create payments or consume approval.
 await as(cashier);const rejectReq={...request,id:id(),expectedVersion:2};await mut('cashier_approval_request',rejectReq);await as(owner);await mut('cashier_approval_decide',{id:id(),approvalId:rejectReq.id,decision:'rejected'});await as(cashier);await assert.rejects(mut('order_create',{...sale,id:id(),discountApprovalId:rejectReq.id,paid:34000}),/belum disetujui/);
 const expiresReq={...rejectReq,id:id()};await mut('cashier_approval_request',expiresReq);await db.query("update public.md_pos_cashier_approvals set expires_at=now()-interval '1 second' where id=$1",[expiresReq.id]);await as(owner);await assert.rejects(mut('cashier_approval_decide',{id:id(),approvalId:expiresReq.id,decision:'approved'}),/kedaluwarsa/);
 const largeCart={...checkout,lines:[{productId:water,qty:1000,price:10000}]},largeReq={...request,id:id(),expectedVersion:2,checkout:largeCart};await mut('cashier_approval_request',largeReq);const largeSale={...largeCart,id:id(),paid:8500000,payment:'Tunai',discountApprovalId:largeReq.id};await assert.rejects(mut('order_create',largeSale),/kurang|cukup/);assert.equal((await money(largeSale.id)).length,0);assert.equal((await read()).cashierApprovals.find(a=>a.id===largeReq.id).status,'approved');
 const initial=await read();await db.exec(fs.readFileSync('database/pos-cashier-controls.sql','utf8'));assert.deepEqual(await read(),initial,'Rerun keeps transactions/settings');
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from public.md_pos_cashier_approvals'),/permission denied/);await assert.rejects(db.query("select public.pos_mutate_027_before_054('order_create','{}')"),/permission denied/);await assert.rejects(db.query("select public.pos_cashier_quote('{}')"),/permission denied/);await db.exec('reset role');
 await db.exec('set role anon');await assert.rejects(read(),/permission denied/);await db.exec('reset role');
 console.log('PASS cashier SQL: rerunnable upgrade, owner controls, scoped single-use approvals, quote binding, master-price enforcement, net checkout/journal/refund, table/note, direct/mixed void, stock provenance, recipe waste, free order, version conflicts and RPC/table permissions.');
}catch(error){console.error(error.message,error.code||'',error.where||'',error.stack?.split('\n').filter(l=>l.includes('cashier-sql.test')).join('\n')||'');process.exitCode=1;}finally{await db.close();}

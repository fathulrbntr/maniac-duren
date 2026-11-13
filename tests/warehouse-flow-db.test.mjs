import {batchReports} from '../pos/batch-report.mjs';
import {batchLocationRows} from '../pos/warehouse-flow.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {warehouseDatabase} from './helpers/warehouse-db.mjs';
const db=await warehouseDatabase();
try{
 const owner=id(),admin=id(),whUser=id(),cashier=id(),other=id(),waitress=id(),cutter=id(),manager=id(),store=id(),foreign=id(),supplier=id();
 const wh=(await db.query("select id from public.md_pos_stores where location_type='warehouse'")).rows[0].id;
 const product=(await db.query("select id from public.md_pos_products where sku='MD-MONTHONG-BUAH'")).rows[0].id;
 await db.query("insert into public.md_pos_stores(id,name) values($1,'Depok'),($2,'Bogor')",[store,foreign]);
 for(const [user,role,st] of [[owner,'owner',store],[admin,'admin',store],[whUser,'warehouse',wh],[cashier,'cashier',store],[other,'cashier',foreign],[waitress,'waitress',store],[cutter,'cutter',store],[manager,'manager',store]]){
  await db.query('insert into auth.users values($1,$2)',[user,user+'@test.local']);await db.query('insert into public.md_pos_staff values($1)',[user]);await db.query('insert into public.md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$2,$3)',[user,role,[st]]);
 }
 const as=who=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);
 const read=async()=>(await db.query('select public.pos_read() s')).rows[0].s;
 const mut=async(action,payload)=>(await db.query('select public.pos_warehouse_mutate($1,$2::jsonb) s',[action,JSON.stringify(payload)])).rows[0].s;
 const old=async(action,payload)=>(await db.query('select public.pos_mutate_027($1,$2::jsonb) s',[action,JSON.stringify(payload)])).rows[0].s;
 const receive=async p=>(await db.query('select public.pos_receive_shipment($1::jsonb) s',[JSON.stringify(p)])).rows[0].s;
 await as(owner);await old('master',{id:supplier,kind:'suppliers',name:'Supplier Satu'});
 await db.query("update public.md_pos_products set barcode='0001',price_kg=90000,price_piece=100000 where id=$1",[product]);
 const code=n=>'9201131126'+String(n).padStart(6,'0')+'0001002000';
 const date='2026-11-13';const plan={id:id(),storeId:wh,supplierId:supplier,date,invoiceNo:'SUP-100',shippingCost:10000,lines:[{productId:product,purchaseCost:400000}]};
 await as(admin);let s=await mut('receipt_plan_save',plan);assert.equal(s.stores.length,3,'admin sees all stores regardless assignment');
 const batch={id:id(),planId:plan.id,storeId:wh,supplierId:supplier,date,invoiceNo:plan.invoiceNo,shippingCost:10000,unloadingComplete:true,lines:[{id:id(),productId:product,purchaseCost:400000,weighings:[1,2,3,4,5].map(n=>({id:id(),barcode:code(n),kg:2,pieces:1,createdAt:new Date().toISOString()}))}]};
 await as(whUser);s=await receive(batch);assert.equal(s.lots.find(l=>l.id===batch.lines[0].id).kg,10);assert.equal(s.receiptPlans[0].receivedId,batch.id);
 await receive(batch);assert.equal((await read()).fruitUnits.length,5,'receipt retry');
 await assert.rejects(receive({...batch,id:id(),planId:null}),/nota supplier/);
 await as(owner);await assert.rejects(receive({...batch,id:id(),storeId:store}),/warehouse/);
 const transfer={id:id(),storeId:wh,toStoreId:store,carrier:'Budi / B 1234',barcodes:[code(1),code(2)],units:[],note:'Kirim Depok'};
 await assert.rejects(mut('transfer_dispatch',transfer),/harga transfer/);
 await mut('transfer_price_save',{id:id(),productId:product,unit:'kg',price:60000});
 await as(whUser);s=await mut('transfer_dispatch',transfer);const t=s.transfers[0];assert.equal(t.total,240000);assert.equal(t.status,'in_transit');assert.equal(s.lots.find(l=>l.id===batch.lines[0].id).kg,6);
 assert(!s.lots.some(l=>l.id===t.lines[0].targetLotId),'no destination stock at dispatch');
 assert(s.fruitUnits.filter(u=>u.status==='in_transit').length===2);
 await mut('transfer_dispatch',transfer);await assert.rejects(mut('transfer_dispatch',{...transfer,note:'Changed'}),/isi berbeda/);
 await assert.rejects(mut('transfer_dispatch',{...transfer,id:id()}),/tidak tersedia/);
 await assert.rejects(old('movement',{id:id(),storeId:wh,toStoreId:store,lotId:batch.lines[0].id,kg:2,pieces:1,kind:'Transfer',barcodes:[code(3)],date,note:'old'}),/Pengiriman Gudang/);
 await as(cashier);await assert.rejects(mut('transfer_price_save',{id:id(),productId:product,unit:'kg',price:1}),/Hak akses/);
 assert.equal((await read()).transfers.length,1);
 const receipt={id:id(),transferId:t.id,deliveryNo:t.deliveryNo,confirmed:true,units:[]};
 await assert.rejects(mut('transfer_receive',receipt),/wajib lengkap/);
 await assert.rejects(mut('transfer_scan',{id:id(),transferId:t.id,deliveryNo:'WRONG',barcodes:[code(1)]}),/surat jalan/);
 await assert.rejects(mut('transfer_scan',{id:id(),transferId:t.id,deliveryNo:t.deliveryNo,barcodes:[code(3)]}),/surat jalan/);
 await as(other);await assert.rejects(mut('transfer_scan',{id:id(),transferId:t.id,deliveryNo:t.deliveryNo,barcodes:[code(1)]}),/Hak akses/);assert.equal((await read()).transfers.length,0);
 await as(cashier);await mut('transfer_scan',{id:id(),transferId:t.id,deliveryNo:t.deliveryNo,barcodes:[code(1)]});await assert.rejects(mut('transfer_receive',receipt),/wajib lengkap/);
 const scanRequest={id:id(),transferId:t.id,deliveryNo:t.deliveryNo,barcodes:[code(2)]};const delta=await mut('transfer_scan',scanRequest);assert.equal(delta.warehouseDelta,true);assert.equal(delta.scans.length,1);assert(!delta.lots&&!delta.products,'scan avoids full POS download');assert.deepEqual(await mut('transfer_scan',scanRequest),delta,'scan retry returns same delta');s=await mut('transfer_receive',receipt);
 assert.equal(s.lots.find(l=>l.id===t.lines[0].targetLotId).kg,4);
 const costRow=(await db.query('select unit_cost,supplier_unit_cost from public.md_pos_lots where id=$1',[t.lines[0].targetLotId])).rows[0];assert.equal(Number(costRow.unit_cost),60000);assert.equal(Number(costRow.supplier_unit_cost),41000);assert.equal(s.fruitUnits.filter(u=>u.status==='available').length,2);assert(s.fruitUnits.every(u=>u.storeId===store&&u.receiptLotId===batch.lines[0].id));
 await mut('transfer_receive',receipt);await assert.rejects(mut('transfer_receive',{...receipt,id:id()}),/dalam perjalanan/);
 await as(admin);await mut('transfer_price_save',{id:id(),productId:product,unit:'kg',price:75000});s=await read();assert.equal(s.transfers[0].total,240000,'issued invoice immutable');
 await mut('transfer_payment',{id:id(),transferId:t.id,amount:100000,reference:'TRX-1'});await assert.rejects(mut('transfer_payment',{id:id(),transferId:t.id,amount:150000,reference:'TRX-2'}),/tidak valid/);
 await as(cutter);s=await mut('fruit_cut_check',{id:id(),storeId:store,barcode:code(1),tableNo:'7',note:'Siap'});assert.equal(s.cutChecks.length,1);
 await as(cashier);await db.query('select public.pos_cashier_shift_mutate($1,$2::jsonb)',['cashier_shift_open',JSON.stringify({id:id(),storeId:store,openingCash:0})]);
 const sale={id:id(),storeId:store,date,payment:'Tunai',paid:180000,lines:[{productId:product,lotId:t.lines[0].targetLotId,barcode:code(1),kg:2,pieces:1,unit:'KG',qty:2,price:90000}]};
 await old('order_create',sale);const sold=(await db.query('select cost,consumption from public.md_pos_order_runs where id=$1',[sale.id])).rows[0];assert.equal(Number(sold.cost),120000,'store sale uses invoice COGS');assert.equal(sold.consumption[0].unitCost,60000);assert.equal((await read()).fruitUnits.find(u=>u.barcode===code(1)).status,'sold');await assert.rejects(old('order_create',{...sale,id:id()}),/berstatus sold/);
 await as(owner);const cancelled=await mut('transfer_dispatch',{...transfer,id:id(),barcodes:[code(3)]});const t2=cancelled.transfers[0];await mut('transfer_cancel',{id:id(),transferId:t2.id,reason:'Pengiriman batal',returnedToWarehouse:true});s=await read();assert.equal(s.lots.find(l=>l.id===batch.lines[0].id).kg,6);assert.equal(s.fruitUnits.find(u=>u.barcode===code(3)).status,'available');
 fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/warehouse-fixture.json',JSON.stringify(s));
 await db.exec(fs.readFileSync('database/warehouse-flow-107.sql','utf8'));assert.equal((await read()).transfers.length,2,'safe reinstall');
 // Legacy administrative documents cannot bypass barcode receiving.
 await assert.rejects(old('document_save',{id:id(),storeId:wh,kind:'DO',sourceType:'transfer'}),/Pengiriman Gudang/);
 await assert.rejects(old('document_save',{id:id(),storeId:store,kind:'PUR',sourceType:''}),/Penerimaan Gudang/);
 // Exact user's 100 kg example: 70 ready in warehouse + 10 reject + 20 received store.
 const bulk={id:id(),storeId:wh,supplierId:supplier,date,invoiceNo:'SUP-100KG',shippingCost:0,unloadingComplete:true,lines:[{id:id(),productId:product,purchaseCost:4000000,weighings:Array.from({length:50},(_,i)=>({id:id(),barcode:code(100+i),kg:2,pieces:1,createdAt:new Date().toISOString()}))}]};
 await receive(bulk);let bs=await mut('transfer_dispatch',{id:id(),storeId:wh,toStoreId:store,carrier:'Uji 100kg',barcodes:Array.from({length:10},(_,i)=>code(100+i)),units:[]});const bt=bs.transfers.find(x=>x.note===''&&x.status==='in_transit');
 let br=batchReports(bs).find(x=>x.root.id===bulk.lines[0].id);assert.equal(br.transitKg,20);assert.equal(br.untraced,0);assert.equal(br.remainingEquivalent,100);
 await mut('transfer_scan',{id:id(),transferId:bt.id,deliveryNo:bt.deliveryNo,barcodes:bt.items.map(x=>x.barcode)});await mut('transfer_receive',{id:id(),transferId:bt.id,deliveryNo:bt.deliveryNo,confirmed:true,units:[]});
 const proof='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
 bs=await old('reject_mark',{id:id(),storeId:wh,date,sourceLotId:bulk.lines[0].id,rejectLotId:id(),kg:10,pieces:5,barcodes:Array.from({length:5},(_,i)=>code(110+i)),processNow:false,evidence:{reject:proof},cause:'taste',reason:'Uji posisi reject'});
 const positions=batchLocationRows(bs,bulk.lines[0].id);assert.equal(positions.find(x=>x.place==='PT. Altara Rasa Nusantara'&&x.status==='available').kg,70);assert.equal(positions.find(x=>x.status==='reject').kg,10);assert.equal(positions.find(x=>x.place==='Depok').kg,20);assert.equal(positions.reduce((n,x)=>n+x.kg,0),100);br=batchReports(bs).find(x=>x.root.id===bulk.lines[0].id);assert.equal(br.untraced,0);assert.equal(br.remainingCost,4000000);
 // Reject processing still produces legacy waste lots after the warehouse upgrade.
 const rejectSource=bs.fruitUnits.find(u=>u.barcode===code(110)).lotId,outputLot=id();
 const outputs=[];for(const [key,suffix,qty] of [['durpas500','DP500',4],['durpas1000','DP1KG',2],['coral','CORAL',1]]){const outputProduct=(await db.query('select id from public.md_pos_products where sku=$1',['MD-MONTHONG-'+suffix])).rows[0].id;outputs.push({key,productId:outputProduct,qty,lotId:key==='durpas500'?outputLot:id(),expiry:''});}
 bs=await old('reject_process',{id:id(),storeId:wh,date,sourceLotId:rejectSource,kg:10,pieces:5,reason:'Olah reject setelah upgrade gudang',barcodes:Array.from({length:5},(_,i)=>code(110+i)),outputs,evidence:{durpas500:proof,durpas1000:proof,coral:proof}});
 assert.equal(bs.unitLots.find(l=>l.id===outputLot).kind,'waste');assert.equal(bs.unitLots.find(l=>l.id===outputLot).qty,4);assert.equal(bs.fruitUnits.filter(u=>u.receiptLotId===bulk.lines[0].id&&u.status==='processed').length,5);
 // One invoice groups several supplier batches and supports per-piece pricing.
 await mut('transfer_price_save',{id:id(),productId:product,unit:'butir',price:125000});const multiId=id();bs=await mut('transfer_dispatch',{id:multiId,storeId:wh,toStoreId:store,carrier:'Dua batch',barcodes:[code(3),code(120)],units:[]});const multi=bs.transfers.find(x=>x.id===multiId);assert.equal(multi.lines.length,2);assert.equal(multi.total,250000);assert(multi.lines.every(x=>x.unit==='butir'&&x.qty===1));await mut('transfer_cancel',{id:id(),transferId:multiId,reason:'Selesai uji dua batch',returnedToWarehouse:true});
 // Non-fruit transfer uses counted units and the same complete receiving rule.
 const material=(await db.query("select id from public.md_pos_products where stock_unit='pcs' limit 1")).rows[0].id,unitLot=id();
 await db.query("insert into public.md_pos_unit_lots(id,product_id,store_id,unit,received_qty,qty,received_date,kind,supplier_id,unit_cost) values($1,$2,$3,'pcs',1000,1000,$4,'purchase',$5,20)",[unitLot,material,wh,date,supplier]);
 await mut('transfer_price_save',{id:id(),productId:material,unit:'pcs',price:30});bs=await mut('transfer_dispatch',{id:id(),storeId:wh,toStoreId:store,carrier:'Uji bahan',barcodes:[],units:[{lotId:unitLot,qty:200}]});const ut=bs.transfers.find(x=>x.carrier==='Uji bahan');
 await assert.rejects(mut('transfer_receive',{id:id(),transferId:ut.id,deliveryNo:ut.deliveryNo,confirmed:true,units:[{lotId:unitLot,qty:199}]}),/wajib lengkap/);
 bs=await mut('transfer_receive',{id:id(),transferId:ut.id,deliveryNo:ut.deliveryNo,confirmed:true,units:[{lotId:unitLot,qty:200}]});const ul=bs.unitLots.find(x=>x.id===ut.lines[0].targetLotId);assert.equal(ul.qty,200);assert.equal(ul.unitCost,30);assert.equal(ul.supplierUnitCost,20);assert.equal(ul.sourceLotId,unitLot);
 // Stok lama can only be registered by admin after exact whole-balance reconciliation.
 const legacy=id();await db.query("insert into public.md_pos_lots(id,store_id,supplier_id,product_id,received_date,received_kg,received_pieces,kg,pieces) values($1,$2,$3,$4,$5,2,1,2,1)",[legacy,wh,supplier,product,date]);
 await assert.rejects(mut('legacy_labels_register',{id:id(),lotId:legacy,barcodes:[code(1)],reason:'Pemeriksaan stok fisik lama'}),/sudah terdaftar/);
 await assert.rejects(mut('legacy_labels_register',{id:id(),lotId:legacy,barcodes:[code(900),code(901)],reason:'Pemeriksaan stok fisik lama'}),/cocok tepat/);
 await as(cashier);await assert.rejects(mut('legacy_labels_register',{id:id(),lotId:legacy,barcodes:[code(900)],reason:'Pemeriksaan stok fisik lama'}),/Hak akses/);await as(owner);
 bs=await mut('legacy_labels_register',{id:id(),lotId:legacy,barcodes:[code(900)],reason:'Pemeriksaan stok fisik lama'});assert.equal(bs.lots.find(x=>x.id===legacy).kg,2);assert.equal(bs.fruitUnits.find(x=>x.barcode===code(900)).receiptLotId,legacy);
 // Waitress completes a paid ready order, never collects payment or edits prices.
 await db.query('select public.pos_cashier_shift_mutate($1,$2::jsonb)',['cashier_shift_open',JSON.stringify({id:id(),storeId:store,openingCash:0})]);
 const serviceOrder=id();await db.query("insert into public.md_pos_order_runs(id,store_id,business_date,status,lines,total,payment_status,paid,paid_date,payment) values($1,$2,$3,'ready','[]',10000,'paid',10000,$3,'Tunai')",[serviceOrder,store,date]);
 await as(waitress);bs=await mut('service_complete',{id:id(),orderId:serviceOrder});assert.equal((await db.query('select status from public.md_pos_order_runs where id=$1',[serviceOrder])).rows[0].status,'paid');await assert.rejects(old('order_create',{id:id(),storeId:store,date,lines:[]}),/Hak akses/);await as(owner);
 // Store managers cannot regain central pricing by legacy custom permissions.
 await db.query("update public.md_pos_employees set permissions=array['master','finance'] where id=$1",[manager]);await as(manager);const ms=await read();assert.equal(ms.access.master,false);assert.equal(ms.access.finance,false);assert.equal(ms.access.backoffice,false);assert.equal(ms.stores.length,1);await assert.rejects(mut('transfer_price_save',{id:id(),productId:product,price:1,unit:'kg'}),/Hak akses/);await as(owner);
 // User-editable metadata cannot claim an unlinked employee account.
 await db.exec("alter table auth.users add column raw_user_meta_data jsonb default '{}';alter table auth.users add column raw_app_meta_data jsonb default '{}'");
 const claimEmployee=id(),claimUser=id();await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'claim@test.local',$2::jsonb)",[claimUser,JSON.stringify({employee_id:claimEmployee})]);await db.query("insert into public.md_pos_employees(id,name,email,role,store_ids) values($1,'Pending','claim@test.local','staff',$2)",[claimEmployee,[store]]);
 let target=(await db.query('select public.pos_account_target($1) x',[claimEmployee])).rows[0].x;assert.equal(target.existingUnrelated,true);assert.equal(target.userId,null);await db.query('update auth.users set raw_app_meta_data=raw_user_meta_data where id=$1',[claimUser]);target=(await db.query('select public.pos_account_target($1) x',[claimEmployee])).rows[0].x;assert.equal(target.userId,claimUser);
 await db.exec('set role authenticated');await read();await assert.rejects(db.query('select * from md_supply.transfers'),/permission denied/);await assert.rejects(db.query('select public.pos_read_before_107()'),/permission denied/);await db.exec('reset role;set role anon');await assert.rejects(read(),/permission denied/);await db.exec('reset role');
 console.log('PASS warehouse database: receipts, centralized prices, transfer transit, strict full receiving, duplicate/retry, wrong outlet, invoices, cancellation, cut checks, ACL and reinstall');
}catch(e){console.error(e.message,e.where||'',e.stack);process.exitCode=1;}finally{await db.close();}

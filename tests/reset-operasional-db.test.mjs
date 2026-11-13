import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {warehouseDatabase} from './helpers/warehouse-db.mjs';

const reset=fs.readFileSync('database/reset-operasional-109.sql','utf8');
const db=await warehouseDatabase();
try{
 await db.exec(fs.readFileSync('supabase/migrations/20261108022503_wireless_customer_display.sql','utf8'));
 const owner=id(),store=id(),supplier=id(),recipe=id(),member=id();
 const wh=(await db.query("select id from public.md_pos_stores where location_type='warehouse'")).rows[0].id;
 const product=(await db.query("select id from public.md_pos_products where sku='MD-MONTHONG-BUAH'")).rows[0].id;
 const output=(await db.query("select id from public.md_pos_products where sku='MD-MONTHONG-DP500'")).rows[0].id;
 await db.query('insert into auth.users values($1,$2)',[owner,'reset-owner@test.local']);
 await db.query('insert into public.md_pos_staff values($1)',[owner]);
 await db.query("insert into public.md_pos_stores(id,name,location,phone,receipt_logo) values($1,'Branch dipertahankan','Alamat uji','08123456789','logo-test')",[store]);
 await db.query("insert into public.md_pos_employees(id,user_id,name,role,store_ids,permissions) values($1,$1,'Owner dipertahankan','owner',$2,$3)",[owner,[store],['master','sell']]);
 await db.query("insert into public.md_pos_employee_documents(employee_id,ktp_photo) values($1,'ktp-test')",[owner]);
 await db.query("insert into public.md_pos_work_hours(store_id,start_time,end_time,updated_by) values($1,'09:00','17:00',$2)",[store,owner]);
 await db.query("insert into public.md_pos_attendance(id,employee_id,store_id,work_date) values($1,$2,$3,current_date)",[id(),owner,store]);
 await db.query("insert into public.md_pos_attendance_legacy(id,original_row) values($1,'{}')",[id()]);
 await db.query("insert into public.md_pos_suppliers(id,name) values($1,'Supplier reset')",[supplier]);
 await db.query("update public.md_pos_products set barcode='0001',price_kg=90000,price_piece=100000,photo='product-photo-test' where id=$1",[product]);
 await db.query("insert into public.md_pos_recipes(id,name,output_id,yield_qty,updated_by) values($1,'Resep dipertahankan',$2,1,$3)",[recipe,output,owner]);
 await db.query('insert into public.md_pos_recipe_items(recipe_id,product_id,qty) values($1,$2,1)',[recipe,product]);
 await db.query("insert into public.md_pos_members(id,name,phone,created_by) values($1,'Member reset','628123456789',$2)",[member,owner]);
 await db.query("insert into public.md_pos_point_rules(product_id,unit,step_qty,points,active,revision,updated_by) values($1,'kg',1,10,true,1,$2)",[product,owner]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
 const mut=async(action,payload)=>(await db.query('select public.pos_warehouse_mutate($1,$2::jsonb) s',[action,JSON.stringify(payload)])).rows[0].s;
 const code=n=>'9201131126'+String(n).padStart(6,'0')+'0001002000';
 const date='2026-11-13',planId=id(),batchId=id(),lotId=id();
 await mut('transfer_price_save',{id:id(),productId:product,unit:'kg',price:60000});
 await mut('receipt_plan_save',{id:planId,storeId:wh,supplierId:supplier,date,invoiceNo:'RESET-TEST',shippingCost:0,lines:[{productId:product,purchaseCost:200000}]});
 await db.query('select public.pos_receive_shipment($1::jsonb)',[JSON.stringify({id:batchId,planId,storeId:wh,supplierId:supplier,date,invoiceNo:'RESET-TEST',shippingCost:0,unloadingComplete:true,lines:[{id:lotId,productId:product,purchaseCost:200000,weighings:[1,2].map(n=>({id:id(),barcode:code(n),kg:2,pieces:1,createdAt:new Date().toISOString()}))}]})]);
 const dispatch={storeId:wh,toStoreId:store,carrier:'Uji reset',units:[]};
 const transferId=id();
 let s=await mut('transfer_dispatch',{...dispatch,id:transferId,barcodes:[code(1)]});
 const transfer=s.transfers.find(t=>t.id===transferId);
 await mut('transfer_scan',{id:id(),transferId,deliveryNo:transfer.deliveryNo,barcodes:[code(1)]});
 await mut('transfer_receive',{id:id(),transferId,deliveryNo:transfer.deliveryNo,confirmed:true,units:[]});
 await mut('fruit_cut_check',{id:id(),storeId:store,barcode:code(1),tableNo:'1',note:'Uji reset'});
 await db.query('select public.pos_cashier_shift_mutate($1,$2::jsonb)',['cashier_shift_open',JSON.stringify({id:id(),storeId:store,openingCash:0})]);
 await db.query('select public.pos_mutate_027($1,$2::jsonb)',['order_create',JSON.stringify({id:id(),storeId:store,date,payment:'Tunai',paid:180000,lines:[{productId:product,lotId:transfer.lines[0].targetLotId,barcode:code(1),kg:2,pieces:1,unit:'KG',qty:2,price:90000}]})]);
 await mut('transfer_dispatch',{...dispatch,id:id(),barcodes:[code(2)]});
 await db.query("insert into public.md_pos_unit_lots(id,product_id,store_id,unit,received_qty,qty,received_date,kind,supplier_id) values($1,$2,$3,'pcs',2,2,$4,'waste',$5)",[id(),output,store,date,supplier]);
 await db.query("insert into public.md_pos_customer_displays(id,owner_id,store_id,pair_hash,payload) values($1,$2,$3,'reset-test','{}')",[id(),owner,store]);
 await db.exec("create table public.unrelated_data(id integer primary key,value text);insert into public.unrelated_data values(1,'preserve external data');");
 const data=async table=>(await db.query(`select to_jsonb(t) row from ${table} t order by to_jsonb(t)::text`)).rows;
 const beforeProducts=await data('public.md_pos_products'),beforeEmployees=await data('public.md_pos_employees'),beforeStores=await data('public.md_pos_stores'),beforeAuth=await data('auth.users');
 const expectedTables=(await db.query("select n.nspname||'.'||c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and (n.nspname='md_supply' or (n.nspname='public' and starts_with(c.relname,'md_pos_'))) order by 1")).rows.map(t=>t.name);
 const sequence=async()=>(await db.query('select last_value,is_called from md_supply.document_number')).rows;
 const beforeSequence=await sequence();
 const rollbackFailure=async(sql,pattern)=>{
  await assert.rejects(db.exec(sql),pattern);
  await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int n from public.md_pos_fruit_units')).rows[0].n,2);
  assert.deepEqual(await data('public.md_pos_products'),beforeProducts);
  assert.deepEqual(await sequence(),beforeSequence,'sequence restart must roll back too');
 };
 // Unknown application tables must not be silently cleared or forgotten.
 await db.exec('create table public.md_pos_unreviewed(id integer)');
 await rollbackFailure(reset,/Tabel belum ditinjau/);
 await db.exec('drop table public.md_pos_unreviewed');
 // A foreign key from another application must abort, not cascade into it.
 await db.exec('create table public.external_barcode_refs(barcode text references public.md_pos_fruit_units)');
 await rollbackFailure(reset,/foreign key constraint/);
 await db.exec('drop table public.external_barcode_refs');
 // Triggers cannot hide writes to protected or unrelated data.
 await db.exec("create function public.reset_test_trigger() returns trigger language plpgsql as $$begin return null;end$$;create trigger reset_test before truncate on public.md_pos_suppliers for each statement execute function public.reset_test_trigger();");
 await rollbackFailure(reset,/trigger TRUNCATE/);
 await db.exec('drop trigger reset_test on public.md_pos_suppliers;drop function public.reset_test_trigger()');
 // A failed post-check must undo the preceding truncate AND sequence restart.
 const verifyStart="for t in select * from md_reset_109_manifest order by schema_name,table_name loop\n  execute format('select count(*)";
 const corrupted=reset.replace(verifyStart,"update public.md_pos_products set photo='CORRUPTED';\n "+verifyStart);
 assert.notEqual(corrupted,reset);
 await rollbackFailure(corrupted,/Data yang dilindungi berubah/);

 const results=await db.exec(reset);
 const report=results.at(-1).rows[0].reset_report;
 assert.equal(report.status,'verified');
 assert.deepEqual(report.tables.map(t=>t.table).sort(),expectedTables);
 assert.equal(report.tables.filter(t=>t.action==='preserved').length,16);
 for(const table of report.tables){
  assert.equal(table.verified,true);
  assert.equal(table.after,table.action==='reset'?0:table.before,table.table);
 }
 assert(report.tables.some(t=>t.table==='md_supply.transfers'&&t.before===2));
 assert(report.tables.some(t=>t.table==='public.md_pos_order_runs'&&t.before===1));
 assert(report.tables.some(t=>t.table==='public.md_pos_attendance'&&t.before===1));
 assert.deepEqual(await data('public.md_pos_products'),beforeProducts);
 assert.deepEqual(await data('public.md_pos_employees'),beforeEmployees);
 assert.deepEqual(await data('public.md_pos_stores'),beforeStores);
 assert.deepEqual(await data('auth.users'),beforeAuth);
 assert.equal((await db.query('select count(*)::int n from public.unrelated_data')).rows[0].n,1);
 const read=(await db.query('select public.pos_read() s')).rows[0].s;
 assert.equal(read.me.id,owner);assert.equal(read.products.length,beforeProducts.length);assert.equal(read.stores.length,2);
 assert.deepEqual(read.lots,[]);assert.deepEqual(read.unitLots,[]);assert.deepEqual(read.orders,[]);assert.deepEqual(read.transfers,[]);assert.deepEqual(read.fruitUnits,[]);
 const seq=(await db.query('select last_value,is_called from md_supply.document_number')).rows[0];assert.equal(Number(seq.last_value),1);assert.equal(seq.is_called,false);
 await db.exec(reset);
 assert.deepEqual(await data('public.md_pos_products'),beforeProducts);
 assert.deepEqual(await data('auth.users'),beforeAuth);
 console.log('PASS reset 109: real warehouse/sale data cleared; 16 protected tables retained; unknown tables, external FKs, triggers and post-check failure roll back; repeat reset and owner read work.');
}finally{await db.close()}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {warehouseDatabase} from './helpers/warehouse-db.mjs';

// Upgrade a populated 106 database, including products made from rejected fruit.
const db=await warehouseDatabase(false);
try{
 const store=id(),supplier=id();
 await db.query("insert into public.md_pos_stores(id,name) values($1,'Toko lama')",[store]);
 await db.query("insert into public.md_pos_suppliers(id,name) values($1,'Supplier lama')",[supplier]);
 const product=(await db.query("select id from public.md_pos_products where stock_unit='pcs' limit 1")).rows[0].id;
 const insert=async(kind,qty=3)=>db.query("insert into public.md_pos_unit_lots(id,product_id,store_id,supplier_id,unit,received_qty,qty,received_date,kind,unit_cost,note) values($1,$2,$3,$4,'pcs',5,$5,'2026-11-13',$6,12500,'Riwayat harus tetap')",[id(),product,store,supplier,qty,kind]);
 for(const kind of ['purchase','opening','production','waste'])await insert(kind);
 await insert('waste',0); // Exhausted historical lots must also remain valid.
 const snapshot=async()=>(await db.query("select to_jsonb(l)-'supplier_unit_cost' row from public.md_pos_unit_lots l order by id")).rows;
 const before=await snapshot(),sql=fs.readFileSync('database/warehouse-flow-107.sql','utf8');
 const broken=sql.replace("check(kind in ('purchase','opening','production','waste','transfer'))","check(kind in ('purchase','opening','production','transfer'))");
 assert.notEqual(broken,sql);
 await assert.rejects(db.exec(broken),e=>e.code==='23514'&&e.message.includes('md_pos_unit_lots_kind_check'));
 await db.exec('rollback');
 assert.deepEqual(await snapshot(),before,'failed migration preserves historical rows');
 assert.equal((await db.query("select to_regnamespace('md_supply') as schema")).rows[0].schema,null,'failed upgrade rolls back new schema');
 await db.exec(sql);
 assert.deepEqual(await snapshot(),before,'corrected migration preserves history and quantities');
 await insert('waste'); // Existing reject-processing output remains accepted.
 await insert('transfer'); // The new transfer type is accepted alongside legacy types.
 await assert.rejects(insert('invalid-kind'),e=>e.code==='23514','constraint remains enforced');
 const upgraded=await snapshot();
 await db.exec(sql);
 assert.deepEqual(await snapshot(),upgraded,'reinstall preserves old and new kinds');
 const constraint=(await db.query("select convalidated from pg_constraint where conrelid='public.md_pos_unit_lots'::regclass and conname='md_pos_unit_lots_kind_check'")).rows[0];
 assert.equal(constraint.convalidated,true,'all existing rows are validated; no NOT VALID workaround');
 console.log('PASS warehouse legacy upgrade: reproduced 23514, rollback, preserved active/empty waste lots, future waste/transfer writes, invalid rejection and reinstall');
}finally{await db.close();}

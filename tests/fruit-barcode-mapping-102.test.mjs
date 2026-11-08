import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {barcodeProduct} from '../pos/barcode-scanner.mjs';
import {receiptBarcode} from '../pos/receipt-barcode.mjs';
const sql=fs.readFileSync(new URL('../database/fruit-barcode-mapping-102.sql',import.meta.url),'utf8');
const mapping=JSON.parse(sql.match(/\$json\$([\s\S]*?)\$json\$/)[1]);
const db=new PGlite();
await db.exec('create table md_pos_products(id uuid primary key, sku text, name text, barcode text, price_kg numeric, stock_unit text); create table md_pos_fruit_units(barcode text primary key, status text);');
for (const m of mapping) await db.query('insert into md_pos_products values(gen_random_uuid(),$1,$1,$2,150000,$3)',[m.sku,m.old_code,'kg_butir']);
await db.exec("insert into md_pos_products values(gen_random_uuid(),'CRYSTALINE','Crystaline','899123',5000,'pcs'); insert into md_pos_fruit_units values('92010711260000680001000228','sold');");
const before=await db.query('select id,sku,name,price_kg,stock_unit from md_pos_products order by sku');
await db.exec(sql);await db.exec(sql); // Safe idempotency.
assert.deepEqual((await db.query('select id,sku,name,price_kg,stock_unit from md_pos_products order by sku')).rows,before.rows);
for (const m of mapping) assert.equal((await db.query('select barcode from md_pos_products where sku=$1',[m.sku])).rows[0].barcode,m.new_code);
assert.equal((await db.query('select count(*)::int as n from md_pos_fruit_units')).rows[0].n,1);
await db.query("update md_pos_products set barcode='0005' where sku='CRYSTALINE'");
await assert.rejects(db.exec(sql),/dipakai produk lain/);await db.exec('rollback;');
const products=mapping.map(m=>({id:m.sku,sku:m.sku,barcode:m.new_code,itemType:'direct',stockUnit:'kg_butir',priceKg:150000}));
for (const p of products) {
 const barcode='9201081126000100'+p.barcode+'000886';
 assert.equal(barcodeProduct({products},barcode).product.id,p.id);
 assert.equal(receiptBarcode(barcode,products,p.id).kg,.886);
}
const oldLabel='92010811260001000007000886', product=products.find(p=>p.barcode==='0005');
assert.equal(barcodeProduct({products,fruitUnits:[{barcode:oldLabel,productId:product.id}]},oldLabel).product.id,product.id);
assert.throws(()=>receiptBarcode(oldLabel,products,product.id),/Kode|kode/);
const water={id:'water',sku:'WATER',barcode:'899123',stockUnit:'pcs',itemType:'direct',salePrice:5000};
assert.equal(barcodeProduct({products:[...products,water]},'899123').product.id,'water');
await db.close();
console.log('PASS PLU mapping: all 12 codes, repeat application, collision abort, preserved prices/non-fruit/history, immutable received labels and ordinary retail barcode.');

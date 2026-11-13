import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
export async function warehouseDatabase(patch=true){
 const db=new PGlite();
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 for(const f of ['pos.sql','compress-pos-photos.sql'])await db.exec(fs.readFileSync('database/'+f,'utf8'));
 await db.exec(fs.readFileSync('database/seeds/import-durian-dan-turunan.sql','utf8').replace("null, null, null, null, '', ''","case when r.stock_unit='kg_butir' then 50000 end, case when r.stock_unit='kg_butir' then 100000 end, null, null, '', ''"));
 for(const f of ['link-durian-reject.sql','product-variants.sql','pos-menu-categories.sql','pos-cashier-controls.sql','product-single-variant.sql','reject-flow-063.sql','store-receipt-064.sql','employee-details-070.sql','reports-admin-071.sql','product-buy-piece-077.sql','receipt-shipment-082.sql','cashier-shifts-083.sql','payment-methods-084.sql','crm-loyalty-085.sql','cash-deposits-092.sql','fruit-tracking-101.sql','fruit-stock-barcode-105.sql','fruit-batch-strict-scan-106.sql',...(patch?['warehouse-flow-107.sql']:[])])await db.exec(fs.readFileSync('database/'+f,'utf8'));
 return db;
}

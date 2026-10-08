import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),sql=name=>fs.readFileSync('database/'+name,'utf8');
try {
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 for(const file of ['pos.sql','rollback-027-compat.sql','compress-pos-photos.sql','product-variants.sql'])await db.exec(sql(file));
 const owner=id(),cashier=id(),store=id();
 for(const [user,role] of [[owner,'owner'],[cashier,'cashier']]) {
  await db.query('insert into auth.users values($1,$2)',[user,user+'@test.invalid']);
  await db.query('insert into public.md_pos_staff values($1)',[user]);
  await db.query('insert into public.md_pos_employees(id,user_id,name,role,store_ids) values($1,$1,$2,$2,$3)',[user,role,[store]]);
 }
 await db.query("insert into public.md_pos_stores(id,name) values($1,'Test outlet')",[store]);
 const as=who=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);await as(owner);
 const save=p=>db.query('select public.pos_product_variants_save($1)',[p]);
 const remove=(pid,confirmed=true)=>db.query("select public.pos_mutate_027('product_delete',$1)",[{id:pid,confirmed}]);
 const get=async pid=>(await db.query('select * from public.md_pos_products where id=$1',[pid])).rows[0];
 const make=(name,labels)=>({id:id(),groupId:id(),name,expectedIds:[],variants:labels.map(label=>({id:id(),name:name+' '+label,sku:id(),itemType:'raw',stockUnit:'g',category:null,salePrice:null,buyPrice:12345,variant:label,variantOptions:[{name:'Pilihan',value:label}]}))});
 const legacy=make('Singleton lama',['Original']);await save(legacy);
 const group=make('Bahan baru',['A','B','C']);await save(group);
 const [a,b,c]=group.variants;
 const used=id();await db.query("insert into public.md_pos_unit_lots(id,product_id,store_id,unit,received_qty,qty,received_date,kind,unit_cost) values($1,$2,$3,'g',10,8,current_date,'opening',100)",[used,a.id,store]);
 const original=await get(a.id),old=await get(legacy.variants[0].id);
 const stocksBefore=(await db.query('select * from public.md_pos_unit_lots')).rows;
 const detached=p=>({...p,variant_group_id:null,variant_group_name:null,variant_options:[],variant:''});
 await db.exec(sql('product-single-variant.sql'));await db.exec(sql('product-single-variant.sql'));
 assert.deepEqual(await get(legacy.variants[0].id),detached(old),'Old singleton repaired with exact identity preserved');
 assert.deepEqual(await get(a.id),original,'A complete group is untouched by installation');
 await assert.rejects(db.query("update public.md_pos_products set variant_group_id=null,variant_group_name=null,variant_options='[]',variant='' where id=$1",[a.id]),/Identitas varian/);
 await assert.rejects(db.query("update public.md_pos_products set name='Forged' where id=$1",[a.id]),/Identitas varian/);
 await as(cashier);await assert.rejects(remove(b.id),/Hak akses|akses/);await as(owner);
 await db.exec('set role authenticated');await assert.rejects(db.query('select public.pos_delete_product($1)',[{id:b.id,confirmed:true}]),/permission denied/);await db.exec('reset role');
 await assert.rejects(remove(b.id,false),/Konfirmasi/);
 await assert.rejects(remove(a.id),/sudah digunakan/);
 assert.deepEqual(await get(a.id),original);
 await remove(c.id);assert.equal((await get(a.id)).variant_group_id,group.groupId,'Three to two remains a group');
 await db.exec('set role authenticated');await remove(b.id);await db.exec('reset role');
 assert.deepEqual(await get(a.id),detached(original),'Two to one detaches atomically, including a survivor with stock');
 await remove(b.id);assert.deepEqual(await get(a.id),detached(original),'Deletion retry cannot change the survivor');
 assert.deepEqual((await db.query('select * from public.md_pos_unit_lots')).rows,stocksBefore);
 const current=(await db.query('select public.pos_read() s')).rows[0].s.products.find(p=>p.id===a.id);
 assert.equal(current.variantGroupId,null);assert.equal(current.variant,'');assert.deepEqual(current.variantOptions,[]);
 // Re-adding a variant follows the normal adoption path with the original SKU/stock.
 const again=make(current.name,['Premium']);again.expectedIds=[a.id];
 again.adopt={productId:a.id,expected:{name:current.name,sku:current.sku,itemType:current.itemType,stockUnit:current.stockUnit,category:current.category,variant:''},variantOptions:[{name:'Pilihan',value:'Original'}]};
 await save(again);assert.equal((await get(a.id)).variant_group_id,again.groupId);
 assert.deepEqual((await db.query('select * from public.md_pos_unit_lots')).rows,stocksBefore);
 await remove(again.variants[0].id);assert.deepEqual(await get(a.id),detached(original));
 // A pre-existing singleton cannot be renamed while being detached in one write.
 const pending=make('Guard',['Only']);await save(pending);
 await assert.rejects(db.query("update public.md_pos_products set variant_group_id=null,variant_group_name=null,variant_options='[]',variant='',name='Changed' where id=$1",[pending.variants[0].id]),/Identitas varian/);
 await db.exec(sql('product-single-variant.sql'));await db.exec(sql('product-single-variant.sql'));
 assert.equal((await get(pending.variants[0].id)).variant_group_id,null);
 console.log('PASS SQL: idempotent legacy repair, atomic 3→2→1 deletion, protected used products, exact survivor/stock preservation, permissions, identity guard, read contract, retry and re-adoption.');
}finally{await db.close();}

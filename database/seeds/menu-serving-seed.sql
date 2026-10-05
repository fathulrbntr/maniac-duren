-- MANIAC DUREN - initial menu/recipe seed
-- Generated from the serving standards supplied by the owner.
-- Safe to run repeatedly: fixed UUIDs + upserts.
-- This seed intentionally does NOT invent missing menu prices.
-- Menus without a price are listed at the end for manual completion.
begin;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('fdfea1a4-235b-5259-a158-d19d9f848cf1','Jelly Melon','raw-jelly-melon',null,'prep','g',null,null,null)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('aa122cf6-8682-5ccb-b63f-fe66fabef498','Jelly Cincau','raw-jelly-cincau',null,'prep','g',null,null,null)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('ee9620ab-e235-5ca4-ab70-d804572b9c9a','Jelly Kelapa / Kelapa Fresh','raw-jelly-kelapa-kelapa-fresh',null,'raw','g',null,null,null)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('5f5ce4e4-1e5e-5505-a578-33e49aab03ed','Mutiara','raw-mutiara',null,'raw','g',null,null,null)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('5b845c1a-277a-5cff-ad6f-0648b97bd456','Nangka','raw-nangka',null,'raw','g',null,null,null)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('8eabe1c4-b881-5c8c-97af-65354d3b6056','Krimer','raw-krimer',null,'raw','g',null,null,null)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('a559a56b-9458-5b0d-bb41-635ba6de4d2e','Selasih','raw-selasih',null,'raw','g',null,null,null)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('665344cb-c16d-5c06-a74d-f3ab9ca15fc9','SKM','raw-skm',null,'raw','g',null,null,null)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('9f819808-edcd-54ec-b672-afc9fd1670c5','Daging Durian','raw-daging-durian',null,'raw','g',null,null,null)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('8dd6eebb-ddc2-5955-8305-36aad7ecfa60','Dawet','raw-dawet',null,'raw','g',null,null,null)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('03c5232d-1346-5c92-8155-4abec4dc58ac','Ketan','raw-ketan',null,'raw','g',null,null,null)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('6c361cc8-8085-5846-b7ac-9ace8edfb178','Gulmer Cair','raw-gulmer-cair',null,'raw','g',null,null,null)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('4e43f727-c5e2-5b67-a9f5-3d7807f45854','Cendol','raw-cendol',null,'raw','g',null,null,null)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('a82e2f40-1385-59d9-9186-e4c6d6c71ac0','Santan + Air','raw-santan-air',null,'raw','ml',null,null,null)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('ed8edfec-24c0-5a9f-883d-4c7284cc898e','Keju','raw-keju',null,'raw','g',null,null,null)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('fe94af4d-643c-58e7-a135-c867c6380975','Matcha','raw-matcha',null,'raw','g',null,null,null)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('c8d6cb85-b01b-55ef-925f-41e3307c617d','Nutrijel Melon','raw-nutrijel-melon',null,'raw','pcs',null,null,null)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('44f0f562-dc07-59e2-b19c-f5ac7c12a752','Nutrijel Cincau','raw-nutrijel-cincau',null,'raw','pcs',null,null,null)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('6b198f27-131a-5454-8d65-2b29a46c1b4e','Air','raw-air',null,'raw','ml',null,null,null)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('96f78cac-2e50-570a-b1ef-bc4804251fab','Es Teler Duren','menu-es-teler-duren','Minuman','recipe','porsi',null,null,30000)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('a1ad0b55-d3c0-5611-b1ea-69a8ab5627b0','Es Teler Original','menu-es-teler-original','Minuman','recipe','porsi',null,null,25000)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('0e27483a-434c-58ee-b8b0-7dd3e4b9fcc7','Es Dawet Duren Ketan','menu-es-dawet-duren-ketan','Minuman','recipe','porsi',null,null,33000)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('3939c24a-5afd-539c-a4de-2c61f146a136','Es Dawet Duren','menu-es-dawet-duren','Minuman','recipe','porsi',null,null,30000)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('66559115-877d-58b8-ac6e-eb3711539ecd','Es Dawet Original','menu-es-dawet-original','Minuman','recipe','porsi',null,null,25000)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('a32ada31-1abd-51ff-90f8-d222b9388321','Cendol Duren','menu-cendol-duren','Minuman','recipe','porsi',null,null,30000)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('25c7404d-ef0d-53d5-b18a-faba99e5c498','Cendol Original','menu-cendol-original','Minuman','recipe','porsi',null,null,20000)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('59763f7b-47eb-5170-92c6-a4b4a741906c','Es Cendol Nangka Duren','menu-es-cendol-nangka-duren','Minuman','recipe','porsi',null,null,33000)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('e8338fcb-9a25-55dd-9cab-76aafa7afe0b','Ketan Duren Keju','menu-ketan-duren-keju','Minuman','recipe','porsi',null,null,30000)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('bb8298bb-c15c-5e76-b31d-9f10d17101cf','Ketan Duren Original','menu-ketan-duren-original','Minuman','recipe','porsi',null,null,28000)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_products
(id,name,sku,category,item_type,stock_unit,price_kg,price_piece,sale_price)
values ('de832e5b-6650-5064-a82b-c0e6e02b5c29','Sop Duren Original','menu-sop-duren-original','Minuman','recipe','porsi',null,null,30000)
on conflict (id) do update set name=excluded.name,sku=excluded.sku,category=excluded.category,item_type=excluded.item_type,stock_unit=excluded.stock_unit,sale_price=excluded.sale_price;

insert into public.md_pos_recipes(id,name,output_id,yield_qty,version,updated_by)
values ('cf8132f0-7a38-52c7-b8bd-290ef04cd9bf','Jelly Melon - Batch','fdfea1a4-235b-5259-a158-d19d9f848cf1',1600,1,null)
on conflict (id) do update set name=excluded.name,output_id=excluded.output_id,yield_qty=excluded.yield_qty,version=excluded.version;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('cf8132f0-7a38-52c7-b8bd-290ef04cd9bf','c8d6cb85-b01b-55ef-925f-41e3307c617d',4),
       ('cf8132f0-7a38-52c7-b8bd-290ef04cd9bf','6b198f27-131a-5454-8d65-2b29a46c1b4e',1600)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipes(id,name,output_id,yield_qty,version,updated_by)
values ('9206e2a1-53ea-5761-a0c4-1e0c88cbf6ae','Jelly Cincau - Batch','aa122cf6-8682-5ccb-b63f-fe66fabef498',1600,1,null)
on conflict (id) do update set name=excluded.name,output_id=excluded.output_id,yield_qty=excluded.yield_qty,version=excluded.version;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('9206e2a1-53ea-5761-a0c4-1e0c88cbf6ae','44f0f562-dc07-59e2-b19c-f5ac7c12a752',4),
       ('9206e2a1-53ea-5761-a0c4-1e0c88cbf6ae','6b198f27-131a-5454-8d65-2b29a46c1b4e',1600)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipes(id,name,output_id,yield_qty,version,updated_by)
values ('02f0b2ad-8496-5987-81cd-192475981b51','Es Teler Duren - Serving','96f78cac-2e50-570a-b1ef-bc4804251fab',1,1,null)
on conflict (id) do update set name=excluded.name,output_id=excluded.output_id,yield_qty=excluded.yield_qty,version=excluded.version;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('02f0b2ad-8496-5987-81cd-192475981b51','fdfea1a4-235b-5259-a158-d19d9f848cf1',70)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('02f0b2ad-8496-5987-81cd-192475981b51','aa122cf6-8682-5ccb-b63f-fe66fabef498',70)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('02f0b2ad-8496-5987-81cd-192475981b51','ee9620ab-e235-5ca4-ab70-d804572b9c9a',70)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('02f0b2ad-8496-5987-81cd-192475981b51','5f5ce4e4-1e5e-5505-a578-33e49aab03ed',70)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('02f0b2ad-8496-5987-81cd-192475981b51','5b845c1a-277a-5cff-ad6f-0648b97bd456',40)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('02f0b2ad-8496-5987-81cd-192475981b51','8eabe1c4-b881-5c8c-97af-65354d3b6056',80)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('02f0b2ad-8496-5987-81cd-192475981b51','a559a56b-9458-5b0d-bb41-635ba6de4d2e',15)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('02f0b2ad-8496-5987-81cd-192475981b51','665344cb-c16d-5c06-a74d-f3ab9ca15fc9',45)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('02f0b2ad-8496-5987-81cd-192475981b51','9f819808-edcd-54ec-b672-afc9fd1670c5',100)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipes(id,name,output_id,yield_qty,version,updated_by)
values ('7d23a96e-9425-5cd6-8233-31329acf6337','Es Teler Original - Serving','a1ad0b55-d3c0-5611-b1ea-69a8ab5627b0',1,1,null)
on conflict (id) do update set name=excluded.name,output_id=excluded.output_id,yield_qty=excluded.yield_qty,version=excluded.version;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('7d23a96e-9425-5cd6-8233-31329acf6337','fdfea1a4-235b-5259-a158-d19d9f848cf1',70)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('7d23a96e-9425-5cd6-8233-31329acf6337','aa122cf6-8682-5ccb-b63f-fe66fabef498',70)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('7d23a96e-9425-5cd6-8233-31329acf6337','ee9620ab-e235-5ca4-ab70-d804572b9c9a',70)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('7d23a96e-9425-5cd6-8233-31329acf6337','5f5ce4e4-1e5e-5505-a578-33e49aab03ed',70)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('7d23a96e-9425-5cd6-8233-31329acf6337','5b845c1a-277a-5cff-ad6f-0648b97bd456',40)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('7d23a96e-9425-5cd6-8233-31329acf6337','8eabe1c4-b881-5c8c-97af-65354d3b6056',80)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('7d23a96e-9425-5cd6-8233-31329acf6337','a559a56b-9458-5b0d-bb41-635ba6de4d2e',15)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('7d23a96e-9425-5cd6-8233-31329acf6337','665344cb-c16d-5c06-a74d-f3ab9ca15fc9',45)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipes(id,name,output_id,yield_qty,version,updated_by)
values ('721d9834-d68a-5390-90be-413d28503e91','Es Dawet Duren Ketan - Serving','0e27483a-434c-58ee-b8b0-7dd3e4b9fcc7',1,1,null)
on conflict (id) do update set name=excluded.name,output_id=excluded.output_id,yield_qty=excluded.yield_qty,version=excluded.version;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('721d9834-d68a-5390-90be-413d28503e91','8dd6eebb-ddc2-5955-8305-36aad7ecfa60',70)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('721d9834-d68a-5390-90be-413d28503e91','03c5232d-1346-5c92-8155-4abec4dc58ac',51)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('721d9834-d68a-5390-90be-413d28503e91','aa122cf6-8682-5ccb-b63f-fe66fabef498',70)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('721d9834-d68a-5390-90be-413d28503e91','ee9620ab-e235-5ca4-ab70-d804572b9c9a',70)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('721d9834-d68a-5390-90be-413d28503e91','5f5ce4e4-1e5e-5505-a578-33e49aab03ed',70)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('721d9834-d68a-5390-90be-413d28503e91','5b845c1a-277a-5cff-ad6f-0648b97bd456',40)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('721d9834-d68a-5390-90be-413d28503e91','8eabe1c4-b881-5c8c-97af-65354d3b6056',80)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('721d9834-d68a-5390-90be-413d28503e91','6c361cc8-8085-5846-b7ac-9ace8edfb178',67)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('721d9834-d68a-5390-90be-413d28503e91','9f819808-edcd-54ec-b672-afc9fd1670c5',100)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipes(id,name,output_id,yield_qty,version,updated_by)
values ('bc3462f8-3a02-5282-925f-9f8211c3156f','Es Dawet Duren - Serving','3939c24a-5afd-539c-a4de-2c61f146a136',1,1,null)
on conflict (id) do update set name=excluded.name,output_id=excluded.output_id,yield_qty=excluded.yield_qty,version=excluded.version;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('bc3462f8-3a02-5282-925f-9f8211c3156f','8dd6eebb-ddc2-5955-8305-36aad7ecfa60',70)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('bc3462f8-3a02-5282-925f-9f8211c3156f','aa122cf6-8682-5ccb-b63f-fe66fabef498',70)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('bc3462f8-3a02-5282-925f-9f8211c3156f','ee9620ab-e235-5ca4-ab70-d804572b9c9a',70)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('bc3462f8-3a02-5282-925f-9f8211c3156f','5f5ce4e4-1e5e-5505-a578-33e49aab03ed',70)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('bc3462f8-3a02-5282-925f-9f8211c3156f','5b845c1a-277a-5cff-ad6f-0648b97bd456',40)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('bc3462f8-3a02-5282-925f-9f8211c3156f','8eabe1c4-b881-5c8c-97af-65354d3b6056',80)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('bc3462f8-3a02-5282-925f-9f8211c3156f','6c361cc8-8085-5846-b7ac-9ace8edfb178',67)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('bc3462f8-3a02-5282-925f-9f8211c3156f','9f819808-edcd-54ec-b672-afc9fd1670c5',100)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipes(id,name,output_id,yield_qty,version,updated_by)
values ('95bedb7a-9db8-52f4-8599-39e801c833c1','Es Dawet Original - Serving','66559115-877d-58b8-ac6e-eb3711539ecd',1,1,null)
on conflict (id) do update set name=excluded.name,output_id=excluded.output_id,yield_qty=excluded.yield_qty,version=excluded.version;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('95bedb7a-9db8-52f4-8599-39e801c833c1','8dd6eebb-ddc2-5955-8305-36aad7ecfa60',70)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('95bedb7a-9db8-52f4-8599-39e801c833c1','aa122cf6-8682-5ccb-b63f-fe66fabef498',70)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('95bedb7a-9db8-52f4-8599-39e801c833c1','ee9620ab-e235-5ca4-ab70-d804572b9c9a',70)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('95bedb7a-9db8-52f4-8599-39e801c833c1','5f5ce4e4-1e5e-5505-a578-33e49aab03ed',70)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('95bedb7a-9db8-52f4-8599-39e801c833c1','5b845c1a-277a-5cff-ad6f-0648b97bd456',40)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('95bedb7a-9db8-52f4-8599-39e801c833c1','8eabe1c4-b881-5c8c-97af-65354d3b6056',80)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('95bedb7a-9db8-52f4-8599-39e801c833c1','6c361cc8-8085-5846-b7ac-9ace8edfb178',67)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipes(id,name,output_id,yield_qty,version,updated_by)
values ('64402ae7-c826-5b74-aab9-966f7efd8bff','Cendol Duren - Serving','a32ada31-1abd-51ff-90f8-d222b9388321',1,1,null)
on conflict (id) do update set name=excluded.name,output_id=excluded.output_id,yield_qty=excluded.yield_qty,version=excluded.version;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('64402ae7-c826-5b74-aab9-966f7efd8bff','4e43f727-c5e2-5b67-a9f5-3d7807f45854',150)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('64402ae7-c826-5b74-aab9-966f7efd8bff','6c361cc8-8085-5846-b7ac-9ace8edfb178',67)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('64402ae7-c826-5b74-aab9-966f7efd8bff','a82e2f40-1385-59d9-9186-e4c6d6c71ac0',80)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('64402ae7-c826-5b74-aab9-966f7efd8bff','9f819808-edcd-54ec-b672-afc9fd1670c5',100)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipes(id,name,output_id,yield_qty,version,updated_by)
values ('edaac93f-c0ec-53ff-bb3f-c1da68664080','Cendol Original - Serving','25c7404d-ef0d-53d5-b18a-faba99e5c498',1,1,null)
on conflict (id) do update set name=excluded.name,output_id=excluded.output_id,yield_qty=excluded.yield_qty,version=excluded.version;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('edaac93f-c0ec-53ff-bb3f-c1da68664080','4e43f727-c5e2-5b67-a9f5-3d7807f45854',150)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('edaac93f-c0ec-53ff-bb3f-c1da68664080','6c361cc8-8085-5846-b7ac-9ace8edfb178',67)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('edaac93f-c0ec-53ff-bb3f-c1da68664080','a82e2f40-1385-59d9-9186-e4c6d6c71ac0',80)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipes(id,name,output_id,yield_qty,version,updated_by)
values ('470fda96-5ea3-59b9-8107-ed335b84fb0a','Es Cendol Nangka Duren - Serving','59763f7b-47eb-5170-92c6-a4b4a741906c',1,1,null)
on conflict (id) do update set name=excluded.name,output_id=excluded.output_id,yield_qty=excluded.yield_qty,version=excluded.version;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('470fda96-5ea3-59b9-8107-ed335b84fb0a','4e43f727-c5e2-5b67-a9f5-3d7807f45854',150)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('470fda96-5ea3-59b9-8107-ed335b84fb0a','6c361cc8-8085-5846-b7ac-9ace8edfb178',67)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('470fda96-5ea3-59b9-8107-ed335b84fb0a','a82e2f40-1385-59d9-9186-e4c6d6c71ac0',80)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('470fda96-5ea3-59b9-8107-ed335b84fb0a','5b845c1a-277a-5cff-ad6f-0648b97bd456',40)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('470fda96-5ea3-59b9-8107-ed335b84fb0a','9f819808-edcd-54ec-b672-afc9fd1670c5',100)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipes(id,name,output_id,yield_qty,version,updated_by)
values ('5cdfd3f8-5f3d-5b5e-9a83-95fc33827a70','Ketan Duren Keju - Serving','e8338fcb-9a25-55dd-9cab-76aafa7afe0b',1,1,null)
on conflict (id) do update set name=excluded.name,output_id=excluded.output_id,yield_qty=excluded.yield_qty,version=excluded.version;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('5cdfd3f8-5f3d-5b5e-9a83-95fc33827a70','03c5232d-1346-5c92-8155-4abec4dc58ac',150)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('5cdfd3f8-5f3d-5b5e-9a83-95fc33827a70','8eabe1c4-b881-5c8c-97af-65354d3b6056',40)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('5cdfd3f8-5f3d-5b5e-9a83-95fc33827a70','9f819808-edcd-54ec-b672-afc9fd1670c5',100)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('5cdfd3f8-5f3d-5b5e-9a83-95fc33827a70','ed8edfec-24c0-5a9f-883d-4c7284cc898e',30)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipes(id,name,output_id,yield_qty,version,updated_by)
values ('981b9a7d-d998-5884-83ee-7ed2df12f299','Ketan Duren Original - Serving','bb8298bb-c15c-5e76-b31d-9f10d17101cf',1,1,null)
on conflict (id) do update set name=excluded.name,output_id=excluded.output_id,yield_qty=excluded.yield_qty,version=excluded.version;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('981b9a7d-d998-5884-83ee-7ed2df12f299','03c5232d-1346-5c92-8155-4abec4dc58ac',150)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('981b9a7d-d998-5884-83ee-7ed2df12f299','8eabe1c4-b881-5c8c-97af-65354d3b6056',40)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('981b9a7d-d998-5884-83ee-7ed2df12f299','9f819808-edcd-54ec-b672-afc9fd1670c5',100)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipes(id,name,output_id,yield_qty,version,updated_by)
values ('3db40af7-78d9-5be9-8527-203af79add1b','Sop Duren Original - Serving','de832e5b-6650-5064-a82b-c0e6e02b5c29',1,1,null)
on conflict (id) do update set name=excluded.name,output_id=excluded.output_id,yield_qty=excluded.yield_qty,version=excluded.version;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('3db40af7-78d9-5be9-8527-203af79add1b','9f819808-edcd-54ec-b672-afc9fd1670c5',250)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;

insert into public.md_pos_recipe_items(recipe_id,product_id,qty)
values ('3db40af7-78d9-5be9-8527-203af79add1b','8eabe1c4-b881-5c8c-97af-65354d3b6056',40)
on conflict (recipe_id,product_id) do update set qty=excluded.qty;


-- Menus that need a selling price before they can be activated as recipe products:
-- 1. Ketan Polos
-- 2. Matcha Duren
-- 3. Matcha Original
-- 4. Sop Duren Keju
-- Their serving recipes are NOT inserted as active POS menu recipes yet because
-- the current schema requires recipe.sale_price > 0.
commit;

-- Upgrade for an existing database at version 024; rerunnable.
begin;
create index if not exists md_pos_orders_branch_recent on public.md_pos_order_runs(store_id,created_at desc);
create index if not exists md_pos_lots_branch_active on public.md_pos_lots(store_id) where kg>0 or pieces>0;
create index if not exists md_pos_unit_lots_branch_active on public.md_pos_unit_lots(store_id) where qty>0;
create or replace function public.pos_read_service(branch uuid,catalog boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s jsonb;
begin
 s:=public.pos_bootstrap();
 if branch is null or not exists(select 1 from jsonb_array_elements(s->'stores') x where (x->>'id')::uuid=branch) then raise exception 'Outlet tidak tersedia';end if;
 if not (public.pos_allowed('sell',branch) or public.pos_allowed('kitchen',branch)) then raise exception 'Akses pelayanan ditolak';end if;
 return s||jsonb_build_object('opsVersion',9,'orderStockVersion',12,'orderPaymentVersion',12,'orderRoutingVersion',13,'batchTrackingVersion',21,'offlineSyncVersion',21,
'recipes',case when catalog then coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'outputId',r.output_id,'yieldQty',r.yield_qty,'version',r.version,'ingredients',coalesce((select jsonb_agg(jsonb_build_object('productId',i.product_id,'qty',i.qty) order by i.product_id) from public.md_pos_recipe_items i where i.recipe_id=r.id),'[]'::jsonb)) order by r.name) from public.md_pos_recipes r),'[]'::jsonb) else '[]'::jsonb end,
'unitLots',coalesce((select jsonb_agg(jsonb_build_object('id',id,'productId',product_id,'storeId',store_id,'unit',unit,'receivedQty',received_qty,'qty',qty,'date',received_date,'expiry',expiry,'kind',kind,'supplierId',supplier_id,'note',note) order by received_date,id) from public.md_pos_unit_lots where store_id=branch and qty>0),'[]'::jsonb),
'suppliers',case when catalog then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'phone',phone,'address',address) order by name) from public.md_pos_suppliers),'[]'::jsonb) else '[]'::jsonb end,
'products',case when catalog then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'sku',sku,'priceKg',price_kg,'pricePiece',price_piece,'category',category,'itemType',item_type,'stockUnit',stock_unit,'salePrice',sale_price,'variant',variant,'barcode',barcode,'photo',photo) order by name) from public.md_pos_products),'[]'::jsonb) else '[]'::jsonb end,
'lots',coalesce((select jsonb_agg(jsonb_build_object('id',id,'storeId',store_id,'supplierId',supplier_id,'productId',product_id,'date',received_date,'receivedKg',received_kg,'receivedPieces',received_pieces,'kg',kg,'pieces',pieces,'sourceLotId',source_lot_id,'note',note,'quality',quality) order by created_at) from public.md_pos_lots where store_id=branch and (kg>0 or pieces>0)),'[]'::jsonb),
'orders',coalesce((select jsonb_agg(case when public.pos_allowed('finance',branch) then to_jsonb(o) else to_jsonb(o)-'cost'-'consumption' end order by o.created_at desc) from public.md_pos_order_runs o where o.store_id=branch and (o.status not in ('paid','cancelled') or o.created_at>=now()-interval '7 days')),'[]'::jsonb),
'people',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.md_pos_employees),'[]'::jsonb),
'events',coalesce((select jsonb_agg(jsonb_build_object('id',id)) from (select id from public.md_pos_events where store_id=branch order by at desc limit 1000) e),'[]'::jsonb));
end$$;
revoke all on function public.pos_read_service(uuid,boolean) from public,anon,authenticated;
grant execute on function public.pos_read_service(uuid,boolean) to authenticated;
-- Scoped response during service mutations avoids rebuilding the reporting state.
do $$begin
 if to_regprocedure('public.pos_read_full_035()') is null then alter function public.pos_read() rename to pos_read_full_035;end if;
end$$;
revoke all on function public.pos_read_full_035() from public,anon,authenticated;
create or replace function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare branch uuid:=nullif(current_setting('maniac.service_branch',true),'')::uuid;
begin
 if branch is not null then return public.pos_read_service(branch,true);end if;
 return public.pos_read_full_035();
end$$;
create or replace function public.pos_mutate_service(action text,payload jsonb,branch uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;previous text:=coalesce(current_setting('maniac.service_branch',true),'');
begin
 if action not like 'order_%' then raise exception 'Aksi pelayanan tidak tersedia';end if;
 perform public.pos_bootstrap();
 if not (public.pos_allowed('sell',branch) or public.pos_allowed('kitchen',branch)) then raise exception 'Akses pelayanan ditolak';end if;
 if payload ? 'storeId' and (payload->>'storeId')::uuid is distinct from branch then raise exception 'Outlet transaksi berbeda';end if;
 if payload ? 'orderId' and not exists(select 1 from public.md_pos_order_runs where id=(payload->>'orderId')::uuid and store_id=branch) then raise exception 'Pesanan outlet tidak ditemukan';end if;
 perform set_config('maniac.service_branch',branch::text,true);
 result:=public.pos_mutate(action,payload);
 perform set_config('maniac.service_branch',previous,true);
 return result;
end$$;
revoke all on function public.pos_read(),public.pos_mutate_service(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.pos_read(),public.pos_mutate_service(text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;

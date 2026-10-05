-- Upgrade setelah 008. Tidak menghapus transaksi lama. Jalankan satu kali.
begin;
create table if not exists public.md_pos_schema_versions(version integer primary key);
do $$begin if exists(select 1 from public.md_pos_schema_versions where version=9) then raise exception 'Versi 009 sudah terpasang'; end if; end$$;
alter function public.pos_read() rename to pos_read_v8;
alter function public.pos_mutate(text,jsonb) rename to pos_mutate_v8;
revoke all on function public.pos_read_v8(),public.pos_mutate_v8(text,jsonb) from public,anon,authenticated;

create table public.md_pos_employees(
 id uuid primary key, user_id uuid unique references auth.users(id), name text not null check(length(btrim(name)) between 1 and 100),
 email text not null default '', phone text not null default '', role text not null check(role in ('owner','manager','cashier','kitchen','warehouse')),
 active boolean not null default true, store_ids uuid[] not null default '{}', permissions text[] not null default '{}', created_at timestamptz not null default now());
-- Akun staff lama mempertahankan aksesnya. Owner harus menata role setelah upgrade.
insert into public.md_pos_employees(id,user_id,name,email,role) select s.user_id,s.user_id,coalesce(nullif(u.email,''),'Admin lama'),coalesce(u.email,''),'owner' from public.md_pos_staff s join auth.users u on u.id=s.user_id;
create table public.md_pos_attendance(id uuid primary key,employee_id uuid not null references public.md_pos_employees,store_id uuid not null references public.md_pos_stores,clock_in timestamptz not null default now(),clock_out timestamptz,check(clock_out is null or clock_out>=clock_in));
create unique index md_pos_one_open_shift on public.md_pos_attendance(employee_id) where clock_out is null;
alter table public.md_pos_lots add column quality text not null default 'ready' check(quality in ('unsorted','unripe','ready','reject'));
-- NULL berarti biaya belum diketahui; tidak boleh dianggap modal nol.
alter table public.md_pos_lots add column unit_cost numeric check(unit_cost>=0);
alter table public.md_pos_unit_lots add column unit_cost numeric check(unit_cost>=0);
create table public.md_pos_events(
 id uuid primary key,action text not null,store_id uuid references public.md_pos_stores,actor uuid references auth.users,employee_id uuid references public.md_pos_employees,
 at timestamptz not null default now(),business_date date not null,payload jsonb not null,details jsonb not null default '{}');
create table public.md_pos_stock_journal(
 id bigint generated always as identity primary key,event_id uuid not null references public.md_pos_events,lot_id uuid not null,
 product_id uuid not null references public.md_pos_products,store_id uuid not null references public.md_pos_stores,
 supplier_id uuid references public.md_pos_suppliers,qty numeric not null,pieces numeric not null default 0,unit text not null,cost numeric,quality text);
create table public.md_pos_order_runs(
 id uuid primary key,store_id uuid not null references public.md_pos_stores,created_by uuid references auth.users,created_at timestamptz not null default now(),
 business_date date not null,paid_date date,status text not null check(status in ('queued','preparing','ready','paid','cancelled')),note text not null default '',
 lines jsonb not null,total numeric not null check(total>=0),consumption jsonb not null default '[]',cost numeric,payment text,paid numeric,
 started_by uuid references auth.users,finished_by uuid references auth.users,cancel_reason text);
create table public.md_pos_money_journal(
 id bigint generated always as identity primary key,event_id uuid not null references public.md_pos_events,store_id uuid not null references public.md_pos_stores,
 category text not null check(category in ('sale','loss','reversal','adjustment')),revenue numeric not null default 0,cost numeric,note text not null default '');
-- Semua tabel hanya dapat diakses melalui RPC yang mengecek hak akses.
do $$declare t text;begin foreach t in array array['employees','attendance','events','stock_journal','order_runs','money_journal'] loop execute format('alter table public.md_pos_%I enable row level security',t);execute format('revoke all on public.md_pos_%I from public,anon,authenticated',t);end loop;end$$;

create function public.pos_allowed(permission text,store uuid default null) returns boolean language plpgsql stable security definer set search_path='' as $$
declare e public.md_pos_employees%rowtype; defaults text[];begin
 select * into e from public.md_pos_employees where user_id=auth.uid() and active;
 if not found then return false;end if;
 if e.role='owner' then return true;end if;
 if permission='employees' then return false;end if;
 if store is not null and not(store=any(e.store_ids)) then return false;end if;
 defaults:=case e.role when 'manager' then array['stock','produce','waste','sell','kitchen','reports','finance','trace','master','attendance','cancel'] when 'cashier' then array['sell','attendance'] when 'kitchen' then array['produce','waste','kitchen','attendance','trace'] when 'warehouse' then array['stock','waste','trace','attendance'] else '{}'::text[] end;
 return permission=any(defaults||e.permissions);
end $$;
create function public.pos_require(permission text,store uuid default null) returns void language plpgsql set search_path='' as $$begin if not public.pos_allowed(permission,store) then raise exception 'Hak akses tidak tersedia: %',permission;end if;end$$;
create function public.pos_stock_snapshot() returns jsonb language sql set search_path='' as $$
 select coalesce(jsonb_agg(x),'[]') from (
 select id,product_id,store_id,supplier_id,kg qty,pieces,'kg' unit,unit_cost,quality from public.md_pos_lots
 union all select id,product_id,store_id,supplier_id,qty,0,unit,unit_cost,null from public.md_pos_unit_lots) x
$$;
create function public.pos_take(product uuid,store uuid,quantity numeric,on_date date) returns jsonb language plpgsql set search_path='' as $$
declare l public.md_pos_unit_lots%rowtype;n numeric:=quantity;t numeric;out jsonb:='[]';begin
 if n is null or n<=0 or (exists(select 1 from public.md_pos_products where id=product and stock_unit in ('pcs','porsi')) and n<>trunc(n)) then raise exception 'Jumlah bahan tidak valid';end if;
 for l in select * from public.md_pos_unit_lots where product_id=product and store_id=store and qty>0 and received_date<=on_date and (expiry is null or expiry>=on_date) order by expiry nulls last,received_date,id for update loop
 t:=least(n,l.qty);update public.md_pos_unit_lots set qty=qty-t where id=l.id;
 out:=out||jsonb_build_array(jsonb_build_object('lotId',l.id,'productId',product,'qty',t,'unit',l.unit,'unitCost',l.unit_cost,'supplierId',l.supplier_id));n:=n-t;exit when n=0;end loop;
 if n>0 then raise exception 'Stok bahan kurang atau kedaluwarsa: %',(select name from public.md_pos_products where id=product);end if;return out;end$$;

create function public.pos_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;e public.md_pos_employees%rowtype;k text;v jsonb;begin
 select * into e from public.md_pos_employees where user_id=auth.uid() and active;
 if not found then raise exception 'Akun tidak memiliki akses POS / karyawan nonaktif';end if;
 s:=public.pos_read_v8();
 s:=s||jsonb_build_object('people',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name)) from public.md_pos_employees x),'[]'),'opsVersion',9,'me',jsonb_build_object('id',e.id,'userId',e.user_id,'name',e.name,'role',e.role,'permissions',e.permissions,'storeIds',e.store_ids),
 'access',(select jsonb_object_agg(p,public.pos_allowed(p)) from unnest(array['stock','produce','waste','sell','kitchen','reports','finance','trace','master','attendance','cancel','employees']) p),
 'employees',coalesce((select jsonb_agg(to_jsonb(x)) from public.md_pos_employees x where public.pos_allowed('employees') or x.id=e.id),'[]'),
 'attendance',coalesce((select jsonb_agg(to_jsonb(x) order by clock_in desc) from public.md_pos_attendance x where (public.pos_allowed('employees') or employee_id=e.id)),'[]'),
 'origins',coalesce((select jsonb_agg(to_jsonb(z)) from (
 select outlot.id lot_id,(r.snapshot->'used') inputs from public.md_pos_productions r join public.md_pos_unit_lots outlot on outlot.id=r.id where not r.voided and (e.role='owner' or r.store_id=any(e.store_ids))
 union all select (o->>'lotId')::uuid,jsonb_build_array(jsonb_build_object('lotId',w.source_lot_id,'qty',(w.snapshot->>'kg')::numeric*((o->>'weightKg')::numeric/nullif((w.snapshot->>'outputKg')::numeric,0)))) from public.md_pos_waste_runs w cross join lateral jsonb_array_elements(w.snapshot->'outputs') o where not w.voided and (e.role='owner' or w.store_id=any(e.store_ids))
 ) z),'[]'),
 'orders',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc) from public.md_pos_order_runs x where public.pos_allowed('sell',x.store_id) or public.pos_allowed('kitchen',x.store_id) or public.pos_allowed('reports',x.store_id)),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(x) order by at desc) from public.md_pos_events x where public.pos_allowed('trace',x.store_id) or public.pos_allowed('finance',x.store_id)),'[]'),
 'journal',coalesce((select jsonb_agg(to_jsonb(x) order by id desc) from public.md_pos_stock_journal x where public.pos_allowed('trace',x.store_id)),'[]'),
 'money',coalesce((select jsonb_agg(to_jsonb(x) order by id desc) from public.md_pos_money_journal x where public.pos_allowed('finance',x.store_id)),'[]'));
 -- Lengkapi metadata penerimaan, kemudian batasi semua data per cabang di server.
 s:=jsonb_set(s,'{lots}',coalesce((select jsonb_agg(x||jsonb_build_object('quality',l.quality,'unitCost',case when public.pos_allowed('finance',l.store_id) then l.unit_cost end,'createdBy',l.created_by)) from jsonb_array_elements(s->'lots') x join public.md_pos_lots l on l.id=(x->>'id')::uuid),'[]'));
 s:=jsonb_set(s,'{unitLots}',coalesce((select jsonb_agg(x||jsonb_build_object('unitCost',case when public.pos_allowed('finance',l.store_id) then l.unit_cost end,'createdBy',l.created_by)) from jsonb_array_elements(s->'unitLots') x join public.md_pos_unit_lots l on l.id=(x->>'id')::uuid),'[]'));
 if e.role<>'owner' then
 foreach k in array array['lots','unitLots','sales','movements','productions','stockAdjustments','wasteRuns'] loop
 s:=jsonb_set(s,array[k],coalesce((select jsonb_agg(x) from jsonb_array_elements(s->k) x where (x->>'storeId')::uuid=any(e.store_ids)),'[]'));end loop;
 s:=jsonb_set(s,'{stores}',coalesce((select jsonb_agg(x) from jsonb_array_elements(s->'stores') x where (x->>'id')::uuid=any(e.store_ids)),'[]'));
 end if;
 if not public.pos_allowed('reports') then s:=jsonb_set(s,'{sales}','[]');end if;
 if not public.pos_allowed('finance') then
 s:=jsonb_set(s,'{products}',coalesce((select jsonb_agg(x-'buyPrice') from jsonb_array_elements(s->'products') x),'[]'));
 s:=jsonb_set(s,'{orders}',coalesce((select jsonb_agg(x-'cost'-'consumption') from jsonb_array_elements(s->'orders') x),'[]'));
 s:=jsonb_set(s,'{journal}',coalesce((select jsonb_agg(x-'cost') from jsonb_array_elements(s->'journal') x),'[]'));
 s:=jsonb_set(s,'{events}',coalesce((select jsonb_agg(x-'payload'-'details') from jsonb_array_elements(s->'events') x),'[]'));
 end if;
 return s;end$$;

create function public.pos_mutate(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare eid uuid:=(payload->>'id')::uuid;ev_id uuid;st uuid;dt date:=coalesce(nullif(payload->>'date','')::date,(now() at time zone 'Asia/Jakarta')::date);me public.md_pos_employees%rowtype;
 old jsonb;fresh jsonb;result jsonb;j jsonb;l jsonb;used jsonb:='[]';line jsonb;req text;rec public.md_pos_recipes%rowtype;p public.md_pos_products%rowtype;
 fruit public.md_pos_lots%rowtype;unitlot public.md_pos_unit_lots%rowtype;ord public.md_pos_order_runs%rowtype;emp public.md_pos_employees%rowtype;
 q numeric;b numeric;amount numeric;v_cost numeric;input_cost numeric;output_weight numeric;total numeric:=0;cnt integer;reason text;target uuid;
begin
 select * into me from public.md_pos_employees where user_id=auth.uid() and active;if not found then raise exception 'Akun tidak memiliki akses POS';end if;
 if eid is null then raise exception 'ID wajib';end if;
 perform pg_catalog.pg_advisory_xact_lock(71031,1102);
 ev_id:=case when action in ('product_save','recipe_save','master','master_details','product_update') then md5(action||payload::text||auth.uid()::text)::uuid else eid end;
 if exists(select 1 from public.md_pos_events where id=ev_id) then
 if not exists(select 1 from public.md_pos_events where id=ev_id and md_pos_events.action=pos_mutate.action and md_pos_events.payload=pos_mutate.payload and actor=auth.uid()) then raise exception 'ID sudah digunakan untuk data lain';end if;
 return public.pos_read();end if;
 st:=nullif(payload->>'storeId','')::uuid;
 if action in ('sale','receipt','unit_receipt','produce','waste_process','order_create','attendance_in') and st is null then raise exception 'Pilih cabang';end if;
 if action in ('movement','sort','inventory_loss','recover') then
 select store_id into st from public.md_pos_lots where id=(payload->>'lotId')::uuid;
 if st is null then select store_id into st from public.md_pos_unit_lots where id=(payload->>'lotId')::uuid;end if;
 if st is null then raise exception 'Stok tidak ditemukan';end if;end if;
 if action like 'order_%' and action<>'order_create' then select * into ord from public.md_pos_order_runs where id=(payload->>'orderId')::uuid for update;if not found then raise exception 'Pesanan tidak ditemukan';end if;st:=ord.store_id;if dt<ord.business_date then raise exception 'Tanggal sebelum pesanan';end if;end if;
 if action='production_void' then select store_id into st from public.md_pos_productions where id=(payload->>'productionId')::uuid;end if;
 if action='waste_void' then select store_id into st from public.md_pos_waste_runs where id=(payload->>'wasteId')::uuid;end if;
 if action='void' then select store_id into st from public.md_pos_sales where id=(payload->>'saleId')::uuid;end if;
 req:=case when action in ('employee_save','employee_link') then 'employees' when action like 'attendance_%' then 'attendance' when action in ('order_start','order_ready') then 'kitchen' when action in ('order_cancel','void','waste_void','production_void') then 'cancel' when action in ('order_create','order_pay','sale') then 'sell' when action in ('waste_process','recover','inventory_loss') then 'waste' when action in ('receipt','unit_receipt','sort','movement') then 'stock' when action='produce' then 'produce' else 'master' end;
 if action in ('order_start','order_ready') and not exists(select 1 from jsonb_array_elements(ord.lines) x where x->>'itemType'='recipe') then req:='sell';end if;
 perform public.pos_require(req,st);
 if dt>(now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal tidak boleh di masa depan';end if;
 old:=public.pos_stock_snapshot();
 insert into public.md_pos_events(id,action,store_id,actor,employee_id,business_date,payload) values(ev_id,action,st,auth.uid(),me.id,dt,payload);
 if action in ('employee_save','employee_link') and me.role<>'owner' then raise exception 'Pengelolaan karyawan hanya untuk owner';end if;
 if action='employee_save' then
 target:=(payload->>'employeeId')::uuid;
 if target is null then raise exception 'ID karyawan wajib';end if;
 select * into emp from public.md_pos_employees where id=target;
 if target=me.id and (payload->>'role'<>'owner' or not coalesce((payload->>'active')::boolean,true)) then raise exception 'Tidak dapat menonaktifkan / menurunkan akses sendiri';end if;
 if exists(select 1 from jsonb_array_elements_text(payload->'storeIds') x where not exists(select 1 from public.md_pos_stores where id=x::uuid)) then raise exception 'Cabang tidak valid';end if;
 if exists(select 1 from jsonb_array_elements_text(payload->'permissions') x where x not in ('stock','produce','waste','sell','kitchen','reports','finance','trace','master','attendance','cancel','employees')) then raise exception 'Permission tidak valid';end if;
 insert into public.md_pos_employees(id,name,email,phone,role,active,store_ids,permissions) values(target,btrim(payload->>'name'),lower(btrim(payload->>'email')),coalesce(payload->>'phone',''),payload->>'role',coalesce((payload->>'active')::boolean,true),array(select jsonb_array_elements_text(payload->'storeIds'))::uuid[],array(select jsonb_array_elements_text(payload->'permissions')))
 on conflict(id) do update set name=excluded.name,email=case when md_pos_employees.user_id is null then excluded.email else md_pos_employees.email end,phone=excluded.phone,role=excluded.role,active=excluded.active,store_ids=excluded.store_ids,permissions=excluded.permissions;
 elsif action='employee_link' then
 target:=(payload->>'employeeId')::uuid;
 select * into emp from public.md_pos_employees where id=target for update;if not found then raise exception 'Karyawan tidak ada';end if;
 if emp.user_id is not null then raise exception 'Akun sudah terhubung';end if;
 if not exists(select 1 from auth.users where id=(payload->>'userId')::uuid and lower(email)=emp.email) then raise exception 'Email akun tidak cocok';end if;
 update public.md_pos_employees set user_id=(payload->>'userId')::uuid where id=target;
 insert into public.md_pos_staff(user_id) values((payload->>'userId')::uuid) on conflict do nothing;
 elsif action='attendance_in' then
 insert into public.md_pos_attendance(id,employee_id,store_id) values(eid,me.id,st);
 elsif action='attendance_out' then
 update public.md_pos_attendance set clock_out=now() where employee_id=me.id and clock_out is null;if not found then raise exception 'Belum absen masuk';end if;
 elsif action='sort' then
 select * into fruit from public.md_pos_lots where id=(payload->>'lotId')::uuid for update;
 if dt<fruit.received_date then raise exception 'Tanggal sebelum penerimaan';end if;
 q:=0;b:=0;
 if jsonb_array_length(payload->'parts')<1 then raise exception 'Isi hasil sortir';end if;
 for l in select value from jsonb_array_elements(payload->'parts') loop
 amount:=public.pos_positive(l->>'kg');cnt:=public.pos_positive(l->>'pieces');
 if (l->>'pieces')::numeric<>cnt or l->>'quality' not in ('ready','unripe','reject') then raise exception 'Hasil sortir tidak valid';end if;
 q:=q+amount;b:=b+cnt;
 insert into public.md_pos_lots(id,store_id,supplier_id,product_id,received_date,received_kg,received_pieces,kg,pieces,source_lot_id,quality,unit_cost,note,created_by)
 values((l->>'id')::uuid,st,fruit.supplier_id,fruit.product_id,fruit.received_date,amount,cnt,amount,cnt,fruit.id,l->>'quality',fruit.unit_cost,'Sortir '||eid,auth.uid());end loop;
 if q<>fruit.kg or b<>fruit.pieces then raise exception 'Total hasil sortir harus sama dengan sisa kg dan butir asal';end if;
 update public.md_pos_lots set kg=0,pieces=0 where id=fruit.id;
 elsif action='recover' then
 select * into fruit from public.md_pos_lots where id=(payload->>'lotId')::uuid and quality='reject' for update;
 if not found or dt<fruit.received_date then raise exception 'Pilih buah reject dengan tanggal sesuai';end if;
 q:=public.pos_positive(payload->>'kg');b:=public.pos_unit_qty(payload->>'pieces','pcs');
 if q>fruit.kg or b>fruit.pieces then raise exception 'Melebihi stok reject';end if;
 select * into p from public.md_pos_products where id=(payload->>'productId')::uuid;
 if not found or p.item_type not in ('prep','finished','direct') or p.stock_unit not in ('kg','g','pcs') then raise exception 'Pilih bahan siap pakai / hasil olahan dengan satuan kg, g, atau pcs';end if;
 amount:=public.pos_unit_qty(payload->>'qty',p.stock_unit);
 output_weight:=case p.stock_unit when 'kg' then amount when 'g' then amount/1000 else public.pos_positive(payload->>'weightKg') end;
 if output_weight>q then raise exception 'Berat hasil melebihi buah asal';end if;
 if coalesce(length(btrim(payload->>'reason')),0)<3 then raise exception 'Catatan pengolahan wajib';end if;
 v_cost:=fruit.unit_cost*q;
 update public.md_pos_lots set kg=kg-q,pieces=pieces-b where id=fruit.id;
 insert into public.md_pos_unit_lots(id,product_id,store_id,unit,received_qty,qty,received_date,expiry,kind,supplier_id,note,created_by,unit_cost)
 values(eid,p.id,st,p.stock_unit,amount,amount,dt,nullif(payload->>'expiry','')::date,'waste',fruit.supplier_id,'Hasil reject '||eid,auth.uid(),v_cost/amount);
 insert into public.md_pos_waste_runs(id,store_id,source_lot_id,waste_date,snapshot,created_by) values(eid,st,fruit.id,dt,
 jsonb_build_object('sourceProductId',fruit.product_id,'sourceName',(select name from public.md_pos_products where id=fruit.product_id),'supplierId',fruit.supplier_id,'supplierName',(select name from public.md_pos_suppliers where id=fruit.supplier_id),'receivedDate',fruit.received_date,'kg',q,'pieces',b,'outputKg',output_weight,'lossKg',q-output_weight,'reason',payload->>'reason','processedBy',me.name,'outputs',jsonb_build_array(jsonb_build_object('key','custom','label',p.name,'productId',p.id,'name',p.name,'unit',p.stock_unit,'qty',amount,'weightKg',output_weight,'lotId',eid,'expiry',payload->>'expiry'))),auth.uid());
 elsif action='inventory_loss' then
 reason:=btrim(payload->>'reason');if coalesce(length(reason),0)<3 then raise exception 'Isi alasan waste / penyusutan';end if;
 if payload->>'cause' not in ('shrinkage','spoiled','mistake','discard') then raise exception 'Penyebab tidak valid';end if;
 q:=public.pos_positive(payload->>'qty');b:=coalesce((payload->>'pieces')::numeric,0);
 select * into fruit from public.md_pos_lots where id=(payload->>'lotId')::uuid for update;
 if found then
 if dt<fruit.received_date then raise exception 'Tanggal sebelum penerimaan';end if;
 if q>fruit.kg or b<0 or b<>trunc(b) or b>fruit.pieces or (payload->>'cause'<>'shrinkage' and b=0) then raise exception 'Jumlah waste tidak valid';end if;
 if payload->>'cause'='shrinkage' and b<>0 then raise exception 'Penyusutan berat tidak mengurangi butir';end if;
 if (fruit.kg-q=0)<>(fruit.pieces-b=0) then raise exception 'Sisa kg dan butir harus konsisten';end if;
 update public.md_pos_lots set kg=kg-q,pieces=pieces-b where id=fruit.id;v_cost:=q*fruit.unit_cost;
 else
 select * into unitlot from public.md_pos_unit_lots where id=(payload->>'lotId')::uuid for update;
 if dt<unitlot.received_date then raise exception 'Tanggal sebelum penerimaan';end if;
 q:=public.pos_unit_qty(payload->>'qty',unitlot.unit);
 if q>unitlot.qty then raise exception 'Waste melebihi stok';end if;
 update public.md_pos_unit_lots set qty=qty-q where id=unitlot.id;v_cost:=q*unitlot.unit_cost;end if;
 insert into public.md_pos_money_journal(event_id,store_id,category,cost,note) values(ev_id,st,'loss',v_cost,payload->>'cause'||': '||reason);
 elsif action='order_create' then
 if jsonb_typeof(payload->'lines') is distinct from 'array' or jsonb_array_length(payload->'lines') not between 1 and 100 then raise exception 'Isi pesanan';end if;
 used:='[]';
 for l in select value from jsonb_array_elements(payload->'lines') loop
 select * into p from public.md_pos_products where id=(l->>'productId')::uuid;
 if not found or p.item_type in ('raw','prep') then raise exception 'Bahan internal tidak dijual';end if;
 if p.stock_unit='kg_butir' then
 select * into fruit from public.md_pos_lots where id=(l->>'lotId')::uuid and product_id=p.id and store_id=st and quality='ready';
 if not found then raise exception 'Pilih stok buah matang';end if;
 q:=public.pos_positive(l->>'kg');b:=public.pos_unit_qty(l->>'pieces','pcs');amount:=public.pos_positive(l->>'price');
 if l->>'unit' not in ('KG','BUTIR') or q>fruit.kg or b>fruit.pieces then raise exception 'Jumlah / cara jual buah tidak valid';end if;
 used:=used||jsonb_build_array(jsonb_build_object('lineId',gen_random_uuid(),'productId',p.id,'name',p.name,'itemType','fruit','unit',l->>'unit','qty',case when l->>'unit'='KG' then q else b end,'kg',q,'pieces',b,'price',amount,'lotId',fruit.id));
 total:=total+amount*case when l->>'unit'='KG' then q else b end;continue;end if;
 q:=public.pos_unit_qty(l->>'qty',p.stock_unit);amount:=public.pos_positive(l->>'price');
 if p.item_type='recipe' then
 select * into rec from public.md_pos_recipes where output_id=p.id;
 if not found then raise exception 'Resep menu belum dibuat: %',p.name;end if;
 select count(*) into cnt from public.md_pos_recipes where output_id=p.id;if cnt<>1 then raise exception 'Menu harus memiliki tepat satu resep aktif: %',p.name;end if;
 end if;
 used:=used||jsonb_build_array(jsonb_build_object('lineId',gen_random_uuid(),'productId',p.id,'name',p.name,'itemType',p.item_type,'unit',p.stock_unit,'qty',q,'price',amount,'recipeId',case when p.item_type='recipe' then rec.id end,'recipeVersion',case when p.item_type='recipe' then rec.version end));total:=total+q*amount;end loop;
 insert into public.md_pos_order_runs(id,store_id,created_by,business_date,status,note,lines,total) values(eid,st,auth.uid(),dt,'queued',left(coalesce(payload->>'note',''),300),used,total);
 elsif action='order_start' then
 if ord.status<>'queued' then raise exception 'Pesanan sudah diproses';end if;
 used:='[]';
 for l in select value from jsonb_array_elements(ord.lines) loop
 cnt:=jsonb_array_length(used);
 select * into p from public.md_pos_products where id=(l->>'productId')::uuid;
 if l->>'itemType'='fruit' then
 select * into fruit from public.md_pos_lots where id=(l->>'lotId')::uuid and store_id=st and quality='ready' for update;
 if not found or fruit.kg<(l->>'kg')::numeric or fruit.pieces<(l->>'pieces')::numeric then raise exception 'Stok buah berubah / tidak cukup';end if;
 update public.md_pos_lots set kg=kg-(l->>'kg')::numeric,pieces=pieces-(l->>'pieces')::integer where id=fruit.id;
 used:=used||jsonb_build_array(jsonb_build_object('lotId',fruit.id,'productId',fruit.product_id,'qty',(l->>'kg')::numeric,'pieces',(l->>'pieces')::integer,'unit','kg','unitCost',fruit.unit_cost,'supplierId',fruit.supplier_id));
 elsif l->>'itemType'='recipe' then
 select * into rec from public.md_pos_recipes where id=(l->>'recipeId')::uuid;
 if not found or rec.version<>(l->>'recipeVersion')::integer then raise exception 'Resep berubah. Batalkan pesanan yang belum dibuat lalu input ulang';end if;
 for line in select jsonb_build_object('productId',product_id,'qty',qty) from public.md_pos_recipe_items where recipe_id=rec.id loop
 used:=used||public.pos_take((line->>'productId')::uuid,st,(line->>'qty')::numeric*(l->>'qty')::numeric/rec.yield_qty,dt);end loop;
 else used:=used||public.pos_take(p.id,st,(l->>'qty')::numeric,dt);end if;
 select coalesce(jsonb_agg(case when ix>cnt then x||jsonb_build_object('lineId',l->>'lineId') else x end order by ix),'[]') into used from jsonb_array_elements(used) with ordinality as z(x,ix);
 end loop;
 select case when bool_or(x->>'unitCost' is null) then null else sum((x->>'qty')::numeric*(x->>'unitCost')::numeric) end into v_cost from jsonb_array_elements(used) x;
 update public.md_pos_order_runs set status='preparing',consumption=used,cost=v_cost,started_by=auth.uid() where id=ord.id;
 elsif action='order_ready' then
 if ord.status<>'preparing' then raise exception 'Pesanan belum dibuat';end if;
 update public.md_pos_order_runs set status='ready',finished_by=auth.uid() where id=ord.id;
 elsif action='order_pay' then
 if ord.status<>'ready' then raise exception 'Selesaikan pembuatan pesanan dahulu';end if;
 amount:=(payload->>'paid')::numeric;
 if amount is null or amount<ord.total or payload->>'payment' not in ('Tunai','QRIS','Transfer') then raise exception 'Pembayaran tidak valid';end if;
 update public.md_pos_order_runs set status='paid',paid_date=dt,paid=amount,payment=payload->>'payment' where id=ord.id;
 insert into public.md_pos_money_journal(event_id,store_id,category,revenue,cost,note) values(ev_id,st,'sale',ord.total,ord.cost,'Pesanan '||ord.id);
 elsif action='order_cancel' then
 if ord.status not in ('queued','preparing','ready') then raise exception 'Pesanan tidak dapat dibatalkan';end if;
 reason:=btrim(payload->>'reason');if coalesce(length(reason),0)<3 then raise exception 'Alasan wajib';end if;
 if ord.status<>'queued' then
 -- Setelah bahan dipakai, pembatalan menjadi waste, tidak mengembalikan bahan yang telah diolah.
 insert into public.md_pos_money_journal(event_id,store_id,category,cost,note) values(ev_id,st,'loss',ord.cost,'Pesanan batal setelah dibuat: '||reason);end if;
 update public.md_pos_order_runs set status='cancelled',cancel_reason=reason where id=ord.id;
 else
 -- Operasi lama tetap dipakai, dengan aturan baru yang diperiksa di server.
 if action in ('receipt','unit_receipt') then
 if payload->>'totalCost' is null or (payload->>'totalCost')::numeric<0 then raise exception 'Isi total modal penerimaan (termasuk ongkos masuk)';end if;end if;
 if action='product_save' and (payload ? 'stock') then raise exception 'Gunakan menu kehilangan / penyusutan atau penerimaan untuk perubahan stok';end if;
 if action='produce' and exists(select 1 from public.md_pos_recipes r join public.md_pos_products prod on prod.id=r.output_id where r.id=(payload->>'recipeId')::uuid and prod.item_type='recipe') then raise exception 'Menu pesanan dibuat melalui Pesanan & Kitchen';end if;
 if action='sale' then for l in select value from jsonb_array_elements(payload->'lines') loop
 if not exists(select 1 from public.md_pos_lots where id=(l->>'lotId')::uuid and quality='ready') then raise exception 'Buah harus berstatus matang / siap jual';end if;end loop;end if;
 if action='waste_process' and not exists(select 1 from public.md_pos_lots where id=(payload->>'sourceLotId')::uuid and quality='reject') then raise exception 'Sortir buah menjadi reject sebelum diolah';end if;
 if action='movement' then
 if payload->>'kind'<>'Transfer' then raise exception 'Pemakaian dapur harus mencatat hasil melalui Olah reject / Produksi';end if;
 perform public.pos_require('stock',(payload->>'toStoreId')::uuid);end if;
 if action='void' and exists(select 1 from public.md_pos_sales where id=(payload->>'saleId')::uuid and voided) then raise exception 'Transaksi sudah dibatalkan';end if;
 if action='waste_void' and exists(select 1 from public.md_pos_waste_runs where id=(payload->>'wasteId')::uuid and voided) then raise exception 'Waste sudah dibatalkan';end if;
 if action in ('receipt','unit_receipt','produce','sale','waste_process','movement') and (exists(select 1 from public.md_pos_lots where id=eid) or exists(select 1 from public.md_pos_unit_lots where id=eid) or exists(select 1 from public.md_pos_sales where id=eid) or exists(select 1 from public.md_pos_waste_runs where id=eid)) then raise exception 'ID lama sudah digunakan';end if;
 if action='waste_process' then payload:=payload||jsonb_build_object('processedBy',me.name);end if;
 result:=public.pos_mutate_v8(action,payload);
 if action='receipt' then update public.md_pos_lots set unit_cost=(payload->>'totalCost')::numeric/received_kg,quality='unsorted' where id=eid;
 elsif action='unit_receipt' then update public.md_pos_unit_lots set unit_cost=(payload->>'totalCost')::numeric/received_qty where id=eid;
 elsif action='movement' then update public.md_pos_lots n set unit_cost=o.unit_cost,quality=o.quality from public.md_pos_lots o where n.id=eid and o.id=n.source_lot_id;
 elsif action='produce' then
 select case when bool_or(u.unit_cost is null) then null else sum((x->>'qty')::numeric*u.unit_cost) end into v_cost from public.md_pos_productions r cross join lateral jsonb_array_elements(r.snapshot->'used') x join public.md_pos_unit_lots u on u.id=(x->>'lotId')::uuid where r.id=eid;
 update public.md_pos_unit_lots set unit_cost=v_cost/received_qty where id=eid;
 elsif action='waste_process' then
 select * into fruit from public.md_pos_lots where id=(payload->>'sourceLotId')::uuid;
 input_cost:=fruit.unit_cost*(payload->>'kg')::numeric;
 select snapshot into j from public.md_pos_waste_runs where id=eid;
 output_weight:=(j->>'outputKg')::numeric;
 if output_weight>0 then
 for l in select value from jsonb_array_elements(j->'outputs') loop
 select * into unitlot from public.md_pos_unit_lots where id=(l->>'lotId')::uuid;
 -- Hasil kemasan dihitung menurut berat, Coral menurut kg.
 amount:=(l->>'weightKg')::numeric;
 update public.md_pos_unit_lots set unit_cost=input_cost*amount/output_weight/received_qty where id=unitlot.id;end loop;
 else insert into public.md_pos_money_journal(event_id,store_id,category,cost,note) values(ev_id,st,'loss',input_cost,'Reject tidak dapat dimanfaatkan');end if;
 elsif action='sale' then
 select case when bool_or(l.unit_cost is null) then null else sum(i.kg*l.unit_cost) end into v_cost from public.md_pos_sale_items i join public.md_pos_lots l on l.id=i.lot_id where i.sale_id=eid;
 insert into public.md_pos_money_journal(event_id,store_id,category,revenue,cost,note) select ev_id,st,'sale',s.total,v_cost,'Buah '||eid from public.md_pos_sales s where s.id=eid;
 elsif action in ('void','waste_void') then
 target:=case when action='void' then (payload->>'saleId')::uuid else (payload->>'wasteId')::uuid end;
 insert into public.md_pos_money_journal(event_id,store_id,category,revenue,cost,note) select ev_id,st,'reversal',-m.revenue,-m.cost,'Pembatalan '||target from public.md_pos_money_journal m where m.event_id=target;
 end if;
 end if;
 if exists(select 1 from public.md_pos_lots where (kg=0)<>(pieces=0) and id in (select (x->>'id')::uuid from jsonb_array_elements(public.pos_stock_snapshot()) x where x->>'unit'='kg')) then
 -- Check only rows changed by this operation; historical inconsistent rows remain visible for correction.
 if exists(select 1 from public.md_pos_lots l join jsonb_array_elements(old) o on l.id=(o->>'id')::uuid where (l.kg=0)<>(l.pieces=0) and (l.kg<>(o->>'qty')::numeric or l.pieces<>(o->>'pieces')::numeric)) then raise exception 'Sisa berat dan butir tidak konsisten';end if;end if;
 fresh:=public.pos_stock_snapshot();
 -- Jurnal selisih sebelum/sesudah menyimpan jejak fisik setiap lot dan orang yang bertindak.
 insert into public.md_pos_stock_journal(event_id,lot_id,product_id,store_id,supplier_id,qty,pieces,unit,cost,quality)
 select ev_id,(n->>'id')::uuid,(n->>'product_id')::uuid,(n->>'store_id')::uuid,(n->>'supplier_id')::uuid,
 (n->>'qty')::numeric-coalesce((o->>'qty')::numeric,0),(n->>'pieces')::numeric-coalesce((o->>'pieces')::numeric,0),n->>'unit',
 ((n->>'qty')::numeric-coalesce((o->>'qty')::numeric,0))*(n->>'unit_cost')::numeric,n->>'quality'
 from jsonb_array_elements(fresh) n left join jsonb_array_elements(old) o on n->>'id'=o->>'id'
 where (n->>'qty')::numeric<>coalesce((o->>'qty')::numeric,0) or (n->>'pieces')::numeric<>coalesce((o->>'pieces')::numeric,0);
 return public.pos_read();
end$$;
revoke all on function public.pos_allowed(text,uuid),public.pos_require(text,uuid),public.pos_stock_snapshot(),public.pos_take(uuid,uuid,numeric,date),public.pos_read(),public.pos_mutate(text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_allowed(text,uuid),public.pos_read(),public.pos_mutate(text,jsonb) to authenticated;
alter function public.pos_waste_evidence(uuid) rename to pos_waste_evidence_v8;
revoke all on function public.pos_waste_evidence_v8(uuid) from public,anon,authenticated;
create function public.pos_waste_evidence(waste_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare st uuid;begin
select store_id into st from public.md_pos_waste_runs where id=waste_id;
if st is null then raise exception 'Waste tidak ditemukan';end if;
perform public.pos_require('waste',st);return public.pos_waste_evidence_v8(waste_id);end$$;
revoke all on function public.pos_waste_evidence(uuid) from public,anon;
grant execute on function public.pos_waste_evidence(uuid) to authenticated;
create unique index md_pos_employee_email on public.md_pos_employees(lower(email)) where email<>'';
create function public.pos_account_target(employee_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare e public.md_pos_employees%rowtype;u uuid;begin
perform public.pos_require('employees');select * into e from public.md_pos_employees where id=employee_id;
if not found or not e.active or e.email='' then raise exception 'Isi email dan aktifkan karyawan dahulu';end if;
select id into u from auth.users where lower(email)=e.email;
return jsonb_build_object('email',e.email,'userId',u,'linked',e.user_id is not null);end$$;
revoke all on function public.pos_account_target(uuid) from public,anon;
grant execute on function public.pos_account_target(uuid) to authenticated;
insert into public.md_pos_schema_versions values(9);
notify pgrst,'reload schema';
commit;

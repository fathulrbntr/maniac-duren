-- Maniac Duren patch 051: sinkronisasi fungsi kategori dengan web.
-- Dapat dipasang dari 046 atau dijalankan ulang pada 047–050.
-- Menjaga pilihan kategori yang ada; tidak mereset produk atau transaksi.
-- Kategori POS global tidak mengganti kategori operasional, stok, atau resep.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
select pg_catalog.pg_advisory_xact_lock(71031,1103);
create table if not exists public.md_pos_menu_categories(
 id uuid primary key,name text not null check(length(btrim(name)) between 1 and 50),
 sort_order integer not null default 0,version bigint not null default 1 check(version>0)
);
create unique index if not exists md_pos_menu_category_name_unique on public.md_pos_menu_categories(lower(name));
alter table public.md_pos_menu_categories enable row level security;
revoke all on public.md_pos_menu_categories from public,anon,authenticated;
alter table public.md_pos_products add column if not exists pos_category_id uuid;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.md_pos_products'::regclass and conname='md_pos_product_pos_category_fk') then
  alter table public.md_pos_products add constraint md_pos_product_pos_category_fk foreign key(pos_category_id) references public.md_pos_menu_categories(id) on delete set null;
 end if;
end$$;
create index if not exists md_pos_product_pos_category_idx on public.md_pos_products(pos_category_id) where pos_category_id is not null;

-- Enam kategori awal. Pengelompokan awal hanya pada pemasangan pertama.
-- Rerun tidak mengembalikan produk yang sudah dipindah/dikeluarkan oleh admin.
do $seed$
declare label text;rank integer:=0;
begin
 if to_regprocedure('public.pos_read_v8()') is null then raise exception 'Pembaca POS v8 tidak ditemukan';end if;
 if position('''posCategories''' in pg_get_functiondef('public.pos_read_v8()'::regprocedure))>0 then return;end if;
 foreach label in array array['Buah','Durpas','Coral','Makan','Minuman','Dessert'] loop
  insert into public.md_pos_menu_categories(id,name,sort_order) values(md5('MD_POS_CATEGORY_046:'||label)::uuid,label,rank) on conflict(id) do nothing;
  rank:=rank+1;
 end loop;
 update public.md_pos_products p set pos_category_id=c.id
 from public.md_pos_menu_categories c
 where p.pos_category_id is null and p.item_type in ('direct','finished','recipe') and c.name=(case
  when to_jsonb(p)->>'durian_output' in ('durpas500','durpas1000') or p.name ~* '^(durpas|durian kupas)([[:space:]]|$)' then 'Durpas'
  when to_jsonb(p)->>'durian_output'='coral' or p.name ~* '^coral([[:space:]]|$)' then 'Coral'
  when p.stock_unit='kg_butir' or p.category='Buah' then 'Buah'
  when p.category in ('Makan','Makanan') then 'Makan'
  when p.category in ('Minuman','Dessert') then p.category
 end);
end
$seed$;

-- Hubungan banyak kategori per produk. Salin pilihan patch 046 hanya sekali.
create table if not exists public.md_pos_menu_category_products(
 category_id uuid not null references public.md_pos_menu_categories(id) on delete cascade,
 product_id uuid not null references public.md_pos_products(id) on delete cascade,
 primary key(category_id,product_id)
);
create index if not exists md_pos_menu_category_product_idx on public.md_pos_menu_category_products(product_id,category_id);
alter table public.md_pos_menu_category_products enable row level security;
revoke all on public.md_pos_menu_category_products from public,anon,authenticated;
do $upgrade$
begin
 if position('''posCategoryIds''' in pg_get_functiondef('public.pos_read_v8()'::regprocedure))=0 then
  insert into public.md_pos_menu_category_products(category_id,product_id)
  select pos_category_id,id from public.md_pos_products where pos_category_id is not null
  on conflict do nothing;
 end if;
end
$upgrade$;

create or replace function public.pos_menu_category_save(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 op uuid:=(payload->>'id')::uuid;target_id uuid:=(payload->>'categoryId')::uuid;
 label text:=regexp_replace(btrim(payload->>'name'),'[[:space:]]+',' ','g');
 expected_version bigint:=(payload->>'expectedVersion')::bigint;operation text:=payload->>'mode';
 target public.md_pos_menu_categories%rowtype;prior public.md_pos_events%rowtype;employee uuid;
 chosen uuid[];
begin
 if auth.uid() is null then raise exception 'Login diperlukan';end if;
 perform public.pos_require('master',null);
 select id into employee from public.md_pos_employees where user_id=auth.uid() and active;
 if employee is null then raise exception 'Akun tidak aktif';end if;
 -- Klien lama tidak boleh mengganti hubungan kategori dengan skema pemindahan.
 if operation is null or operation not in ('add','remove','rename') then raise exception 'Muat ulang POS patch 047 untuk mengelola kategori';end if;
 if op is null or target_id is null or label is null or length(label) not between 1 and 50
    or lower(label) in ('semua','belum dikategorikan') or expected_version is null or expected_version<0 then raise exception 'Data kategori tidak valid';end if;
 if jsonb_typeof(payload->'productIds') is distinct from 'array' or jsonb_array_length(payload->'productIds')>5000
    or octet_length(payload::text)>1000000 then raise exception 'Pilihan produk tidak valid atau terlalu banyak';end if;
 -- Urutan lock sama dengan penyimpanan master; pembacaan POS tetap berjalan.
 lock table public.md_pos_products in share row exclusive mode;
 lock table public.md_pos_menu_categories in share row exclusive mode;
 lock table public.md_pos_menu_category_products in share row exclusive mode;
 perform pg_catalog.pg_advisory_xact_lock(71031,hashtext(op::text));
 select * into prior from public.md_pos_events where id=op;
 if found then
  if prior.action<>'pos_category_save' or prior.actor is distinct from auth.uid() or prior.payload is distinct from payload then raise exception 'ID pengiriman sudah digunakan untuk data lain';end if;
  return public.pos_read();
 end if;
 select * into target from public.md_pos_menu_categories where id=target_id;
 if (target.id is null and (expected_version<>0 or operation<>'add')) or (target.id is not null and target.version<>expected_version) then raise exception 'Kategori sudah berubah. Tutup form dan perbarui data.';end if;
 if target.id is not null and operation<>'rename' and target.name<>label then raise exception 'Nama kategori sudah berubah. Tutup form dan perbarui data.';end if;
 if exists(select 1 from public.md_pos_menu_categories where lower(name)=lower(label) and id<>target_id) then raise exception 'Nama kategori sudah digunakan';end if;
 select coalesce(array_agg(value::uuid),array[]::uuid[]) into chosen from jsonb_array_elements_text(payload->'productIds');
 if exists(select 1 from unnest(chosen) x group by x having count(*)>1) then raise exception 'Produk dipilih lebih dari sekali';end if;
 if operation='rename' and cardinality(chosen)>0 then raise exception 'Ubah nama tidak mengubah pilihan produk';end if;
 if exists(select 1 from unnest(chosen) x left join public.md_pos_products p on p.id=x where p.id is null or (operation='add' and p.item_type not in ('direct','finished','recipe'))) then raise exception 'Pilih produk jual yang terdaftar di Master Barang';end if;
 if target.id is null then
  insert into public.md_pos_menu_categories(id,name,sort_order) values(target_id,label,(select coalesce(max(sort_order),-1)+1 from public.md_pos_menu_categories));
 elsif operation='rename' then update public.md_pos_menu_categories set name=label where id=target_id;
 end if;
 if operation='add' then
  insert into public.md_pos_menu_category_products(category_id,product_id)
  select target_id,x from unnest(chosen) x on conflict do nothing;
 elsif operation='remove' then
  delete from public.md_pos_menu_category_products cp where cp.category_id=target_id and cp.product_id=any(chosen);
 end if;
 update public.md_pos_menu_categories set version=version+1 where id=target_id;
 insert into public.md_pos_events(id,action,actor,employee_id,business_date,payload)
 values(op,'pos_category_save',auth.uid(),employee,(now() at time zone 'Asia/Jakarta')::date,payload);
 return public.pos_read();
end$$;
revoke all on function public.pos_menu_category_save(jsonb) from public,anon,authenticated;
grant execute on function public.pos_menu_category_save(jsonb) to authenticated;

-- Tambahkan metadata kecil di pembaca yang sudah ada. Tidak ada RPC kategori
-- terpisah saat login, berpindah menu, atau mengklik filter kategori.
do $read$
declare signature text;definition text;
 product_needle text:=$needle$'stockUnit',stock_unit,$needle$;
 product_replacement text:=$replacement$'stockUnit',stock_unit,'posCategoryIds',coalesce((select jsonb_agg(cp.category_id order by cp.category_id) from public.md_pos_menu_category_products cp where cp.product_id=md_pos_products.id),'[]'::jsonb),$replacement$;
 list_needle text:=$needle$'products',$needle$;
 list_replacement text:=$replacement$'posCategoryMembershipVersion',2,'posCategories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'sortOrder',c.sort_order,'version',c.version) order by c.sort_order,c.name) from public.md_pos_menu_categories c),'[]'::jsonb),'products',$replacement$;
begin
 foreach signature in array array['public.pos_read_v8()','public.pos_read_service(uuid,boolean)'] loop
  if to_regprocedure(signature) is null then
   if signature='public.pos_read_v8()' then raise exception 'Pembaca POS v8 tidak ditemukan';end if;
   continue;
  end if;
  definition:=pg_get_functiondef(to_regprocedure(signature));
  -- Kolom 046 tetap di database, tetapi tidak dipakai di JSON POS baru.
  definition:=replace(definition,'''posCategoryId'',pos_category_id,','');
  if position('''posCategoryIds''' in definition)=0 then
   if (length(definition)-length(replace(definition,product_needle,'')))/length(product_needle)<>1 then raise exception 'Format produk % belum dikenali; pemasangan dibatalkan',signature;end if;
   definition:=replace(definition,product_needle,product_replacement);
  end if;
  if position('''posCategories''' in definition)=0 then
   if (length(definition)-length(replace(definition,list_needle,'')))/length(list_needle)<>1 then raise exception 'Format kategori % belum dikenali; pemasangan dibatalkan',signature;end if;
   definition:=replace(definition,list_needle,list_replacement);
  end if;
  if position('''posCategoryMembershipVersion''' in definition)=0 then definition:=replace(definition,'''posCategories'',','''posCategoryMembershipVersion'',2,''posCategories'',');end if;
  execute definition;
 end loop;
end
$read$;
notify pgrst,'reload schema';
select c.name as kategori,count(p.product_id) as produk from public.md_pos_menu_categories c left join public.md_pos_menu_category_products p on p.category_id=c.id group by c.id,c.name,c.sort_order order by c.sort_order;
commit;

-- Maniac Duren · patch 045. Jalankan seluruh file sebelum mengunggah UI.
-- Menambah metadata kelompok; tidak menggabungkan ID, stok, batch, atau HPP.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
select pg_catalog.pg_advisory_xact_lock(71031,1103);
alter table public.md_pos_products
 add column if not exists variant_group_id uuid,
 add column if not exists variant_group_name text,
 add column if not exists variant_options jsonb not null default '[]';
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.md_pos_products'::regclass and conname='md_pos_variant_metadata_valid') then
  alter table public.md_pos_products add constraint md_pos_variant_metadata_valid check (
   (variant_group_id is null and variant_group_name is null and variant_options='[]'::jsonb) or
   (variant_group_id is not null and variant_group_name is not null and length(btrim(variant_group_name)) between 1 and 100
    and jsonb_typeof(variant_options)='array' and jsonb_array_length(variant_options) between 1 and 3));
 end if;
end$$;
create unique index if not exists md_pos_variant_combination_unique
 on public.md_pos_products(variant_group_id,lower(variant_options::text)) where variant_group_id is not null;

-- Kelompokkan master durian yang namanya tepat sesuai impor sebelumnya.
-- Kelompok yang belum lengkap dilewati; duplikat membatalkan pemasangan.
-- Pemasangan ulang tidak menimpa kelompok yang sudah disimpan.
do $seed$
declare family text; base text; prefix text; condition text; size text; full_name text;
 opts jsonb; expected jsonb; entry jsonb; ids uuid[]; gid uuid; row_id uuid;
begin
 foreach family in array array['Monthong','Bawor','Musang King','Black Thorn','Super Tembaga','Cumasi','Masmuar','Mimang','Petruk','Matahari','Lokal Mentega','Lokal Super','Lokal Premium'] loop
  foreach prefix in array array['Durian ','Durpas ','Coral ','Daging Durian '] loop
   if prefix<>'Durpas ' and family not in ('Musang King','Black Thorn') then continue;end if;
   base:=prefix||family;gid:=md5('MD_POS_VARIANTS_044:'||base)::uuid;
   if exists(select 1 from public.md_pos_products where variant_group_id=gid) then continue;end if;
   expected:='[]';ids:=array[]::uuid[];
   foreach condition in array (case when family in ('Musang King','Black Thorn') then array['Fresh','Nitrogen'] else array[''] end) loop
    foreach size in array (case when prefix='Durpas ' then array['500 gr','1 kg'] else array[''] end) loop
     opts:='[]';full_name:=base;
     if condition<>'' then opts:=opts||jsonb_build_array(jsonb_build_object('name','Kondisi','value',condition));full_name:=full_name||' '||condition;end if;
     if size<>'' then opts:=opts||jsonb_build_array(jsonb_build_object('name','Ukuran','value',size));full_name:=full_name||' '||size;end if;
     expected:=expected||jsonb_build_array(jsonb_build_object('name',full_name,'options',opts));
    end loop;
   end loop;
   for entry in select value from jsonb_array_elements(expected) loop
    if (select count(*) from public.md_pos_products where lower(btrim(name))=lower(entry->>'name'))>1 then raise exception 'Nama master ganda: %',entry->>'name';end if;
    select id into row_id from public.md_pos_products where name=entry->>'name' and variant_group_id is null
     and item_type=case when prefix='Durian ' then 'direct' else 'finished' end
     and stock_unit=case when prefix='Durian ' then 'kg_butir' when prefix='Durpas ' then 'pcs' else 'kg' end
     and category=case when prefix='Durian ' then 'Buah' else 'Olahan Duren' end;
    if row_id is null then exit;end if;
    ids:=array_append(ids,row_id);
   end loop;
   if cardinality(ids)<>jsonb_array_length(expected) then continue;end if;
   for entry in select value from jsonb_array_elements(expected) loop
    update public.md_pos_products set variant_group_id=gid,variant_group_name=base,variant_options=entry->'options'
    where id=any(ids) and name=entry->>'name';
   end loop;
  end loop;
 end loop;
end
$seed$;

-- Identitas varian tetap konsisten saat diedit satu per satu.
-- Guard berlaku juga untuk klien lama/API; harga, SKU, barcode, foto boleh diedit.
create or replace function public.pos_variant_identity_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.variant_group_id is not null and
   (new.name is distinct from old.name or new.variant is distinct from old.variant
    or new.item_type is distinct from old.item_type or new.stock_unit is distinct from old.stock_unit
    or new.category is distinct from old.category or new.variant_group_id is distinct from old.variant_group_id
    or new.variant_group_name is distinct from old.variant_group_name or new.variant_options is distinct from old.variant_options) then
  raise exception 'Identitas varian sudah terdaftar. Edit harga, SKU, barcode, atau foto pada varian tersebut.';
 end if;
 return new;
end$$;
revoke all on function public.pos_variant_identity_guard() from public,anon,authenticated;
drop trigger if exists md_pos_variant_identity_guard on public.md_pos_products;
create trigger md_pos_variant_identity_guard before update on public.md_pos_products for each row execute function public.pos_variant_identity_guard();

-- RPC atomik: seluruh varian berhasil atau seluruh perubahan dibatalkan.
-- Hanya satu pos_read di akhir; tidak membaca data outlet untuk setiap SKU.
-- Satu validator privat digunakan untuk opsi produk lama maupun varian baru.
create or replace function public.pos_variant_option_labels(options jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare opt jsonb;names jsonb:='[]';seen text[]:=array[]::text[];suffix text:='';label text:='';
begin
 if jsonb_typeof(options) is distinct from 'array' or jsonb_array_length(options) not between 1 and 3 then raise exception 'Isi 1–3 pilihan varian';end if;
 for opt in select value from jsonb_array_elements(options) loop
  if jsonb_typeof(opt) is distinct from 'object' then raise exception 'Pilihan varian tidak valid';end if;
  if jsonb_typeof(opt->'name') is distinct from 'string' or jsonb_typeof(opt->'value') is distinct from 'string'
     or length(btrim(opt->>'name')) not between 1 and 30 or length(btrim(opt->>'value')) not between 1 and 40
     or opt->>'name'<>btrim(opt->>'name') or opt->>'value'<>btrim(opt->>'value')
     or lower(opt->>'name')=any(seen) or (select count(*) from jsonb_object_keys(opt))<>2 then raise exception 'Nama atau nilai pilihan varian tidak valid';end if;
  seen:=array_append(seen,lower(opt->>'name'));names:=names||jsonb_build_array(lower(opt->>'name'));
  suffix:=suffix||case when suffix='' then '' else ' ' end||(opt->>'value');
  label:=label||case when label='' then '' else ' / ' end||(opt->>'value');
 end loop;
 if length(label)>100 then raise exception 'Keterangan varian maksimal 100 karakter';end if;
 return jsonb_build_object('suffix',suffix,'label',label,'names',names);
end$$;
revoke all on function public.pos_variant_option_labels(jsonb) from public,anon,authenticated;

create or replace function public.pos_product_variants_save(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 op uuid:=(payload->>'id')::uuid;gid uuid:=(payload->>'groupId')::uuid;
 base text:=btrim(payload->>'name');entry jsonb;options jsonb;option_names jsonb;group_option_names jsonb;
 full_name text;label text;pid uuid;v_barcode text;
 current_ids jsonb;expected_ids jsonb;group_row public.md_pos_products%rowtype;
 source_row public.md_pos_products%rowtype;source_expected jsonb;labels jsonb;
 employee uuid;prior public.md_pos_events%rowtype;first_type text;first_unit text;first_category text;
begin
 if auth.uid() is null then raise exception 'Login diperlukan';end if;
 perform public.pos_require('master',null);
 select id into employee from public.md_pos_employees where user_id=auth.uid() and active;
 if employee is null then raise exception 'Akun tidak aktif';end if;
 if op is null or gid is null or base is null or length(base) not between 1 and 100 then raise exception 'ID dan nama barang wajib';end if;
 if jsonb_typeof(payload->'variants') is distinct from 'array' or jsonb_typeof(payload->'expectedIds') is distinct from 'array'
    or jsonb_array_length(payload->'variants') not between 1 and 60 or jsonb_array_length(payload->'expectedIds')>60
    or octet_length(payload::text)>200000 then raise exception 'Daftar varian tidak valid atau terlalu besar';end if;
 -- Menserialkan penambahan SKU terhadap penulisan master biasa; tidak mengunci pembacaan.
 lock table public.md_pos_products in share row exclusive mode;
 perform pg_catalog.pg_advisory_xact_lock(71031,hashtext(op::text));
 select * into prior from public.md_pos_events where id=op;
 if found then
  if prior.action<>'product_variants_save' or prior.actor is distinct from auth.uid() or prior.payload is distinct from payload then raise exception 'ID pengiriman sudah digunakan untuk data lain';end if;
  return public.pos_read();
 end if;
 -- MD_POS_EXISTING_VARIANTS_045: enroll one existing product without rewriting it.
 if payload ? 'adopt' then
  if jsonb_typeof(payload->'adopt') is distinct from 'object' or jsonb_typeof(payload#>'{adopt,expected}') is distinct from 'object' then raise exception 'Data barang asal tidak valid';end if;
  select * into source_row from public.md_pos_products where id=(payload#>>'{adopt,productId}')::uuid for update;
  if not found or source_row.variant_group_id is not null then raise exception 'Barang sudah berubah atau sudah memiliki varian. Perbarui data.';end if;
  source_expected:=jsonb_build_object('name',source_row.name,'sku',source_row.sku,'variant',source_row.variant,'itemType',source_row.item_type,'stockUnit',source_row.stock_unit,'category',source_row.category);
  if source_expected is distinct from payload#>'{adopt,expected}' then raise exception 'Barang sudah berubah. Tutup form dan perbarui data.';end if;
  if exists(select 1 from public.md_pos_products where variant_group_id=gid or lower(variant_group_name)=lower(base)) then raise exception 'Kelompok barang sudah ada. Gunakan Tambah varian pada barang tersebut.';end if;
  options:=payload#>'{adopt,variantOptions}';
  perform public.pos_variant_option_labels(options);
  update public.md_pos_products set variant_group_id=gid,variant_group_name=base,variant_options=options where id=source_row.id;
 end if;
 select coalesce(jsonb_agg(id::text order by id::text),'[]') into current_ids from public.md_pos_products where variant_group_id=gid;
 select coalesce(jsonb_agg(value order by value),'[]') into expected_ids from jsonb_array_elements_text(payload->'expectedIds');
 if current_ids<>expected_ids then raise exception 'Daftar varian sudah berubah. Tutup form dan perbarui data.';end if;
 if jsonb_array_length(current_ids)+jsonb_array_length(payload->'variants')>60 then raise exception 'Maksimal 60 varian per barang';end if;
 select * into group_row from public.md_pos_products where variant_group_id=gid limit 1;
 if group_row.id is not null then
  if group_row.variant_group_name<>base then raise exception 'Nama kelompok varian tidak sesuai';end if;
  first_type:=group_row.item_type;first_unit:=group_row.stock_unit;first_category:=group_row.category;
  select jsonb_agg(lower(value->>'name') order by n) into group_option_names from jsonb_array_elements(group_row.variant_options) with ordinality t(value,n);
 elsif exists(select 1 from public.md_pos_products where lower(variant_group_name)=lower(base)) then
  raise exception 'Kelompok barang sudah ada. Gunakan Tambah varian pada barang tersebut.';
 end if;
 for entry in select value from jsonb_array_elements(payload->'variants') loop
  pid:=(entry->>'id')::uuid;v_barcode:=btrim(coalesce(entry->>'barcode',''));
  if pid is null or exists(select 1 from public.md_pos_products where id=pid) then raise exception 'ID barang sudah digunakan atau tidak valid';end if;
  if coalesce(entry->>'photo','')<>'' or entry ? 'stock' then raise exception 'Foto dan stok dicatat terpisah setelah varian dibuat';end if;
  if v_barcode<>'' and exists(select 1 from public.md_pos_products where lower(btrim(md_pos_products.barcode))=lower(v_barcode)) then raise exception 'Barcode % sudah digunakan',v_barcode;end if;
  options:=entry->'variantOptions';labels:=public.pos_variant_option_labels(options);
  full_name:=base||' '||(labels->>'suffix');label:=labels->>'label';option_names:=labels->'names';
  if group_option_names is null then group_option_names:=option_names;end if;
  if option_names<>group_option_names then raise exception 'Urutan dan nama pilihan varian harus sama';end if;
  if entry->>'name' is distinct from full_name or entry->>'variant' is distinct from label then raise exception 'Nama lengkap varian tidak sesuai pilihan';end if;
  if first_type is null then first_type:=entry->>'itemType';first_unit:=entry->>'stockUnit';first_category:=entry->>'category';end if;
  if entry->>'itemType' is distinct from first_type or entry->>'stockUnit' is distinct from first_unit or entry->>'category' is distinct from first_category then raise exception 'Jenis, kategori, dan satuan seluruh varian harus sama';end if;
  if exists(select 1 from public.md_pos_products where variant_group_id=gid and lower(variant_options::text)=lower(options::text)) then raise exception 'Kombinasi varian sudah ada';end if;
  perform public.pos_save_product(entry,false);
  perform public.pos_save_product_details(entry);
  update public.md_pos_products set variant_group_id=gid,variant_group_name=base,variant_options=options where id=pid;
 end loop;
 insert into public.md_pos_events(id,action,actor,employee_id,business_date,payload)
 values(op,'product_variants_save',auth.uid(),employee,(now() at time zone 'Asia/Jakarta')::date,payload);
 return public.pos_read();
end$$;
revoke all on function public.pos_product_variants_save(jsonb) from public,anon,authenticated;
grant execute on function public.pos_product_variants_save(jsonb) to authenticated;

-- Tambahkan metadata kecil pada pembaca yang sudah ada tanpa RPC baru saat login.
do $read$
declare signature text;definition text;
 needle text:=$needle$'stockUnit',stock_unit,$needle$;
 replacement text:=$replacement$'stockUnit',stock_unit,'variantGroupId',variant_group_id,'variantGroupName',variant_group_name,'variantOptions',variant_options,$replacement$;
begin
 foreach signature in array array['public.pos_read_v8()','public.pos_read_service(uuid,boolean)'] loop
  if to_regprocedure(signature) is null then
   if signature='public.pos_read_v8()' then raise exception 'Pembaca POS v8 tidak ditemukan';end if;
   continue;
  end if;
  definition:=pg_get_functiondef(to_regprocedure(signature));
  if position('''variantGroupId'',variant_group_id' in definition)>0 then continue;end if;
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Format % belum dikenali. Pemasangan dibatalkan.',signature;end if;
  execute replace(definition,needle,replacement);
 end loop;
end
$read$;
notify pgrst,'reload schema';
select count(distinct variant_group_id) as kelompok_varian,count(*) filter(where variant_group_id is not null) as barang_dalam_kelompok from public.md_pos_products;
commit;

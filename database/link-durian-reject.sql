-- Maniac Duren: hasil Olah Reject mengikuti durian asal (patch 043).
-- Jalankan seluruh file setelah impor 75 produk durian dan turunannya.
-- Tidak mengubah stok, harga, riwayat, role, atau konfigurasi login.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select pg_catalog.pg_advisory_xact_lock(71031,1102);

alter table public.md_pos_products
  add column if not exists durian_source_id uuid,
  add column if not exists durian_output text;

do $constraints$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.md_pos_products'::regclass and conname='md_pos_durian_source_fk') then
    alter table public.md_pos_products add constraint md_pos_durian_source_fk
      foreign key(durian_source_id) references public.md_pos_products(id);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.md_pos_products'::regclass and conname='md_pos_durian_output_valid') then
    alter table public.md_pos_products add constraint md_pos_durian_output_valid check (
      (durian_source_id is null and durian_output is null) or
      (durian_source_id is not null and durian_source_id<>id and durian_output is not null
       and durian_output in ('durpas500','durpas1000','coral','daging')
       and item_type in ('finished','direct') and category is not null and category='Olahan Duren'
       and stock_unit=case when durian_output in ('durpas500','durpas1000') then 'pcs' else 'kg' end)
    );
  end if;
end
$constraints$;
create unique index if not exists md_pos_durian_output_unique
  on public.md_pos_products(durian_source_id,durian_output) where durian_source_id is not null;

-- Pencocokan nama/SKU hanya dilakukan pada pemasangan pertama. Setelahnya ID
-- menjaga hubungan saat nama/SKU diubah. Pemasangan ulang tidak menimpa hubungan.
do $link$
declare
  family record; spec record; source_ids uuid[]; output_ids uuid[];
  source_row public.md_pos_products%rowtype; output_row public.md_pos_products%rowtype;
  expected_name text; expected_sku text;
begin
  if to_regprocedure('public.pos_waste_action(text,jsonb)') is null then
    raise exception 'Fungsi Olah Reject belum tersedia';
  end if;
  if position('MD_POS_REJECT_FAMILY_043' in pg_get_functiondef('public.pos_waste_action(text,jsonb)'::regprocedure))>0 then return; end if;
  for family in select * from (values
    ('MONTHONG','Monthong'),('BAWOR','Bawor'),
    ('MK-FRESH','Musang King Fresh'),('MK-NITROGEN','Musang King Nitrogen'),
    ('BT-FRESH','Black Thorn Fresh'),('BT-NITROGEN','Black Thorn Nitrogen'),
    ('SUPER-TEMBAGA','Super Tembaga'),('CUMASI','Cumasi'),('MASMUAR','Masmuar'),
    ('MIMANG','Mimang'),('PETRUK','Petruk'),('MATAHARI','Matahari'),
    ('LOKAL-MENTEGA','Lokal Mentega'),('LOKAL-SUPER','Lokal Super'),('LOKAL-PREMIUM','Lokal Premium')
  ) v(code,name) loop
    expected_name:='Durian '||family.name; expected_sku:='MD-'||family.code||'-BUAH';
    select array_agg(id) into source_ids from public.md_pos_products
      where lower(btrim(sku))=lower(expected_sku)
         or lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g'))=lower(expected_name);
    if coalesce(cardinality(source_ids),0)<>1 then
      raise exception 'Master "%" tidak ditemukan / ganda. Jalankan import-durian-dan-turunan.sql dan periksa duplikat.',expected_name;
    end if;
    select * into strict source_row from public.md_pos_products where id=source_ids[1];
    if source_row.item_type<>'direct' or source_row.stock_unit<>'kg_butir' or source_row.category is distinct from 'Buah'
       or lower(regexp_replace(btrim(source_row.name),'[[:space:]]+',' ','g'))<>lower(expected_name) then
      raise exception 'Master durian asal tidak sesuai: %',expected_name;
    end if;
    for spec in select * from (values
      ('durpas500','DP500','Durpas ',' 500 gr','pcs'),
      ('durpas1000','DP1KG','Durpas ',' 1 kg','pcs'),
      ('coral','CORAL','Coral ','','kg'),
      ('daging','DAGING','Daging Durian ','','kg')
    ) v(key,code,prefix,suffix,unit) loop
      expected_name:=spec.prefix||family.name||spec.suffix;
      expected_sku:='MD-'||family.code||'-'||spec.code;
      select array_agg(id) into output_ids from public.md_pos_products
        where lower(btrim(sku))=lower(expected_sku)
           or lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g'))=lower(expected_name);
      if coalesce(cardinality(output_ids),0)<>1 then
        raise exception 'Master hasil "%" tidak ditemukan / ganda. Jalankan import-durian-dan-turunan.sql dan periksa duplikat.',expected_name;
      end if;
      select * into strict output_row from public.md_pos_products where id=output_ids[1];
      if output_row.item_type not in ('finished','direct') or output_row.stock_unit<>spec.unit
         or output_row.category is distinct from 'Olahan Duren'
         or lower(regexp_replace(btrim(output_row.name),'[[:space:]]+',' ','g'))<>lower(expected_name) then
        raise exception 'Master hasil tidak sesuai: %',expected_name;
      end if;
      if output_row.durian_source_id is not null and
         (output_row.durian_source_id<>source_row.id or output_row.durian_output is distinct from spec.key) then
        raise exception 'Produk % sudah terhubung ke durian / jenis hasil lain',expected_name;
      end if;
      update public.md_pos_products set durian_source_id=source_row.id,durian_output=spec.key where id=output_row.id;
    end loop;
  end loop;
end
$link$;

-- Helper internal; hanya dipakai melalui mutasi yang telah memeriksa akses.
create or replace function public.pos_waste_output_product(source_product uuid,output_key text)
returns uuid language plpgsql stable set search_path='' as $function$
declare p public.md_pos_products%rowtype; target public.md_pos_products%rowtype; expected_unit text;
begin
  select * into p from public.md_pos_products where id=source_product;
  if not found or p.item_type<>'direct' or p.stock_unit<>'kg_butir' then raise exception 'Pilih durian asal yang valid';end if;
  if output_key is null or output_key not in ('durpas500','durpas1000','coral') then raise exception 'Jenis hasil reject tidak valid';end if;
  expected_unit:=case when output_key='coral' then 'kg' else 'pcs' end;
  select * into target from public.md_pos_products where durian_source_id=source_product and durian_output=output_key;
  if not found then raise exception 'Master hasil % untuk % belum dihubungkan. Periksa master turunan durian.',output_key,p.name;end if;
  if target.item_type not in ('finished','direct') or target.stock_unit<>expected_unit or target.category is distinct from 'Olahan Duren' then
    raise exception 'Jenis atau satuan hasil olahan untuk % tidak sesuai',p.name;
  end if;
  return target.id;
end
$function$;
revoke all on function public.pos_waste_output_product(uuid,text) from public,anon,authenticated;

-- Tambahkan dua metadata kecil pada pembacaan produk yang sudah ada.
-- Tidak membuat RPC tambahan dari browser atau membangun ulang seluruh JSON foto.
do $read$
declare signature text; definition text;
  needle text:=$needle$'stockUnit',stock_unit,$needle$;
  addition text:=$replacement$'stockUnit',stock_unit,'durianSourceId',durian_source_id,'durianOutput',durian_output,$replacement$;
begin
  foreach signature in array array['public.pos_read_v8()','public.pos_read_service(uuid,boolean)'] loop
    if to_regprocedure(signature) is null then
      if signature='public.pos_read_v8()' then raise exception 'Pembaca POS v8 tidak ditemukan';end if;
      continue;
    end if;
    definition:=pg_get_functiondef(to_regprocedure(signature));
    if position('''durianSourceId'',durian_source_id' in definition)>0 then continue;end if;
    if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
      raise exception 'Format % belum dikenali. Pemasangan dibatalkan tanpa perubahan.',signature;
    end if;
    execute replace(definition,needle,addition);
  end loop;
end
$read$;

-- Pasang validasi di fungsi inti yang dipakai jalur 027 maupun jalur POS baru.
-- Retry transaksi lama kembali sebelum pemeriksaan ini; pembatalan tetap memakai
-- ID hasil pada snapshot lama, sehingga riwayat produk umum tetap dapat dibatalkan.
do $guard$
declare definition text;
  needle text:=$needle$v_seen:=array_append(v_seen,v_output.id);$needle$;
  addition text:=$replacement$-- MD_POS_REJECT_FAMILY_043
   if v_output.id is distinct from public.pos_waste_output_product(v_source.product_id,v_spec.key) then
    raise exception 'Produk hasil tidak sesuai durian asal / ukuran kemasan. Perbarui halaman Olah Reject.';
   end if;
   v_seen:=array_append(v_seen,v_output.id);$replacement$;
begin
  definition:=pg_get_functiondef('public.pos_waste_action(text,jsonb)'::regprocedure);
  if position('MD_POS_REJECT_FAMILY_043' in definition)=0 then
    if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
      raise exception 'Format fungsi Olah Reject belum dikenali. Pemasangan dibatalkan tanpa perubahan.';
    end if;
    execute replace(definition,needle,addition);
  end if;
end
$guard$;
revoke all on function public.pos_waste_action(text,jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';

select count(distinct durian_source_id) as jenis_durian,
       count(*) filter(where durian_output in ('durpas500','durpas1000','coral')) as hasil_olah_reject,
       count(*) filter(where durian_output='daging') as master_daging
from public.md_pos_products where durian_source_id is not null;
commit;

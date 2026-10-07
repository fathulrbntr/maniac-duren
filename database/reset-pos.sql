-- RESET DATA POS MANIAC DUREN
-- Jalankan di Supabase SQL Editor pada database POS yang sudah memiliki schema.
-- Struktur tabel, function, RPC, RLS, index, dan auth.users TIDAK dihapus.
-- Semua data tabel public.md_pos_* akan dikosongkan.
-- Satu akun owner dapat dipertahankan dengan mengganti email di bawah.

begin;

-- Akun owner yang dipertahankan saat reset POS.
-- Jika email ini berubah, ubah hanya nilai admin_email di bawah.
do $$
declare
  admin_email text := 'fathulrbntr@gmail.com';
  t record;
  admin_id uuid;
begin
  select id into admin_id
  from auth.users
  where lower(email) = lower(admin_email)
  limit 1;

  if admin_id is null then
    raise exception 'Akun owner dengan email % tidak ditemukan di auth.users.', admin_email;
  end if;

  -- Hapus seluruh data POS tanpa menyentuh tabel customer/menu atau auth.users.
  -- CASCADE diperlukan karena banyak tabel POS saling memiliki foreign key.
  for t in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename like 'md_pos_%'
  loop
    execute format('truncate table public.%I restart identity cascade', t.tablename);
  end loop;

  -- Kembalikan akses POS hanya kepada akun owner tersebut.
  insert into public.md_pos_staff(user_id)
  values (admin_id)
  on conflict (user_id) do nothing;

  -- Pulihkan profil employee owner agar dashboard/permission POS langsung dapat dipakai.
  -- Tabel ini tersedia pada schema POS terintegrasi.
  if to_regclass('public.md_pos_employees') is not null then
    insert into public.md_pos_employees(id,user_id,name,email,role,active,store_ids,permissions)
    values (admin_id,admin_id,coalesce(nullif(split_part(admin_email,'@',1),''),'Owner'),admin_email,'owner',true,'{}','{stock,produce,waste,sell,kitchen,reports,finance,trace,master,attendance,cancel,employees}')
    on conflict (id) do update set
      user_id=excluded.user_id, name=excluded.name, email=excluded.email, role='owner',
      active=true, store_ids='{}', permissions=excluded.permissions;
  end if;

  raise notice 'POS reset selesai. Owner yang dipertahankan: %', admin_email;
end $$;

commit;

-- Verifikasi setelah reset:
select 'stores' as table_name, count(*) as rows from public.md_pos_stores
union all select 'suppliers', count(*) from public.md_pos_suppliers
union all select 'products', count(*) from public.md_pos_products
union all select 'lots', count(*) from public.md_pos_lots
union all select 'sales', count(*) from public.md_pos_sales
union all select 'sale_items', count(*) from public.md_pos_sale_items
union all select 'movements', count(*) from public.md_pos_movements
union all select 'recipes', count(*) from public.md_pos_recipes
union all select 'productions', count(*) from public.md_pos_productions
union all select 'waste_runs', count(*) from public.md_pos_waste_runs
union all select 'employees', count(*) from public.md_pos_employees
union all select 'attendance', count(*) from public.md_pos_attendance
union all select 'money_journal', count(*) from public.md_pos_money_journal
order by table_name;

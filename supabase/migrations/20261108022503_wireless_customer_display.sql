-- Tablet customer display. No order/payment writes and no anonymous table access.
create table if not exists public.md_pos_customer_displays (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.md_pos_stores(id) on delete cascade,
  pair_hash text not null unique,
  pair_expires_at timestamptz not null default (now() + interval '5 minutes'),
  viewer_hash text unique,
  verification_code text,
  approved boolean not null default false,
  revoked boolean not null default false,
  payload jsonb,
  seq bigint not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours')
);
create index if not exists md_pos_customer_displays_owner_idx on public.md_pos_customer_displays(owner_id, created_at);
create index if not exists md_pos_customer_displays_store_idx on public.md_pos_customer_displays(store_id);
create index if not exists md_pos_customer_displays_expiry_idx on public.md_pos_customer_displays(expires_at);
create table if not exists public.md_pos_display_pair_limits (
  bucket text primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 1
);
alter table public.md_pos_customer_displays enable row level security;
alter table public.md_pos_display_pair_limits enable row level security;
revoke all on public.md_pos_customer_displays, public.md_pos_display_pair_limits from public, anon, authenticated;
grant select, insert, update, delete on public.md_pos_customer_displays, public.md_pos_display_pair_limits to service_role;

create or replace function public.pos_display_snapshot(p jsonb, store_name text) returns jsonb
language plpgsql immutable security invoker set search_path = '' as $$
declare lines jsonb; l jsonb; q jsonb := null; k text;
begin
  if p is null or p = 'null'::jsonb then return null; end if;
  if jsonb_typeof(p) <> 'object' or octet_length(p::text) > 65536
    or jsonb_typeof(p->'lines') is distinct from 'array' then raise exception 'Invalid display snapshot'; end if;
  if jsonb_array_length(p->'lines') > 200 then raise exception 'Too many display lines'; end if;
  if coalesce(p->>'phase','') not in ('cart','payment','confirming','uncertain','expired','paid') then raise exception 'Invalid display phase'; end if;
  foreach k in array array['subtotal','discount','total'] loop
    if jsonb_typeof(p->k) is distinct from 'number' or (p->>k)::numeric < 0 or (p->>k)::numeric > 1e12 then raise exception 'Invalid display amount'; end if;
  end loop;
  lines := '[]'::jsonb;
  for l in select value from jsonb_array_elements(p->'lines') loop
    foreach k in array array['qty','price','subtotal'] loop
      if jsonb_typeof(l->k) is distinct from 'number' or (l->>k)::numeric < 0 or (l->>k)::numeric > 1e12 then raise exception 'Invalid display line'; end if;
    end loop;
    lines := lines || jsonb_build_array(jsonb_build_object('name',left(l->>'name',120),'qty',l->'qty',
      'unit',left(l->>'unit',12),'price',l->'price','subtotal',l->'subtotal'));
  end loop;
  if p->>'phase' = 'payment' and coalesce(p->>'demo','false') = 'false' and jsonb_typeof(p->'qr') = 'object' then
    if length(p->'qr'->>'payload') > 2953 or jsonb_typeof(p->'qr'->'expiresAt') is distinct from 'number' then raise exception 'Invalid display QR'; end if;
    q := jsonb_build_object('payload',p->'qr'->>'payload','expiresAt',p->'qr'->'expiresAt');
  end if;
  return jsonb_build_object('phase',p->>'phase','demo',coalesce(p->>'demo','false') = 'true',
    'store',left(store_name,120),'table',left(p->>'table',60),'lines',lines,
    'subtotal',p->'subtotal','discount',p->'discount','total',p->'total','payment',left(p->>'payment',60),'qr',q);
end $$;
revoke all on function public.pos_display_snapshot(jsonb,text) from public, anon, authenticated;

create or replace function public.pos_customer_display_host(p_action text, p_store uuid, p_session uuid, p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.md_pos_customer_displays%rowtype; code text; snap jsonb; next_seq bigint;
begin
  if auth.uid() is null then raise exception 'Login kasir diperlukan'; end if;
  if p_action <> 'stop' and not public.pos_allowed('sell',p_store) then raise exception 'Hak akses kasir diperlukan'; end if;
  if p_action = 'create' then
    code := upper(p_data->>'code');
    if p_session is null or code is null or code !~ '^[A-F0-9]{10}$' then raise exception 'Kode pasangan tidak valid'; end if;
    perform pg_advisory_xact_lock(hashtextextended('customer-display:' || auth.uid()::text, 0));
    delete from public.md_pos_customer_displays where expires_at < now() - interval '1 day';
    select * into d from public.md_pos_customer_displays where id = p_session;
    if found then
      if d.owner_id <> auth.uid() or d.store_id <> p_store or d.revoked or d.expires_at <= now()
        or d.pair_hash <> encode(sha256(convert_to(code,'UTF8')),'hex') then raise exception 'Sesi tidak tersedia'; end if;
    else
      if (select count(*) from public.md_pos_customer_displays where owner_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
        raise exception 'Terlalu banyak kode baru. Coba lagi nanti';
      end if;
      insert into public.md_pos_customer_displays(id,owner_id,store_id,pair_hash)
        values(p_session,auth.uid(),p_store,encode(sha256(convert_to(code,'UTF8')),'hex')) returning * into d;
    end if;
  else
    select * into d from public.md_pos_customer_displays where id = p_session and owner_id = auth.uid() and store_id = p_store for update;
    if not found then raise exception 'Sesi layar pelanggan tidak ditemukan'; end if;
    if p_action = 'stop' then
      update public.md_pos_customer_displays set revoked=true, payload=null, viewer_hash=null where id=d.id;
      return jsonb_build_object('status','closed');
    end if;
    if d.revoked or d.expires_at <= now() then return jsonb_build_object('status','closed'); end if;
    if p_action = 'publish' then
      next_seq := (p_data->>'seq')::bigint;
      if next_seq is null or next_seq < 1 then raise exception 'Invalid sequence'; end if;
      if next_seq > d.seq then
        snap := public.pos_display_snapshot(p_data->'snapshot',(select name from public.md_pos_stores where id = d.store_id));
        if (snap->'qr'->>'expiresAt')::numeric > extract(epoch from now())*1000+180000 then
          snap := jsonb_set(snap,'{qr,expiresAt}',to_jsonb(floor(extract(epoch from now())*1000+180000)));
        end if;
        update public.md_pos_customer_displays set payload=snap,seq=next_seq,updated_at=clock_timestamp() where id=d.id returning * into d;
      end if;
    elsif p_action = 'approve' then
      if d.viewer_hash is null or d.pair_expires_at <= now() or p_data->>'verificationCode' is distinct from d.verification_code then
        raise exception 'Kode verifikasi tablet tidak sesuai atau kedaluwarsa';
      end if;
      update public.md_pos_customer_displays set approved=true where id=d.id returning * into d;
    elsif p_action <> 'status' then raise exception 'Aksi layar pelanggan tidak dikenal'; end if;
  end if;
  return jsonb_build_object('status',case when d.approved then 'connected' when d.pair_expires_at <= now() then 'expired' when d.viewer_hash is not null then 'pending' else 'waiting' end,
    'verificationCode',d.verification_code,'pairExpiresAt',floor(extract(epoch from d.pair_expires_at)*1000),'expiresAt',floor(extract(epoch from d.expires_at)*1000));
end $$;
revoke all on function public.pos_customer_display_host(text,uuid,uuid,jsonb) from public, anon;
grant execute on function public.pos_customer_display_host(text,uuid,uuid,jsonb) to authenticated;

-- Keep employee rows private even from the display relay. Return only active status.
create or replace function public.pos_display_owner_active(p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.md_pos_employees where user_id=p_owner and active);
$$;
revoke all on function public.pos_display_owner_active(uuid) from public, anon, authenticated;
grant execute on function public.pos_display_owner_active(uuid) to service_role;

-- Only the server API may call this function. Tablet tokens cannot call host RPCs.
create or replace function public.pos_customer_display_viewer(p_action text, p_code text default null, p_token text default null, p_bucket text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare d public.md_pos_customer_displays%rowtype; n integer; token text; snap jsonb;
begin
  if p_action = 'pair' then
    if p_bucket is null or p_bucket !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','unavailable'); end if;
    delete from public.md_pos_display_pair_limits where window_start < now() - interval '1 day';
    insert into public.md_pos_display_pair_limits as limits(bucket) values(p_bucket)
    on conflict (bucket) do update set
      attempts=case when limits.window_start < now() - interval '1 minute' then 1 else limits.attempts+1 end,
      window_start=case when limits.window_start < now() - interval '1 minute' then now() else limits.window_start end
    returning attempts into n;
    if n > 8 then return jsonb_build_object('status','rate_limited'); end if;
    select * into d from public.md_pos_customer_displays
      where pair_hash=encode(sha256(convert_to(upper(p_code),'UTF8')),'hex')
      and not revoked and viewer_hash is null and pair_expires_at > now() and expires_at > now() for update;
    if not found then return jsonb_build_object('status','unavailable'); end if;
    token := replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','');
    update public.md_pos_customer_displays set viewer_hash=encode(sha256(convert_to(token,'UTF8')),'hex'),
      verification_code=upper(left(replace(gen_random_uuid()::text,'-',''),6)) where id=d.id returning * into d;
    return jsonb_build_object('status','pending','token',token,'verificationCode',d.verification_code);
  elsif p_action not in ('poll','leave') then return jsonb_build_object('status','unavailable'); end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','gone'); end if;
  select * into d from public.md_pos_customer_displays where viewer_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and not revoked and expires_at > now();
  if not found then return jsonb_build_object('status','gone'); end if;
  if p_action = 'leave' then
    update public.md_pos_customer_displays set revoked=true,payload=null,viewer_hash=null where id=d.id;
    return jsonb_build_object('status','gone');
  end if;
  if not public.pos_display_owner_active(d.owner_id) then return jsonb_build_object('status','gone'); end if;
  if not d.approved then
    if d.pair_expires_at <= now() then return jsonb_build_object('status','gone'); end if;
    return jsonb_build_object('status','pending','verificationCode',d.verification_code);
  end if;
  snap := case when d.updated_at > now() - interval '15 seconds' then d.payload else null end;
  if (snap->'qr'->>'expiresAt')::numeric <= extract(epoch from now())*1000 then
    snap := jsonb_set(jsonb_set(snap,'{qr}','null'),'{phase}','"expired"');
  end if;
  return jsonb_build_object('status','connected','snapshot',snap,'seq',d.seq,
    'serverNow',floor(extract(epoch from clock_timestamp())*1000),'updatedAt',floor(extract(epoch from d.updated_at)*1000));
end $$;
revoke all on function public.pos_customer_display_viewer(text,text,text,text) from public, anon, authenticated;
grant execute on function public.pos_customer_display_viewer(text,text,text,text) to service_role;

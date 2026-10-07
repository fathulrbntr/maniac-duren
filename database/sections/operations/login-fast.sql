-- 023: one server-only RPC for login limits and identity; no stock changes.
begin;
create index if not exists md_pos_login_attempts_started_at_idx on public.md_pos_login_attempts(started_at);
create index if not exists md_pos_employees_login_email_idx on public.md_pos_employees(lower(email)) where active and user_id is not null;
create index if not exists md_pos_employees_login_phone_idx on public.md_pos_employees(public.pos_phone_key(phone)) where active and user_id is not null;
create or replace function public.pos_login_prepare(identifier text, ip_bucket text, login_bucket text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ip_ok boolean;account_ok boolean;target jsonb;
begin
 if ip_bucket is null or login_bucket is null or ip_bucket !~ '^ip:[a-f0-9]{64}$' or login_bucket !~ '^login:[a-f0-9]{64}$' then
  return jsonb_build_object('allowed',false);
 end if;
 ip_ok:=public.pos_login_throttle(ip_bucket);
 account_ok:=public.pos_login_throttle(login_bucket);
 if not ip_ok or not account_ok then return jsonb_build_object('allowed',false);end if;
 target:=public.pos_login_identity(identifier);
 return jsonb_build_object('allowed',true,'target',target);
end$$;
revoke all on function public.pos_login_prepare(text,text,text) from public,anon,authenticated;
grant execute on function public.pos_login_prepare(text,text,text) to service_role;
notify pgrst,'reload schema';
commit;

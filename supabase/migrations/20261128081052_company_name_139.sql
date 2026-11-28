-- Rename the company in the installed financial validation messages.
begin;
set local lock_timeout = '5s';
do $$
declare
  routine regprocedure;
  definition text;
begin
  foreach routine in array array[
    'md_supply.require_retail_balance(date,numeric)'::regprocedure,
    'public.pos_admin_mutate_before_107(text,jsonb)'::regprocedure
  ] loop
    definition := pg_get_functiondef(routine);
    if strpos(definition,'PT Retail') > 0 then
      execute replace(definition,'PT Retail','PT. Altara Rasa Nusantara');
    elsif strpos(definition,'PT. Altara Rasa Nusantara') = 0 then
      raise exception 'Nama perusahaan tidak ditemukan di %', routine;
    end if;
  end loop;
end$$;
commit;

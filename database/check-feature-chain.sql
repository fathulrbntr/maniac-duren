-- Read-only diagnostic; does not install, reset or alter anything.
-- Version markers are evidence of installation, not proof against later RPC replacement.
select version from public.md_pos_schema_versions order by version;

select signature, to_regprocedure(signature) is not null as available
from (values
 ('public.pos_read()'),
 ('public.pos_mutate_027(text,jsonb)'),
 ('public.pos_product_variants_save(jsonb)'),
 ('public.pos_document_get(uuid)'),
 ('public.pos_cashier_shift_mutate(text,jsonb)'),
 ('public.pos_cashier_shifts_read(jsonb)'),
 ('public.pos_payment_settings_save(jsonb)'),
 ('public.pos_crm_read(jsonb)'),
 ('public.pos_cash_deposits_read(jsonb)'),
 ('public.pos_cash_deposit_proof(uuid)'),
 ('public.pos_cash_deposit_mutate(text,jsonb)')
) as expected(signature);

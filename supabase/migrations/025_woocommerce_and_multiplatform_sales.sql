-- WooCommerce: a real integration via manually-entered REST API
-- credentials (WooCommerce's REST API is plain Basic Auth over HTTPS --
-- no OAuth app, no platform review, unlike every other integration in
-- this batch; the founder generates these themselves in their own
-- wp-admin under WooCommerce > Settings > Advanced > REST API).
--
-- Also fixes a real gap sales_data has had since it was created: no
-- platform column, so a WooCommerce sale and a Shopify sale for the same
-- product in the same month would silently overwrite each other on
-- upsert (its unique constraint was only brand_id/product_id/month).
-- Wasn't a problem with one platform; is one now that there's a second.
-- Run this in the Supabase SQL Editor after 024_ecommerce_platforms.sql.

alter table public.sales_data add column if not exists platform text not null default 'shopify';

do $$
declare
  existing_unique_constraint text;
begin
  select c.conname into existing_unique_constraint
  from pg_constraint c
  where c.conrelid = 'public.sales_data'::regclass and c.contype = 'u';

  if existing_unique_constraint is not null then
    execute format('alter table public.sales_data drop constraint %I', existing_unique_constraint);
  end if;
end $$;

alter table public.sales_data
  add constraint sales_data_brand_product_month_platform_key unique (brand_id, product_id, month, platform);

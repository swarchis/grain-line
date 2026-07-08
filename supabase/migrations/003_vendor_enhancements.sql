-- Vendor favoriting/blocking/notes, and structured (adaptable) quote request fields.
-- Run this in the Supabase SQL Editor after 002_vendors_and_quotes.sql.

alter table vendors add column if not exists favorited boolean not null default false;
alter table vendors add column if not exists blocked boolean not null default false;
alter table vendors add column if not exists notes text;

-- Structured, per-request fields (quantity/target cost/deadline/etc.) — each quote
-- request can ask for different things, so this is freeform JSON rather than fixed columns.
alter table quotes add column if not exists preferences jsonb not null default '{}'::jsonb;

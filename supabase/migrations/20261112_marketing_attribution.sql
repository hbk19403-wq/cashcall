-- Marketing attribution: anonymous page-view events and lead source on access requests.
-- Idempotent. Safe to run more than once.

create table if not exists public.marketing_events (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  event         text not null,
  path          text,
  session_id    text,
  label         text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  referrer      text,
  landing_path  text
);

create index if not exists marketing_events_created_at_idx on public.marketing_events (created_at);

-- Row-level security on with no policies: only the service role (server routes) can read or write.
alter table public.marketing_events enable row level security;

alter table if exists public.access_requests
  add column if not exists utm_source   text,
  add column if not exists utm_medium   text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content  text,
  add column if not exists referrer     text,
  add column if not exists landing_path text;

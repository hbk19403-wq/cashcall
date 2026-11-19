-- ── email_ingest_log ─────────────────────────────────────────────────────────
-- Tracks every email received at ingest@cashcall.io for auditing and debugging.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists email_ingest_log (
  id              uuid primary key default gen_random_uuid(),
  from_email      text not null,
  to_address      text,
  subject         text,
  attachment_count int default 0,
  received_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- Service role only — no RLS needed (admin audit table)
alter table email_ingest_log enable row level security;
create policy "service role full access" on email_ingest_log
  using (auth.role() = 'service_role');

-- Index for per-sender queries
create index if not exists email_ingest_log_from_email_idx
  on email_ingest_log (from_email, received_at desc);

-- ── get_user_id_by_email RPC ─────────────────────────────────────────────────
-- Used by /api/email/ingest to look up a user_id from their email address.
-- Service role required. Returns null if not found.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function get_user_id_by_email(p_email text)
returns table (id uuid)
language sql
security definer
set search_path = auth, public
as $$
  select id from auth.users where email = p_email limit 1;
$$;

-- Revoke public, grant to service role only
revoke all on function get_user_id_by_email(text) from public;
grant execute on function get_user_id_by_email(text) to service_role;

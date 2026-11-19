-- Team Invitations table for CashCall
-- Run this in your Supabase SQL Editor

create table if not exists team_invitations (
  id             uuid primary key default gen_random_uuid(),
  invited_by     uuid references auth.users on delete cascade not null,
  email          text not null,
  role           text not null check (role in ('manager', 'staff')),
  location_id    uuid references locations(id) on delete set null,
  token          text unique not null,
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  expires_at     timestamptz not null,
  accepted_by    uuid references auth.users on delete set null,
  accepted_at    timestamptz,
  created_at     timestamptz default now()
);

-- RLS: owners can only see their own invitations
alter table team_invitations enable row level security;

create policy "owners_manage_invitations"
  on team_invitations
  for all
  using (invited_by = auth.uid())
  with check (invited_by = auth.uid());

-- Index for token lookups (used in accept route)
create index if not exists team_invitations_token_idx on team_invitations(token);
create index if not exists team_invitations_invited_by_idx on team_invitations(invited_by);

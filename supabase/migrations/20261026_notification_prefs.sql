-- notification_prefs: per-user WhatsApp digest settings
create table if not exists notification_prefs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  whatsapp_number     text,
  whatsapp_provider   text not null default 'twilio' check (whatsapp_provider in ('twilio', 'meta')),
  digest_enabled      boolean not null default false,
  digest_time         text not null default '07:00',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique (user_id)
);

alter table notification_prefs enable row level security;

create policy "Users manage own prefs"
  on notification_prefs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

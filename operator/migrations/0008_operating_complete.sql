alter table prospects add column if not exists lane text not null default 'operating';

alter table outreach_messages add column if not exists lease_until timestamptz;
alter table outreach_messages add column if not exists lease_token text;

alter table enrichment_grants add column if not exists provider text;
alter table enrichment_grants add column if not exists unit text;
alter table enrichment_grants add column if not exists cost_cents integer not null default 0;
alter table enrichment_grants add column if not exists expires_at timestamptz;
alter table enrichment_grants add column if not exists spent_at timestamptz;

create table if not exists delivery_events (
  id text primary key,
  user_id text not null,
  message_id text not null,
  kind text not null,
  note text not null,
  created_at timestamptz not null default now()
);
create index if not exists delivery_events_user_idx on delivery_events (user_id, created_at desc);

create table if not exists identity_merges (
  id text primary key,
  user_id text not null,
  keep_id text not null,
  drop_id text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists operating_state (
  user_id text primary key,
  monthly_budget_cents integer not null default 5000,
  spend_month text not null default '',
  spend_used_cents integer not null default 0
);

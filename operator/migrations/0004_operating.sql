create table if not exists product_configurations (
  id text primary key,
  user_id text not null unique,
  digest text not null,
  status text not null,
  snapshot_json text not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

create table if not exists discovery_runs (
  id text primary key,
  user_id text not null,
  configuration_digest text not null,
  trigger text not null,
  status text not null,
  proposal_count integer not null default 0,
  terminal_reason text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists discovery_runs_user_idx on discovery_runs (user_id, started_at desc);

create table if not exists draft_plays (
  id text primary key,
  user_id text not null,
  proposal_id text not null,
  title text not null,
  status text not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, proposal_id)
);

create table if not exists outreach_packages (
  id text primary key,
  user_id text not null,
  prospect_id text not null,
  status text not null,
  subject text not null,
  body text not null,
  digest text not null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, prospect_id)
);

create table if not exists suppressions (
  id text primary key,
  user_id text not null,
  kind text not null,
  value text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, value)
);

create table if not exists enrichment_grants (
  id text primary key,
  user_id text not null,
  prospect_id text not null,
  status text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

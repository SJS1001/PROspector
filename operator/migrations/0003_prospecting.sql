alter table prospects add column if not exists origin text not null default 'seed';
alter table prospects add column if not exists run_id text;
alter table prospects add column if not exists fingerprint text;

create table if not exists profile_configurations (
  id text primary key,
  user_id text not null unique,
  digest text not null,
  status text not null,
  snapshot_json text not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);
create index if not exists profile_configurations_user_idx on profile_configurations (user_id);

create table if not exists prospecting_runs (
  id text primary key,
  user_id text not null,
  configuration_digest text not null,
  trigger text not null,
  status text not null,
  candidate_count integer not null default 0,
  qualified_count integer not null default 0,
  terminal_reason text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists prospecting_runs_user_idx on prospecting_runs (user_id, started_at desc);

create table if not exists signals (
  id text primary key,
  user_id text not null,
  run_id text not null,
  prospect_id text,
  url text not null,
  title text not null,
  excerpt text not null,
  tier integer not null,
  content_hash text not null,
  retrieved_at timestamptz not null default now(),
  publication_date text,
  recency text not null
);
create index if not exists signals_user_run_idx on signals (user_id, run_id);

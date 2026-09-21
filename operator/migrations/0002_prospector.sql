create table if not exists workspaces (
  user_id text primary key,
  company_name text not null,
  company_legal text not null,
  interview_complete boolean not null default false,
  seeded_at timestamptz not null default now()
);

create table if not exists knowledge_items (
  id text primary key,
  user_id text not null,
  question_id text not null,
  scope text not null,
  question text not null,
  proposed_answer text,
  confirmed_answer text,
  status text not null,
  evidence text not null,
  inference text not null,
  recommendation text not null,
  sort_order integer not null,
  unique (user_id, question_id)
);
create index if not exists knowledge_items_user_idx on knowledge_items (user_id, sort_order);

create table if not exists market_proposals (
  id text primary key,
  user_id text not null,
  title text not null,
  problem_match text not null,
  customer_type text not null,
  examples text not null,
  likely_buyer text not null,
  risks text not null,
  product_fit text not null,
  evidence text not null,
  decision text not null default 'open',
  decision_reason text,
  decided_at timestamptz
);
create index if not exists market_proposals_user_idx on market_proposals (user_id);

create table if not exists prospects (
  id text primary key,
  user_id text not null,
  account_name text not null,
  account_id text not null,
  target_name text not null,
  target_id text not null,
  offer_id text not null,
  score integer not null,
  outcome text not null,
  state text not null,
  revision integer not null default 1,
  configuration_digest text not null,
  assessment_id text not null,
  assessment_json text not null,
  evidence_excerpt text not null,
  evidence_url text not null,
  evidence_tier integer not null,
  evidence_date text not null,
  cooldown_until timestamptz,
  review_at timestamptz,
  material_signal boolean not null default false,
  last_reason text,
  created_at timestamptz not null default now()
);
create index if not exists prospects_user_state_idx on prospects (user_id, state);

create table if not exists review_commands (
  id text primary key,
  user_id text not null,
  command_key text not null,
  operation_digest text not null,
  prospect_id text not null,
  decision text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (user_id, command_key)
);
create index if not exists review_commands_user_idx on review_commands (user_id, prospect_id);

create table if not exists contacts (
  id text primary key,
  user_id text not null,
  prospect_id text not null,
  full_name text not null,
  role text not null,
  email_kind text not null,
  email_display text not null,
  source text not null,
  confidence text not null
);
create index if not exists contacts_user_idx on contacts (user_id, prospect_id);

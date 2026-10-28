alter table contacts add column published_url text;

create table if not exists outreach_messages (
  id text primary key,
  user_id text not null,
  package_id text not null,
  prospect_id text not null,
  contact_id text not null,
  to_email text not null,
  subject text not null,
  body text not null,
  digest text not null,
  status text not null,
  acknowledged boolean not null default false,
  gmail_url text,
  blocked_reason text,
  approved_at timestamptz,
  dispatched_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists outreach_messages_user_idx on outreach_messages (user_id, created_at desc);

create table if not exists operator_secrets (
  user_id text not null,
  name text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, name)
);

alter table contacts add column if not exists phone_display text;
alter table contacts add column if not exists provider_id text;

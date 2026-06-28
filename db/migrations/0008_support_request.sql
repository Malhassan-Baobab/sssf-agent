-- 0008_support_request.sql
-- Escalation tickets: when the agent lacks an answer, it can (with consent)
-- raise a request for a human officer to contact the user. Name + mobile required.
create table if not exists support_request (
  id bigint generated always as identity primary key,
  channel text not null default 'agent',
  name text not null,
  mobile text not null,
  email text,
  topic text,
  details text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);
create index if not exists support_request_status_idx on support_request (status, created_at);

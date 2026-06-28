-- 0007_chat_sessions.sql
-- Per-channel conversation state so the serverless Telegram webhook can hold a
-- multi-turn dialogue (e.g. confirm-before-compute). Synthetic/pilot only —
-- minimum data: channel + chat id + message history. No pensioner PII.
create table if not exists chat_session (
  id bigint generated always as identity primary key,
  channel text not null default 'telegram',
  chat_id text not null,
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (channel, chat_id)
);
create index if not exists chat_session_lookup on chat_session (channel, chat_id);

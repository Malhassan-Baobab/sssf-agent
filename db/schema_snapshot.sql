-- ============================================================================
-- SSSF Agent — consolidated schema snapshot (pilot v0.1.0)
-- Mirrors the live Supabase GSH database (project uyuhlgvfujmtaentfttf) as of
-- 2026-06-28. Structure only — seed data lives in migrations 0002/0004/0005.
-- Use this as the migration target when moving the pilot to a local Postgres.
--
-- Verified against live DB: pgvector 0.8.0 | 103 law_chunks | 40 faq |
-- 12 topics | 105 chunk_topics | 16 article_xref | 2 services |
-- calc final_v1: 19 constants, 21 yos rows, 7 age rows |
-- functions: match_law_chunks, match_faq, match_procedures.
-- Embedding dimension = 1536 (OpenAI text-embedding-3-large).
-- ============================================================================

create extension if not exists vector;

-- ===== RAG corpus =====
create table if not exists source_documents (
  id bigint generated always as identity primary key,
  doc_key text unique not null,
  title_ar text, title_en text,
  doc_type text not null,
  authority text,
  version text not null default 'v1',
  effective_date date,
  language text,
  source_path text,
  created_at timestamptz not null default now()
);

create table if not exists law_chunks (
  id bigint generated always as identity primary key,
  document_id bigint not null references source_documents(id) on delete cascade,
  chapter_no text, chapter_title text,
  article_no text, article_title text, clause text,
  language text not null,
  content text not null,
  citation text not null,
  version text not null default 'v1',
  token_count int,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index if not exists law_chunks_article_idx on law_chunks (document_id, article_no);
create index if not exists law_chunks_hnsw_idx on law_chunks using hnsw (embedding vector_cosine_ops);

create table if not exists faq (
  id bigint generated always as identity primary key,
  question_ar text not null,
  answer_ar text not null,
  article_refs text[],
  language text not null default 'ar',
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index if not exists faq_hnsw_idx on faq using hnsw (embedding vector_cosine_ops);

create table if not exists procedure_chunks (
  id bigint generated always as identity primary key,
  document_id bigint references source_documents(id) on delete cascade,
  section text, step_no int, actor text,
  language text not null default 'ar',
  content text not null,
  citation text not null,
  version text not null default 'v1',
  token_count int,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index if not exists procedure_chunks_hnsw_idx on procedure_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists procedure_chunks_section_idx on procedure_chunks (document_id, section);

-- ===== Knowledge graph =====
create table if not exists topic (
  key text primary key, title_ar text, title_en text, description text
);

create table if not exists service (
  key text primary key, title_ar text, title_en text,
  service_type text not null, description text,
  legal_basis text[], calc_type text,
  required_inputs jsonb, required_attachments jsonb, source_path text,
  created_at timestamptz not null default now()
);

create table if not exists article_xref (
  id bigint generated always as identity primary key,
  document_id bigint references source_documents(id) on delete cascade,
  from_article text not null, to_article text not null,
  relation text not null default 'references', note text
);
create index if not exists article_xref_from_idx on article_xref (document_id, from_article);

create table if not exists chunk_topic (
  chunk_id bigint references law_chunks(id) on delete cascade,
  topic_key text references topic(key) on delete cascade,
  primary key (chunk_id, topic_key)
);
create table if not exists procedure_topic (
  procedure_id bigint references procedure_chunks(id) on delete cascade,
  topic_key text references topic(key) on delete cascade,
  primary key (procedure_id, topic_key)
);
create table if not exists faq_topic (
  faq_id bigint references faq(id) on delete cascade,
  topic_key text references topic(key) on delete cascade,
  primary key (faq_id, topic_key)
);
create table if not exists service_topic (
  service_key text references service(key) on delete cascade,
  topic_key text references topic(key) on delete cascade,
  primary key (service_key, topic_key)
);

-- ===== Versioned calc config =====
create table if not exists calc_config_version (
  version text primary key, source_file text, notes text,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists yos_percentage (
  config_version text references calc_config_version(version) on delete cascade,
  years int not null, pct numeric not null,
  primary key (config_version, years)
);
create table if not exists age_percentage (
  config_version text references calc_config_version(version) on delete cascade,
  gender text not null, age_min int not null, age_max int, pct numeric not null,
  primary key (config_version, gender, age_min)
);
create table if not exists calc_constant (
  config_version text references calc_config_version(version) on delete cascade,
  key text not null, value numeric not null,
  unit text, article text, description text,
  primary key (config_version, key)
);

-- ===== Retrieval functions =====
create or replace function match_law_chunks(query_embedding vector(1536), match_count int default 5)
returns table (id bigint, article_no text, article_title text, clause text, content text, citation text, chapter_title text, similarity float)
language sql stable as $$
  select lc.id, lc.article_no, lc.article_title, lc.clause, lc.content, lc.citation, lc.chapter_title,
         1 - (lc.embedding <=> query_embedding) as similarity
  from law_chunks lc where lc.embedding is not null
  order by lc.embedding <=> query_embedding limit match_count;
$$;

create or replace function match_faq(query_embedding vector(1536), match_count int default 3)
returns table (id bigint, question_ar text, answer_ar text, article_refs text[], similarity float)
language sql stable as $$
  select f.id, f.question_ar, f.answer_ar, f.article_refs,
         1 - (f.embedding <=> query_embedding) as similarity
  from faq f where f.embedding is not null
  order by f.embedding <=> query_embedding limit match_count;
$$;

create or replace function match_procedures(query_embedding vector(1536), match_count int default 3)
returns table (id bigint, section text, actor text, content text, citation text, similarity float)
language sql stable as $$
  select p.id, p.section, p.actor, p.content, p.citation,
         1 - (p.embedding <=> query_embedding) as similarity
  from procedure_chunks p where p.embedding is not null
  order by p.embedding <=> query_embedding limit match_count;
$$;

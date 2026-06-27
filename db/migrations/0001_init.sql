create extension if not exists vector;

-- ===== RAG corpus =====
create table if not exists source_documents (
  id bigint generated always as identity primary key,
  doc_key text unique not null,            -- 'law_5_2018'
  title_ar text, title_en text,
  doc_type text not null,                  -- law|decision|regulation|guide|form|faq
  authority text,                          -- 'Law 5/2018'
  version text not null default 'v1',
  effective_date date,
  language text,                           -- ar|en|bilingual
  source_path text,                        -- corpus/clean/...
  created_at timestamptz not null default now()
);

create table if not exists law_chunks (
  id bigint generated always as identity primary key,
  document_id bigint not null references source_documents(id) on delete cascade,
  chapter_no text, chapter_title text,
  article_no text,                         -- '19'
  article_title text,                      -- 'حالات استحقاق المعاش'
  clause text,                             -- 'أ','ب','1'
  language text not null,                  -- ar|en
  content text not null,
  citation text not null,                  -- 'Law 5/2018, Art. 19(ج)'
  version text not null default 'v1',
  token_count int,
  embedding vector(1536),                  -- OpenAI text-embedding-3-large: 1536 dims
  created_at timestamptz not null default now()
);
create index if not exists law_chunks_article_idx on law_chunks (document_id, article_no);
create index if not exists law_chunks_embed_idx on law_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table if not exists faq (
  id bigint generated always as identity primary key,
  question_ar text not null,
  answer_ar text not null,
  article_refs text[],                     -- ['Law 5/2018, Art. 4']
  language text not null default 'ar',
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index if not exists faq_embed_idx on faq using ivfflat (embedding vector_cosine_ops) with (lists = 50);

-- ===== Calc reference config (versioned) =====
create table if not exists calc_config_version (
  version text primary key,                -- 'final_v1'
  source_file text, notes text,
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
  gender text not null,                    -- male|female
  age_min int not null, age_max int,       -- age_max null = and above
  pct numeric not null,
  primary key (config_version, gender, age_min)
);

create table if not exists calc_constant (
  config_version text references calc_config_version(version) on delete cascade,
  key text not null, value numeric not null,
  unit text, article text, description text,
  primary key (config_version, key)
);

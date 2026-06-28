-- 0003_knowledge_graph.sql
-- Relationship layer that connects law <-> procedure <-> service <-> numbers,
-- plus a procedure_chunks store and HNSW indexes tuned for the pilot's small corpus.
-- See Notion "09 · Knowledge Data Model & Retrieval".

-- ===== Thematic topics (connective tissue across all layers) =====
create table if not exists topic (
  key text primary key,                    -- 'pension_eligibility','service_purchase',...
  title_ar text,
  title_en text,
  description text
);

-- ===== Procedural layer: chunks from the contributions procedures guide =====
create table if not exists procedure_chunks (
  id bigint generated always as identity primary key,
  document_id bigint references source_documents(id) on delete cascade,
  section text,                            -- 'registration','start_of_service','end_of_service','collection','add_purchase'
  step_no int,
  actor text,                              -- 'employer','insured','fund_officer','system'
  language text not null default 'ar',
  content text not null,
  citation text not null,                  -- 'Contributions Procedures Guide, §End of Service'
  version text not null default 'v1',
  token_count int,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

-- ===== Service / form / certificate catalog =====
create table if not exists service (
  key text primary key,                    -- 'form_3_service_addition','form_4_purchase','cert_salary'
  title_ar text,
  title_en text,
  service_type text not null,              -- 'form','certificate','procedure'
  description text,
  legal_basis text[],                      -- ['Law 5/2018, Art. 20']
  calc_type text,                          -- 'purchase','pension','eos', null
  required_inputs jsonb,
  required_attachments jsonb,
  source_path text,
  created_at timestamptz not null default now()
);

-- ===== Directed article -> article cross-reference graph =====
create table if not exists article_xref (
  id bigint generated always as identity primary key,
  document_id bigint references source_documents(id) on delete cascade,
  from_article text not null,
  to_article text not null,
  relation text not null default 'references',  -- references|depends_on|exception_to|defines_term_for
  note text
);
create index if not exists article_xref_from_idx on article_xref (document_id, from_article);

-- ===== Many-to-many: chunk <-> topic, faq <-> topic, service <-> topic =====
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

-- ===== Indexes: switch to HNSW for better recall at pilot scale =====
-- Drop the ivfflat indexes from 0001 (lists=100/50 over-partition a <300-row corpus).
drop index if exists law_chunks_embed_idx;
drop index if exists faq_embed_idx;

create index if not exists law_chunks_hnsw_idx
  on law_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists faq_hnsw_idx
  on faq using hnsw (embedding vector_cosine_ops);
create index if not exists procedure_chunks_hnsw_idx
  on procedure_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists procedure_chunks_section_idx
  on procedure_chunks (document_id, section);

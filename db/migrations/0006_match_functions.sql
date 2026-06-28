-- 0006_match_functions.sql
-- Retrieval primitives for the RAG layer (cosine similarity over HNSW indexes).

-- Vector match over law_chunks, returning citation + similarity.
create or replace function match_law_chunks(
  query_embedding vector(1536),
  match_count int default 5
)
returns table (
  id bigint,
  article_no text,
  article_title text,
  clause text,
  content text,
  citation text,
  chapter_title text,
  similarity float
)
language sql stable
as $$
  select
    lc.id, lc.article_no, lc.article_title, lc.clause, lc.content,
    lc.citation, lc.chapter_title,
    1 - (lc.embedding <=> query_embedding) as similarity
  from law_chunks lc
  where lc.embedding is not null
  order by lc.embedding <=> query_embedding
  limit match_count;
$$;

-- Vector match over the FAQ fast-path.
create or replace function match_faq(
  query_embedding vector(1536),
  match_count int default 3
)
returns table (
  id bigint,
  question_ar text,
  answer_ar text,
  article_refs text[],
  similarity float
)
language sql stable
as $$
  select
    f.id, f.question_ar, f.answer_ar, f.article_refs,
    1 - (f.embedding <=> query_embedding) as similarity
  from faq f
  where f.embedding is not null
  order by f.embedding <=> query_embedding
  limit match_count;
$$;

-- Match over procedure chunks.
create or replace function match_procedures(
  query_embedding vector(1536),
  match_count int default 3
)
returns table (
  id bigint,
  section text,
  actor text,
  content text,
  citation text,
  similarity float
)
language sql stable
as $$
  select
    p.id, p.section, p.actor, p.content, p.citation,
    1 - (p.embedding <=> query_embedding) as similarity
  from procedure_chunks p
  where p.embedding is not null
  order by p.embedding <=> query_embedding
  limit match_count;
$$;

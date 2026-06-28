-- 0005_tag_chunk_topics.sql
-- Tags every law chunk with one or more topics by article number.
-- Run AFTER the law is ingested (depends on law_chunks rows existing).
-- Idempotent: on conflict do nothing.

with a as (
  select id, nullif(regexp_replace(article_no, '[^0-9]', '', 'g'), '')::int as n
  from law_chunks
  where document_id = (select id from source_documents where doc_key='law_5_2018_ar')
)
insert into chunk_topic (chunk_id, topic_key)
select a.id, t.topic_key
from a
join lateral (
  select unnest(case
    when a.n = 1 then array['definitions']
    when a.n between 3 and 5 then array['contributions']
    when a.n between 6 and 9 then array['service_addition']
    when a.n between 10 and 18 then array['contributions']
    when a.n = 19 then array['pension_eligibility']
    when a.n = 20 then array['service_purchase']
    when a.n = 21 then array['pension_eligibility','death_disability']
    when a.n = 22 then array['pension_eligibility','death_disability']
    when a.n between 23 and 26 then array['pension_calc']
    when a.n between 27 and 40 then array['beneficiaries']
    when a.n between 41 and 44 then array['eos_gratuity']
    when a.n between 45 and 48 then array['pension_suspension']
    when a.n between 49 and 51 then array['penalties']
    when a.n between 52 and 54 then array['exceptional']
    when a.n = 55 then array['service_addition']
    when a.n between 56 and 59 then array['death_disability']
    when a.n = 60 then array['pension_suspension']
    when a.n between 61 and 64 then array['pension_suspension']
    else array['definitions']
  end) as topic_key
) t on true
where a.n is not null
on conflict do nothing;

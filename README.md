# SSSF Agent

Hallucination-resistant customer-support agent for the Sharjah Social Security Fund (SSSF). Three-layer architecture: Policy RAG · Deterministic Calc Engine · Certificate Actions.

> **Design sandbox only.** Production runs on UAE sovereign cloud. No real pensioner PII in this repo — synthetic data only.

## Structure

```
corpus/
  raw/        ← source PDFs (gitignored — add cleaned versions only)
  clean/      ← quality-passed, chunking-ready text
rag/          ← ingestion, chunking, embedding, retrieval
engine/       ← deterministic calc service (pension, EoS, purchase/addition)
orchestrator/ ← LLM routing + dialogue layer
eval/         ← gold eval set (policy + calc test cases)
db/
  migrations/ ← SQL migrations (apply in order)
scripts/      ← one-off tooling (ingest, re-embed, run-eval)
.github/      ← CI workflows (future)
```

## Prerequisites

- Node.js 18+
- A Supabase project with pgvector enabled (Postgres 15+)
- Anthropic API key (orchestrator)
- OpenAI API key (embeddings — text-embedding-3-large, 1536 dims)

## Setup

```bash
# 1. Clone
git clone https://github.com/<owner>/sssf-agent.git
cd sssf-agent

# 2. Install dependencies
npm install

# 3. Environment
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL,
# EMBEDDING_MODEL, EMBEDDING_DIM, ANTHROPIC_API_KEY, OPENAI_API_KEY

# 4. Apply DB migrations (requires psql on PATH, or use Supabase dashboard SQL editor)
psql "$SUPABASE_DB_URL" -f db/migrations/0001_init.sql
psql "$SUPABASE_DB_URL" -f db/migrations/0002_seed_calc.sql
```

### Alternative: apply via Supabase dashboard

Open your project → SQL Editor → paste each migration file in order.

## Verify migrations

After applying, run these checks in the Supabase SQL editor:

```sql
-- pgvector enabled
select installed_version from pg_available_extensions where name = 'vector';

-- All tables present
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;

-- calc config seeded
select version, is_active, source_file from calc_config_version;
select count(*) from yos_percentage where config_version = 'final_v1';   -- expect 21
select count(*) from age_percentage where config_version = 'final_v1';   -- expect 7
select count(*) from calc_constant where config_version = 'final_v1';    -- expect 19
```

## DB schema overview

| Table | Purpose |
|---|---|
| `source_documents` | Metadata per ingested document (law, regulation, FAQ) |
| `law_chunks` | Article/clause chunks with 1536-dim embeddings for RAG |
| `faq` | High-confidence Q&A pairs with embeddings (fast-path retrieval) |
| `calc_config_version` | Versioned calc config snapshot (audit trail) |
| `yos_percentage` | Years-of-service → pension % lookup |
| `age_percentage` | Age + gender → pension % lookup |
| `calc_constant` | Named constants (min pension, EoS tiers, purchase rules, etc.) |

## Anti-hallucination rules

1. **Closed domain** — answer only from the RAG corpus and tool outputs.
2. **Cite the article** — every policy claim names the law/regulation and article.
3. **Abstain over guess** — low retrieval confidence → route to human officer.
4. **No mental math** — all amounts come from the deterministic calc engine.
5. **Confirm before acting** — read inputs back before computing or submitting.

See `CLAUDE.md` for the full design brief and `Agent_Architecture.md` for the production three-layer architecture.

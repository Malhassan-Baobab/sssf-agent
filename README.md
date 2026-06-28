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

**RAG + relationship graph** (see Notion "09 · Knowledge Data Model & Retrieval"):

| Table | Purpose |
|---|---|
| `source_documents` | Metadata per ingested document (law, regulation, FAQ) |
| `law_chunks` | Article/clause chunks with 1536-dim embeddings (Art. 1 split per definition) |
| `procedure_chunks` | Steps from the contributions procedures guide (embedded) |
| `faq` | Q&A fast-path with embeddings + auto-linked `article_refs` |
| `service` | Form/certificate catalog (legal_basis, calc_type, inputs, attachments) |
| `topic` | Thematic concepts spanning all layers |
| `chunk_topic` / `faq_topic` / `procedure_topic` / `service_topic` | Many-to-many topic tags |
| `article_xref` | Directed article→article cross-reference graph |

**Deterministic calc config** (versioned):

| Table | Purpose |
|---|---|
| `calc_config_version` | Versioned calc config snapshot (audit trail) |
| `yos_percentage` | Years-of-service → pension % lookup |
| `age_percentage` | Age + gender → pension % lookup |
| `calc_constant` | Named constants (min pension, EoS tiers, purchase rules, etc.) |

Retrieval primitives: `match_law_chunks()`, `match_faq()`, `match_procedures()` (cosine over HNSW).

## Deterministic calc engine (`engine/`)

Pure, typed functions — the model never does arithmetic. Decoded from the Final Version
calculator and cross-checked to Law 5/2018. Covers pension (Art. 23), the Art. 26 minimum
floor, early-retirement reduction (Art. 19 ج/د), end-of-service gratuity (Art. 43), reward
beyond 35 years (Art. 23), and purchase/addition cost (Art. 20 / 6-7). Every result carries
its citations.

```bash
npm run test:calc    # validates all 22 oracle cases (Calc_TestCases.xlsx)
```

> The oracle's own Expected/Actual columns disagree on several rows (spreadsheet bugs).
> The engine implements the **law-correct** value and the divergences are documented in
> `engine/calc.test.ts` for officer review.

## Corpus pipeline

```bash
npm run chunk:law-ar                 # docx → corpus/clean/law_5_2018_ar.jsonl (article/definition chunks)
npm run ingest -- --jsonl corpus/clean/law_5_2018_ar.jsonl --doc-key law_5_2018_ar \
  --doc-title-ar "..." --doc-type law --effective-date 2018-04-08 --lang ar
npx tsx scripts/ingest-faq.ts        # embed 40 Q&A, auto-link citations
npx tsx scripts/search.ts "سؤال" 5   # retrieval smoke test
```

## Orchestrator (`orchestrator/`)

LLM that routes between the two pillars and never owns facts or numbers. It can only
act through the typed tool boundary: `search_policy` (RAG + graph expansion, abstains
below confidence threshold) and the two calc tools (deterministic engine). The system
prompt enforces closed-domain, mandatory citation, confirm-before-compute, no mental
math, and bilingual elderly-friendly tone.

```bash
npx tsx orchestrator/cli.ts                 # interactive REPL
npx tsx orchestrator/cli.ts "ما هو الحد الأدنى للمعاش؟"   # one-shot
```

## Anti-hallucination rules

1. **Closed domain** — answer only from the RAG corpus and tool outputs.
2. **Cite the article** — every policy claim names the law/regulation and article.
3. **Abstain over guess** — low retrieval confidence → route to human officer.
4. **No mental math** — all amounts come from the deterministic calc engine.
5. **Confirm before acting** — read inputs back before computing or submitting.

See `CLAUDE.md` for the full design brief and `Agent_Architecture.md` for the production three-layer architecture.

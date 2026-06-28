# SSSF Agent — Pilot Handoff (v0.1.0)

Two-function pilot — **Policy Q&A (RAG)** and **Calculations** — for the Sharjah Social
Security Fund customer-support agent. Built and validated over a 7-day prototype plan.
Design sandbox; **synthetic data only**, no real pensioner PII.

## What works today

| Pillar | Status | Evidence |
|---|---|---|
| Policy Q&A (RAG) | ✅ | Law 5/2018 fully ingested (103 chunks, 72 articles); retrieval returns correct article as top hit |
| Calculations | ✅ | Engine passes **22/22** oracle cases exactly (`npm run test:calc`) |
| Orchestrator | ✅ | 3 pillars wired; confirm-before-compute, citations, abstention enforced |
| Guardrails / eval | ✅ | Policy citation **92.9%**, abstention **100%**, 0 specific-fact leaks; **5/5** E2E scenarios |

## Architecture (three layers, model orchestrates only)

```
WhatsApp/Web → Orchestrator (LLM, claude-sonnet-4-6)
                 ├─ search_policy   → RAG over law_chunks + faq (+ graph expansion), abstains < 0.35
                 ├─ calculate_*     → deterministic engine (typed, validated), never model math
                 └─ system prompt   → closed-domain · cite article · confirm · no mental math · bilingual
```

- **Policy** comes only from cited legal text (`law_chunks`, `faq`) with knowledge-graph
  expansion (`article_xref`, `service`). Below confidence threshold → abstain.
- **Numbers** come only from `engine/` (pension Art. 23, floor Art. 26, EoS Art. 43,
  early reduction Art. 19, reward, purchase/addition Art. 20/6-7). Config is versioned
  in Supabase (`final_v1`) and mirrored in `engine/config.ts`.
- The model can affect the world only through the typed tool boundary — it cannot
  fabricate a rule or smuggle in a number.

## Run it

```bash
npm install
cp .env.example .env          # fill Supabase + OpenAI + Anthropic keys
npm run test:calc             # 22/22 deterministic calc cases
npx tsx eval/run-eval.ts      # policy citation + abstention metrics
npx tsx eval/e2e.ts           # 5 multi-turn scenarios
npx tsx orchestrator/cli.ts   # talk to the agent (AR/EN)
```

DB migrations: `db/migrations/0001…0006` (apply in order); consolidated snapshot in
`db/schema_snapshot.sql`. Corpus pipeline and schema are documented in the README and
Notion "09 · Knowledge Data Model & Retrieval".

## Open decisions (need officer / product sign-off)

1. **Calc oracle has wrong cells.** `Calc_TestCases.xlsx` Expected/Actual columns disagree
   with each other and the law on several rows (e.g. TC10 marks a non-eligible case as
   pension — a calculator bug). The engine follows the law. **Officer must confirm the
   law-correct values and re-freeze the oracle.** (Notion 06 decision item.)
2. **Authoritative pension salary.** Pilot takes contribution salary as a direct input;
   confirm the 3-year-average definition (Art. 1) for production.
3. **Pension-salary semantics & private-sector caps** (Art. 23 §2) not yet modelled.

## Backlog (tracked in Notion 06)

- **Procedures guide / decisions / HR exec-reg OCR.** PDFs have a corrupt text layer;
  `scripts/render-pdf-pages.py` is the verified render-for-OCR path. Not blocking — the
  pensioner-facing essence is in the law + service catalog + FAQ.
- **Citation precision (P2):** prefer the *defining* article for definitional values
  (e.g. retirement age → Art. 1, not only Art. 19).
- Procedure-layer embedding once OCR'd; survivor/disability calc; certificates (Pillar 3).

## Not in this pilot (by design)

Certificates and any personal-data actions (Pillar 3), WhatsApp integration, authentication,
and UAE-sovereign-cloud hosting. The agent answers general questions and runs estimates only;
personal records are routed to an officer.

## Next phases (per the rollout plan)

1. Officer review of `docs/DEMO.md` + sign-off on the calc oracle.
2. OCR the procedures corpus; re-run eval.
3. Wire WhatsApp + authentication + personal records (Pillar 3) on sovereign cloud.
4. Re-run the full eval before each launch and after any law/calculator change.

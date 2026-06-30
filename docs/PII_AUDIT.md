# PII-Boundary Audit (Pilot)

Date: 2026-06-30. Scope: the pilot agent (Telegram + web), law + FAQ corpus, deterministic
calc engine. **Synthetic data only — no real pensioner records are connected.**

## Principle
The model orchestrates; it never owns facts, numbers, or records. It must never receive a
pensioner's personal record. Any identifier (phone, Emirates ID) stays in the function layer.

## What is actually sent to the LLM (verified)
The entire LLM context is assembled in `orchestrator/agent.ts` and is exactly three things:
```
system  = SYSTEM_PROMPT + buildParseHint(userMessage)   // static rules + deterministic parse of the user's own text
messages = this.history                                 // the conversation: the user's own messages,
                                                        // assistant replies, and tool_result blocks
```
- `buildParseHint` only parses the **user's own message** (yes/no, gender, number, intent) — no external data.
- `tool_result` blocks contain only: cited **public law text** (search_policy), **computed amounts**
  (calc tools), or a **callback reference id** (raise_support_request). No personal record is ever returned.

## Every database access (grep `.from(` / `.rpc(`)
| Path | Table | Read/Write | Personal data? |
|---|---|---|---|
| retriever | `law_chunks`, `article_xref`, `service`, `match_faq` | read | No — public Law 5/2018 + FAQ |
| engine/config | `calc_constant`, `age_percentage` | read | No — config |
| tools (escalation) | `support_request` | **write** | Stores the name + mobile the USER volunteered for a callback |
| channels/telegram | `chat_session` | read/write | The conversation itself (the user's own typed messages) |
| scripts (ingest) | `source_documents`, `law_chunks`, `faq` | write (offline) | No |

**There is no table of pensioner records and no code path that looks up a person by ID/phone
and places it in the prompt.** Record-backed retrieval simply does not exist in the pilot.

## The only PII in scope
The single piece of personal data the system handles is **contact details the user volunteers
for a callback** (full name + mobile), which the model passes to `raise_support_request` (a write).
This is consent-based and is not a record lookup. The number is validated/normalized server-side.

## Third-party / someone-else's data
Requests for another person's pension/record ("my friend's / my father's pension file") are
refused and routed to an officer (system-prompt rule + verified by the abstain/escalation tests).
The agent will still run a **general estimate** from inputs the user provides on anyone's behalf
(no records involved).

## Eligibility inputs vs. PII
Age / years / salary / gender that the user types are **self-provided calculation inputs**, not
records fetched about an identified person. They drive the deterministic engine and are not
resolved against any database of individuals.

## Recommendations for production (not pilot blockers)
1. **Redact contact details in logs.** `tool_result` for raise_support_request and the
   `chat_session.history` may contain a name/mobile. Production logging should redact these;
   the abuse metric hook already logs the event only (no content).
2. **Phone-number identification + OTP** when records are introduced (per Agent_Architecture §3):
   pass identifiers to the backend, return only what's needed, never load full records into context.
3. **Data residency:** production on UAE sovereign cloud; the public Claude path is design-only.

## Conclusion
For the pilot, the model receives **no pensioner records** — only the user's own conversation,
static rules, public law text, and computed numbers. The lone PII (callback name + mobile) is
user-volunteered and confined to a single write tool. The PII boundary holds.

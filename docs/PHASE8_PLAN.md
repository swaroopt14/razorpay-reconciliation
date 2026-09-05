# Phase 8 — Ask Zord / Finance RAG

**Status:** implemented in `backend/agents/agents/askzord/` plus `GET /v1/reconciliation/summary`. MCP / Gemini wording were not required for correctness.

**Locked definition:** Build a finance-aware explanation and retrieval layer so a Finance Controller can ask questions about Phase 6 truth and Phase 7 proof. Ask Zord retrieves, copies deterministic numbers, explains, cites, and surfaces uncertainty. It does **not** reconcile, re-score UTR, invent amounts, or become a second investigation agent.

```text
Phase 6 determines financial truth.
Phase 7 proves financial truth.
Phase 8 explains financial truth.
The LLM is not the calculator, the ledger, or the matcher.
```

This clone only. Reuse [`backend/agents/`](backend/agents/). No new microservice. No LangGraph. **No MCP** (that stays Phase 9). Tools stay HTTP (same pattern as Phase 6B/7). Do not rewrite `DefaultRAGService` / intent SQL RAG. Do not turn this into a Finance Controller UI, a cash ledger, or Phase 9’s observe→reason→tool loop.

---

## Architectural rule (non-negotiable)

> **Ask Zord is an explanation and retrieval layer, not another reconciliation engine.**

| Layer | Owns | Must not do |
|---|---|---|
| Phase 6 APIs | status, result, amounts, exceptions, counts | — |
| Phase 7 APIs | evidence IDs, snapshots, decision/calc traces, pack hash | — |
| Structured tools | every number, status, count, variance, cash figure | LLM addition / invented IDs |
| RAG | policy / glossary / “what does settled mean?” | transaction truth |
| LLM | wording of an already-validated answer | new facts |
| Validators | reject status/number/evidence hallucinations | “fix” by guessing |

If a question needs a number, Ask Zord **calls a tool or copies a structured field**. If the tool returns none, the answer is `UNKNOWN` / a limitation — never a guessed rupee amount.

---

## What already exists vs what Phase 8 adds

The current Ask Zord path is already `zord-prompt-layer`:

```text
POST /query
  → memory follow-up rewrite
  → finance.Investigate()     # Phase 6B graph, prose string
  → tools.Investigate()
  → tools.Answer()            # Slice A proof APIs
  → LLM PlanQuery + SQL/vector RAG (intent / Merkle packs)
```

| Already there | Phase 8 adds |
|---|---|
| `POST /query` + JWT tenant + session memory | `POST /v1/ask-zord/finance/query` with a **structured answer contract** |
| Deterministic `agents/finance` graph (record + exception prose) | **Router + query plan** (RECORD / AGGREGATE / EXPLANATION / KNOWLEDGE / …) |
| HTTP tools for payment/payout/settlement/bank/exception/evidence | **Structured retriever** that also does **aggregates** (no LLM SUM) |
| Phase 7 pack / decision / calc / audit / verify tools | Evidence + calculation attached on every material finance claim |
| Hybrid SQL + Pinecone retriever for **intent/ops** docs | Finance **knowledge** RAG only (glossary / policy). Not used for amounts |
| Advisory guard (cannot approve/settle) | **Numeric / status / evidence validators** (reject, don’t prompt-hope) |
| Chat memory (entity follow-up rewrite) | Memory may inherit `entity_id`; **must re-query tools** for refunds/amounts |

Hard rules that still hold: Razorpay `settled` ≠ `bank_credited`. `MATCHED` ≠ `fully_reconciled` ≠ `bank_credited`. Status is never renamed to `STUCK` / `SLA_BREACH`. Agent inference never overrides AUTHORITATIVE / DERIVED. `get_ledger_entry` stays `source_not_in_this_phase`. Refund API is not faked.

Existing `LiveSQLRetriever` queries intent-engine `evidence_packs` (Merkle). **Do not use that table as Phase 7 finance proof.** Finance evidence is `GET /v1/finance-evidence/...` only.

---

## Architecture

```text
                    User question
                           │
                    FinanceRouter (Go)
                           │
                    QueryPlan (no LLM)
                           │
           ┌───────────────┼───────────────┐
           ↓               ↓               ↓
    Structured tools   Phase 7 pack    Knowledge RAG
    (Phase 6 APIs)     (evidence IDs)  (KNOWLEDGE only)
           │               │               │
           └───────────────┼───────────────┘
                           ↓
                    FinanceContext
                    (facts / evidence / knowledge)
                           ↓
                    AnswerBuilder (template first;
                    LLM wording only if validation-safe)
                           ↓
                    Validators
                    (numeric + status + evidence + claims)
                           ↓
                    AskZordResponse
```

Four question classes (router must hit these; extra labels are aliases):

| Intent | Example | Sources |
|---|---|---|
| **RECORD** | What happened to `pay_123`? | payment/payout + events + settlement + bank + recon |
| **AGGREGATE** / **CASH_POSITION** / **RECONCILIATION** | How much is unresolved? Why is the rate 94%? | summary API + exception list (SUM in Go) |
| **EXPLANATION** / **INVESTIGATION** | Why is `pay_123` unresolved? Biggest issues? | recon + decision/calc traces + pack + exceptions sorted by impact |
| **KNOWLEDGE** | Difference between settlement and bank credit? | RAG / seeded finance glossary only |

`RECONCILIATION` and `CASH_POSITION` are **AGGREGATE** with a metric set. `INVESTIGATION` is **EXPLANATION** over the exception list. Do not invent more engines.

---

## Where the code lives

Reuse `zord-prompt-layer`. Add an **askzord** package **beside** `agents/finance`, not a second RAG service and not a copy of `DefaultRAGService`.

```text
backend/agents/
  agents/askzord/                 # new
    router.go                     # deterministic classify
    plan.go                       # QueryPlan
    retrieve.go                   # structured + evidence tool calls
    aggregate.go                  # SUM/count in Go
    context.go                    # facts / evidence / knowledge
    answer.go                     # template + optional LLM wording
    citations.go                  # [Evidence: ev_…] vs [Source: …]
    validate.go                   # numeric / status / evidence / claims
    terms.go                      # controlled vocabulary
    knowledge.go                  # seeded glossary + existing retriever
    handler.go                    # POST /v1/ask-zord/finance/query
    askzord_test.go
    testdata/golden/*.json        # focused eval set (not 50–100 this phase)
  agents/finance/                 # keep; Ask Zord calls it for RECORD/EXPLANATION entity load
  tools/                          # keep HTTP tools; add GetReconSummary
```

Outcome-engine (thin, no new recon rules):

```text
GET /v1/reconciliation/summary
```

Returns **already-stored** counts and summed `variance_amount` by result/reason. Ask Zord must not `SELECT SUM` against the outcome DB from prompt-layer.

Existing `POST /query` should **dispatch finance questions into Ask Zord** (same pipeline, same validators) instead of returning only the Phase 6B prose string. Non-finance questions stay on today’s planner + SQL RAG.

---

## 1. Finance router (deterministic Go)

Do **not** send finance questions through `llm.PlanQuery` first. Classification is code, same idea as `finance.Classify` / `tools.SelectTool`.

Input: question + optional conversation entity.

Output:

```json
{
  "intent": "EXPLANATION",
  "entity": {"type": "payment", "id": "pay_123"},
  "required_sources": ["payment", "settlement", "bank", "refund", "reconciliation", "evidence"],
  "metrics": [],
  "filters": {}
}
```

Rules of thumb:

| Signal | Intent |
|---|---|
| `pay_` / `pout_` + “what happened / status / events” | RECORD |
| “why / root cause / unresolved / unexplained” + entity | EXPLANATION |
| “how much / count / rate / total / cash / expected vs received” | AGGREGATE |
| “biggest / top exceptions / failed payments where money moved” | INVESTIGATION (aggregate + ranked exceptions) |
| “what does X mean / difference between / SLA / policy” and **no** entity id | KNOWLEDGE |
| “refund” + entity | RECORD, source `get_refund` (settlement `line_type=refund` only — not a refund API) |
| “ledger” | RECORD, `get_ledger_entry` → limitation `source_not_in_this_phase` |

Follow-up (“and the refund?”) may copy `entity` from session **facts**, then **re-run tools**. Never treat prior assistant prose as an amount or status.

---

## 2. Structured retrieval (no LLM)

Adapters over existing HTTP tools only:

```text
get_payment / get_payment_events
get_payout / get_payout_events
get_settlement / search_settlements / get_refund
get_bank_transaction / search_bank_transactions
get_reconciliation / get_exception / get_similar_cases
get_evidence / get_evidence_pack / get_decision_trace
get_calculation_trace / get_audit_trail / verify_evidence / get_source_snapshot
get_sla_policy
get_ledger_entry          # stub → limitation
get_recon_summary         # new thin API
```

Retriever responsibilities:

- Entity lookup (404 / `none` → do not invent)
- Exception list + **Go** `SUM(variance_amount)` and counts by `result` / `reason`
- Evidence IDs only from tool JSON
- Tenant isolation via existing JWT / `tenant_id` query (already enforced in Phase 6/7 APIs)

Missing tool → `UNKNOWN` / limitation. Cross-tenant IDs → drop + limitation.

### New summary API (outcome-engine)

`GET /v1/reconciliation/summary?tenant_id=&connector_id=`

```json
{
  "entity_counts": {"payment": 80, "payout": 20},
  "result_counts": {"MATCHED": 94, "AMBIGUOUS": 2, "UNRESOLVED": 3, "CONFLICTED": 1},
  "exposure_minor": 42500,
  "exposure_by_reason": [
    {"reason": "amount_mismatch", "count": 1, "exposure_minor": 25000},
    {"reason": "failed_with_bank_movement", "count": 1, "exposure_minor": 10000}
  ],
  "currency": "INR"
}
```

`exposure_minor` = sum of exception `variance_amount` only (not MATCHED failed-with-no-movement). Rate = `MATCHED / (MATCHED+AMBIGUOUS+UNRESOLVED+CONFLICTED+VARIANCE+ORPHAN)` from stored results, **computed in Go**. This is how “why is the rate 94%?” is answered.

Cash-position questions reuse the same payload:

```text
expected / received / unresolved
```

are copies of structured fields (settlement net vs bank credit vs exception exposure). There is **no** new cash ledger.

---

## 3. Knowledge RAG (contextual only)

Use RAG **only** when intent is `KNOWLEDGE`, or as a short glossary footnote after structured facts (“settled is not bank credited”).

Reuse `HybridEvidenceRetriever` if a finance knowledge collection exists; otherwise seed **in-repo markdown** (no CMS, no live Razorpay docs crawl this phase):

```text
backend/agents/agents/askzord/testdata/knowledge/
  settlement_vs_bank_credit.md
  matched_vs_fully_reconciled.md
  failed_no_movement.md
  payout_sla.md
  exception_reasons.md
```

Each file: `source=internal`, `document_type=glossary|policy`, `version`, `effective_from`. Keyword + title match is enough if Pinecone is unset. Do **not** require Recall@K dashboards this phase.

Cite knowledge as `[Source: title, version]`. Never as `[Evidence: …]`.

Provider docs vs internal model must be labeled:

```text
Razorpay uses "settled" for inclusion in a settlement file.
Our model: settled ≠ bank_credited. Only a matched bank CREDIT proves cash in.
```

---

## 4. Finance context + answer contract

Builder input (never raw LLM memory):

```json
{
  "structured_facts": {
    "provider_status": "failed",
    "reconciliation_result": "UNRESOLVED",
    "reason": "failed_with_bank_movement",
    "amount_minor": 10000,
    "bank_movement_minor": 10000,
    "settlement": null,
    "refund": null
  },
  "calculations": [{"formula": "structured_variance_amount", "output": 10000}],
  "evidence": ["ev_1", "ev_2"],
  "knowledge": [],
  "limitations": ["Root cause remains UNKNOWN."]
}
```

Response (`POST /v1/ask-zord/finance/query`):

```json
{
  "answer": "Payment pay_123 is failed. Reconciliation is UNRESOLVED (failed_with_bank_movement). Exposure is 10000 INR, copied from structured variance.",
  "intent": "EXPLANATION",
  "facts": [
    {"field": "provider_status", "value": "failed"},
    {"field": "reconciliation_result", "value": "UNRESOLVED"},
    {"field": "exposure_minor", "value": 10000, "currency": "INR"}
  ],
  "calculations": [],
  "evidence": ["ev_1", "ev_2"],
  "sources": [],
  "confidence": 0.82,
  "limitations": ["Root cause remains UNKNOWN. Movement is proven; why it happened is not."]
}
```

**Default path is a Go template** (same discipline as `agents/finance.Draft`). Optional Gemini wording is allowed only **after** facts are frozen, and **must pass validators**. If the LLM is down or fails validation, return the template answer. That is the Phase 8 demo path — do not depend on Gemini for correctness.

`POST /query` can wrap this as today’s `QueryResponse.Answer` plus citations mapped from `evidence` / `sources`.

---

## 5. Citations (two kinds, never mixed)

| Kind | Format | Allowed when |
|---|---|---|
| Financial evidence | `[Evidence: ev_123]` | ID returned by Phase 7 / Phase 6 `evidence_ids` |
| Knowledge | `[Source: Settlement vs bank credit, v1]` | Seeded doc or retriever chunk |

Do not cite intent Merkle `evidence_packs` as finance proof. Do not cite a conversation turn as evidence.

---

## 6. Validators (the Phase 8 product)

Run on the final answer **and** on any LLM rewrite.

### Numeric

Extract integers / rupee amounts from the answer. Every amount must equal a value in `structured_facts` or `calculations`. Mismatch → **reject rewrite**, keep template. Target: **100%** on deterministic values.

### Status / terminology

Reject (or rewrite via template) if the answer contains:

| Forbidden unless clearly quoted as “not our label” | Why |
|---|---|
| `STUCK`, `SLA_BREACH`, `NORMAL` as a Razorpay status | never rename |
| `bank credited` / `reached the bank` when `bank_credit_proven` is false | settled ≠ credited |
| `fully reconciled` when result is only `MATCHED` or bank is unproven | MATCHED ≠ fully_reconciled |
| `we lost ₹X` / `permanent loss` | exposure ≠ loss |
| invented `ev_*` | fabricated evidence |

Correct shape:

```text
Razorpay status remains failed.
Reconciliation result is UNRESOLVED.
Exposure is 10000 (copied). Root cause UNKNOWN.
```

### Evidence

Every material financial claim (amount, bank movement exists, settlement missing) maps to a structured field and, when an evidence ID exists, that ID. Fake ID → drop + limitation. Missing pack → limitation, not invention. Invalid hash from `verify_evidence` → report `INVALID`, do not treat snapshot as authoritative.

### Claims

Adversarial: “How much did we lose?” → identify **unresolved exposure**, explicitly **not proven as loss**.

---

## 7. Controlled terminology

`agents/askzord/terms.go` — display labels only, never written back to Razorpay status.

```text
provider_status        = Razorpay / payout status as stored
reconciliation_result  = MATCHED | UNRESOLVED | AMBIGUOUS | …
financial_state        = e.g. MONEY_MOVEMENT_UNACCOUNTED
                         (explanation label only)
```

Example:

```text
Razorpay status:     failed
Reconciliation:      UNRESOLVED
Financial state:     MONEY_MOVEMENT_UNACCOUNTED
```

`financial_state` must be explained as **our label**, not a Razorpay status.

---

## 8. Conversation memory

Reuse existing Redis/session memory.

Allowed to persist: last `entity_type`, `entity_id`, `intent`, `conversation_id`.

**Forbidden** as truth: last answer amounts, last LLM sentence, “the refund was ₹X”.

`GET /v1/ask-zord/conversations/:id` returns stored **plans/facts snapshots** (optional, thin). Do **not** expose system prompts. If this is more than a session lookup, skip the GET this phase — `X-Session-ID` on `POST /query` already exists.

---

## 9. HTTP API

On **zord-prompt-layer** (JWT, tenant from auth — same as `/query`):

```text
POST /v1/ask-zord/finance/query
```

```json
{
  "question": "Why is payment pay_123 unresolved?",
  "conversation_id": "conv_123"
}
```

`conversation_id` is optional; if empty, use `X-Session-ID` when present.

No public mutation APIs. Ask Zord never `POST`s recon run or investigation create unless the user is already hitting those outcome APIs elsewhere.

Wire `Register` in `routes/routes.go` next to `/query`. Do not add MCP facades.

---

## 10. Implementation order

| Step | What | Done when |
|---|---|---|
| **8.1** | Router + QueryPlan + tests | intents in the table below classify without LLM |
| **8.2** | Structured retriever + `GET /v1/reconciliation/summary` | record + aggregate fixtures, tenant isolation |
| **8.3** | Evidence attach (existing Phase 7 tools) | pack/trace/calc copied; fake ID dropped |
| **8.4** | Knowledge seed + optional hybrid retrieve | glossary questions do not invent payments |
| **8.5** | Template AnswerBuilder + citations + confidence | contract JSON stable |
| **8.6** | Validators | numeric / status / evidence / loss-vs-exposure tests |
| **8.7** | Endpoint + `/query` dispatch | JWT tenant; no prompt leak |
| **8.8** | Focused golden JSON | ~20 cases, not 50–100 |

Optional Gemini wording is last and must be feature-flagged (`ASK_ZORD_LLM_WORDING=false` default).

---

## 11. Tests (definition of done)

Unit / fixture only. No live Razorpay, Gemini, ledger, or refund API.

**Router:** RECORD, AGGREGATE, EXPLANATION, KNOWLEDGE, CASH_POSITION, INVESTIGATION.

**Structured:** correct payment/payout/settlement/bank/recon; summary totals; tenant B cannot see tenant A.

**Numeric:** source `10000` + injected answer `10500` → REJECT.

**Status:** `settled` + no bank → reject “funds reached the bank”; `MATCHED` + bank unproven → reject “fully reconciled”; `failed` → reject “stuck”.

**Evidence:** claim without ID/limitation fails; `ev_invented` dropped; other-tenant ID dropped; `INVALID` hash reported.

**Adversarial:**

| Ask | Must say |
|---|---|
| How much did we lose from failed payments? | Unresolved **exposure**, not proven loss |
| Which bank caused the failures? | `UNKNOWN` if evidence doesn’t name a bank |
| Was every settled payment credited? | No, if summary/exceptions show missing bank |

**Golden (`testdata/golden/`, ~20 files):** mix of record / aggregate / explanation / knowledge / adversarial. Each file:

```json
{
  "question": "Why is pay_123 unresolved?",
  "expected_intent": "EXPLANATION",
  "required_facts": ["provider_status=failed", "reconciliation_result=UNRESOLVED"],
  "forbidden_claims": ["fully reconciled", "lost", "STUCK", "ev_invented"],
  "required_limitations": ["UNKNOWN"]
}
```

Do **not** require RAG Recall@K / MRR dashboards this phase.

---

## 12. Demo lock

```text
"Why is the reconciliation rate 94%?"
  → summary: 100 scored, 94 MATCHED, 2 AMBIGUOUS, 3 UNRESOLVED, 1 CONFLICTED
  → exposure 42500 copied from exceptions
  → LLM/template explains; citations = summary + top exception evidence

"Show me the biggest unresolved issue."
  → exceptions sorted by variance_amount
  → amount_mismatch 25000 + pack / calc / decision if present

"Is that money lost?"
  → "Not proven. ₹25,000 is unresolved exposure, not confirmed loss."
```

Then a record question: `Why is pay_123 unresolved?` → failed + bank + no settlement/refund + UNKNOWN + `[Evidence: ev_…]`.

---

## Explicitly out of Phase 8

- New microservice / LangGraph / **MCP finance namespace** (Phase 9)
- Ask Zord becoming an investigation agent (tool loops, autonomous observe→reason)
- Re-running Phase 6 recon or Phase 5 `Match()` from the chat path
- SQL from prompt-layer onto `canonical_payments` / `finance_evidence`
- Using intent Merkle `evidence_packs` as finance proof
- Live Razorpay doc crawl, document CMS, Recall@K platform
- Ledger service / refund `refund.*` money movement (limitations only)
- Finance Controller UI / React
- Editing applied `20260902*` goose files
- 50–100 golden questions (do ~20 focused)

---

## End-to-end lock

```text
PHASE 6  Reconcile + Investigate     → "What happened to the money?"
PHASE 7  Evidence + Provenance       → "Prove it."
PHASE 8  Ask Zord                    → "Explain it. Cite it. Do not invent it."
PHASE 9  Investigation Agent + MCP   → "Actively investigate complex cases."
```

**Phase 8 is complete when the LLM cannot invent a financial number, provider status, reconciliation result, transaction, or evidence reference — even if Gemini is on.**

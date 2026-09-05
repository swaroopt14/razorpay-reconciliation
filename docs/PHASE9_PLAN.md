# Phase 9 — Investigation Agent

**Status:** implemented in `backend/agents/agents/investigate/`. No `zord-agent-service`, no LangGraph, no live MCP. Gemini plan reorder is off.

**Locked definition:** Build an autonomous, **hypothesis-driven investigation loop** that takes a Phase 6 exception, walks HTTP finance tools, confirms or eliminates hypotheses, copies structured impact, and emits an evidence-backed report. The agent decides **which tool to call next**. It does **not** reconcile, re-score UTR, rewrite Razorpay status, invent evidence, or execute refunds/ledger mutations.

```text
Phase 6 determines financial truth.     → "What doesn't match?"
Phase 7 proves financial truth.         → "What proves it?"
Phase 8 explains financial truth.       → "Ask Zord."
Phase 9 investigates complex exceptions → "What actually happened — and what is still UNKNOWN?"
```

This clone only. **`backend/zord-agent-service` does not exist — do not create it.** Reuse [`backend/agents/`](backend/agents/) beside `agents/finance` and `agents/askzord`. No new microservice. No Python LangGraph. **No live MCP server** (an in-process tool registry with MCP-shaped schemas is enough). Tools stay HTTP to outcome-engine / zord-evidence. Ledger and refund APIs stay stubbed. Do not fold this into Ask Zord. Do not turn it into a Finance Controller UI.

---

## Architectural rule (non-negotiable)

> **Phase 9 is an evidence-driven investigator sitting on deterministic recon. It is not a chatbot, not RAG, and not a second matcher.**

| Layer | Owns | Must not do |
|---|---|---|
| Phase 6 | MATCHED / exception / amounts | — |
| Phase 7 | evidence IDs, pack, calc/decision traces | — |
| Phase 8 Ask Zord | explain + cite on demand | run an investigation loop |
| Phase 9 loop | plan → tool → hypothesis → stop | `Match()`, SQL, status rename, auto-refund |
| Evidence policy | PROVEN / LIKELY / POSSIBLE / UNKNOWN | LLM self-assigning PROVEN |
| Stopping policy | halt at proof / exhaustion / safety limit | infinite tool spam |

One-shot `get_payment` → prose is **Phase 6B / Ask Zord**. Phase 9 must have:

```text
Observe → Reason → Select tool → Execute → Update state → Evaluate hypotheses
  → more evidence? YES → loop
  → NO → verify → conclude
```

`POST /v1/reconciliation/investigations` today is **DeterministicInvestigation** (template root cause from `reason`). Keep it. Phase 9 is a **second path** that produces a richer report and still cannot change Razorpay `status` or force `MATCHED`.

---

## What already exists vs what Phase 9 adds

| Already there | Phase 9 adds |
|---|---|
| `agents/finance` linear graph (Classify→…→Draft) | **Loop** with stopping policy + tool budget |
| `agents/askzord` Q&A over tools | Not reused as the investigator (Ask Zord may *read* the report) |
| HTTP tools (payment/payout/settlement/bank/exception/evidence/summary) | In-process **tool registry** (schema + authority + allow-list) |
| Outcome `Investigate()` + `investigation.completed.v1` | Agent report + hypothesis trace; still emit completed for Phase 7 |
| Phase 7 `fabricated_evidence_id` / UNKNOWN pack guard | Every finding cites tool JSON IDs only |
| Exception list + `variance_amount` | Batch: **priority sort**, cap `max_cases`, never guess-resolve |

Hard rules that still hold: `settled` ≠ `bank_credited`. `MATCHED` ≠ `fully_reconciled`. Status is never `STUCK` / `SLA_BREACH`. Failed-with-no-movement stays MATCHED (nothing to investigate). `get_ledger_entry` → limitation. Agent inference never overrides AUTHORITATIVE / DERIVED. Exposure ≠ loss.

---

## Architecture

```text
                    Phase 6 exception
                           │
                    InvestigationAgent (Go)
                           │
                    Load exception + plan
                           │
                    Generate hypotheses (code)
                           │
              ┌──────────── loop (max 12) ────────────┐
              ↓                                        │
        SelectNextTool (registry, not LLM)             │
              ↓                                        │
        HTTP tool (outcome / evidence)                 │
              ↓                                        │
        Validate result (none → UNKNOWN, no invent)    │
              ↓                                        │
        Update state + score hypotheses                │
              ↓                                        │
        StoppingPolicy ── NO ──────────────────────────┘
              │ YES
              ↓
        Copy financial impact (structured only)
              ↓
        Evidence verify (Phase 7 tools)
              ↓
        Root-cause category (controlled vocab)
              ↓
        Report + investigation.completed.v1
              ↓
        Phase 7 pack / Phase 8 can explain
```

No DB credentials in the agent. No arbitrary URLs. No SQL.

---

## Where the code lives

```text
backend/agents/
  agents/investigate/              # new — not askzord, not finance.Draft
    state.go
    plan.go
    hypotheses.go
    registry.go                    # tool allow-list + schemas
    loop.go                        # observe/reason/select/execute
    stop.go
    evidence.go                    # cite / reject fabricated IDs
    report.go
    batch.go                       # prioritize exceptions
    handler.go                     # POST /v1/investigations ...
    investigate_test.go
    testdata/cases/*.json          # ~15 focused fixtures (not 50)

backend/recon/
  # optional thin fields on investigation_records if needed
  # reuse POST /v1/reconciliation/investigations as the persist API
  # do not add a second recon matcher
```

Do **not** add `backend/zord-agent-service/`. Do **not** add `mcp/server.go` as a deployable. `registry.go` can look like MCP tool descriptors (`name`, `input`, `authority`, `risk=READ_ONLY`) and still call `tools.OutcomeClient`.

Ask Zord stays explanation-only. If a user says “investigate pay_123”, Ask Zord may **start** Phase 9 (HTTP) or point at `GET /v1/investigations/:id` — it must not grow its own loop.

---

## 1. Investigation state (structured, not chat)

```go
type InvestigationState struct {
    InvestigationID string
    TenantID, ConnectorID string
    EntityType, EntityID string
    ExceptionReason string
    Plan []string
    Sources map[string]map[string]any // tool name → last JSON
    Hypotheses []Hypothesis
    Evidence []string
    Findings []Finding
    ImpactMinor int64
    Currency string
    Missing []string
    ToolCalls []ToolCall
    Iteration int
    Status string // running | completed | limit_reached
    RootCause string          // controlled category
    RootCauseCertainty string // PROVEN | LIKELY | POSSIBLE | UNKNOWN
    Recommendation string
    Limitations []string
}
```

Persist the report as JSON on the existing investigation row **or** return it from prompt-layer and POST the summary fields (`root_cause`, `financial_impact`, `evidence_ids`) to outcome-engine. Do not invent a second investigation table unless the current row cannot hold a `report` JSONB — prefer adding one nullable `report` column in a **new** goose file (not `20260902*`).

---

## 2. Hypotheses (code-generated per reason)

For `failed_with_bank_movement` / `payout_failed_with_bank_movement`:

| ID | Statement | Eliminated when |
|---|---|---|
| H1 | Settled despite provider failure | `search_settlements` returns none |
| H2 | Refunded after failure | refund search none |
| H3 | Bank row belongs to another payment | candidates > 1 or no exact payment_id |
| H4 | Unexplained movement (supported if bank exists + no setl/refund) | — |
| H5 | Bank candidate is unrelated | no UTR / ambiguous |
| H6 | Evidence insufficient | default remaining |

Statuses: `POSSIBLE` → `SUPPORTED` / `CONTRADICTED` / `UNKNOWN`. **`PROVEN` only if evidence policy allows** (authoritative settlement/bank **and** no contradiction). LLM cannot set PROVEN.

Other reasons get a small fixed set (missing settlement, amount mismatch, ambiguous bank, payout open SLA, payout missing bank). Do not generate free-text hypotheses.

---

## 3. Investigation plan (stored, not improvised)

Example `FAILED_WITH_MONEY_MOVEMENT` / `pay_123`:

```text
get_payment
get_payment_events
search_settlements
search_bank_transactions
get_refund
get_ledger_entry          # stub → missing_evidence
get_reconciliation
get_evidence / list finance evidence
verify_evidence           # if ev_* returned
```

Payout plan: payout + events + bank DEBIT search + SLA + evidence. Settlement-variance plan: settlement + calc trace + bank. The **next tool** is the first planned step whose source is still missing — not an LLM picker. After the plan is exhausted, stop.

---

## 4. Tool registry (controlled)

Reuse existing HTTP tools only. Each entry:

```text
name, authority (RAZORPAY|SETTLEMENT|BANK|RECON|EVIDENCE|STUB),
risk=READ_ONLY, allowed_entities, max_retries=2
```

Allow-list = Phase 6/7/8 tools. **Forbidden:** raw SQL, outbound URLs, recon `Run()`, `Match()`, refund create, ledger write.

`get_ledger_entry` / refund API: `source_not_in_this_phase` → `Missing` + do not invent.

Same tool + same args twice → count as retry; third call is skipped.

---

## 5. Loop + stopping policy

```text
max_iterations    = 12
max_tool_calls    = 20
max_same_tool     = 2
```

Stop when:

| Case | Status | Certainty |
|---|---|---|
| Required sources fetched, no contradiction, impact copied, H* PROVEN | `completed` | PROVEN |
| Sources fetched, one hypothesis SUPPORTED, no PROVEN | `completed` | LIKELY |
| All planned tools done, still insufficient | `completed` | UNKNOWN |
| Budget hit | `limit_reached` | UNKNOWN |

Never stop by “the LLM is confident.” Never mark the Phase 6 result `MATCHED`.

---

## 6. Evidence + impact + root cause

- Finding “bank movement exists / 10000” only if tool JSON has the bank row / `observed_amount`.
- Impact = last Phase 7 calc variance if present, else exception `variance_amount`. Agent does not add.
- Root-cause **categories** (closed set):

```text
MISSING_SETTLEMENT
BANK_MISMATCH
AMOUNT_VARIANCE
FAILED_WITH_MONEY_MOVEMENT
AMBIGUOUS_BANK
PAYOUT_MISSING_BANK
PAYOUT_FAILED_WITH_MOVEMENT
PAYOUT_OPEN_SLA
PROVIDER_STATE_CONFLICT
UNKNOWN
```

`failed_with_bank_movement` → category `FAILED_WITH_MONEY_MOVEMENT`, certainty **UNKNOWN** (movement proven, why not). Same as Phase 7 pack.

Recommendation = existing DeterministicInvestigation text (REVIEW / MONITOR / ESCALATE). **No** “refund automatically” / “reverse ledger”.

---

## 7. Batch

`POST /v1/investigations/batch` with `max_cases` (default 8, cap 20) and optional `min_financial_impact`.

```text
priority = variance_amount   # aging/severity later
```

Skip MATCHED. Run the loop **sequentially** on the top-N exceptions. Summary:

```text
exceptions_in = N
completed = C
unknown = U
exposure_remaining = sum(impact where certainty != PROVEN)
false_resolutions = 0   # invariant: never rewrite Phase 6 MATCHED
```

Do not claim “6 resolved” unless a hypothesis is PROVEN **and** Phase 6 already accounted for it. Prefer “6 investigated, 2 still UNKNOWN, 0 false resolutions.”

---

## 8. Report + APIs

Prompt-layer (JWT tenant, same as Ask Zord):

```text
POST /v1/investigations              { exception_id | entity_id, entity_type }
GET  /v1/investigations/:id
POST /v1/investigations/:id/run      # run/resume loop
POST /v1/investigations/batch        { max_cases, min_financial_impact }
GET  /v1/investigations/:id/trace    # plan + tool calls + hypotheses
```

Skip `/stop` and separate findings/evidence GETs this phase — they are slices of the same report.

Response shape:

```json
{
  "investigation_id": "…",
  "entity_type": "payment",
  "entity_id": "pay_123",
  "status": "completed",
  "classification": "FAILED_WITH_MONEY_MOVEMENT",
  "root_cause": {"category": "UNKNOWN", "certainty": "UNKNOWN"},
  "financial_impact": {"amount": 10000, "currency": "INR", "type": "UNRESOLVED_EXPOSURE"},
  "hypotheses": [],
  "evidence": ["ev_1"],
  "missing_evidence": ["ledger", "refund_api"],
  "recommendation": "REQUEST_REVIEW",
  "limitations": ["Root cause remains UNKNOWN. Permanent loss is not proven."],
  "iterations": 7,
  "tool_calls": 7
}
```

On complete: POST/reuse outcome investigation + existing `investigation.completed.v1` so Phase 7 can seal a pack. **Do not** emit `investigation.tool_called.v1` this phase.

---

## 9. Kafka

Reuse `investigation.completed.v1` (already emitted from outcome `Investigate()`). Phase 9 should call that persist path (or equivalent ingest) so Phase 7 packs stay the proof layer. No new event types required.

---

## 10. Implementation order

| Step | What | Done when |
|---|---|---|
| **9.1** | State + plan + hypotheses + registry | fixtures classify tools without LLM |
| **9.2** | Loop + stop policy | failed+bank demo; max-iter stops UNKNOWN |
| **9.3** | Evidence/impact/root-cause guards | no invent; impact copied |
| **9.4** | Persist + completed event / Phase 7 | pack still UNKNOWN for failed+bank |
| **9.5** | HTTP APIs | JWT tenant isolation |
| **9.6** | Batch priority | top-N by impact; 0 false MATCHED |
| **9.7** | Focused case JSON (~15) | hallucination tests below |

Gemini is **off** by default (`INVESTIGATE_LLM_PLAN=false`). If enabled later, it may only *reorder unused planned tools*, never add tools or set PROVEN.

---

## 11. Tests (definition of done)

Fixture HTTP tools only. No live Razorpay / Gemini / ledger / refund API.

**Hallucination (must have):**

| # | Setup | Must not say | Must say |
|---|---|---|---|
| 1 | No bank tool result | Bank received ₹10,000 | no bank / UNKNOWN |
| 2 | No settlement | Payment was settled | no settlement |
| 3 | Two bank candidates | Proven ownership | possible; not proven |
| 4 | failed + bank | Razorpay incorrectly processed | UNKNOWN why |
| 5 | exposure only | ₹10,000 was lost | unresolved exposure |
| 6 | payout `processing` | STUCK | status remains processing |

**Loop:** plan tools called in order; same tool+args not >2; stop at 12.

**False resolution:** batch never writes `result=MATCHED`.

**Golden (~15 cases):** payment failed+bank, failed+no movement (should refuse / not re-open MATCHED), payout missing bank, payout open SLA, amount mismatch, ambiguous, missing settlement, tenant-b isolation, fabricated `ev_*`, ledger stub, limit_reached.

Do **not** require a 50-case benchmark or latency dashboard this phase.

---

## 12. Demo lock

```text
Phase 6: 100 scored, 92 MATCHED, 8 exceptions
Phase 9 batch (max 8):
  walks tools per exception
  0 false resolutions
  failed+bank → UNKNOWN, exposure 10000, no settlement/refund/ledger
  pack (Phase 7) + Ask Zord (Phase 8) can explain the report
```

Script line:

> The recon engine found the break. The agent traversed payment, events, settlement, bank, refund, and ledger tools, tested hypotheses, copied ₹10,000 exposure, and refused a root cause the evidence does not prove.

---

## Explicitly out of Phase 9

- New `zord-agent-service` / Python LangGraph / hosted MCP server
- Ask Zord growing an investigate loop
- Re-running Phase 6 `Run()` or Phase 5 `Match()` from the agent
- SQL or DB credentials in the agent
- Auto refund / ledger write / forced MATCHED
- Renaming Razorpay status
- Faking ledger or `refund.*` money movement
- 50-case eval platform / Finance UI
- Editing applied `20260902*` goose files
- Extra Kafka types (`tool_called`, `finding`) unless persist is blocked without them

---

## End-to-end lock

```text
PHASE 6  Recon              → exception
PHASE 9  Investigate loop   → hypotheses + tools + UNKNOWN/LIKELY
PHASE 7  Evidence pack      → prove the conclusion
PHASE 8  Ask Zord           → explain the report
```

**Phase 9 is complete when the agent cannot invent a number, status, transaction, evidence ID, or PROVEN root cause — and cannot resolve an exception by guessing.**

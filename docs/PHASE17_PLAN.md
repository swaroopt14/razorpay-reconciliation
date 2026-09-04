# Phase 17 — Remaining backend (plan, then tests, then E2E)

**Status:** implemented (2026-09-03). Tests green. Hybrid E2E ran (in-memory + Postgres). See [PHASE17_REPORT.md](./PHASE17_REPORT.md).

**Rule:** money numbers stay deterministic Go. Gemini explains and asks. It never invents amounts, UTRs, bank rows, or MATCHED.

---

## 0. What you asked for vs what we will actually build

The leftover list mixed three different things: **product gaps**, **domain that is not Razorpay merchant books**, and **submission packaging**. Treat them separately.

| Ask | Verdict | Why |
|---|---|---|
| Razorpay Test Mode live E2E | **Build, honestly** | Prove live payment fetch + webhook. Settlement + bank for 50+ still come from seed/import. Say that on camera. |
| Refunds API | **Build** | Real Razorpay refund client + observation type. Stop pretending settlement `line_type=refund` is a refund entity. |
| Ledger `get_ledger_entry` | **Build a derived cash ledger** | Not a GL. Derive debit/credit lines from payments, settlement fee/tax, refunds, proven bank. Keep refusing invented journal entries. |
| Forward cash forecaster | **Build a 7-day schedule, not a forecast** | Bucket existing `SettledAt` / SLA windows. Gemini explains the schedule. Label it `schedule_projection`. |
| GL tax-line matcher | **Do not build GST→GL** | Different product. Instead ship a **fee/tax breakdown** API (already in the data) and an agent that explains tax lines. That *is* the Razorpay merchant version. |
| 5-min pitch + public repo | **Packaging, last** | Needs a working demo command + report JSON. Not a new engine. |
| Test every JSON API | **Build httptest contracts now** | Financial + close handlers have **zero** HTTP tests today. |
| Nothing breaking | **Regression gate** | Phase 11 eval must stay P=R=F1=1.0, false_match=0. Ask Zord goldens must stay green. |
| Where to use AI/ML | **See §2** | Agents sit *on* the books, not *in* the books. |

---

## 1. Where AI/ML belongs (and where it must not)

### Already AI (keep)

| Surface | What it does | Must stay true |
|---|---|---|
| Gemini RAG `POST /query` | General product Q&A, embeddings | Must **short-circuit** finance questions into Ask Zord (already does) |
| Ask Zord | Explains recon with validators | Deterministic facts. Optional Gemini *rewrite* of prose, discarded if validators fail (`RejectRewrite`) |
| Investigation agent | Plan → tools → hypotheses | Loop stays Go. Optional Gemini only for *phrasing* after evidence exists |

### Add AI here (this phase)

These are the agent layers that make it an **AI Finance Controller**, not a recon CLI.

```text
1. Controller Briefing Agent   (NEW)
   Input:  close-report JSON
   Output: 8–12 sentence merchant briefing
   Tools:  get_recon_summary, get_cash_position, get_cash_schedule,
           list_exceptions, get_tax_breakdown
   Guard:  every number must appear in the JSON. If Gemini adds a ₹, drop the rewrite.

2. Exception Narrator          (extend Phase 9)
   After hypotheses are evaluated, Gemini writes the summary sentence.
   Numbers, root_cause category, impact still copied from structured state.

3. Cash / tax explainer        (extend Ask Zord)
   “When does in-flight cash hit?” → schedule tool + prose
   “Why is net ₹9,882 not ₹10,000?” → tax breakdown tool + prose
```

### Never put an LLM / ML model here

| Layer | Reason |
|---|---|
| `ReconcilePayment` / `ReconcilePayout` | Rule labels. Phase 11 already proved this. |
| `CashPosition` / 7-day buckets | Sums of `int64`. |
| Fee/tax arithmetic | `lineNet = amount − fee − tax`. |
| Derived ledger lines | Copy from observations. |
| Match / false-match metrics | Count vs ground truth. |
| `BankCreditProven` | Evidence policy, not a classifier. |

No embeddings for bank matching. No trained ranker. No ROC-AUC. UTR confidence stays `ScoreUTRAndAmount`.

That is the 2026 bet in the PS: **verification capacity**, not generation speed.

---

## 2. Workstreams (files, functions, outcome)

### A. API JSON contract tests (do first — nothing else until this is green)

**Why first:** you asked to prove every finance endpoint sends correct JSON, and that new work does not break old APIs. Today `FinancialHandler` and `CloseHandler` have **no httptest**.

**Directory:** `backend/zord-outcome-engine/handlers/`

| File | What it tests |
|---|---|
| `financial_handler_contract_test.go` | `GET /v1/reconciliation/summary`, `cash-position`, `exceptions`, `payments/:id`, `sla-policy`, `POST /v1/reconciliation/run` |
| `close_handler_contract_test.go` | `POST /v1/finance-close/run` JSON keys + types |
| `api_json_schema_test.go` | Shared helpers: `Content-Type: application/json`, required keys, `currency=INR`, amounts are numbers not strings |

**In-memory store**, same pattern as `payment_handler_test.go`. No Postgres required.

**Must assert (examples):**

```json
GET /v1/reconciliation/summary
{
  "scored_count": <int>,
  "matched_count": <int>,
  "exposure_minor": <int>,
  "currency": "INR",
  "result_counts": {},
  "exposure_by_reason": []
}

GET /v1/reconciliation/cash-position
{
  "gross_captured_minor": <int>,
  "settlement_expected_net_minor": <int>,
  "bank_credited_proven_minor": <int>,
  "in_flight_minor": <int>,
  "unresolved_exposure_minor": <int>,
  "currency": "INR",
  "as_of": <RFC3339>
}

POST /v1/finance-close/run
{
  "close_run_id": "...",
  "records": <int>,
  "matched": <int>,
  "exceptions": <int>,
  "match_rate": <float 0..1>,
  "false_resolutions": 0,
  "exception_list": [{ "entity_id", "reason", "variance" }],
  "accuracy": { "precision", "recall", "f1", "false_match_rate" },
  "cash_position": { ... }
}
```

**Invariant tests:** `settled ≠ bank_credited_proven`; `MATCHED` payload never includes `"fully_reconciled"`; failed payment never has `bank_credit_proven: true`.

**Outcome:** a failing JSON shape is a red test, not a silent frontend bug.

---

### B. Refunds as first-class money movement

**Directory:** `backend/zord-outcome-engine/`

| File | Function |
|---|---|
| `internal/poll/providers/razorpay/refunds.go` | `FetchRefund`, `ListRefundsPage` — Test Mode keys only |
| `internal/observe/normalize.go` | Stop skipping `refund.*`; emit `RefundObservation` |
| `db/migrations/20260903040000_phase17_refunds.sql` | `provider_refund_observations` |
| `internal/recon/financial.go` | `reconcileFailed` / captured-refunded use **refund observations**, not only settlement lines |
| `handlers/financial_handler.go` | `GET /v1/reconciliation/refunds?payment_id=` |
| `zord-prompt-layer/tools/phase6_tools.go` | `GetRefund` hits the new endpoint, not `SearchSettlements(..., "refund")` |

**JSON from `GetRefund`:**

```json
{
  "payment_id": "pay_…",
  "refunds": [{
    "refund_id": "rfnd_…",
    "amount_minor": 10000,
    "currency": "INR",
    "provider_status": "processed",
    "bank_movement_proven": false
  }],
  "source": "provider_refund_observations"
}
```

If none: `{ "refunds": [], "error": "not_found" }` — never invent a refund.

**Tests:** `TestNormalizeDoesNotSkipRefund`, `TestPAY004` still MATCHED when refund observation exists and bank does not, `GetRefund` contract test.

**Outcome:** investigation agent can say “no refund found” from a real store.

---

### C. Derived cash ledger (replace the stub, do not fake a GL)

**Directory:** `backend/zord-outcome-engine/internal/recon/ledger.go`

`get_ledger_entry` today returns `source_not_in_this_phase`. That was correct when we had nothing. Now we can derive a **cash ledger** from sources we already trust:

```text
captured payment     → debit  merchant receivable (gross)
settlement fee+tax   → credit  that receivable, debit expense (fee/tax lines)
bank CREDIT proven   → credit  cash
in-flight settlement → still receivable, not cash
refund observation   → reverse receivable
payout bank DEBIT    → debit  cash
```

**API:** `GET /v1/reconciliation/ledger?entity_type=payment&entity_id=pay_123`

```json
{
  "entity_type": "payment",
  "entity_id": "pay_123",
  "lines": [
    { "side": "debit",  "account": "receivable", "amount_minor": 10000, "source": "canonical_payment", "evidence_id": "…" },
    { "side": "credit", "account": "fee",        "amount_minor": 272,   "source": "settlement_line",   "evidence_id": "…" },
    { "side": "credit", "account": "tax",        "amount_minor": 0,     "source": "settlement_line" },
    { "side": "debit",  "account": "cash",       "amount_minor": 9728,  "source": "bank", "only_if": "bank_credit_proven" }
  ],
  "balanced": true,
  "limitations": ["Not a statutory GL. Derived from Razorpay + bank observations."]
}
```

Accounts are a **fixed enum**: `receivable`, `cash`, `fee`, `tax`, `refund`, `payout`, `unresolved_exposure`. No merchant chart of accounts. If evidence is missing, omit the line — do not invent.

`GetLedgerEntry` in prompt-layer calls this API. Investigation “missing ledger” goes away when lines exist.

**Outcome:** Ask Zord can answer “show me the books for pay_123” with evidence IDs.

---

### D. Forward cash — 7-day **schedule**, not a forecast

**Directory:** `internal/recon/cash_schedule.go`

Inputs that already exist: `SettledAt`, `ValueDate`, `BankCreditProven`, payout SLA (`GET /v1/reconciliation/sla-policy`).

```text
For each MATCHED-or-in-flight payment:
  if bank_credit_proven → day 0 (already received)
  else if SettledAt set  → bucket SettledAt + 0..3d (reuse defaultDateWindow)
  else                   → bucket "unknown_timing" (do not guess a date)

For open payouts:
  expected debit = created_at + mode SLA (IMPS 15m / NEFT 60m)
```

**API:** `GET /v1/reconciliation/cash-schedule?days=7`

```json
{
  "as_of": "...",
  "horizon_days": 7,
  "kind": "schedule_projection",
  "days": [
    { "date": "2026-09-03", "expected_credit_minor": 0, "expected_debit_minor": 0, "count": 0 }
  ],
  "unknown_timing_minor": 0,
  "limitations": ["Not a statistical forecast. Buckets observed settlement dates + SLA."]
}
```

Gemini (Ask Zord `CASH_POSITION` / new `CASH_SCHEDULE` intent) **explains** this JSON. It does not predict a 9th day.

**Outcome:** you can demo the track title *and the cash position* without fake ML.

---

### E. Tax-line matcher — Razorpay sense, not GST-GL

**Do not** map HSN/GST to GL accounts. That data is not in this product.

**Do** ship the matcher the settlement file already supports:

**API:** `GET /v1/reconciliation/tax-breakdown?payment_id=`

```json
{
  "payment_id": "pay_123",
  "gross_minor": 10000,
  "fee_minor": 272,
  "tax_minor": 0,
  "net_minor": 9728,
  "bank_credited_minor": 9728,
  "explained": true,
  "reason": "fee_explained"
}
```

Wire Ask Zord knowledge + a tool `get_tax_breakdown`. Agent answer:

> Gross ₹10,000. Fee ₹272. Tax ₹0. Net ₹9,728 equals proven bank credit. This is not an exception.

That is the **tax-line matcher** for a Razorpay merchant.

---

### F. Razorpay Test Mode live E2E (honest hybrid)

Test Mode **does** give: payments API, webhooks, payouts.  
Test Mode **does not** give: a 50+ labeled settlement+bank batch.

**Directory:** `backend/zord-outcome-engine/cmd/finance-e2e/` + `testing/e2e/live_payment_test.go`

```text
Step 1  razorpay-smoke (existing)     Test Mode FetchPayments
Step 2  optional webhook replay       edge → observe → canonical_payments
Step 3  finance-seed                  synthetic settlement + bank + labels
Step 4  finance-close                 match rate + exceptions + throughput
Step 5  Ask Zord + investigate        against that tenant
```

**CLI:** `go run ./cmd/finance-e2e --live-payments --seed-batch`

Prints a JSON report:

```json
{
  "live_payments_fetched": 12,
  "live_mode": "test",
  "seeded_records": 120,
  "close": { "match_rate": 0.88, "exceptions": 14, "throughput_per_s": 1800 },
  "limitations": [
    "Settlement and bank rows are synthetic. Razorpay Test Mode has no settlement/bank feed for a 50+ labeled batch."
  ]
}
```

That sentence in `limitations` is the credibility win. Do not claim Test Mode produced the whole loop.

---

### G. Controller Briefing Agent (the AI piece judges will remember)

**Directory:** `backend/zord-prompt-layer/agents/briefing/`

```text
POST /v1/finance/briefing
body: { tenant_id, connector_id, close_run_id }
```

Flow:

```text
Load close report JSON (deterministic)
  → Gemini: 8–12 sentence briefing for a merchant finance lead
  → Validate: every integer in the prose must exist in the JSON
  → If rewrite fails validation, return the template briefing (no LLM)
```

Template fallback (always works, even with Gemini down):

> Closed 120 records. Match rate 88.3%. 14 exceptions remain. Unresolved exposure ₹12,845. False resolutions 0. Settled is not bank credited. In-flight ₹X. Root causes are listed; none were guessed.

**Tests:** golden briefing with mocked Gemini that injects “we lost ₹50,000” → must be rejected.

---

### H. Pitch packaging (last, not a phase of the engine)

- `make demo` already planned: seed → close → print report
- 5-min video script lives in `PITCH.md` (what to say, what not to claim)
- Public repo is a git/remote task — only when you ask to push

---

## 3. Sequence (build → test → report → E2E)

```text
0. Baseline test report          (this document’s companion run)
1. A  JSON contract httptests    ← gate for everything else
2. E  Tax breakdown API + tests
3. D  Cash schedule API + tests
4. C  Derived ledger + GetLedgerEntry
5. B  Refunds client + observations
6. G  Briefing agent + hallucination tests
7. F  finance-e2e CLI (hybrid live+seed)
8. Re-run full test gate + Phase 11 eval
9. Report 2: before/after JSON + metrics
10. Only then: live E2E against DATABASE_URL
```

Frontend stays **after** step 9. Report shape should be stable.

---

## 4. Test gate (nothing merging if this fails)

```bash
cd backend/zord-outcome-engine
go test ./internal/recon/... ./internal/recon/eval/... ./handlers/... ./internal/close/... ./internal/dataset/... ./internal/observe/...

cd backend/zord-prompt-layer
go test ./agents/askzord/... ./agents/investigate/... ./tools/...

go run ./cmd/phase11-eval   # must stay P=1 R=1 F1=1 false_match=0
```

New packages must add tests in the same PR as the code. Contract tests fail if a JSON field is renamed or an amount becomes a string.

---

## 5. What we will not do

- GST / HSN / statutory GL mapping
- Statistical cash forecast / time-series model
- LLM inside `ReconcilePayment`
- Claiming Razorpay Test Mode produced settlement+bank for 50+ records
- Auto-refund, auto-ledger post, forced MATCHED
- Filling `get_ledger_entry` with invented journals

---

## 6. Expected demo after this phase

```text
Live Test Mode: fetched N payments (rzp_test_…)
Synthetic close: 120 records, match_rate 88%, 14 exceptions, 0 false resolutions
Cash: proven vs in-flight vs 7-day schedule (labeled schedule_projection)
Tax: pay_123 fee ₹272 explained, not an exception
Ledger: derived 4 lines, balanced, evidence IDs
Refunds: GetRefund returns [] or real rfnd_* from observations
Agent briefing: Gemini prose, every ₹ copied from JSON
Limitation spoken: Test Mode has no settlement/bank feed; batch is seeded and labeled
```

That is still **one finance-ops loop**, now with books + cash + an agent that can talk about both without lying.

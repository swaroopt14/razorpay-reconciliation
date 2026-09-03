# Remaining backend work — AI Finance Controller

**Track:** Razorpay AI Buildathon 04 — *Run the books and the cash position.*

**The bar:** close **one** finance-ops loop across a **50+ record synthetic batch**, reporting **match rate** and the **exceptions it could not resolve**. Judged on **throughput + measured accuracy + an honest exception list**. One cherry-picked match proves nothing.

This document is the gap analysis and build plan for what is **left in the backend** before frontend work starts.

---

## 0. Where we actually are

| Phase | What it gives the demo | State |
|---|---|---|
| 1–5 | Razorpay client, webhooks, canonical payments, settlement lines, bank ingress, Settlement↔Bank candidates | Done |
| 6 / 6B | Deterministic recon → `MATCHED` / exception + `variance_amount`, payments **and** payouts | Done |
| 7 | Evidence, provenance, SHA-256 packs, decision/calculation traces | Done |
| 8 | Ask Zord — explain and cite, with anti-hallucination validators | Done |
| 9 | Investigation agent — hypothesis loop, stopping policy, `UNKNOWN` when unproven | Done |
| 11 | Offline eval harness, 153 labeled cases, real P/R/F1 | Done |

**We already have the hard part:** a deterministic engine, an evidence layer, and an agent that refuses to lie. What is missing is the **demo loop** — one batch, one number, one honest exception list.

---

## 1. Gap analysis against the bar

| The bar asks for | Today | Gap |
|---|---|---|
| **50+ record synthetic batch** | 153 cases exist **in memory only** (`eval.BuildCorpus`) | **No seeder writes them to Postgres.** Live recon has nothing to read. |
| **Match rate** | `matched_count` / `scored_count` derivable from `GET /v1/reconciliation/summary` | Not a first-class field; no single "close the loop" call |
| **Exceptions it could not resolve** | Exceptions list + Phase 9 reports exist separately | Never joined into one artifact |
| **Throughput** | Only in offline `cmd/phase11-eval` | **Absent from the live API** |
| **Measured accuracy** | Offline vs a hardcoded corpus | Not measured on the **live batch**, because live data has no labels |
| **Honest exception list** | Phase 9 says `UNKNOWN` correctly | Not surfaced as one report |
| **Cash position** (track title) | Ask Zord `CASH_POSITION` is just an aggregate re-skin | **No expected-vs-received cash position** |

Plus one **real quality gap** Phase 11 already exposed and we did not hide:

```text
false_match_rate = 0.203
```

`partial_settlement` and `duplicate_settlement` still return `MATCHED` when Phase 5 attached an `EXACT` bank row. That is 12 records the engine silently accepts. **We should fix the engine, not the label.**

---

## 2. Phase 12 — Close the two recon rule gaps

**Why first:** every downstream metric inherits this. Fixing it moves false-match from 0.203 toward 0 *honestly*.

**Directory:** `backend/zord-outcome-engine/internal/recon/`

| File | Change |
|---|---|
| `financial.go` | `reconcileCaptured()` — before trusting `exact`, compare settlement net against payment amount and detect duplicate payment lines |
| `exceptions.go` | Add `DeterministicInvestigation` cases for two new reasons |
| `financial_test.go` | `TestPAY009_PartialSettlementIsVariance`, `TestPAY010_DuplicateSettlementIsConflicted` |
| `eval/corpus.go` | Flip `partial_settlement` / `duplicate_settlement` **oracle** labels to match new truth |

**New rules**

```text
PAY-009  captured + settlement net < payment amount (beyond fee+tax)
         → VARIANCE / partial_settlement
         variance = payment_amount - settlement_net

PAY-010  captured + >1 payment-type settlement line for same payment_id
         → CONFLICTED / duplicate_settlement
```

**Invariant:** an `EXACT` bank decision proves *the bank matched that settlement line*. It does **not** prove the settlement covered the whole payment. Do not delete the EXACT evidence — carry it and still raise the exception.

**Outcome:** `go run ./cmd/phase11-eval` reports `false_match_rate ≈ 0.000`, recall ≈ 1.0, and regression stays 1.000 after oracle update.

---

## 3. Phase 13 — Synthetic dataset + Postgres seeder

**Why:** this is the single biggest blocker. Nothing else in the demo can run without rows in the database.

**Directory:** `backend/zord-outcome-engine/internal/recon/dataset/` + `backend/zord-outcome-engine/cmd/finance-seed/`

| File | Functionality |
|---|---|
| `dataset/generate.go` | `Generate(cfg Config) Batch` — deterministic (seeded RNG) 120-record batch, configurable clean/exception mix, realistic INR amounts, UTRs, value dates |
| `dataset/families.go` | Reuse Phase 11 families so eval and demo share one vocabulary |
| `dataset/truth.go` | `GroundTruth{EntityID, ExpectedResult, ExpectedReason, ExpectedException, ExpectedVariance}` |
| `dataset/write.go` | `Seed(ctx, *sql.DB, Batch)` — bulk insert into the **real** tables |
| `cmd/finance-seed/main.go` | CLI: `--tenant --connector --count --seed --truncate` |
| `db/migrations/20260903030000_phase13_synthetic_truth.sql` | New table `synthetic_ground_truth` (new file — do **not** touch applied `20260902*`) |

**Tables written** (all existing):

```text
canonical_payments
provider_payment_observation_events
provider_settlement_line_observations
bank_transaction_observations
settlement_bank_match_decisions
canonical_payouts
provider_payout_observation_events
synthetic_ground_truth          ← new, labels only
```

**Hard rule:** the seeder writes **observations and canonical facts only**. It must **never** write `reconciliation_results` or `reconciliation_exceptions`. Recon has to earn those.

**Decision needed — the exception mix.** Phase 11's corpus is ~40% exceptions because it is a *stress* corpus: it deliberately over-samples every failure family to test the engine. A demo batch should look like production, roughly **85–92% clean**, so the headline match rate is believable. Recommendation: ship **two profiles** from the same generator — `--profile realistic` (default, ~88/12) for the demo, `--profile stress` (~60/40) for eval. Same code, same labels, different sampling weights. Then quote the realistic number on camera and mention the stress number as evidence the engine was actually pushed.

**Outcome:**

```bash
go run ./cmd/finance-seed --count 120 --seed 42
# 120 records seeded: 71 clean, 49 exception-bearing, ground truth stored
```

---

## 4. Phase 14 — Close-the-loop orchestrator

**Why:** the judge should run **one** command and see the whole loop.

**Directory:** `backend/zord-outcome-engine/internal/close/` + handler

| File | Functionality |
|---|---|
| `close/service.go` | `Service.Run()` — recon run → summary → exceptions → prioritize → (call Phase 9) → assemble report |
| `close/metrics.go` | Wall-clock timing, `records_per_second`, p50/p95 per record |
| `close/report.go` | `CloseReport` struct — the demo artifact |
| `handlers/close_handler.go` | `POST /v1/finance-close/run`, `GET /v1/finance-close/:id` |
| `routes/outcome_route.go` | Register both under JWT |
| `db/migrations/20260903030001_phase14_close_runs.sql` | `finance_close_runs` (report JSONB + timing) |

**Also add to `reconciliation_runs`:** `duration_ms`, `throughput_per_s`.

**Report shape:**

```json
{
  "close_run_id": "...",
  "records": 120,
  "matched": 71,
  "exceptions": 49,
  "match_rate": 0.592,
  "investigated": 20,
  "resolved_by_investigation": 0,
  "still_unresolved": 49,
  "unresolved_exposure_minor": 1284500,
  "currency": "INR",
  "false_resolutions": 0,
  "throughput_per_s": 1840.2,
  "duration_ms": 65,
  "exception_list": [ { "entity_id": "...", "reason": "...", "variance": 0, "certainty": "UNKNOWN" } ]
}
```

**Invariant:** `resolved_by_investigation` may only increment when a hypothesis is `PROVEN` **and** Phase 6 already accounts for it. Phase 9 never rewrites `MATCHED`. A batch that resolves nothing and says so is a **passing** result.

**Outcome:** one call produces match rate + throughput + the exception list.

---

## 5. Phase 15 — Measured accuracy on the live batch

**Why:** the bar says *measured accuracy*, not "our engine says 92%". Because the batch is synthetic and labeled, we can score the **live DB run** against ground truth.

**Directory:** `backend/zord-outcome-engine/internal/close/`

| File | Functionality |
|---|---|
| `close/accuracy.go` | Join `synthetic_ground_truth` × `reconciliation_results` → confusion matrix |
| `close/accuracy_test.go` | Seeded run must hit precision/recall targets |
| handler | `GET /v1/finance-close/:id/accuracy` |

**Metrics** (reuse `internal/recon/eval/metrics.go` — do not fork the math):

```text
precision, recall, F1
match_rate, false_match_rate
exception_capture_rate
variance_detection_rate
amount_weighted_accuracy
evidence_completeness
throughput, p50 / p95 latency
```

**Keep omitting ROC-AUC / PR-AUC** with the stated reason: recon emits rule labels, not a scored binary classifier. Saying that out loud is a credibility win, not a weakness.

**Outcome:** `/accuracy` returns real numbers computed against labels the engine never saw.

---

## 6. Phase 16 — Cash position

**Why:** the track is literally *"run the books **and the cash position**"*. Right now `CASH_POSITION` in Ask Zord just re-prints exception exposure.

**Directory:** `backend/zord-outcome-engine/internal/recon/`

| File | Functionality |
|---|---|
| `cash.go` | `CashPosition(results, lines, banks) CashSnapshot` — deterministic Go sums, no LLM |
| `cash_test.go` | Settled ≠ received; unresolved is its own bucket |
| `handlers/financial_handler.go` | `GET /v1/reconciliation/cash-position` |
| `zord-prompt-layer/tools/phase6_tools.go` | `get_cash_position` tool |
| `zord-prompt-layer/agents/askzord/retrieve.go` | `IntentCashPosition` calls the real tool |

**Snapshot:**

```json
{
  "gross_captured_minor": 0,
  "settlement_expected_net_minor": 0,
  "bank_credited_proven_minor": 0,
  "in_flight_minor": 0,
  "unresolved_exposure_minor": 0,
  "as_of": "..."
}
```

**Invariant — the whole point of this project:**

```text
settlement_expected_net  ≠  bank_credited_proven
```

`bank_credited_proven` counts **only** results where `BankCreditProven == true`. `in_flight` = expected net with no proven bank credit yet. Never sum them into one "cash" number.

**Optional forward view (only if time):** `expected_credit_next_7d` from settlement value dates. Label it a **schedule projection**, not a forecast. No ML.

---

## 7. Phase 17 — Refunds as first-class money movement (P2)

Currently refunds only exist as settlement `line_type=refund`. `refund.*` webhooks are explicitly skipped.

| File | Change |
|---|---|
| `internal/poll/providers/razorpay/refunds.go` | `FetchRefund` / `ListRefundsPage` |
| `internal/observe/normalize.go` | Stop skipping `refund.*`; emit a **separate** observation type |
| `db/migrations/20260903030002_phase17_refunds.sql` | `provider_refund_observations` |
| `internal/recon/financial.go` | Refund becomes real evidence for `reconcileFailed` |

**Cut this if time is short.** Say "refunds are settlement-line only in this build" — an honest limitation beats a fake API.

---

## 8. Phase 18 — End-to-end acceptance

**Directory:** `backend/zord-outcome-engine/testing/e2e/` + repo root

| File | Functionality |
|---|---|
| `Makefile` | `make demo` — compose up → migrate → seed → close → print report |
| `testing/e2e/finance_close_e2e_test.go` | Build-tagged: seed 120 → run close → assert match rate, throughput, 0 false resolutions |
| `scripts/demo.sh` | The 5-minute pitch script, one command |

**Chain proved:**

```text
seed (synthetic) → canonical payments → settlement lines → bank rows
   → Phase 6 recon → Phase 7 evidence → Phase 9 investigation
   → close report (match rate + throughput + exceptions)
   → Ask Zord answers questions about it
```

**Honest note for the video:** Razorpay Test Mode is wired (Phases 1–3) but the *batch* is synthetic, because Test Mode has no settlement or bank feed. Say that on camera. It is the correct engineering answer, and judges will check.

---

## 9. Sequencing

| Order | Phase | Priority | Why |
|---|---|---|---|
| 1 | 12 — recon rule gaps | **P0** | Every metric inherits it |
| 2 | 13 — seeder | **P0** | Nothing runs without rows |
| 3 | 14 — close loop | **P0** | The demo artifact |
| 4 | 15 — live accuracy | **P0** | "Measured accuracy" in the bar |
| 5 | 16 — cash position | **P1** | Track title says it |
| 6 | 18 — E2E + `make demo` | **P1** | Judge reproducibility |
| 7 | 17 — refunds | **P2** | Cut if tight |
| 8 | Ledger | **P2** | Keep the honest stub |

**P0 is four phases.** That is the minimum to satisfy the bar. Frontend starts after 14 lands (the report shape stops changing there).

---

## 10. Invariants that carry into every phase

These are non-negotiable and already enforced by tests:

```text
Razorpay `settled`      ≠  bank_credited
MATCHED                 ≠  fully_reconciled
unresolved exposure     ≠  proven loss
Never rename a Razorpay status (no STUCK, no SLA_BREACH)
Never force a match to improve a metric
Never fabricate an evidence ID, bank row, or settlement
Agent may not write MATCHED
UNKNOWN is a first-class, passing answer
```

**The differentiator:** most submissions will report a 95% match rate on data they generated to match. Ours reports the match rate, the false-match rate, the exceptions it **could not** resolve, and the reason it refused to guess — with evidence IDs behind every number.

---

## 11. What the finished demo says

```text
120 synthetic records (realistic profile)
106 matched deterministically          match rate 88.3%
 14 exceptions
 14 investigated by the agent
  0 false resolutions
 14 still unresolved                   exposure ₹12,845.00

throughput 1,840 records/sec           p95 0.7ms/record
precision 1.00  recall 1.00  F1 1.00   (vs held-out ground truth)

"₹10,000 moved through the bank on a failed payment.
 No settlement, no refund, no ledger entry.
 Root cause is not proven. This is unresolved exposure, not a loss."
```

That is a Finance Controller artifact. Not a chatbot with a dashboard.

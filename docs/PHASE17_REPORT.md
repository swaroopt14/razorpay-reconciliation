# Phase 17 report — remaining backend, then tests, then E2E

**Date:** 2026-09-03  
**Repo:** `razorpay-reconciliation`  
**Rule that still holds:** money numbers stay deterministic Go. Gemini may rephrase. It never invents amounts, UTRs, bank rows, or MATCHED. Razorpay `settled` is never `bank_credited`.

Do **not** quote Phase 11 `P=1.000` as demo accuracy. That number is regression against the engine’s own oracle. Demo numbers are the close report below.

---

## What shipped

| Workstream | Outcome |
|---|---|
| A. JSON contract httptests | `GET` summary / cash-position / cash-schedule / tax-breakdown / ledger / refunds / payment (with `observations`) / sla-policy; `POST` recon run; `POST` finance-close/run |
| B. Refunds | Razorpay `FetchRefund` / `ListRefundsPage`; `NormalizeRefund`; `provider_refund_observations`; `GET /v1/reconciliation/refunds`; `GetRefund` is no longer a settlement-line alias |
| C. Derived cash ledger | `GET /v1/reconciliation/ledger`; `GetLedgerEntry` calls it. Empty lines, never invented journals. Not a statutory GL |
| D. 7-day schedule | `GET /v1/reconciliation/cash-schedule` with `kind: schedule_projection` |
| E. Tax breakdown | `GET /v1/reconciliation/tax-breakdown/:payment_id`; Ask Zord pulls it on fee/tax/net questions |
| F. Hybrid E2E | `go run ./cmd/finance-e2e --live-payments --profile realistic --limit 120` |
| G. Controller briefing | `POST /v1/finance/briefing`; Gemini rewrite discarded if it adds numbers |

Not built, on purpose: GST→GL, statistical forecast, LLM inside `ReconcilePayment`.

---

## Test gate

```text
outcome-engine  recon / eval / dataset / observe / handlers / razorpay / finance-e2e / testing/e2e   PASS
prompt-layer    askzord / investigate / briefing / finance / tools                                   PASS
phase11-eval    n=153  regression=1.000  P=1.000 R=1.000 F1=1.000  false_match=0                     PASS
```

Phase 11 `P=R=F1=1.0` is **oracle regression**, not held-out live traffic.

---

## E2E results

### 1. In-memory (`DATABASE_URL` unset)

62 records (realistic profile, 50+ required). Match rate **0.758**. 47 MATCHED, 15 exceptions, 0 false resolutions.

That 0.758 is the engine matching its own seeded families, not Postgres ground truth.

### 2. Postgres (fresh DB `zord_finance_e2e` on `:5433`)

Migrations through `20260903040000_phase17_refunds`. Seed bug fixed (settlement insert had 18 args for 17 placeholders).

| Field | Value |
|---|---|
| records | 62 |
| matched | 47 |
| exceptions | 15 |
| match_rate | **0.758** |
| false_resolutions | 0 |
| false_match_rate | **0** |
| investigated | 15 (none resolved by investigation — correct; agent cannot force MATCHED) |
| throughput | ~1.3k records/s |
| duration | 46 ms |

**Accuracy vs `synthetic_ground_truth` (the honest metric):**

| precision | recall | f1 | false_match |
|---|---|---|---|
| 1.000 | 0.758 | 0.862 | 0 |

Precision 1.0 and false_match 0 mean: nothing the engine called MATCHED was labeled an exception. Recall 0.758 is **not** “we missed 15 exceptions on the board” — those 15 are listed. Close accuracy currently treats a result as correct only when `FinancialResult.Exception != nil`, and SQL list does not hydrate that pointer, so UNRESOLVED rows fail the “correct” check even when `result` + `reason` match the label. **Do not present 0.758 recall as missed exceptions.** Present the exception list.

**Exception list (all variance 0, certainty UNKNOWN):**

- 5× `settlement_without_bank` (UNRESOLVED)
- 10× `captured_missing_settlement` (UNRESOLVED)

**Cash position (minor units, INR):**

| gross_captured | settlement_expected_net | bank_credited_proven | in_flight | unresolved_exposure |
|---|---|---|---|---|
| 2,900,396 | 1,855,132 | 1,626,332 | 228,800 | 0 |

In-flight (228,800) is settled-not-bank-proven. Unresolved exposure is 0 because these exception reasons copy variance 0, not the payment amount. That is a metric gap (see remaining).

### 3. Live Test Mode

`--live-payments` called Razorpay Test Mode `FetchPayments`. **0 payments returned** (empty test account, or keys that are not a funded Test Mode merchant). Settlement + bank for the 62-row close are **synthetic**. Spoken limitation:

> Razorpay Test Mode has no settlement/bank feed for a 50+ labeled batch.

---

## Remaining — what to update next

### Must fix before you pitch numbers

1. **Close accuracy vs labels** — hydrate `Exception` on listed results, or score `result != MATCHED` as exception. Then recall should move toward 1.0 for this seed (the 15 exceptions are already in `exception_list`).
2. **`unresolved_exposure_minor`** — missing settlement / missing bank currently contribute 0 variance. Copy `amount_minor` (or expected net) so the briefing’s “unresolved exposure” is not ₹0 while 15 items are open.
3. **Existing DB `zord_outcome_phase3`** — goose refuses `Up` (`missing migration 20260902050000` before version `20260902200000`). Use a **fresh** database for demo (`zord_finance_e2e` works). Do not fight the old goose history on camera.

### Product gaps (not in this phase, still needed)

4. **Frontend / live proof UI** — React chips still not started. Report JSON is stable enough to wire.
5. **Pitch packaging** — `PITCH.md` + 5-min script + public repo. Last, not engine work.
6. **Webhook replay E2E** — `finance-e2e` does not POST a signed webhook through edge → observe → canonical. Only optional Test Mode `FetchPayments`.
7. **Refund backfill** — client exists; no job that lists Razorpay refunds into `provider_refund_observations` for a tenant.
8. **Briefing `close_run_id`** — handler currently reads `GET /summary`, not the saved close report. Wire `GET /v1/finance-close/:id` so briefing numbers equal the close JSON.
9. **Payout ledger** — derived ledger is payment-only. `GetLedgerEntry` for `pout_*` still empty.
10. **`POST /v1/connectors/razorpay/test`** — still a mock health result, not the real client.
11. **Seed JSON** — `SeedResult` now has `json` tags; re-run e2e if you need `batch_id` in the seed object.
12. **Realistic profile cap** — `--limit 120` yields **62** rows (clean families + 15 exceptions). To show 120 on stage, use `--profile stress` or add more matched families to the realistic selector.

### Out of scope (do not build for this track)

- GST / HSN / statutory GL
- Statistical cash forecast
- LLM inside recon
- Claiming Test Mode produced settlement+bank for 50+ records
- Auto-refund, auto-ledger post, forced MATCHED

---

## Demo line (honest)

Live Test Mode: fetched **0** payments (empty test merchant).  
Synthetic close: **62** records, match_rate **75.8%**, **15** exceptions, **0** false MATCHED.  
Cash: proven **₹16,263.32** vs in-flight **₹2,288.00** (amounts are minor/100). Schedule is `schedule_projection`, not a forecast.  
Limitation spoken: Test Mode has no settlement/bank feed; the batch is seeded and labeled.

```bash
# tests
make test

# in-memory e2e
make e2e

# postgres e2e (fresh DB)
DATABASE_URL='postgres://postgres@127.0.0.1:5433/zord_finance_e2e?sslmode=disable' \
  make e2e
```

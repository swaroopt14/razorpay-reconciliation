# Phase 11 — Evaluation Harness

**Status:** implemented in `backend/recon/internal/recon/eval/`.

**Locked definition:** A **controlled, labeled ground-truth corpus** (100+ records) plus a **real metrics runner** against Phase 6 `ReconcilePayment` / `ReconcilePayout` / `OrphanBankResult`. This is a product phase, not leftover unit tests.

```text
Labeled fixture
      ↓
ReconcilePayment / ReconcilePayout / OrphanBank
      ↓
Compare to controller truth + engine oracle
      ↓
Precision / Recall / F1 / match / false-match / capture / variance / amount-weighted / evidence / latency
```

This clone only. No new microservice. No live Razorpay. No invented ledger/refund APIs. Do not fold this into Ask Zord or Phase 9’s 15 goldens. Do **not** emit ROC-AUC / PR-AUC — recon is a rule labeler, not a scored binary classifier.

---

## What is being evaluated

| Component | How | Not this phase |
|---|---|---|
| Phase 6 payment / payout / orphan recon | In-process `Reconcile*` on fixtures | Live Test Mode |
| Phase 5 decision states | Fixtures **carry** EXACT / VARIANCE / AMBIGUOUS / CONFLICTED (already decided) | Re-scoring UTR from scratch |
| Phase 7 / 8 / 9 | Evidence completeness uses Phase 6 `EvidenceRefs` only | Ask Zord goldens, investigation loop, Merkle packs |

Two scores, on purpose:

| Score | Label | Meaning |
|---|---|---|
| **Regression** | `oracle` | What today’s rules emit. Must stay **1.0**. If it drops, we broke recon. |
| **Quality** | `truth` | What a Finance Controller expects. Can be **< 1.0** when the engine has a known gap. |

Known honest gaps (documented, not hidden):

- `partial_settlement` + EXACT bank on the partial net → engine `MATCHED`; controller wants an exception.
- `duplicate_settlement` + EXACT on combined net → engine `MATCHED`; controller wants an exception.

False-match rate is therefore **real**, not forced to zero.

---

## Corpus (100+)

Families (all must appear):

**Accounted / normal**

- `exact` — payment → settlement → bank EXACT
- `fee_explained` — fee deducted, bank = net
- `tax_explained` — tax deducted, bank = net
- `failed_no_movement` — failed, no bank (MATCHED, not bank credited)
- `failed_refund` — failed + refund line, no bank
- `payout_processed_exact` — processed + unique debit
- `high_confidence` — MATCHED but `bank_credit_proven=false`

**Exceptions**

- `missing_settlement`
- `missing_bank`
- `wrong_amount`
- `wrong_utr` (no EXACT; matcher would not lock)
- `duplicate_settlement`
- `duplicate_bank` / `ambiguous_reference`
- `partial_settlement`
- `fee_variance` (bank ≠ net after fee)
- `tax_variance`
- `date_mismatch` (no EXACT)
- `conflicting_candidates`
- `failed_with_bank`
- `orphan_bank`
- `open_status_no_downstream`
- `payout_missing_bank`
- `payout_failed_movement`
- `payout_open_sla`

Amounts vary. IDs are `eval_<family>_<n>`. Currency INR.

---

## Metrics (quality vs `truth`)

| Metric | Definition | Notes |
|---|---|---|
| Precision | TP / (TP+FP) | Positive = exception present |
| Recall | TP / (TP+FN) | |
| F1 | 2PR/(P+R) | |
| Match rate | predicted MATCHED / N | |
| False-match rate | predicted MATCHED ∧ truth=exception / predicted MATCHED | 0 if no MATCHED |
| Exception capture | TP / truth-exceptions | = recall |
| Variance detection | flagged amount_mismatch or VARIANCE / truth variance families | |
| Amount-weighted accuracy | Σ amount·correct(result+exception) / Σ amount | |
| Evidence completeness | required refs present; must not invent bank when truth says none | |
| Throughput | cases / second | |
| Latency | p50 / p95 per case | |
| ROC-AUC | **omitted** | not a scored classifier |
| PR-AUC | **omitted** | same |

Regression accuracy = exact match of `result` + `exception?` + `reason` to `oracle`.

---

## Where the code lives

```text
backend/recon/
  internal/recon/eval/
    case.go
    corpus.go
    run.go
    metrics.go
    eval_test.go
  cmd/phase11-eval/main.go
```

```bash
cd backend/recon && go test ./internal/recon/eval/ -count=1
go run ./cmd/phase11-eval
```

---

## Explicitly out

- Live Razorpay Test Mode E2E (that is a later Phase 12)
- New `zord-agent-service`
- Fake ROC-AUC from discrete labels
- 50-case investigation LLM benchmark
- Editing applied `20260902*` goose files
- Forcing MATCHED to improve the score

**Phase 11 is complete when the harness has ≥100 labeled records, every listed family, real Precision/Recall/F1, an explicit skip of ROC-AUC, and a false-match rate that can be non-zero.**

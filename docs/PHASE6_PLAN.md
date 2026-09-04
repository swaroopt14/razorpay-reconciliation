# Phase 6 — Reconciliation + Agentic Investigation

**Scope:** Financial story on top of Phase 4 canonical payments, Phase 5 Settlement↔Bank **candidates**, and Phase 6B canonical payouts. Exceptions when money movement cannot be explained. Investigator is a Go graph + HTTP tools on `zord-prompt-layer`.

**Not this phase:** ledger service, refund API + `refund.*` webhooks, `zord-agent-service`, LangGraph, MCP, Merkle / zord-evidence packs, live React proof chips, payout-failure prediction.

Hard rules: Razorpay `settled` is never `bank_credited`. Do not rebuild XLSX parsers or `AttachmentEngine`. Do not call `recon.Match()` / `attachBank` from ingest. Do not set `fully_reconciled` from PSP `settled`. `MATCHED` is not `fully_reconciled` and not `bank_credited`. Razorpay statuses are never renamed to `STUCK` / `SLA_BREACH` / `NORMAL`.

```
canonical_payments ──┐
canonical_payouts ───┤
settlement lines ────┼──► FinancialReconciler ──► reconciliation_results
bank observations ───┤                          └── reconciliation_exceptions
Phase 5 decisions ───┘                                      │
                                                            ▼
                                       prompt-layer agents/finance graph
```

---

## 6A — Deterministic payment engine (`internal/recon`)

Consume, do not re-parse or re-score UTR:

- `canonical_payments` + observation events
- `provider_settlement_line_observations`
- `bank_transaction_observations`
- `settlement_bank_match_decisions`

Hierarchy: exact `payment_id` / `payment_link` / Phase 5 `EXACT_MATCH` → `HIGH_CONFIDENCE` → keep `AMBIGUOUS` → `UNRESOLVED`. Never force a pick.

| Razorpay status (untouched) | Observed movement | `reconciliation.result` |
|---|---|---|
| `captured` + settlement + Phase 5 `EXACT_MATCH` CREDIT | Net accounted | `MATCHED` (bank credit proven via Phase 5 decision) |
| `failed` / `cancelled` + no settlement + no bank CREDIT/DEBIT | Nothing moved | `MATCHED`, **no** exception, **not** bank_credited |
| `failed` + bank CREDIT/DEBIT, no refund/settlement | Money moved | `UNRESOLVED` + exception; impact = bank amount |
| `failed` + refund settlement line, no bank | Refund explains | `MATCHED` |
| `captured` + no settlement | Missing downstream | `UNRESOLVED` + exception |
| Unique UTR, amount differs | Phase 5 `CONFLICTED` | `CONFLICTED` / `VARIANCE`; preserve payment / settlement net / bank amounts |
| Two equal bank candidates | Phase 5 `AMBIGUOUS` | `AMBIGUOUS` |
| Bank CREDIT, no settlement/payment | Phase 5 `ORPHAN_BANK` | `ORPHAN` + exception |
| `authorized`/`created` past 72h, no settlement/bank | Stuck in PSP terms | `UNRESOLVED` + exception; **do not** rename status to `STUCK` |

Amount math, UTR equality, record existence, and age stay deterministic (no LLM).

Migration: `backend/zord-outcome-engine/db/migrations/20260902200000_phase6_reconciliation.sql`

Outbox: `reconciliation.decision.v1`. Trigger: `POST /v1/reconciliation/run` and after bank ingest `Match()` **outside** `imports.Commit`.

---

## 6B — Canonical payouts + payout recon + finance graph

Razorpay client: `FetchPayout`, `ListPayoutsPage`. Store `provider_status` exactly (`pending | scheduled | queued | processing | processed | reversed | cancelled | rejected | failed`). Reducer: failed/open must not overwrite `processed`.

Tables (migration `20260903010000_phase6b_canonical_payouts.sql`): `canonical_payouts`, `provider_payout_observation_events`. Observe `payout.*` on the existing webhook envelope.

`ReconcilePayout` (bank **DEBIT** only):

| Razorpay status | Movement | result |
|---|---|---|
| `processed` + EXACT DEBIT | accounted | `MATCHED` |
| `failed` / `cancelled` / `rejected` + no bank | nothing moved | `MATCHED`, no exception |
| `failed` + unexplained bank | money moved | `UNRESOLVED` + `payout_failed_with_bank_movement` |
| `processed` + no bank | missing downstream | `UNRESOLVED` + `payout_missing_bank` |
| `pending`/`queued`/`processing`/`scheduled` past 15m SLA | still open | `UNRESOLVED` + `payout_open_past_sla`; **status unchanged** |

APIs: `GET /v1/reconciliation/payouts/:id` `{ status, reconciliation, evidence_refs }`, `GET /internal/payouts/:id`, `GET /v1/reconciliation/sla-policy`. `POST /v1/reconciliation/run` loads payments and payouts.

Investigator (`backend/zord-prompt-layer/agents/finance/`): Classify → LoadPrimary → LoadLifecycle → LoadFinancialLinks → LoadBankSettlement → CheckSLA → VerifyEvidence → Draft.

HTTP tools: `get_payout`, `get_payout_events`, `get_sla_policy`, `get_similar_cases`, plus existing payment/settlement/bank/recon/exception/evidence. `get_ledger_entry` stays `source_not_in_this_phase`.

Allowed: narrative root cause, where it stopped, recommendation (`WAIT` / `MONITOR` / `ESCALATE` / `REQUEST_REVIEW`). Forbidden: amount math, UTR equality, inventing records, changing Razorpay status, forcing AMBIGUOUS → MATCHED. Impact = copy `variance_amount`.

Batch: list exceptions `entity_type=payout`, group by reason, investigate **exceptions only**.

---

## Tests

```bash
cd backend/zord-outcome-engine
go test ./internal/recon/ ./internal/payouttruth/ ./internal/observe/ ./internal/poll/providers/razorpay/ ./handlers/ -count=1
DATABASE_URL='postgres://postgres@127.0.0.1:5433/zord_outcome_phase3?sslmode=disable' \
  go test -tags=integration ./internal/persistence/ -count=1
cd backend/zord-prompt-layer && go test ./tools/ ./agents/finance/ -count=1
```

PAY-001..008 and PAYO-001..004 are unit tests in `internal/recon`. Prompt-layer tests do not require live Gemini.

---

## Later

Phase 7 (not this file): [PHASE7_PLAN.md](./PHASE7_PLAN.md) — prove the Phase 6 conclusion. Merkle/ed25519 intent packs in `zord-evidence` stay as they are.

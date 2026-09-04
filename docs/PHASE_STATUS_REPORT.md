# Razorpay reconciliation — what is implemented

User-facing copy through Phase 11 is in [README.md](../README.md) (`Razorpay Reconciliation`).

**Repo:** `razorpay-reconciliation`  
**Date:** 2026-09-03  
**Scope:** this repo only. No new microservice.

Hard rule that still holds: Razorpay `settled` is never `bank_credited`. Only a matched bank observation proves cash in the merchant account.

---

## Status at a glance

| Phase | Purpose | Status |
| --- | --- | --- |
| Phase 1 | Talk to Razorpay safely (REST client) | **Done** |
| Phase 2 | Accept a real Razorpay webhook as an observation | **Done** |
| Observation processor | `provider.observation.received` → payment observation | **Done** |
| PDF Phase 3 | API backfill / freshness / Airflow | **Done** (gap-fill + provenance) |
| Phase 4 | Canonical payment truth (`canonical_payments` + reducer) | **Done** (unit + Postgres integration) |
| Phase 5A | Settlement line truth on `provider_settlement_line_observations` | **Done** |
| Phase 5B | Bank statement ingress + Settlement↔Bank candidates | **Done** (candidates only; no `fully_reconciled`) |
| Phase 6 | Payment-first financial recon + prompt-layer investigation | **Done** (`MATCHED` ≠ bank_credited) |
| Phase 6B | Canonical payouts + payout recon + prompt-layer finance graph | **Done** (derived cash ledger in Phase 17) |
| Phase 7 | Finance evidence, provenance, decision/calc traces, audit, pack | **Done** (SHA-256 pack; Merkle/ed25519 unused) |
| Phase 8 | Ask Zord / Finance RAG (explain + cite; not a recon engine) | **Done** ([PHASE8_PLAN.md](./PHASE8_PLAN.md)) |
| Phase 9 | Investigation agent (hypothesis loop; not a chatbot) | **Done** ([PHASE9_PLAN.md](./PHASE9_PLAN.md)) |
| Phase 11 | Evaluation harness (100+ labeled records; real metrics) | **Done** ([PHASE11_PLAN.md](./PHASE11_PLAN.md)) |
| Phase 17 | Refunds, derived ledger, 7-day schedule, tax breakdown, briefing, hybrid E2E | **Done** ([PHASE17_REPORT.md](./PHASE17_REPORT.md)) |
| Bank / matcher / proof | Multi-source recon, not bank_credited from PSP settled | Done (already in tree) |
| Ingestion (file import) | Validate-then-commit settlement/bank files | Done (already in tree) |
| Refunds / mutations | Refund API + refund webhooks as money movement | **Done** (Phase 17: observations + GET refunds; no API backfill job yet) |
| AI agents | Prompt-layer finance graph + Phase 9 investigation loop (HTTP tools; no LangGraph/MCP) | **Done** (derived ledger + briefing agent) |
| Live console proof UI | React chips; wireframes only | **Not started** |

Edge still does **not** canonicalize. Outcome-engine `paymenttruth.Processor` is the single path for webhook ingest and payment API backfill.

---

## Architecture (locked)

```
                    RAZORPAY TEST MODE
                           │
              ┌────────────┴────────────┐
              │                         │
          REST API                 Webhook
              │                         │
              ▼                         ▼
   zord-outcome-engine          zord-edge
   Razorpay Client              Webhook Handler
              │                    HMAC + receipt
              │                    + ingress_outbox
              │                         │
              │              provider.observation.received
              │                         │
              └────────────┬────────────┘
                           ▼
              zord-outcome-engine /internal/observe
                           │
                           ▼
              provider_payment_observations
              payment.observation.normalized.v1
                           │
                           ▼
                    LATER (not this report)
              recon / refunds / live proof UI
```

Not created on purpose: `zord-razorpay`, `zord-webhook-service`, `razorpay_connectors`.

---

## Phase 1 — Razorpay connector

**Purpose:** communicate with Razorpay safely.

**Where:** `backend/zord-outcome-engine/internal/poll/providers/razorpay/`

| File | Role |
| --- | --- |
| `client.go` | HTTP client, Basic Auth, retry, decode |
| `config.go` | test/live mode, timeout, retries |
| `errors.go` | typed provider errors (401/403/404/429/5xx) |
| `pagination.go` | skip/count only — no recon |
| `redact.go` | keep secrets out of logs |
| `*_test.go` | client / config / pagination / redaction |

**Methods:** `HealthCheck`, `FetchPayment`, `ListPayments` / `ListPaymentsPage`, `ListSettlementReconDay`.

**Retry:** GET only. Retry 429 / 5xx / timeout. Fail 400 / 401 / 403 / 404. Bounded exponential backoff + jitter.

**Edge config API (does not call Razorpay in production path except the mock test):**

- `POST /v1/connectors/razorpay`
- `POST /v1/connectors/razorpay/test`
- `GET /v1/connectors/razorpay/status`
- `GET /v1/connectors`

Migration: `backend/zord-edge/db/migrations/20260826_add_razorpay_connector_fields.sql`  
Extends existing `connectors` (`provider_mode`, `api_key_ref`, `webhook_secret_ref`, health columns).

**Tests:** 47 top-level tests in the four Phase 1 files (`client` 22, `config` 14, `pagination` 6, `redaction` 5). Older notes said 45.

```bash
cd backend/zord-outcome-engine
go test ./internal/poll/providers/razorpay/
```

### Phase 1 leftovers (small)

- `POST /v1/connectors/razorpay/test` still returns a **mock** healthy result. It does not call the outcome-engine client.
- Live mode exists in config; do not use live keys for the demo.
- No `NewConfig` / `BaseURLForMode` helpers — `DefaultConfig` + `Validate` is the equivalent.

---

## Phase 2 — Webhook observation

**Purpose:** prove Razorpay sent a legitimate webhook, persist it, emit an observation. Not payment finality.

**Where:** `backend/zord-edge/`

| Piece | Path |
| --- | --- |
| HMAC | `validator/razorpay_signature_verifier.go` |
| Handler | `handler/razorpay_webhook_handler.go` |
| Service | `services/razorpay_webhook_service.go` |
| Store | `services/razorpay_webhook_store.go` |
| Metrics | `services/razorpay_webhook_metrics.go` |
| Models | `model/razorpay_webhook_event.go`, `model/provider_webhook_receipt.go` |
| Migration | `db/migrations/20260829_create_provider_webhook_receipts.sql` |
| Fixtures | `testdata/razorpay/*.json` |

**Routes**

- `POST /v1/webhooks/razorpay/:connectorID`
- `GET /v1/webhooks/razorpay/receipt/:receiptID`
- `GET /v1/webhooks/razorpay/receipts/:connectorID`

**Implemented contract**

1. Read raw body (1 MB → 413). HMAC is over those bytes, never re-marshaled JSON.
2. Missing event id / signature → 400.
3. Unknown connector → 404. Tenant comes from the connector row (not a client header).
4. **Verify signature first**, then parse JSON.
5. Invalid HMAC → 401 `INVALID_WEBHOOK_SIGNATURE`, nothing persisted.
6. Valid HMAC + bad JSON → 400 `INVALID_WEBHOOK_PAYLOAD`, nothing persisted.
7. SHA-256 of body stored on the receipt.
8. Same TX: `provider_webhook_receipts` + `ingress_outbox`.
9. Unique `(connector_id, event_id)`.
10. Same event + same hash → HTTP 200 `duplicate`, **existing** `receipt_id`, `delivery_count++`, **no second outbox**.
11. Same event + **different** hash → HTTP 200 `payload_conflict`, stored hash kept, no second outbox.
12. Outbox event is `provider.observation.received` (not `payment.captured`).
13. Envelope includes receipt id, hashes, event type, and a **safe payment snapshot** (amount, currency, status, order id). No API secret, no webhook secret, no full payload.
14. Out-of-order `authorized` / `captured` / `failed` are all stored as observations. The handler does not rank them.
15. Metrics: `razorpay_webhook_*` with low-cardinality labels (`provider`, `mode`, `status`, `event_type`).

This is **durable idempotent receipt + transactional outbox**, not “exactly-once HTTP”. Razorpay can retry; we accept 200 so they stop.

**Tests**

```bash
cd backend/zord-edge
go test ./validator ./services ./handler
```

Includes signature tests, service persist/outbox/duplicate/conflict/rollback, handler httptest (200/400/401/404/413).

Postgres end-to-end (optional):

```bash
cd backend/zord-edge
DATABASE_URL=postgres://... go test -tags=integration ./testing -count=1
```

### Phase 2 leftovers (not blockers)

- Integration test is not run in the default `go test ./...` (needs DB + build tag).
- Webhook secret: connector `secret` / `env:` ref first, then global `RAZORPAY_WEBHOOK_SECRET` for local demo.
- Receipt GET/list are not JWT tenant-scoped (webhook capability is connector id + secret).
- Same leftover as Phase 1: connector `/test` is still mock.

---

## Observation processor (after Phase 2)

**Purpose:** turn a legitimate webhook observation into a canonical **payment observation**. Still not recon, refunds, or bank credit.

**Where:** `backend/zord-outcome-engine/internal/observe/`

```
provider.observation.received
        → NormalizePayment (payment.captured / authorized / failed)
        → provider_payment_observations (source=webhook)
        → outcome_outbox payment.observation.normalized.v1
```

- Refund / settlement / other events: **skipped** (no payment row).
- Same snapshot hash: duplicate, no second normalized outbox.
- Different snapshot (e.g. authorized then captured): update the payment row.
- Failed stays `failed`. Never mapped to `bank_credited`.
- Does **not** write `canonical_intents` (those are payout commands).

**HTTP (relay token):** `POST /internal/observations/provider`  
**Kafka:** consumer group `outcome-engine-observation-group` on `payments.ledger.events.v1` (`KAFKA_OBSERVATION_TOPIC` override).

```bash
cd backend/zord-outcome-engine
go test ./internal/observe ./handlers -run Observation
```

---

## Already in the tree (not built in the last Phase 1/2 pass)

These were already present on `feat/new-feature` and stay in scope as later surfaces, not Phase 1/2 gaps.

- **PDF Phase 3:** Razorpay payment/settlement backfill, freshness vs webhook index, Airflow DAGs.
- **Matcher / proof:** `internal/recon` L1–L6, proof APIs, `settled ≠ bank_credited`.
- **File ingestion:** `internal/imports` validate-then-commit; commit does not run the matcher.
- **Wireframes:** `docs/frontend/` and `docs/phase-6-evidence-and-proof.md` (folder `docs/` is gitignored — keep a local copy).

---

## Explicitly not implemented

| Item | Why it is out |
| --- | --- |
| Refund list/fetch/create API | IMPLEMENTATION.md Phase 4 (refunds) |
| `refund.created` as money movement | Observation processor skips refunds |
| Bank ↔ PSP match on webhook | Matcher is a separate path; webhook must stay fast |
| AI / Gemini in the webhook | Would make ingest fragile |
| Live React proof chips | Wireframes only; do not overload Settlement Journal |
| New `zord-razorpay` service | Adapter belongs in outcome-engine |

---

## Phase 4 — Canonical payment truth

**Purpose:** one current payment row, many immutable observations, no last-write-wins regression.

**Where:** `backend/zord-outcome-engine/internal/paymenttruth/`

| Piece | Role |
| --- | --- |
| `db/migrations/20260902050000_create_canonical_payments.sql` | Identity-hash columns on events + `canonical_payments` |
| mapper / reducer | Razorpay status → recon vocab; no backward transitions |
| `Processor.Process` | Single `RunInTx` path for webhook + API backfill |
| `GET /internal/payments/:payment_id` | Current canonical + observation history |
| `payment.canonical.updated.v1` | Outbox when status / amount / intent link changes |

Exact intent link only: `canonical_intents.client_payout_ref` or `business_idempotency_key` = Razorpay `order_id`. Else `unlinked`. Never amount-only.

Applied on local Postgres `127.0.0.1:5433` database `zord_outcome_phase3`.

---

## Phase 5 — Settlement line + bank candidates

**Purpose:** persist settlement-line truth and bank CREDIT observations, then emit Settlement↔Bank **candidates**. Not full Payment↔Settlement↔Bank recon (Phase 6).

**5A** `provider_settlement_line_observations`: adjustment, canonical/provider status, file/row provenance, `payment_link` (`unlinked`/`linked`/`partial`) via exact `payment_id` lookup into `canonical_payments`. Duplicate file hash → `status=duplicate`, zero new rows.

**5B** Edge `POST /v1/bank-statements` hashes the file, stores it, writes `bank_ingest_runs`, emits `bank.statement.received` once. Outcome-engine `POST /internal/bank-statements/ingest` parses with `internal/imports` (not Edge payout parser). `MatchSettlementBank` writes `settlement_bank_match_decisions` and `bank.match.completed.v1`. No `payment_proof_subjects` / `fully_reconciled`.

Migrations: `backend/zord-outcome-engine/db/migrations/20260902100000_phase5_settlement_bank_truth.sql`, `backend/zord-edge/db/migrations/20260902100000_create_bank_ingest_runs.sql`.

---

## Phase 6 — Financial recon + investigation

**Purpose:** explain each canonical payment against Phase 5 settlement/bank candidates. Write `reconciliation_results` / exceptions. Do not call `recon.Match()` from ingest. Do not treat PSP `settled` or recon `MATCHED` as `bank_credited`.

Failed + no settlement + no bank → `MATCHED` with **no** exception and `bank_credit_proven=false`. Failed + unexplained bank movement → `UNRESOLVED` + exception. Orphan bank CREDIT → `ORPHAN`. AMBIGUOUS stays AMBIGUOUS.

APIs under `/v1/reconciliation/*`. Outbox `reconciliation.decision.v1`. Investigator is `zord-prompt-layer` HTTP tools; `get_ledger_entry` returns `source_not_in_this_phase`.

Migration: `backend/zord-outcome-engine/db/migrations/20260902200000_phase6_reconciliation.sql`. Plan: [PHASE6_PLAN.md](./PHASE6_PLAN.md).

---

## Phase 6B — Payouts + agentic investigation

**Purpose:** first-class Razorpay payouts beside payments, and a real investigation graph in `zord-prompt-layer/agents/finance`.

Razorpay payout status is stored exactly (`pending | scheduled | queued | processing | processed | reversed | cancelled | rejected | failed`). Failed does not overwrite `processed`; late `processing` does not regress `processed`. SLA/age is an exception reason (`payout_open_past_sla`), never a status.

`ReconcilePayout` joins bank **DEBIT** only. Failed/cancelled/rejected with no movement → `MATCHED` (no exception). Processed + exact debit → `MATCHED`. Open past 15m SLA → `UNRESOLVED`, status unchanged. `POST /v1/reconciliation/run` loads payments and payouts.

Observe: `payout.*` webhooks reuse `provider.observation.received`. APIs: `GET /v1/reconciliation/payouts/:id`, `GET /internal/payouts/:id`.

Investigator graph: Classify → LoadPrimary → LoadLifecycle → LoadFinancialLinks → LoadBankSettlement → CheckSLA → VerifyEvidence → Draft. Tools: `get_payout`, `get_payout_events`, `get_sla_policy`, `get_similar_cases`. Ledger stays stubbed.

Migration: `backend/zord-outcome-engine/db/migrations/20260903010000_phase6b_canonical_payouts.sql`.

---

## Phase 7 — Evidence, provenance, audit

**Purpose:** prove the Phase 6 conclusion. Phase 6 finds the break; Phase 7 proves it.

Reuse `backend/zord-evidence/internal/finance/` (new tables prefixed `finance_`). Do **not** copy full canonical rows; store pointer + minimal snapshot + SHA-256. Do **not** wire finance packs through `RequiredLeafTypes` / 14-leaf Merkle / ed25519.

Consumes `reconciliation.decision.v1` and `investigation.completed.v1` (Kafka + `POST /internal/finance-evidence/ingest`). Rejected AMBIGUOUS candidates stay on the decision trace. Failed + bank movement cannot be sealed as `PROVEN`. Tenant isolation is enforced in the store. Prompt-layer tools: `get_evidence_pack`, `get_decision_trace`, `get_calculation_trace`, `get_audit_trail`, `verify_evidence`, `get_source_snapshot`. Ledger stays stubbed.

Migration: `backend/zord-evidence/db/migrations/20260903020000_phase7_finance_evidence.sql`. Plan: [PHASE7_PLAN.md](./PHASE7_PLAN.md).

---

## How to verify

```bash
# Phase 1
cd backend/zord-outcome-engine && go test ./internal/poll/providers/razorpay/

# Phase 2 + bank ingress
cd backend/zord-edge && go test ./validator ./services ./handler

# Observation processor + canonical truth + Phase 5 matcher
cd backend/zord-outcome-engine && go test ./internal/paymenttruth/ ./internal/payouttruth/ ./internal/poll/ ./internal/observe/ ./internal/imports/ ./internal/recon/ ./internal/bankingest/ ./handlers/ -count=1

# Postgres (Phase 3 provenance + Phase 4 canonical + Phase 5 chain + Phase 6/6B recon)
DATABASE_URL='postgres://postgres@127.0.0.1:5433/zord_outcome_phase3?sslmode=disable' \
  go test -tags=integration ./internal/persistence/ -count=1

# Prompt-layer investigation graph (no live Gemini)
cd backend/zord-prompt-layer && go test ./tools/ ./agents/finance/ -count=1

# Phase 7 finance evidence (in-memory; no Merkle)
cd backend/zord-evidence && go test ./internal/finance/ -count=1

# Phase 8 Ask Zord (no live Gemini)
cd backend/zord-prompt-layer && go test ./agents/askzord/ ./tools/ ./agents/finance/ -count=1

# Phase 9 investigation loop (fixture HTTP; no live Gemini)
cd backend/zord-prompt-layer && go test ./agents/investigate/ -count=1

# Phase 11 evaluation harness
cd backend/zord-outcome-engine && go test ./internal/recon/eval/ -count=1
```

---

## Phase 8 — Ask Zord / Finance RAG

**Purpose:** explain Phase 6/7 truth. Not a second recon engine. Not Phase 9.

Deterministic Go router (RECORD / AGGREGATE / EXPLANATION / KNOWLEDGE) in `agents/askzord`. Numbers come from HTTP tools and `GET /v1/reconciliation/summary`. Validators reject invented amounts, `settled`→bank credited, `MATCHED`→fully reconciled, `STUCK`, fake `ev_*`, and “we lost ₹X”. Knowledge is seeded glossary markdown. `POST /v1/ask-zord/finance/query` plus `/query` dispatch. Ledger stays stubbed.

---

## Phase 9 — Investigation Agent

**Purpose:** autonomously investigate Phase 6 exceptions. Not Ask Zord, not a second recon engine.

Go loop in `agents/investigate/`: plan → HTTP tools → hypotheses → stop. Evidence policy never assigns `PROVEN` for failed+bank. Stopping policy (max 12 / 20). Batch by `variance_amount`. `POST /v1/investigations` and `/batch`. Persist via existing outcome `Investigate()` + `investigation.completed.v1`. Ledger stays stubbed.

---

## Phase 11 — Evaluation Harness

**Purpose:** measure Phase 6 recon against a labeled corpus. Not a live Razorpay E2E.

`internal/recon/eval` builds 153 fixtures across the locked families. **Regression** vs the engine oracle is 1.0. **Quality** vs controller truth reports Precision / Recall / F1 / false-match / capture / variance / amount-weighted / evidence / latency. ROC-AUC is omitted. Known quality gaps: partial and duplicate settlement still MATCHED when an EXACT bank row exists.

```bash
cd backend/zord-outcome-engine && go run ./cmd/phase11-eval
```

---

## Suggested next coding work

See [PHASE17_REPORT.md](./PHASE17_REPORT.md) remaining list. Highest leverage:

1. Close accuracy: hydrate `Exception` on listed results (Postgres recall 0.758 is a scorer bug, not 15 missed MATCHED).
2. Unresolved exposure: missing settlement/bank currently copy variance 0.
3. Frontend against the now-stable close / cash / ledger / tax JSON.
4. Briefing should load `close_run_id`, not only summary.
5. Pitch script + public repo — last.
6. Optional: point `POST /v1/connectors/razorpay/test` at the real client.

# Razorpay reconciliation — what is implemented

**Repo:** `razorpay-reconciliation` (`feat/new-feature`)  
**Date:** 2026-09-02  
**Scope:** this clone only. No new microservice. No Arealis-Zord edits.

Hard rule that still holds: Razorpay `settled` is never `bank_credited`. Only a matched bank observation proves cash in the merchant account.

---

## Status at a glance

| Phase | Purpose | Status |
| --- | --- | --- |
| Phase 1 | Talk to Razorpay safely (REST client) | **Done** |
| Phase 2 | Accept a real Razorpay webhook as an observation | **Done** (unit-tested; Postgres smoke needs `DATABASE_URL`) |
| Observation processor | `provider.observation.received` → canonical payment observation | **Done** |
| PDF Phase 3 | API backfill / freshness / Airflow | Done (already in tree) |
| Bank / matcher / proof | Multi-source recon, not bank_credited from PSP settled | Done (already in tree) |
| Ingestion (file import) | Validate-then-commit settlement/bank files | Done (already in tree) |
| Refunds / mutations | Refund API + refund webhooks as money movement | **Not started** |
| AI agents | Recovery / retry agents | **Not started** |
| Live console proof UI | React chips; wireframes only | **Not started** |

Phase 1 and Phase 2 are not blocking. The webhook handler does **not** create canonical payments. That happens downstream.

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

## How to verify

```bash
# Phase 1
cd backend/zord-outcome-engine && go test ./internal/poll/providers/razorpay/

# Phase 2
cd backend/zord-edge && go test ./validator ./services ./handler

# Observation processor
cd backend/zord-outcome-engine && go test ./internal/observe/
```

---

## Suggested next coding work (after 1 / 2)

1. Optional: point `POST /v1/connectors/razorpay/test` at the real client (last Phase 1 hole).
2. Optional: run the Postgres webhook integration test against a real DB.
3. Refunds phase (new): Razorpay refund client + `refund.*` as a **separate** observation type — not inside the payment webhook handler.
4. Proof UI / Phase 6 evidence leftovers (`HasWebhook` flag, intent L3, merkle verify).

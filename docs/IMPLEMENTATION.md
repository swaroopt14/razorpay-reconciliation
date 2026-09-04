# Razorpay Reconciliation — Implementation Guide & Checklist

> **Purpose:** Authoritative reference for what is built, what is missing, and what to do next.
> **Last updated:** 2026-09-02
> **Current test count:** 161 tests passing (settlement-file) + PDF Phase 3 polling/backfill suite

---

## Table of Contents

- [Phase Status Summary](#phase-status-summary)
- [Phase 1: Razorpay Client & Connector](#phase-1-razorpay-client--connector)
- [Phase 2: Webhook Ingestion & Signature Verification](#phase-2-webhook-ingestion--signature-verification)
- [Phase 3: Settlement Reconciliation](#phase-3-settlement-reconciliation)
- [PDF Phase 3: Razorpay polling & API backfill](#pdf-phase-3-razorpay-polling--api-backfill)
- [PDF Phases 4–6: Bank CSV, matcher, proof](#pdf-phases-46-bank-csv-matcher-proof)
- [Settlement and bank file ingestion](#settlement-and-bank-file-ingestion)
- [Phase 4: Refunds & Mutations](#phase-4-refunds--mutations)
- [Phase 5: AI Recovery Agents](#phase-5-ai-recovery-agents)
- [Local run](#local-run)
- [Frontend / Console](#frontend--console)
- [Testing Coverage](#testing-coverage)
- [Recommended Next Steps](#recommended-next-steps)

---

## Phase Status Summary

| Phase | Description | Status | Tests |
|-------|------------|--------|-------|
| **Phase 1** | Razorpay client, config, health check | ✅ Complete | 45 |
| **Phase 2** | Webhook signature verification, receipt pipeline | ✅ Complete | 9 |
| **Phase 3** | Settlement-file parsing, canonicalization, attachment | ✅ Complete | 61 |
| **PDF Phase 3** | Razorpay polling / API backfill, freshness, Airflow HTTP triggers | ✅ Complete | mock-first |
| **PDF Phases 4–6** | Bank CSV, hierarchical matcher, separate proof states | ✅ Complete | mock-first |
| **Ingestion Phase 4** | Settlement/bank file import lifecycle (validate → commit) | ✅ Complete | mock-first |
| **Phase 4** | Refunds, mutations, payment.captured processing | ❌ Not started | 0 |
| **Phase 5** | AI recovery agents, autonomous actions | ❌ Not started | 0 |
| **Infrastructure** | K8s, Airflow, CI/CD, monitoring | ✅ Complete | — |
| **Console** | Next.js dashboard | ✅ Complete (polling) | — |

---

## Phase 1: Razorpay Client & Connector

> ✅ **COMPLETE** — 45 tests, all passing

### What's Built

- [x] Razorpay client with Basic Auth (`zord-outcome-engine/internal/poll/providers/razorpay/client.go`)
- [x] Config with Test/Live mode validation (`config.go`)
- [x] Typed provider errors with HTTP classifier (`errors.go`)
- [x] Pagination helpers (SkipCount, NextPage, HasMore) (`pagination.go`)
- [x] Secret redaction for logs (`redact.go`)
- [x] Request tracing via X-Request-Id (`client.go`)
- [x] Exponential retry with jitter for safe GETs (250ms→500ms→1s) (`client.go`)
- [x] Context cancellation and deadline support (`client.go`)
- [x] Health check endpoint (`POST /v1/connectors/razorpay/test`)
- [x] Connector CRUD API (`zord-edge/handler/connector_handler.go`)
- [x] Connector DB migration with mode/refs/health columns
- [x] 45 tests covering auth, errors, retry, pagination, redaction

### API Endpoints

| Method | Endpoint | Status |
|--------|----------|--------|
| `POST` | `/v1/connectors/razorpay` | ✅ |
| `POST` | `/v1/connectors/razorpay/test` | ✅ |
| `GET` | `/v1/connectors/razorpay/status` | ✅ |
| `GET` | `/v1/connectors` | ✅ |

---

## Phase 2: Webhook Ingestion & Signature Verification

> ✅ **COMPLETE** — 9 tests + full receipt pipeline

### What's Built

- [x] HMAC-SHA256 signature verifier (`zord-edge/validator/razorpay_signature_verifier.go`)
- [x] Timing-safe comparison via `hmac.Equal`
- [x] `SignRazorpayWebhook` helper for test fixtures
- [x] Webhook event models (`zord-edge/model/razorpay_webhook_event.go`)
- [x] Provider webhook receipt model with 8 status constants (`model/provider_webhook_receipt.go`)
- [x] Full webhook service pipeline: parse → verify → persist → outbox (`services/razorpay_webhook_service.go`)
- [x] HTTP handler with 1MB body limit (`handler/razorpay_webhook_handler.go`)
- [x] Receipt status/list endpoints
- [x] Idempotent receipt ingestion (UNIQUE on connector_id + event_id)
- [x] Transactional outbox for crash-safe Kafka publishing
- [x] DB migration: `20260829_create_provider_webhook_receipts.sql`
- [x] Routes wired in `routes/intent_route.go`
- [x] 9 tests (valid, changed body, wrong secret, malformed, raw bytes, truncated)

### API Endpoints

| Method | Endpoint | Status |
|--------|----------|--------|
| `POST` | `/v1/webhooks/razorpay/:connectorID` | ✅ |
| `GET` | `/v1/webhooks/razorpay/receipt/:receiptID` | ✅ |
| `GET` | `/v1/webhooks/razorpay/receipts/:connectorID` | ✅ |

### Flow

```
Razorpay POST → Read raw body (1MB) → Extract Signature + Event ID
→ Resolve secret (env → connector DB) → HMAC-SHA256 verify
→ Parse metadata → SHA-256 body hash
→ BEGIN TX → INSERT receipt (ON CONFLICT → increment) → INSERT outbox → COMMIT
→ Return 200
```

---

## Phase 3: Settlement Reconciliation

> ✅ **COMPLETE (already built)** — settlement-file matching is in place. This is **not** the PDF Phase 3 polling/backfill work; see the next section.

This phase is PSP settlement **file** ingest (Razorpay XLSX / Cashfree CSV) → canonical observations → attachment to intents. Bank statement / UTR matching is still the remaining reconciliation gap.

### What's Built

#### Settlement Parsing
- [x] Parser interface (`services/parser_interface.go`)
- [x] Parser registry with provider lookup (`services/parser_registry.go`)
- [x] Razorpay XLSX parser — 27 columns (`services/razorpay_parser.go`)
- [x] Cashfree CSV parser — 10 columns (`services/cashfree_parser.go`)
- [x] Footer/total row detection
- [x] Transaction type filtering (payout, refund)
- [x] Fee/tax extraction

#### Canonicalization
- [x] Universal settlement shape — 50 columns (`models/universal_settlement_shape.go`)
- [x] Settlement canonicalization service (`services/settlement_canonicalize_service.go`)
- [x] Settlement ingest service (`services/settlement_ingest_service.go`)
- [x] Settlement models (`models/settlement_models.go`)

#### Attachment Engine
- [x] Candidate matching with multiple strategies (`services/attachment_engine.go`)
  - Client reference match
  - Batch reference match
  - Client batch ID match
  - Amount + currency + time window match
- [x] Confidence scoring (`services/attachment_scoring.go`)
  - `ScoreCandidate` — multi-signal scoring with quality modifiers
  - `ComputeParseConfidence` — per-row parse quality
  - `ParseQualityLabels` — 4-tier quality labels
  - `ComputeMappingConfidence` — field mapping confidence
  - `CarrierRichnessScore` — evidence carrier density
  - `ComputeVariance` — exact/amount/currency/status variance
  - `ClassifyConfidenceContext` — exact/low/invalid
  - `SelectDecisionType` — no-candidate/exact/low/ambiguous/conflicted
  - `ComputeAmbiguityScore` — unresolved/conflicted/exact ratio
- [x] Candidate set hash computation
- [x] Delay days calculation
- [x] Intent record builders (ambiguous, conflicted, unresolved)
- [x] Governance state checks (non-attachable states)
- [x] `NormalizeBatchAttachmentStatus` — 12 status mappings

#### Attachment Models
- [x] Attachment models (`models/attachment_models.go`)
- [x] Mapping profile models with PII fields (`models/mapping_profile_models.go`)
- [x] Canonical outcome models (`models/canonical_outcome.go`)

#### Handlers & Routes
- [x] Settlement upload handler (`handlers/settlement_upload_handler.go`)
- [x] Settlement job handler (`handlers/settlement_job_handler.go`)
- [x] Settlement PSPs handler (`handlers/settlement_psps_handler.go`)
- [x] Settlement outbox service (`services/settlement_outbox_service.go`)
- [x] Handler struct with shared dependencies (`handlers/handler_struct.go`)
- [x] Routes wired (`routes/outcome_route.go`)

### API Endpoints

| Method | Endpoint | Status |
|--------|----------|--------|
| `POST` | `/v1/settlement/upload` | ✅ |
| `GET` | `/v1/settlement/jobs/:job_id` | ✅ |
| `POST` | `/v1/attachment/run` | ✅ |

### What settlement-file matching does not do

- [ ] Bank statement ingestion (no bank CSV/PDF parser)
- [ ] UTR matching (no Bank↔PSP↔Intent triple reconciliation)
- [ ] Settlement upload handler integration tests (requires mock S3 + DB)
- [ ] Canonicalization pipeline integration tests (requires mock DB)

---

## PDF Phase 3: Razorpay polling & API backfill

> ✅ **COMPLETE** — webhook remains the fast path; API backfill is the repair/verification path. Implemented inside `zord-outcome-engine` (no `zord-razorpay-service`).

### What's built

- [x] `backfill_jobs`, `backfill_cursors`, `provider_response_receipts`, `provider_payment_observations`, `provider_settlement_line_observations`
- [x] Edge index on `provider_webhook_receipts (connector_id, provider_entity_id)` and `payload.payment.entity.id` parse
- [x] Razorpay client raw bytes + hash; `ListPaymentsPage` (`from`/`to` unix, count ≤ 100); `ListSettlementReconDay` (`GET /settlements/recon/combined`, count ≤ 1000)
- [x] Provider-neutral `BackfillProvider` adapter; job/window/lease/cursor orchestration; provider-ID upsert; `outcome_outbox` events
- [x] `GET /internal/webhooks/receipts/index` on zord-edge (`X-Relay-Token`)
- [x] `FreshnessService.CompareWindow` (`api_and_webhook_present`, `api_only_missing_webhook`, `webhook_only_missing_api`, `both_present_payload_changed`)
- [x] Outcome-engine internal routes: create/resume/cancel/get job + freshness (service token)
- [x] Airflow DAGs that HTTP-call outcome-engine only (`razorpay_payment_backfill_dag`, `razorpay_settlement_backfill_dag`, `reconciliation_freshness_dag`)

### Internal API

| Method | Endpoint | Status |
|--------|----------|--------|
| `POST` | `/internal/backfill/payments` | ✅ |
| `POST` | `/internal/backfill/settlements` | ✅ |
| `GET` | `/internal/backfill/jobs/:job_id` | ✅ |
| `POST` | `/internal/backfill/jobs/:job_id/resume` | ✅ |
| `POST` | `/internal/backfill/jobs/:job_id/cancel` | ✅ |
| `GET` | `/internal/freshness/:job_id` | ✅ |
| `GET` | `/internal/webhooks/receipts/index` (zord-edge) | ✅ |

### Explicitly deferred (not this phase)

`payment.captured` → intent, refund API mutations, WebSockets, S3 raw response blobs, Grafana dashboards, live console proof pages.

---

## PDF Phases 4–6: Bank CSV, matcher, proof

> ✅ **COMPLETE** — `provider_settlement_state = settled` is never shown as `bank_credited`. Only a matched bank observation proves cash in the merchant account.

### What's built

- [x] `bank_statement_uploads`, `bank_transaction_observations`, `payment_proof_subjects`, `recon_match_decisions`, `payment_evidence_leaves`
- [x] Bank CSV parser in outcome-engine (`services/bank_statement_parser.go`) — not zord-edge `bank_parser`
- [x] Hierarchical matcher L1–L6 (`internal/recon`); L6 cannot verify; UTR match can fully reconcile
- [x] `POST /v1/bank-statements/upload`, `GET /v1/merchant/transactions/:payment_id/proof`, `POST /internal/recon/run`
- [x] Freshness DAG calls recon-run after backfill; never calls Razorpay or the bank
- [x] Payment-subject evidence leaves + `GET /v1/merchant/evidence/:id/verify`
- [x] Ask Zord read tools in prompt-layer (`get_transaction_proof`, `get_bank_match`, …)
- [x] Console wireframes in `docs/frontend/` (live React pages still later; do not overload Settlement Journal)

### Merchant / internal API

| Method | Endpoint | Status |
|--------|----------|--------|
| `POST` | `/v1/bank-statements/upload` | ✅ |
| `GET` | `/v1/merchant/transactions/:payment_id/proof` | ✅ |
| `GET` | `/v1/merchant/reconciliation/summary` | ✅ |
| `GET` | `/v1/merchant/reconciliation/gaps` | ✅ |
| `POST` | `/internal/recon/run` | ✅ |
| `GET` | `/internal/recon/gaps` | ✅ |

---

## Settlement and bank file ingestion

> ✅ **COMPLETE** — validate-then-commit imports into existing observation tables. Does **not** run the matcher or claim `bank_credited`. Leftover proof-loop work is listed in `docs/phase-6-evidence-and-proof.md`.

### What's built

- [x] `data_imports`, `import_row_results`; extra columns on settlement/bank observations
- [x] Settlement JSON/CSV recon mapper (`internal/imports/settlement.go`) — payment/refund/transfer/adjustment
- [x] Bank format profiles (generic, HDFC/ICICI/SBI-like) with mapping, timezone, amount unit
- [x] Merchant import APIs + one-shot `POST /v1/bank-statements/upload` wrapper
- [x] Outbox events `bank.observation.normalized.v1`, `import.completed.v1` (constants in `event_contract.go`, not a new zord-contracts module)

### Explicitly not in this phase

Bank ↔ PSP matching, three-way proof, refund create API, live bank APIs, zord-edge `bank_parser`, merkle packs (Phase 6).

---

## Phase 4: Refunds & Mutations

> ❌ **NOT STARTED** — 0 tests

### What Needs to Be Built

#### Razorpay Refund API Client
- [ ] Refund list endpoint client (`GET /v1/refunds`)
- [ ] Refund fetch endpoint (`GET /v1/refunds/:id`)
- [ ] Refund create endpoint (`POST /v1/refunds`) — for manual refunds
- [ ] Refund config (mode, pagination, retry — reuse Phase 1 client pattern)
- [ ] Refund error classification

#### Refund Webhook Processing
- [ ] `refund.created` event handler
- [ ] `refund.processed` event handler
- [ ] `refund.failed` event handler
- [ ] Refund receipt model (reuse Phase 2 receipt pattern)
- [ ] Refund → Intent attachment (link refund to original payment)

#### Mutation Tracking
- [ ] Payment mutation detection (amount changes, status changes)
- [ ] Intent version chain updates on mutation
- [ ] Mutation timeline for audit trail
- [ ] Partial refund support

#### Refund Reconciliation
- [ ] Refund ↔ Settlement matching (are refunds deducted in settlement?)
- [ ] Refund amount verification vs. PSP records
- [ ] Disputed refund flagging

#### Tests Required
- [ ] Refund API client unit tests (10+)
- [ ] Refund webhook processing tests (5+)
- [ ] Mutation detection tests (5+)
- [ ] Refund reconciliation tests (5+)

### Suggested File Structure

```
zord-outcome-engine/internal/poll/providers/razorpay/
├── refund_client.go          # Refund API client
├── refund_types.go           # Refund DTOs
├── refund_client_test.go     # Refund client tests

zord-edge/
├── handler/refund_webhook_handler.go   # Refund webhook handler
├── services/refund_webhook_service.go  # Refund processing pipeline
├── model/refund.go                     # Refund models
├── db/migrations/..._create_refunds.sql # Refund table

zord-outcome-engine/services/
├── refund_reconciliation_service.go    # Refund ↔ Settlement matching
├── refund_reconciliation_service_test.go
```

---

## Phase 5: AI Recovery Agents

> ❌ **NOT STARTED** — 0 tests

### Current ML Foundation (Already Built)

- [x] CatBoost regression for leakage prediction (`ml-service/`)
- [x] Isolation Forest anomaly detection
- [x] Z-score anomaly detection
- [x] HDBSCAN clustering
- [x] Policy engine with 20+ seeded IF-THEN rules
- [x] Action contract generation (immutable audit trail)
- [x] SLA breach escalation worker (`sla_worker.go`)

### What Needs to Be Built

#### Recovery Agent Framework
- [ ] Agent interface — takes unresolved payment, decides action
- [ ] Action executor — retry, escalate, compensate, dispute
- [ ] Decision audit trail — every agent action logged as action contract
- [ ] Confidence threshold — only act when confidence > threshold
- [ ] Human-in-the-loop fallback — low-confidence decisions go to operator

#### Specific Agents
- [ ] **Retry Agent** — retries failed payouts with backoff
- [ ] **Escalation Agent** — escalates stuck payments (>SLA)
- [ ] **Compensation Agent** — auto-credits for verified leakage
- [ ] **Dispute Agent** — auto-generates dispute evidence packs
- [ ] **Stale Payment Agent** — flags/ages stale unresolved payments

#### ML Integration
- [ ] Real-time feature pipeline from Kafka → ML service
- [ ] Model retraining trigger on new settlement data
- [ ] A/B testing framework for recovery strategies
- [ ] Recovery success rate tracking

#### Tests Required
- [ ] Agent decision logic tests (10+)
- [ ] Action executor tests (5+)
- [ ] Confidence threshold tests (5+)
- [ ] Integration tests with mock ML responses (5+)

---

## Local run

### What's Built

- [x] Razorpay connector, webhooks, settlement recon, and finance close loop
- [x] Airflow DAGs: `intent_transform_dag.py` + `intent_normalization_quality_dag.py`
- [x] Docker Compose for local development
- [x] Multi-stage Dockerfiles for all services

---

## Frontend / Console

> ✅ **COMPLETE** — Full Next.js 14 dashboard

### What's Built

- [x] Next.js 14 App Router (`zord-console/`)
- [x] Role-based dashboards (admin/ops/customer)
- [x] Settlement upload UI
- [x] Intent ingestion UI
- [x] Connector management UI
- [x] Evidence pack viewer
- [x] SLA monitoring dashboard
- [x] Payout command center

### What's Missing

- [ ] Live payment-proof chips (wireframes in `docs/frontend/`; do not overload Settlement Journal)
- [ ] WebSocket streaming (currently uses HTTP polling via React Query/SWR)
- [ ] Real-time settlement job progress
- [ ] Live attachment progress updates
- [ ] SLA breach alert streaming

---

## Testing Coverage

### Current Test Inventory

| Suite | File | Tests | Status |
|-------|------|-------|--------|
| Phase 1 Razorpay client | `zord-outcome-engine/internal/poll/providers/razorpay/*_test.go` | 45 | ✅ |
| Phase 2 Signature verifier | `zord-edge/validator/razorpay_signature_verifier_test.go` | 9 | ✅ |
| Phase 3 Razorpay parser | `zord-outcome-engine/services/razorpay_parser_test.go` | 18 | ✅ |
| Phase 3 Cashfree parser | `zord-outcome-engine/services/cashfree_parser_test.go` | 12 | ✅ |
| Phase 3 Attachment scoring | `zord-outcome-engine/services/attachment_scoring_test.go` | 30 | ✅ |
| Phase 3 Parser registry | `zord-outcome-engine/services/parser_registry_test.go` | 4 | ✅ |
| Phase 3 Mapping profiles | `zord-outcome-engine/models/mapping_profile_test.go` | 7 | ✅ |
| Phase 3 Attachment engine | `zord-outcome-engine/services/attachment_engine_test.go` | 40 | ✅ |
| PDF Phase 3 payments page / hasher | `zord-outcome-engine/internal/poll/providers/razorpay/*_test.go` | added | ✅ |
| PDF Phase 3 backfill + freshness | `zord-outcome-engine/internal/poll/backfill_service_test.go` | added | ✅ |
| PDF Phase 3 internal HTTP | `zord-outcome-engine/handlers/backfill_handler_test.go` | added | ✅ |
| PDF Phase 3 Airflow DAGs | `zord-airflow/tests/test_razorpay_dags.py` | 4 | ✅ |
| PDF Phases 4–6 matcher + parser | `zord-outcome-engine/internal/recon/*_test.go`, `services/bank_statement_parser_test.go` | added | ✅ |
| PDF Phases 4–6 Ask Zord tools | `zord-prompt-layer/tools/*_test.go` | added | ✅ |
| Pre-existing other | Various | 15 | ✅ |
| **Total** | | **161** | **All passing** |

### Tests Still Needed (Lower Priority)

| Component | Test Type | Effort | Priority |
|-----------|-----------|--------|----------|
| Settlement upload handler | Integration (mock S3 + DB) | High | Medium |
| Canonicalization service | Integration (mock DB) | High | Medium |
| Attachment engine full pipeline | Integration (mock DB + Kafka) | High | Low |
| Cashfree parser CSV edge cases | Unit (already covered) | Done | — |

---

## Recommended Next Steps

### Priority 1: Close the Reconciliation Loop (bank / UTR)

✅ **Done.** Bank CSV ingestion, UTR matcher, and separate payment / settlement / bank / proof states live in `zord-outcome-engine/internal/recon`. Live console chips are still wireframes in `docs/frontend/`.

Still later: bank APIs (CSV first), ML anomaly / cash forecast, live React proof pages.

---

### Priority 2: Process payment.captured Events (Phase 2 Gap)

The webhook pipeline is built and working, but it only stores receipts. It doesn't process `payment.captured` events into canonical intents.

**What to build:**
1. Event type router in the webhook service (switch on event type)
2. `payment.captured` → canonical intent transformer
3. `payment.authorized` → intent status update
4. `payment.failed` → intent failure recording

**Estimated effort:** 1 week

---

### Priority 3: Razorpay Refund API Integration (Phase 4)

Refunds are already detected in settlement files, but there's no live refund tracking.

**What to build:**
1. Refund list/fetch/create client (reuse Phase 1 client pattern)
2. Refund webhook handlers (`refund.created`, `refund.processed`, `refund.failed`)
3. Refund ↔ Settlement reconciliation

**Estimated effort:** 1-2 weeks

---

### Priority 4: WebSocket Streaming

Replace HTTP polling in the console for real-time updates.

**What to build:**
1. WebSocket endpoint in zord-edge
2. Kafka → WebSocket bridge for settlement job progress
3. Live attachment progress streaming
4. SLA breach alert push notifications

**Estimated effort:** 1-2 weeks

---

### Priority 5: AI Recovery Agents (Phase 5)

The ML foundation is ready. What's missing is the execution layer.

**What to build:**
1. Agent interface and action executor framework
2. Retry agent (failed payouts)
3. Escalation agent (stuck payments)
4. Human-in-the-loop fallback for low-confidence decisions

**Estimated effort:** 2-3 weeks

---

### Priority 6: Terraform & Production Hardening

**What to build:**
1. Terraform modules for AWS EKS, RDS, S3, Secrets Manager
2. Multi-region deployment testing
3. Secrets rotation automation
4. Load testing with realistic transaction volumes

**Estimated effort:** 1-2 weeks

---

## Quick Reference: Run Tests

```bash
# Phase 1 — Razorpay client (45 tests)
cd backend/zord-outcome-engine
go test ./internal/poll/providers/razorpay/... -v -count=1

# Phase 2 — Signature verifier (9 tests)
cd backend/zord-edge
go test ./validator/... -v -count=1

# Phase 3 — Settlement pipeline (52 tests)
cd backend/zord-outcome-engine
go test ./services/... -v -count=1
go test ./models/... -v -count=1

# All backend tests
cd backend
find . -name "*_test.go" -exec dirname {} \; | sort -u | while read dir; do
  echo "Testing $dir..."
  (cd "$dir" && go test ./... -count=1 2>&1 | tail -1)
done
```

---

## File Inventory (New Files Created This Session)

| # | File | Purpose |
|---|------|---------|
| 1 | `backend/zord-edge/db/migrations/20260829_create_provider_webhook_receipts.sql` | Receipt table |
| 2 | `backend/zord-edge/validator/razorpay_signature_verifier.go` | HMAC-SHA256 verify |
| 3 | `backend/zord-edge/validator/razorpay_signature_verifier_test.go` | 9 tests |
| 4 | `backend/zord-edge/model/razorpay_webhook_event.go` | Event models |
| 5 | `backend/zord-edge/model/provider_webhook_receipt.go` | Receipt model |
| 6 | `backend/zord-edge/services/razorpay_webhook_service.go` | Webhook pipeline |
| 7 | `backend/zord-edge/handler/razorpay_webhook_handler.go` | HTTP handler |
| 8 | `backend/zord-outcome-engine/services/razorpay_parser_test.go` | 18 tests |
| 9 | `backend/zord-outcome-engine/services/cashfree_parser_test.go` | 12 tests |
| 10 | `backend/zord-outcome-engine/services/attachment_scoring_test.go` | 30 tests |
| 11 | `backend/zord-outcome-engine/services/parser_registry_test.go` | 4 tests |
| 12 | `backend/zord-outcome-engine/models/mapping_profile_test.go` | 7 tests |
| 13 | `backend/zord-outcome-engine/services/attachment_engine_test.go` | 40 tests |
| 14 | `backend/zord-outcome-engine/services/cashfree_parser.go` | Bug fix: FieldsPerRecord = -1 |

---

## Architecture Decisions Log

| Decision | Rationale |
|----------|-----------|
| Raw body read before JSON parsing | Signature must match exact bytes |
| `hmac.Equal` for comparison | Prevents timing side-channel attacks |
| `UNIQUE(connector_id, event_id)` | Idempotency — duplicate delivery increments count |
| Transactional outbox | Crash-safe — outbox worker retries publication |
| Return 2xx before downstream | Razorpay retries on non-2xx; long waits cause timeouts |
| No API secrets in logs/events | Security — only hash, event_id, mode logged |
| `reader.FieldsPerRecord = -1` | Cashfree footer rows have fewer fields than header |
| Parser registry pattern | Extensible — add new PSP parsers without changing callers |
| Universal settlement shape (50 cols) | Single canonical format for all PSP settlement data |

---

*This document is the authoritative implementation reference. Update it as work progresses.*

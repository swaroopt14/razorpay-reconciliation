# Payout Command View - Backend API Delivery Spec

## 1) Scope
This document defines backend API contracts required by the new frontend at:

- `/payout-command-view/today`

Frontend surfaces covered:

1. `Home overview`
2. `Payout command view`
3. `Trace & Evidence`
4. `Payout Intelligence`
5. `Failure Intelligence`
6. `Reconciliation & Finality`
7. Cross-page `Ask Zord` prompt layer

### 1.1 Service-Seven Runtime (Intelligence + Bulk)

Frontend runtime integration now assumes the following upstream baseline for Service Seven:

```env
HTTP_PORT=8080
ENVIRONMENT=development
DATABASE_URL=postgres://zpi:zpi_secret@localhost:5440/zord_intelligence
KAFKA_BROKERS=localhost:9092
KAFKA_GROUP_ID=zord-intelligence-group
INTELLIGENCE_MODE=GRADE_A
TOPIC_INTENT_CREATED=canonical.intent.created
TOPIC_DISPATCH_CREATED=dispatch.attempt.created
TOPIC_OUTCOME_NORMALIZED=outcome.event.normalized
TOPIC_FINALITY_CERT=finality.certificate.issued
TOPIC_FINAL_CONTRACT=final.contract.updated
TOPIC_EVIDENCE_READY=evidence.pack.ready
TOPIC_DLQ=dlq.event
TOPIC_STATEMENT_MATCH=statement.match.event
TOPIC_CORRIDOR_HEALTH_TICK=corridor.health.tick
TOPIC_SLA_TIMER_TICK=sla.timer.tick
TOPIC_SETTLEMENT_CREATED=canonical.settlement.created
TOPIC_ATTACHMENT_DECISION=attachment.decision.created
TOPIC_VARIANCE_RECORD=variance.record.created
TOPIC_BATCH_SUMMARY=batch.summary.updated
TOPIC_GOVERNANCE_DECISION=governance.decision.created
TOPIC_ACTUATION_ALERT=zpi.actuation.alert
TOPIC_ACTUATION_RETRY=zpi.actuation.retry
TOPIC_ACTUATION_EVIDENCE=zpi.actuation.evidence
TOPIC_ACTUATION_BATCH_PATCH=zpi.actuation.batch_patch
```

## 2) Service Ownership

| Service | Ownership | Responsibility |
|---|---|---|
| `zord-edge` (or `zord-aggregator`) | Platform / API Gateway Team | Composite page APIs (`/v1/overview`, `/v1/home/*`, `/v1/workspace/*`, `/v1/intelligence/*`, `/v1/failure-intelligence/*`, `/v1/reconciliation/*`) |
| `zord-intent-engine` | Intent Team | Intents, intent detail, DLQ, failure buckets, queue depth |
| `zord-vault-journal` | Vault Team | Raw envelope list/detail and parse status |
| `zord-contracts` (or relay contracts service) | Contracts Team | Contract definitions and intent-to-contract mapping data |
| `zord-prompt-layer` | AI/Prompt Team | Prompt query and answer generation |
| `zord-edge` | Tenant Team | Tenant list / tenant metadata |

## 3) Core APIs Required (Raw Data Layer)

These are required for trace/evidence tables and drilldown:

| Method | Endpoint | Service | Used In |
|---|---|---|---|
| `GET` | `/v1/overview` | `zord-edge` / aggregator | Top-level dashboard KPIs and health strip |
| `GET` | `/v1/intents` | `zord-intent-engine` | Intent table, counts, trend derivations |
| `GET` | `/v1/intents/:id` | `zord-intent-engine` | Intent drilldown panel |
| `GET` | `/v1/envelopes` | `zord-vault-journal` | Trace table joins, envelope references |
| `GET` | `/v1/envelopes/:id` | `zord-vault-journal` | Envelope parse status + bank/object ref |
| `GET` | `/v1/dlq` | `zord-intent-engine` | DLQ Queue tab |
| `GET` | `/v1/contracts` | `zord-contracts` | Provider/trace join metadata |
| `GET` | `/v1/tenants` | `zord-edge` | Tenant/company labels in tables |

### 3.1 Query Params (minimum)

| Endpoint | Required Params | Optional Params |
|---|---|---|
| `/v1/intents` | `page`, `page_size` | `tenant_id`, `status`, `from`, `to` |
| `/v1/envelopes` | `page`, `page_size` | `tenant_id`, `parse_status`, `from`, `to` |
| `/v1/dlq` | none | `tenant_id`, `page`, `page_size`, `stage`, `reason_code`, `from`, `to` |
| `/v1/contracts` | none | `tenant_id`, `intent_id`, `page`, `page_size` |
| `/v1/tenants` | none | `page`, `page_size`, `status` |
| `/v1/overview` | `tenant_id` | `window` (`24h`,`7d`,`30d`,`90d`) |

### 3.2 Raw Response Fields Required by Frontend

#### `/v1/overview`
```json
{
  "environment": "PRODUCTION",
  "kpis": {
    "intents_received_24h": 0,
    "canonicalized_24h": 0,
    "rejected_24h": 0,
    "idempotency_hits_24h": 0,
    "p95_ingest_latency_ms": 0,
    "slo": {
      "latency_ms": 60,
      "success_rate_pct": 99.9
    }
  },
  "health": [],
  "errors_last_24h": {},
  "recent_activity": [],
  "evidence": {
    "worm_active": false,
    "last_write": "",
    "hash_chain": "OK"
  }
}
```

#### `/v1/intents` item shape
```json
{
  "intent_id": "INT-TR-88214",
  "amount": 482450,
  "currency": "INR",
  "instrument": "IMPS",
  "source": "Routed",
  "status": "PENDING_FINALITY",
  "created_at": "2026-04-21T06:03:00Z",
  "envelope_id": "env_...",
  "tenant_id": "tenant_..."
}
```

#### `/v1/intents/:id` detail shape
```json
{
  "intent_id": "INT-TR-88214",
  "status": "PENDING_FINALITY",
  "source": "Razorpay",
  "canonical": {
    "amount": { "value": 482450, "currency": "INR" },
    "instrument": { "kind": "IMPS" }
  },
  "beneficiary": { "name": "Vendor Corridor A" },
  "evidence": { "raw_envelope_id": "env_..." },
  "created_at": "2026-04-21T06:03:00Z"
}
```

#### `/v1/envelopes` item shape
```json
{
  "envelope_id": "env_...",
  "source": "Razorpay",
  "parse_status": "CANONICALIZED",
  "object_ref": "ICICI26092024011958"
}
```

#### `/v1/envelopes/:id` detail shape
```json
{
  "envelope_id": "env_...",
  "source": "Razorpay",
  "parse_status": "CANONICALIZED",
  "object_ref": "ICICI26092024011958"
}
```

#### `/v1/dlq` item shape
```json
{
  "dlq_id": "DLQ-1042",
  "envelope_id": "env_...",
  "tenant_id": "tenant_...",
  "stage": "provider_callback",
  "reason_code": "CALLBACK_TIMEOUT",
  "error_detail": "Callback hash mismatch",
  "replayable": true,
  "created_at": "2026-04-21T06:10:00Z"
}
```

#### `/v1/contracts` item shape
```json
{
  "contract_id": "ctr_...",
  "tenant_id": "tenant_...",
  "intent_id": "INT-TR-88214",
  "envelope_id": "env_...",
  "contract_payload": "base64_json",
  "trace_id": "ZRD-TRACE-3f8a9b2c"
}
```

#### `/v1/tenants` item shape
```json
{
  "tenant_id": "tenant_...",
  "tenant_name": "GHCA Cohort 07"
}
```

## 4) Composite APIs Required by Page (Graph/Widget Layer)

The new frontend has many graphs. To keep frontend fast and stable, backend should expose composite payloads (already denormalized for each page).

### 4.1 Home overview

**Endpoint**: `GET /v1/home/overview`

**Service**: `zord-edge` aggregator  
**Sources**: intents + outcomes + recon + evidence + contracts

**Required params**:
- `tenant_id` (required)
- `timeframe`: `week | month | quarter | year` (required)
- `year`: `2026 | 2027 | 2028` (required for `quarter/year`)
- `quarter`: `Q1 | Q2 | Q3 | Q4` (required for `quarter`)

**Payload sections required by frontend widgets**:
- `hero`: large metric, title, summary
- `chart`: 80-144 points depending on timeframe
- `tooltip`: active point values and delta
- `range`: selected range start/end
- `axis`: labels and holiday markers
- `cards`: payout recovery forecast, exception handling cost, recovery lift vs baseline, insight
- `promptSeeds`: 3 chips for bottom AI bar

**Minimum schema**
```json
{
  "hero": {
    "metric_value": "$1,651,045,139",
    "title": "Payout income",
    "summary": "Payout income accelerated after overflow moved away from degraded PSP lanes and into healthier routes."
  },
  "chart": {
    "points": [
      {
        "point": 0,
        "bar_value": 63000,
        "line_value": 52000,
        "lower_line_value": 31000,
        "selected": false,
        "is_holiday": false
      }
    ],
    "range": [20, 50],
    "axis_labels": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"],
    "holiday_labels": []
  },
  "cards": {
    "recovery_forecast": { "value": "$142,9k", "label": "Recovered value", "live_window": "Mar" },
    "exception_handling_cost": { "value": "$16,4k", "label": "Ops & exception spend" },
    "lift_vs_baseline": { "value": "$92,5k", "label": "Lift over baseline" },
    "insight": {
      "text": "The reroute shift improved cleared payout quality and reduced exception drag across the period, with higher confirmed value and lower bank-side uncertainty.",
      "value": "$57,9k"
    }
  },
  "prompt_seeds": [
    "What changed across routed payout quality this cycle?",
    "Why did proof readiness shift for this issuer set?",
    "Where is bank-side confirmation still lagging after reroute?"
  ]
}
```

---

### 4.2 Payout command view

**Endpoint**: `GET /v1/workspace/today`

**Service**: `zord-edge` aggregator  
**Sources**: intents + contracts + dlq + recon + prompt context

**Required params**:
- `tenant_id`
- `tab`: `today | routing | proof | banks`

**Payload sections**:
- `heroCard` (clean payouts + mini bars)
- `providerPosture` list
- `recoveryIntelligence` metric and compare bars
- `escalations` card
- `aiLayer` (question, supporting context, latest answer, suggested questions)
- `operatorModules` (4 tiles)

---

### 4.3 Trace & Evidence

**Endpoint**: `GET /v1/trace/overview`

**Service**: `zord-edge` aggregator  
**Sources**: intents, intent detail, envelopes, dlq, contracts, tenants

**Required params**:
- `tenant_id`
- `tab`: `intent_table | dlq_queue | heat_map | web_map | bar_analysis`
- `page`, `page_size` for table tabs

**Payload sections**:
- `summaryStrip` (amount, beneficiary, client, status)
- `intentTable` (paginated rows)
- `dlqQueue` (rows)
- `heatMap` matrix
- `webMap` nodes + edges
- `barAnalysis` windows (`week|month|quarter`)
- `timeline`
- `evidencePack` items

**Important**:
- Intent table must include PSP and bank logos resolved from names/refs.
- Pagination metadata is required: `page`, `page_size`, `total`.

---

### 4.4 Payout Intelligence

**Endpoint**: `GET /v1/intelligence/overview`

**Service**: `zord-edge` aggregator or `zord-analytics`

**Required params**:
- `tenant_id`
- `window`: `30d | 90d | 180d | 12m`

**Payload sections**:
- `kpiCards` (4 top cards)
- `stackedTrend` (base cleared + rerouted lift + quality + drift)
- `riskByCause` (pie)
- `processorQualityTrend` (multi-line/area)
- `riskNetwork` (nodes + edges)
- `issuingBankTable`
- `ticketRiskHistogram`
- `regionalHeatmap`
- `safeExposureTiles`

**Risk network schema**
```json
{
  "risk_network": {
    "nodes": [
      { "id": "ops-hub", "label": "Ops Hub", "tone": "hub", "size": 40, "x": 332, "y": 214 }
    ],
    "edges": [
      { "from": "ops-hub", "to": "risk-hub", "weight": 1 }
    ]
  }
}
```

---

### 4.5 Failure Intelligence

**Endpoint**: `GET /v1/failure-intelligence/overview`

**Service**: `zord-edge` aggregator  
**Primary source**: `zord-intent-engine` (+ optional analytics denorm)

**Required params**:
- `tenant_id`
- `window`: `24h | 7d | 30d`

**Payload sections**:
- `kpis` (queue depth, aging>24h, median owner response, auto-resolved today)
- `topFailureReasons` (category bar chart with amount-at-risk)
- `queues` by owner tabs:
  - `needs_client_fix`
  - `needs_psp_fix`
  - `needs_bank_follow_up`
- `queueDepthTrend`
- `notes`

---

### 4.6 Reconciliation & Finality

**Endpoint**: `GET /v1/reconciliation/overview`

**Service**: `zord-edge` aggregator or reconciliation analytics service

**Required params**:
- `tenant_id`
- `window`: `7d | 30d | 90d | 180d`

**Payload sections**:
- `kpis`:
  - recon closure rate
  - full 3-signal coverage
  - amount variance
  - auto-close recon rate
- `reconciliationTrend` (stacked bars + finality rate line)
- `mismatchQueue`
- `signalCoverageTrend`
- `varianceByCause`
- `narrative`

## 5) Ask Zord (Cross-Page)

### 5.1 Runtime endpoint contract (shared by Prompt team)

**Frontend route**: `POST /api/prompt-layer/query` (Next.js proxy)  
**Upstream service**: `zord-prompt-layer`  
**Upstream endpoint**: `POST /query` (default local: `http://localhost:8086/query`)

**Upstream request (required)**
```json
{
  "query": "Summarize failure status and evidence readiness for tenant 11111111-1111-4111-8111-111111111111",
  "tenant_id": "11111111-1111-4111-8111-111111111111",
  "top_k": 6
}
```

**Upstream response (current)**
```json
{
  "answer": "The system encountered a problem during a crucial step where it validates incoming information...",
  "confidence": "medium",
  "entities_found": {},
  "citations": [
    {
      "source_type": "intent_dlq_items",
      "record_id": "",
      "chunk_id": "",
      "snippet": "DLQ item: stage=semantic_validation reason_code=MISSING_PROVIDER_REFERENCE replayable=true created_at=2026-04-22 11:32:19.516814+00 error_detail=Provider reference absent in payload",
      "score": 0.75
    }
  ],
  "next_actions": []
}
```

**Optional extension (incoming soon)**
```json
{
  "visualization": {
    "type": "bar|line|pie|network|table",
    "title": "string",
    "data": {}
  }
}
```

### 5.2 Backend delivery requirements for prompt service

- `query` must accept natural-language prompts from all 6 surfaces:
  - `home`
  - `workspace` (`today`, `routing`, `proof`, `banks`)
  - `trace`
  - `intelligence`
  - `failure-intelligence`
  - `reconciliation`
- `answer` must be business-readable (no internal table/field leakage).
- `confidence` should be normalized to one of: `low`, `medium`, `high`.
- `citations[].snippet` should remain short enough to render in card UI (recommend < 280 chars).
- If `visualization` is present, payload must include `type`, `title`, and renderable `data`.

### 5.3 Prompt Layer runtime (current backend contract)

**Upstream**: `POST http://localhost:8086/query`  
**Headers**: `Content-Type: application/json`

**Request**
```json
{
  "query": "Summarize failure status and evidence readiness for tenant 11111111-1111-4111-8111-111111111111",
  "tenant_id": "11111111-1111-4111-8111-111111111111",
  "top_k": 6
}
```

**Response**
```json
{
  "answer": "The system encountered a problem during a crucial step where it validates incoming information...",
  "confidence": "medium",
  "entities_found": {},
  "citations": [
    {
      "source_type": "intent_dlq_items",
      "record_id": "",
      "chunk_id": "",
      "snippet": "DLQ item: stage=semantic_validation reason_code=MISSING_PROVIDER_REFERENCE replayable=true created_at=2026-04-22 11:32:19.516814+00 error_detail=Provider reference absent in payload",
      "score": 0.75
    }
  ],
  "next_actions": []
}
```

When visualization is requested, backend may append:

```json
{
  "visualization": {
    "type": "bar|line|pie|network|table",
    "title": "string",
    "data": {}
  }
}
```

### 5.4 Service-Seven Intelligence endpoints (exact frontend consumption)

All UI intelligence calls should route through frontend proxy:  
`/api/intelligence/*` -> upstream `http://localhost:8080/v1/intelligence/*`

| Method | Endpoint | Frontend usage |
|---|---|---|
| `GET` | `/v1/intelligence/mode` | Capability catalogue and mode awareness |
| `GET` | `/v1/intelligence/mode/status?tenant_id=X` | Topic health strip |
| `GET` | `/v1/intelligence/kpis?tenant_id=X` | KPI cards |
| `GET` | `/v1/intelligence/corridors/health?tenant_id=X` | Corridor posture |
| `GET` | `/v1/intelligence/failures/top?tenant_id=X` | Failure leaderboard |
| `GET` | `/v1/intelligence/sla?tenant_id=X` | SLA performance |
| `GET` | `/v1/intelligence/sla-breach?tenant_id=X` | Grade-B breach lens |
| `GET` | `/v1/intelligence/retry-recovery?tenant_id=X` | Recovery impact trend |
| `GET` | `/v1/intelligence/statement-match?tenant_id=X` | Statement matching health |
| `GET` | `/v1/intelligence/provider-ref-missing?tenant_id=X` | Missing provider reference risk |
| `GET` | `/v1/intelligence/fusion-conflicts?tenant_id=X` | Multi-signal conflict lens |
| `GET` | `/v1/intelligence/ml/anomaly?tenant_id=X` | Anomaly score |
| `GET` | `/v1/intelligence/ml/sla-risk?tenant_id=X` | SLA risk prediction |
| `GET` | `/v1/intelligence/ml/failure-shift?tenant_id=X` | Failure-shift detection |
| `GET` | `/v1/intelligence/leakage?tenant_id=X` | Leakage snapshot |
| `GET` | `/v1/intelligence/ambiguity?tenant_id=X` | Ambiguity snapshot |
| `GET` | `/v1/intelligence/defensibility?tenant_id=X` | Defensibility snapshot |
| `GET` | `/v1/intelligence/rca?tenant_id=X&corridor_id=Y` | Corridor RCA |
| `GET` | `/v1/intelligence/pattern?tenant_id=X` | Pattern intelligence |
| `GET` | `/v1/intelligence/recommendation?tenant_id=X` | Recommendation cards |
| `GET` | `/v1/intelligence/batches?tenant_id=X` | Batch intelligence list |
| `GET` | `/v1/intelligence/batches/{batch_id}?tenant_id=X` | Batch intelligence detail |
| `GET` | `/v1/intelligence/{type}/history?tenant_id=X&limit=N` | Snapshot history |
| `GET` | `/v1/intelligence/explanations/{snapshot_id}` | Explanation detail |
| `POST` | `/v1/intelligence/explain-batch` | Generate batch explanation |

### 5.5 Bulk ingest endpoint (batch command center)

Frontend route for upload in batch center:

- `POST /api/bulk-ingest` -> upstream `POST http://localhost:8080/v1/bulk-ingest`
- Form body: `file` (multipart)
- Header pass-through:
  - `Authorization` (or server-side env key fallback)
  - `X-Zord-Source-Type`
  - `X-Zord-Source-Class`

## 6) Frontend Performance + Contract Rules

| Rule | Requirement |
|---|---|
| Cache | `Cache-Control: no-store` for all dashboard APIs |
| Pagination | Required for table endpoints, must return `total` |
| Timezone | All server timestamps in ISO-8601 UTC; frontend renders local timezone |
| Null safety | Missing values should be `null` or empty arrays, not omitted objects |
| Status enums | Keep stable enum set; any new enum must be additive |
| Currency | Amounts as numbers in INR minor/major unit consistently (recommend major, decimal allowed) |

## 7) Delivery Plan by Team

### Phase 1 (must-have to unblock frontend integration)
1. `zord-intent-engine`: `/v1/intents`, `/v1/intents/:id`, `/v1/dlq`
2. `zord-vault-journal`: `/v1/envelopes`, `/v1/envelopes/:id`
3. `zord-contracts`: `/v1/contracts`
4. `zord-edge`: `/v1/tenants`, `/v1/overview`

### Phase 2 (graph-composite delivery)
1. `zord-edge` aggregator:
   - `/v1/home/overview`
   - `/v1/workspace/today`
   - `/v1/trace/overview`
   - `/v1/intelligence/overview`
   - `/v1/failure-intelligence/overview`
   - `/v1/reconciliation/overview`

### Phase 3 (AI analyst)
1. `zord-prompt-layer`:
   - `POST /query` (consumed by frontend via `/api/prompt-layer/query`)

## 8) Acceptance Checklist

| Check | Pass Criteria |
|---|---|
| Home chart changes with Week/Month/Quarter/Year | API returns timeframe-specific points + labels + range |
| Tooltip follows cursor | Every chart point includes values for bars + lines |
| Intent table pagination | Next/Prev and page counts work with backend totals |
| DLQ tab data | DLQ list shows rows with owner/action mapping data |
| Trace drilldown | Clicking an intent loads intent + envelope detail |
| Intelligence graphs render | All graph datasets available with non-empty arrays |
| Reconciliation metrics render | KPI + trend + mismatch queues all populated |
| Prompt layer responds | `/api/prompt-layer/query` proxy returns answer + confidence + citations (and visualization when present) |

---

If needed, this can be converted directly into OpenAPI 3.0 (`yaml`) in a follow-up file.

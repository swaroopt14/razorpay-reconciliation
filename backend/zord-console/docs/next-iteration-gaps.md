# Next-iteration gaps — backend ↔ frontend handoff

Snapshot of what's live, what's still static, and what each side needs to ship to close the gap.
Cross-reference for `frontend-backend-integration.md` §8 (KPI doc) and the 16-KPI list provided
on 2026-05-11.

---

## 1. What's already live (no action needed)

### zord-edge (auth + ingest)
- `POST /v1/auth/signup`, `/login`, `/refresh`, `/logout`, `GET /v1/auth/me` — JWT + bcrypt + refresh-token rotation.
- `Authenticate()` middleware is dual-mode: accepts JWT (3-segment) or legacy API key (`prefix.secret`).
- `/v1/bulk-ingest` response includes `batch_id` so the console can unlock the settlement step.
- `CheckBatchIDExists` removed — uniqueness now lives downstream in intent-engine where `payment_intent` is canonical.

### zord-intelligence (port 8089) — wired into console
- `GET /v1/intelligence/dashboard/leakage` → KPIs 1–6
- `GET /v1/intelligence/dashboard/ambiguity` → KPIs 7–10
- `GET /v1/intelligence/dashboard/defensibility` → KPIs 11–13
- `GET /v1/intelligence/dashboard/patterns` → KPI 14 (accepts `batch_id`)
- `GET /v1/intelligence/dashboard/recommendations` → KPIs 15–16
- `GET /v1/intelligence/batches` → batch list (supports `status`, `limit`)
- `GET /v1/intelligence/batches/{batch_id}` → batch detail + `batch_health` projection

### zord-console — surfaces with live KPI data
| Surface | Live for |
|---|---|
| `IntentJournalSurface` | Sidebar batches + per-batch drilldown (`batch_health`) + KPI 14 donut counts |
| `AmbiguityLeakageSurface` | Hero ₹ leakage + Trapped capital + Dispute exposure |
| `EvidenceSurface` | Defensibility score hero + sub-stats (audit/dispute ready, tier) |

---

## 1.5 Per-surface gap audit — every page, what's needed, who owns it

Read this section first. Every `/payout-command-view` surface is listed; covers both "frontend can wire now" and "blocked on new endpoint".

Legend: 🟢 fully live · 🟡 partially live · 🔴 entirely static · 🛑 blocked on new endpoint

### Today tab (`/payout-command-view/today`)

| Surface | Status | What's missing | Endpoint needed | Owner |
|---|---|---|---|---|
| **HomeSurface** | 🔴 | KPI strip at top (leakage % · defensibility · anomaly · acceptance). Chart, prompt, snapshot stats all canned. | None new — use `useIntelligenceKpis` | **Frontend** |
| **IntentJournalSurface** | 🟡 | Sidebar + per-batch right pane = live. Intent rows table + DLQ rows from 8083 (no KPI overlay). "Dispatch Confidence" label still legacy. `batchQualityScore` uses row-count proxy fallback. | **G** — per-intent enrichment | **Backend (G)** + Frontend (label/overlay) |
| **AmbiguityLeakageSurface** | 🟡 | Hero + 2 buckets live. "Ops cost" bucket, By-connector / By-rail / By-amount-band tables, ROI strip, 3 recommendation cards all canned. | **A** (breakdowns) + **D** (recs list) + **E** (ROI summary) | **Backend (A,D,E)** |
| **EvidenceSurface** | 🟡 | Defensibility hero live. "Exposure" middle card, waterfall stages, 5-row packs table, search filter all canned. | **F** — evidence packs list + detail | **Backend (F)** |
| **ProofSurface** | 🔴 | Top-failure-reasons bar, evidence stage breakdown, all reason groupings. | None new — KPI 10 from `/v1/intelligence/dashboard/ambiguity` | **Frontend** |
| **OperationsGridSurface** | 🔴 | PSP-health grid, connector latencies, queue depths, error counts — all seed data. | **H** (per-PSP rollup) + new ops health endpoint | **Backend (H + new)** |
| **MerkleGraphSurface** | 🔴 | Tamper status, replay-equivalence visualization, merkle root browser. | New: `GET /v1/intelligence/merkle/recent` + per-pack drilldown (covered by **F**) | **Backend (F + new)** |
| **BillingSurface** | 🔴 | Plan tier, invoice list, usage stats (intents processed, evidence packs generated). | New: `GET /v1/billing/usage` + `GET /v1/billing/invoices` | **Backend (new)** |
| **WorkspaceSurface** | 🔴 | Team members, role assignments, API key rotation history. | `GET /v1/auth/admin/users` (exists, route handler already in place but UI not wired). API-key audit log = new. | **Frontend** (users wiring) + **Backend** (key audit) |
| **SystemsIntegrationSurface** | 🔴 | "Connected systems" cards (LMS / ERP / bank feeds health). | New: `GET /v1/systems/connections` + `GET /v1/systems/connections/{id}/health` | **Backend (new)** |
| **LiveSyncSurface** | 🔴 | Real-time PSP push/poll status pills, last-sync timestamps per provider. | New: `GET /v1/systems/sync-status` (or WebSocket stream) | **Backend (new)** |
| **SandboxConnectorsSurface** | 🔴 | Sandbox onboarding flow — fake connector mocks. | Acceptable to stay static (it's sandbox by design). | — |

### Other pages

| Page | Status | What's missing | Endpoint needed | Owner |
|---|---|---|---|---|
| **`/payout-command-view/batch-command-center`** | 🟡 | Upload form is wired. "Recent batch traffic" table (12 hardcoded rows) static. | None — `getIntelligenceBatches` already shipped | **Frontend** |
| **`/payout-command-view/connector-intelligence`** | 🔴 | Per-PSP cards, reversal trend, latency P95, route concentration. | **H** (per-PSP rollup) + **B** (settlement delay timeseries) | **Backend (B,H)** |
| **`/payout-command-view/evidence-pack/[packId]`** | 🔴 | Artifact list, signatures, merkle leaves. | **F** (evidence pack detail) | **Backend (F)** |
| **`/payout-command-view/settings/api-keys`** | 🟡 | Tenant-reg flow wired. Audit log, rotation history static. | New: `GET /v1/auth/api-keys/audit` | **Backend (new)** |
| **`/payout-command-view/settings/account`** | 🔴 | Profile editing form. | `PATCH /v1/auth/me` (new) | **Backend (new)** |
| **`/payout-command-view/page.tsx` (landing)** | 🔴 | Marketing-style intro cards. | Acceptable to stay static. | — |

### Quick read for tomorrow

**Frontend-only work I can ship without backend (~half day):**
1. HomeSurface KPI strip
2. Batch Command Center "Recent batch traffic" table
3. ProofSurface "Top failure reasons" bar
4. WorkspaceSurface users list (route handler exists)
5. ConnectorIntelligence per-PSP risk badges (uses existing patterns endpoint per batch)

**Blocked on backend (9 endpoint groups A–I + 6 ad-hoc):**
1. AmbiguityLeakage breakdowns (A)
2. Recovery timeseries (B, C)
3. Recommendations contracts list (D)
4. ROI summary (E)
5. Evidence packs list + detail (F)
6. Per-intent enrichment (G)
7. Per-PSP overview (H)
8. Snapshot freshness signaling (I)
9. Ops health endpoints (new)
10. Merkle recent + replay (new)
11. Billing usage + invoices (new)
12. API key audit log (new)
13. Systems connections health (new)
14. Live sync status (new)
15. PATCH /v1/auth/me for profile editing (new)

---

## 2. Still static — what frontend can fix without new backend endpoints

These cards/tables can be wired *today* using endpoints that already exist (zord-edge, zord-intent-engine on 8083, zord-intelligence on 8089). Frontend-only work.

### High priority (visible on day-one demo)
- **HomeSurface KPI strip** — add a 4-tile rollup at the top: leakage % · defensibility score · batch anomaly level · acceptance %. Use the existing `useIntelligenceKpis` hook. Needs a UX call on placement.
- **Batch Command Center → "Recent batch traffic" table** — replace 12 canned rows with `getIntelligenceBatches(tenantId)`. Direct shape match.
- **IntentJournalSurface → "Dispatch Confidence" card label** — rename to "Batch quality" once we agree what to display. Today still shows `confirmed/total`, not a real KPI.
- **IntentJournalSurface → intent rows table** — already pulls from `/api/prod/intents` (8083). No KPI overlay yet. Could add a "severity" column from KPI 14 per-batch.

### Medium priority
- **ProofSurface → "Top failure reasons" bar** — wire KPI 10 (`provider_ref_missing_rate`) from `/v1/intelligence/dashboard/ambiguity`.
- **ConnectorIntelligence page → per-connector risk badges** — call `/v1/intelligence/dashboard/patterns?batch_id=<latest>` per connector. Needs a card per PSP.

### Low priority (visual polish)
- **AmbiguityLeakageSurface → "Ops cost"** — derive from `ambiguous_intent_count` × benchmark hours. Pure client math.
- **EvidenceSurface → search filter** — wire to the existing list query.

---

## 3. Still static — needs NEW backend endpoints

The console references these but no endpoint exists in the 16 KPIs. Each is one new GET that should land on **zord-intelligence (port 8089)** for consistency.

### A. AmbiguityLeakageSurface breakdowns

| Card | New endpoint | Returns |
|---|---|---|
| "By connector" rows (PayU / RazorpayX / Stripe / Cashfree) | `GET /v1/intelligence/breakdown/by-connector?tenant_id=…` | `{ items: [{ provider, ambiguity_rate, delta_pp, exposure_minor, trend }] }` |
| "By rail" rows (IMPS / NEFT / NACH / UPI) | `GET /v1/intelligence/breakdown/by-rail?tenant_id=…` | `{ items: [{ rail, ambiguity_rate, delta_pp, exposure_minor, trend }] }` |
| "By amount band" bars | `GET /v1/intelligence/breakdown/by-amount-band?tenant_id=…` | `{ items: [{ band_label, band_min_minor, band_max_minor, ambiguity_rate, share_pct }] }` |

### B. Reversal + settlement timeseries

| Card | New endpoint | Returns |
|---|---|---|
| Recovery → reversal trend per PSP | `GET /v1/intelligence/timeseries/reversal-exposure?tenant_id=…&granularity=month` | `{ series: [{ month, by_provider: { razorpay: minor, payu: minor, … } }] }` |
| Recovery → recon progress trend | `GET /v1/intelligence/timeseries/reconciliation?tenant_id=…` | `{ series: [{ month, reconciled, pending, mismatch }] }` |
| Recovery → signal coverage trend | `GET /v1/intelligence/timeseries/signal-coverage?tenant_id=…` | `{ series: [{ month, psp_push_pct, psp_poll_pct, bank_statement_pct, multi_source_pct }] }` |
| ConnectorIntelligence → `settlement_delay_p95` | `GET /v1/intelligence/timeseries/settlement-delay?tenant_id=…&provider=razorpay` | `{ series: [{ ts, p50_ms, p95_ms, p99_ms }] }` |

### C. Mismatch queue + causes (Recovery page)

| Card | New endpoint | Returns |
|---|---|---|
| "Mismatch by cause" bars | `GET /v1/intelligence/breakdown/mismatch-causes?tenant_id=…` | `{ items: [{ cause_code, count, exposure_minor }] }` |
| "Mismatch queue" rows | `GET /v1/intelligence/mismatch-queue?tenant_id=…&limit=50` | `{ items: [{ contract_id, cause_code, exposure_minor, age_sec, owner_role }] }` |

### D. Recommendations *list* (Ambiguity page)

We already have KPI 15/16 *rates* but not the underlying contracts.

| Card | New endpoint | Returns |
|---|---|---|
| 3 recommendation cards at bottom of AmbiguityLeakage | `GET /v1/intelligence/recommendations?tenant_id=…&status=PENDING&limit=3` | `{ items: [{ contract_id, headline, rationale, recommended_action, expected_impact_minor, family }] }` |
| Acceptance action | `POST /v1/intelligence/recommendations/{contract_id}/accept` | 204 |
| Dismiss action | `POST /v1/intelligence/recommendations/{contract_id}/dismiss` | 204 |

### E. "What Zord closed" ROI proof (Ambiguity page)

| Card | New endpoint | Returns |
|---|---|---|
| Ambiguity closed / Disputes won / Capital released | `GET /v1/intelligence/roi/closed-summary?tenant_id=…&window=30d` | `{ ambiguity_closed_minor, disputes_won_count, capital_released_minor }` |

### F. Evidence pack table + drilldown

| Card | New endpoint | Returns |
|---|---|---|
| EvidenceSurface packs table | `GET /v1/intelligence/evidence-packs?tenant_id=…&limit=50` | `{ items: [{ pack_id, intent_id, merkle_root, certified_at, defensibility_score, artifact_count, total_artifacts }] }` |
| Evidence pack detail page | `GET /v1/intelligence/evidence-packs/{pack_id}?tenant_id=…` | full artifact list + signatures + merkle leaves |

### G. Per-intent enrichment (so IntentJournal scoring uses real per-row data)

Today the donut shows row-count proportions. Doc §4.5 expects per-intent quality scores.

| Card | New endpoint | Returns |
|---|---|---|
| Per-intent scores for selected batch | `GET /v1/intelligence/batches/{batch_id}/intents?tenant_id=…` | `{ items: [{ intent_id, scores: { intent_quality_score, matchability_score, proof_readiness_score }, idempotency: { duplicate_risk_flag }, mapping: { mapping_uncertain_flag }, client_payout_ref }] }` |

When this lands the `batchQualityScore` fallback in `IntentJournalSurface.tsx:121` upgrades automatically to the doc §4.5 weighted-six formula.

### H. Connector Intelligence per-PSP rollup

| Card | New endpoint | Returns |
|---|---|---|
| Per-PSP "highest exposure" hero | `GET /v1/intelligence/by-connector/overview?tenant_id=…` | `{ items: [{ provider, exposure_minor, ambiguity_rate, settlement_delay_p95_ms, reversal_rate, anomaly_level }] }` |

### I.5 Missing fields on existing dashboard endpoints — DEFERRED (2026-05-12)

> **Status update 2026-05-12 (later):** User confirmed frontend should work with the
> current 16 KPIs only — no new backend asks for this sprint. AmbiguitySurface no longer
> shows the amber "5 KPIs awaiting backend" section; instead it renders **graphs** built
> from the 4 live ambiguity KPIs (7, 8, 9, 10) plus derived "drag factors". Re-open this
> section only when the backend team has bandwidth for the §8.2 expansion.

The user mapped §8.1 / §8.2 KPI numbering onto the surfaces. Several KPIs they want shown aren't in the current zord-intelligence dashboard responses. **These are NOT new endpoints — just new fields on existing ones.**

#### Leakage endpoint (`/v1/intelligence/dashboard/leakage`) — add 1 field

| Field | KPI # (§8.1) | Used by |
|---|---|---|
| `total_observed_settled_volume` (minor units, string) | KPI 2 | HomeSurface "Total disbursement value" hero (currently derived locally as `intended − unmatched − under_settlement`) |

Frontend already derives this approximately — adding the real field upgrades accuracy. Non-blocking.

#### Ambiguity endpoint (`/v1/intelligence/dashboard/ambiguity`) — add 5 fields

| Field | KPI # (§8.2) | Used by | Status |
|---|---|---|---|
| `ambiguous_amount_rate` | 3 | Ambiguity page — % of value (vs count) that's ambiguous | 🛑 BLOCKER |
| `low_confidence_attachment_rate` | 5 | Ambiguity page — % of decisions below confidence threshold | 🛑 BLOCKER |
| `candidate_collision_rate` | 6 | Ambiguity page — % of intents with >1 matching settlement candidate | 🛑 BLOCKER |
| `carrier_completeness_rate` | 9 | Ambiguity page — % of rows with all required carrier identifiers (UTR/RRN) | 🛑 BLOCKER |
| `ambiguity_severity` | 10 | Ambiguity page severity badge (composite 0–100) | 🛑 BLOCKER |

**Ambiguity page is BLOCKED on these 5 fields.** Don't wire it until the API ships these. (User confirmed 2026-05-12.)

##### Concrete handoff to the backend team

File to edit (zord-intelligence):
`backend/zord-intelligence/internal/handlers/dashboard_ambiguity_handler.go`

The `AmbiguitySnapshot` (in `internal/services/ambiguity_intelligence_service.go`) already
carries `AmbiguousAmountMinor`, `TotalDecisions`, `ProviderRefMissingRate` — so 3 of the 5
new fields are derivable today; the other 2 need new instrumentation in the projection.

Add to `DashboardAmbiguityResponse`:

```go
AmbiguousAmountRate         float64 `json:"ambiguous_amount_rate"`         // KPI 3
LowConfidenceAttachmentRate float64 `json:"low_confidence_attachment_rate"` // KPI 5
CandidateCollisionRate      float64 `json:"candidate_collision_rate"`      // KPI 6
CarrierCompletenessRate     float64 `json:"carrier_completeness_rate"`     // KPI 9
AmbiguitySeverity           float64 `json:"ambiguity_severity"`            // KPI 10
```

Derivation per field (in the handler, after the existing `resp.*` assignments):

| Field | Derivation | Notes |
|---|---|---|
| **KPI 9** `CarrierCompletenessRate` | `1.0 - kpis.ProviderRefMissingRate` | Approximate — treats `provider_ref` as the canonical carrier. Once UTR/RRN/IFSC are tracked separately, replace. |
| **KPI 3** `AmbiguousAmountRate` | Cross-snapshot read: fetch latest `LEAKAGE` snapshot, parse `total_intended_amount_minor`, then `kpis.AmbiguousAmountMinor / totalIntendedMinor`. Returns `0.0` if leakage snapshot absent. | Add `AmbiguousAmountMinor decimal.Decimal` to `ambiguityKPIFields` so it parses from snapshot JSON (the value already exists in `AmbiguitySnapshot`). |
| **KPI 5** `LowConfidenceAttachmentRate` | Placeholder `0.0` with TODO. | Needs new instrumentation: track `LowConfidenceCount` (decisions where `confidence < 0.7`) in `AmbiguityValue` projection + `AmbiguitySnapshot`. Then divide by `TotalDecisions`. |
| **KPI 6** `CandidateCollisionRate` | Placeholder `0.0` with TODO. | Needs new instrumentation: track `MultiCandidateIntentCount` in `attachment_decision` projection. |
| **KPI 10** `AmbiguitySeverity` | Doc §8.2 formula: `0.35·A3 + 0.25·A5 + 0.20·A6 + 0.20·A10`, then ×100. With A5/A6 stubbed at 0, reduces to a partial weighted score. | Will jump to real value once #5 and #6 land. |

After backend ships these 5 fields:
1. Frontend updates `services/payout-command/prod-api/intelligenceTypes.ts` —
   add the 5 fields to `AmbiguityKpiResolved`.
2. `AmbiguitySurface.tsx` — remove the amber blocked-section, render the 5 fields as live tiles.
3. Mark this §I.5 entry ✅ and remove the BLOCKER pills.

### J. Evidence — `batch_id` ↔ `contract_id` placeholder mapping

When the evidence-pack endpoints (Group F) land, the UI's existing `batch_id` field on the evidence drilldown maps to **`contract_id` from the backend response** (placeholder until evidence pack IDs are first-class). Both the table column "Pack ID" and the URL `/payout-command-view/evidence-pack/[packId]` will need to accept either format.

Frontend impact: when wiring `EvidenceSurface` packs table, accept `contract_id` as the canonical identifier; treat `pack_id` as an alias for backwards compatibility.

### I. Stale data / sandbox-vs-live signaling

Currently every dashboard endpoint returns `data_available: false` with a `reason` when empty. That's enough for empty states. But for **partial freshness** (e.g. leakage snapshot is 12h old) we need:

| Card | New endpoint | Returns |
|---|---|---|
| All dashboard endpoints | (modify existing) add `freshness_warning?: string` + `snapshot_age_seconds: number` to every envelope | — |

---

## 4. Backend hygiene items (zord-edge schema)

The console doesn't surface these but they break ingest if a batch ID is supplied:

- `ingress_envelopes` `CREATE TABLE` missing ~20 columns the INSERT references (`batchid`, `source_class`, `mapping_profile_hint`, `parser_classification`, `file_*` columns, etc.). See `db/db.go:55-79` vs `services/ingest_service.go:31-33`.
- `ingress_outbox` missing `ingress_channel`, `envelope_hash`, `envelope_signature`, `lease_id`, `event_type`, `lease_until`, `created_at`, `updated_at`, `published_at`, `failure_reason_code`, `batchid`.
- `idempotency_keys` missing `principal_id_first_seen`, `source_class_first_seen`.
- `db.UpsertIngestRun` (referenced by `bulk_handler.go:677`) was missing — added as a logging stub in `db/ingest_run.go`. If you want this persisted, design an `ingest_runs` table and replace the stub.

These must be fixed before any real ingest succeeds end-to-end.

---

## 5. Other consoles outside `/payout-command-view`

Not in scope of this iteration but flagged so we don't forget:

- `/customer/*`, `/admin/*`, `/ops/*`, `/console/*`, `/app-final/*` — pre-existing mock UIs. Each will need its own KPI mapping when productized.
- `/final-landing/*`, `/landing-page-final`, `/sandbox`, `/pricing` — marketing/static. No backend dependency.

---

## 6. Definition of done — sprint exit criteria

For a "no canned numbers visible on the main flow" exit:

**Backend**
- [ ] Ship endpoints A–F above. (G + H = stretch.)
- [ ] Fix `ingress_envelopes` / `ingress_outbox` / `idempotency_keys` schemas.
- [ ] Implement real `ingest_runs` persistence (replace the stub).

**Frontend**
- [ ] Wire HomeSurface KPI strip.
- [ ] Wire Batch Command Center "Recent batch traffic" to `getIntelligenceBatches`.
- [ ] Wire ProofSurface "Top failure reasons" to KPI 10.
- [ ] Wire ConnectorIntelligence per-PSP cards once endpoint H ships.
- [ ] Wire AmbiguityLeakage breakdown tables once endpoints A ship.
- [ ] Wire Recovery timeseries charts once endpoints B + C ship.
- [ ] Wire Recommendations cards + actions once endpoint D ships.
- [ ] Wire ROI proof strip once endpoint E ships.
- [ ] Wire EvidenceSurface packs table once endpoint F ships.
- [ ] Replace `batchQualityScore` row-count proxy with doc §4.5 formula once endpoint G ships.

**Quality gates**
- [ ] No `// canned` / `// mock` comments left in `/payout-command-view/today/_components/surfaces/`.
- [ ] Every card handles `data_available: false` with a graceful empty state.
- [ ] `useIntelligenceKpis` polling interval reviewed for production load (currently 30s).

---

Last updated: 2026-05-11 (post-Phase-2 console wiring).

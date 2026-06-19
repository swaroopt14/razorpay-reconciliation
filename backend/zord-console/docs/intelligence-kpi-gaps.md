# Intelligence Service KPI Gaps — Payout Command

**Audience:** Intelligence / Outcome service owners
**Contract reference:** `Zord_Payout_Command_Canonical_KPI_and_UI_Data_Contract_2026-06-15.md`
**Console branch context:** `swaroop/clean-payout-live-surfaces`

This document lists backend gaps that block full canonical KPI compliance. The console has implemented frontend-only fixes (labels, tooltips, removal of cross-metric fallbacks) where existing APIs allow.

---

## Batch scope (Intelligence service contract)

All Intelligence dashboard KPI routes **except** `batch_contract` accept the session `tenant_id` and an optional `batch_id`:

| Parameters | Response scope |
|------------|----------------|
| `tenant_id` only | Tenant-wide KPIs |
| `tenant_id` + `batch_id` | Per-batch KPIs for that batch |

Routes that follow this pattern today: **leakage**, **ambiguity**, **patterns**, **defensibility**, **recommendations**, and related timeseries/velocity endpoints wired through the console BFF.

`GET /v1/intelligence/batch_contract/{batch_id}` is a **separate** per-batch contract API (not the shared optional-`batch_id` query pattern).

### Current console behavior

- BFF passes `batch_id` when a batch is selected; surfaces trust `data_available` on the response.
- **Match Review** uses ambiguity API batch-scoped data when present; batch health enriches counts when available but is not required to render KPIs.
- **Payment Gaps** uses leakage API batch-scoped `viewModel` when `batch_id` is set; batch health merge is optional enrichment.
- **Home** (batch selected): maps `batch_contract.total_confirmed_amount` as interim stand-in for `confirmed_matched_value_minor` on the settlement hero card.
- Evidence still uses tenant defensibility until `batch_id` is wired on that route; no longer uses leakage `unmatched_amount_minor` on the Evidence page.

---

## P0 — Required for correct batch scope and scale

| Ask | Why | Contract ref |
|-----|-----|--------------|
| **Confirm `batch_id` on defensibility** returns batch-scoped values (leakage and ambiguity already batch-scoped when `batch_id` sent) | Evidence page still tenant-wide for defensibility | §2.11, §9 |
| **Confirm `defensibility_score` scale is 0–65** and document rubric dimensions + `calculation_version` | Evidence Completeness Index hero uses hover tooltip “X of 65 points”; score must not be shown as a percentage | §2.8, §10 |
| **Confirm rate fields are 0.0–1.0** (`audit_ready_pct`, `evidence_pack_rate`, `governance_coverage_pct`, `replayability_pct`, `dispute_ready_pct`, `carrier_completeness_rate`, `candidate_collision_rate`) | Console normalizes with `normalizePercentRatio`; incorrect scales cause display bugs | §2.9 |

### Removed workaround

Console no longer hides batch-selected KPIs with “Not available for this batch” when Intelligence returns `data_available: true`.

---

## P1 — New endpoints / projections

| Ask | Why | Contract ref |
|-----|-----|--------------|
| `GET /v1/operations/summary` (or extend existing BFF) | Home closure dashboard cards (blocked batches, close-ready, operational queues) | §6, §15 |
| `payment_exception_cases` + `GET /v1/exceptions/summary` | Open Financial Exception Value without double-counting unmatched intent | §12, §8 |
| `batch_close_readiness` projection | Blocked batches / close-ready batches on Home | §13 |
| `evidence_verification_results` | Verified vs generated pack states on Evidence | §14 |
| Connector-attributed exception value (`connector_id` on exception cases) | Replace heuristic connector exposure; console removed 65% preventable and weighted allocation fallbacks | §11 |

---

## P2 — Deterministic aggregates

| Ask | Why | Contract ref |
|-----|-----|--------------|
| `confirmed_matched_value_minor` deterministic aggregate | True “matched” metric distinct from observed settlement | §2.1, §5 |

**Interim console mapping:** when a batch is selected on Home, `batch_contract.total_confirmed_amount` is shown as the confirmed-matched hero value until this KPI exists.

---

## Metric envelope (all responses)

Contract §15 expects consistent metadata on KPI responses:

- `scope_type` (`tenant` | `batch`)
- `window_start` / `window_end`
- `computed_at`
- `calculation_version`

Console surfaces `computed_at` where present today; scope badges will use full envelope when available.

---

## Console API mapping (live surfaces)

| Surface | BFF routes | Primary Intelligence fields |
|---------|------------|----------------------------|
| Home | `/api/prod/intelligence/leakage`, `ambiguity`, `defensibility`, `patterns`, `batch_contract` | Batch: `batch_contract.total_confirmed_amount` (interim confirmed matched); tenant: `total_observed_settled_amount_minor`, `unmatched_amount_minor`, etc. |
| Workspace | Same + `/api/prod/intents/dlq-items` | Leakage amounts; separate queue counts; patterns when `batch_id` set |
| Payment Gaps | leakage, timeseries/leakage, ambiguity, defensibility | Unmatched / intended / observed amounts |
| Match Review | ambiguity, ambiguity/velocity, batch health | `ambiguous_intent_count`, `candidate_collision_rate`, batch health KPIs |
| Evidence | defensibility, evidence packs | `defensibility_score` (0–65 index), pack artifact counts |
| Connectors | leakage, ambiguity, patterns, recommendations | Provider patterns; no connector-attributed money until P1 |

---

## Contact

Share implementation ETA or OpenAPI updates with the payout-command console team so Phase 3 (operations summary, exception cases, Home four-card model) can be wired without further semantic fallbacks.

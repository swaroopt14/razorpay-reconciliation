# Payout KPI API Wiring

Frontend wiring map for the payout KPI UI overhaul. **All KPI values must come from API fields** — show `—` when missing.

## Home (`?dock=home`)

| Component | UI label | API field | Endpoint | BFF |
|-----------|----------|-----------|----------|-----|
| `OperationsHealthCards` | Confirmation coverage % | `settlement_confirmation_coverage_pct` | `GET /v1/operations/summary` | `/api/prod/operations/summary` |
| `OperationsHealthCards` | Confirmed matched value | `confirmed_matched_value_minor` | operations/summary | same |
| `OperationsHealthCards` | Exception queue count | `open_exception_queue_count` | operations/summary | same |
| `OperationsHealthCards` | Exception queue value | `open_exception_queue_value_minor` | operations/summary | same |
| `OperationsHealthCards` | Blocked batches | `batch_close_readiness.blocked_batch_count` | operations/summary | same |
| `OperationsHealthCards` | Close-ready | `batch_close_readiness.close_ready_batch_count` | operations/summary | same |
| `ZordInsightCarousel` (4 slots) | Insight cards | leakage/ambiguity/patterns/trend API text | various intelligence | `/api/prod/intelligence/*` |

**Backend gap:** `GET /v1/operations/summary` returns `data_available: false` until intelligence service ships the endpoint.

## Workspace (`?dock=workspace`)

| Component | Data path |
|-----------|-----------|
| `AskZordWorkspaceLayout` | `POST /api/prompt-layer/query` only via `useAskZordState` |

Financial exception counts are **not** on this surface — they live on Home Exception queue card.

## Payment Gaps (`?dock=leakage`)

| Component | UI label | API field | Endpoint |
|-----------|----------|-----------|----------|
| `LeakageKpiStrip` hero | Open Financial Exception Value | `total_amount_minor` | `GET /v1/intelligence/dashboard/leakage` |
| `LeakageKpiStrip` secondary | Unmatched / short-settled / unlinked / reversal | `unmatched_amount_minor`, `under_settlement_amount_minor`, `orphan_amount_minor`, `reversal_exposure_minor` | leakage |
| `ExposureSegmentBar` | Segment amounts & roll % | `exposure_bands[]` or individual minor fields | leakage |
| `LeakageBatchWatchlistTable` | Batch ID | `batch_id` | `GET /v1/intelligence/batches` |
| | Intended value | `total_intended_amount_minor` | batches |
| | Variance | `total_variance_minor` | batches |
| | Leakage % | `leakage_percentage` | batches (**backend gap**) |
| | Reversal amount | `reversal_exposure_minor` | batches |
| `BatchScoreHealthCard` | Batch risk score | `batch_risk_score` | `GET /v1/intelligence/dashboard/patterns` |
| | Driver bars | `risk_driver_breakdown[]` | patterns (**backend gap**) |
| `LeakageZordInsightsCard` | Insight copy | `intelligence_headline`, `intelligence_body` | ambiguity KPI |

**Backend gaps:**
- `total_amount_minor` on leakage dashboard response
- `leakage_percentage` on batch list rows
- `risk_driver_breakdown[]` on patterns dashboard

## Intent Journal (`?dock=grid`)

| Component | Change |
|-----------|--------|
| `IntentJournalHeroBanner` | Removed duplicate Intended Payment Value bucket; hero retains intended value |

## Ambiguity (`?dock=ambiguity`)

| Component | UI label | API field | Endpoint |
|-----------|----------|-----------|----------|
| `MatchingConfidenceKpiStrip` | Unclear signal | `ambiguous_intent_count` | ambiguity |
| `SignalClarityBar` | Bands & roll % | `signal_clarity_bands[]` | ambiguity (**backend gap**) |
| | Ambiguity rate header | `ambiguity_rate` | ambiguity |
| | Mix legend | `ambiguity_mix_segments`, `clearing_pct` | ambiguity |
| `AmbiguityVelocityChart` | Bubble map | scatter API | `/api/prod/intelligence/ambiguity/velocity-scatter` |
| `ZordInsightsPanel` | Insights | `intelligence_headline`, `intelligence_body` | ambiguity |

**Removed:** `TopReasonsForReview` Zord Intelligence panel, `AmbiguityMixDonut`, `BatchControlList`, `DataQualityAuditCard`.

## New BFF routes

| Route | Upstream |
|-------|----------|
| `GET /api/prod/operations/summary` | `GET /v1/operations/summary` |
| `GET /api/prod/exceptions/summary` | `GET /v1/exceptions/summary` |

## Type extensions (`intelligenceTypes.ts`)

- `LeakageKpiResolved.total_amount_minor`
- `LeakageKpiResolved.exposure_bands`, `segment_roll_rates`
- `AmbiguityKpiResolved.signal_clarity_bands`
- `PatternsKpiResolved.batch_risk_score`, `risk_driver_breakdown`, `summary_stats`
- `IntelligenceBatchRow.reversal_exposure_minor`, `leakage_percentage`

# Payout Command View (`/payout-command-view/today` & `/sandbox`) — API data map

Both routes render `PayoutCommandViewClient` with the same dock surfaces; only `EnvironmentProvider` mode (`live` vs `sandbox`) differs. Session tenant scopes `/api/prod/*` calls.

**Master gap inventory (Home → Evidence):** see [`console-execution-api-gaps.md`](./console-execution-api-gaps.md).

## Home dock — `HomeSurface`

| UI region | Source | Console / upstream route |
|-----------|--------|----------------------------|
| Hero / KPI strip | Intelligence + trend | `GET /api/prod/intelligence/*`, `GET /api/prod/home/disbursement-trend` |
| Data status bar | Intent + settlement probes | `GET /api/prod/intents/batches`, `GET /api/prod/settlement/observations/batches` |

## Intent Journal dock — `IntentJournalSurface`

| UI region | Source | Route |
|-----------|--------|--------|
| Sidebar batch list | Intent engine (split) | `GET /api/prod/intents/batch-ids` |
| Payment Instructions table | Intent engine (split) | `GET /api/prod/intents/payment-intents?batch_id=` |
| Review Items (DLQ) | Intent engine (split) | `GET /api/prod/intents/dlq-items?batch_id=` |
| KPI / hero metrics | Derived client-side | Sum/count from payment-intents + dlq-items |
| Optional intelligence overlay | Intelligence | `GET /api/prod/intelligence/batches/{id}` |
| Row detail (when intent_id known) | Intent engine | `GET /api/prod/intents/{intent_id}` |

**Legacy (not used by journal):** `GET /api/prod/intents/batches?batch_id=` monolithic detail — still used by Batch Command Center.

## Settlement Journal dock — `SettlementJournalSurface`

| UI region | Source | Route |
|-----------|--------|--------|
| Sidebar batches | Outcome engine | `GET /api/prod/settlement/observations/batches` |
| Observation rows | Outcome engine | `GET /api/prod/settlement/observations/batches?client_batch_id=` |
| KPI / hero / data health | Derived client-side | Aggregates from observation rows |

## Other docks (snapshot)

| Dock | Primary data | Notes |
|------|----------------|-------|
| Leakage / Ambiguity / Evidence | `useIntelligenceKpis`, evidence packs | See gaps doc |
| Connectors | Partial intelligence + static PSP cards | Per-connector API gap |
| Live sync | Placeholder | Systems sync API gap |
| Workspace | `POST /api/prompt-layer/query` | |

## Intelligence KPI helper (`useIntelligenceKpis`)

Polls: `/api/prod/intelligence/leakage`, `ambiguity`, `defensibility`, `patterns`, `recommendations`.

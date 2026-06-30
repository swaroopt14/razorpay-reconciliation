# Payout smoke simulator

Single-container API simulator for **manual payout-command UI review**. All backend services are served from **one port** (`8099` by default) with realistic multi-batch fixtures.

The Next.js console BFF still runs locally (`npm run dev`); it proxies to this simulator instead of real microservices.

## How this compares to `zord-intelligence/docker-compose.test.yml`

| | Intelligence `docker-compose.test.yml` | Payout smoke simulator |
|---|----------------------------------------|-------------------------|
| **Purpose** | Run real intelligence service + Kafka + ML + Postgres | Fake all payout APIs on one port for UI review |
| **Demo batch data** | **Not auto-generated** — `init.sql` only creates schema + policy seeds | **10 batches generated in memory** at startup |
| **Where KPI/batch values come from** | Kafka events → `ProjectionService` → Postgres projections/snapshots, **or** Go tests insert rows directly | JavaScript fixtures (`buildSmokeBatches`) return JSON |
| **Integration tests** | `dashboard_e2e_test.go` calls `seedSnapshot()` / `seedAction()` per test tenant | N/A — static catalogue, configurable count |
| **Containers** | 5 (intelligence, postgres, kafka, ml-service, kafka-ui) | **1** |

Intelligence test data pattern (from `internal/handlers/dashboard_e2e_test.go`):

1. Unique `tenant_id` per test run
2. `INSERT INTO intelligence_snapshots` with JSON `snapshot_json` (LEAKAGE, PATTERN, etc.)
3. `INSERT INTO action_contracts` for recommendation KPIs
4. HTTP handler reads snapshots → dashboard API response

The smoke simulator **mirrors those response shapes** without Postgres — batches are built like multiple per-batch snapshot seeds:

```js
buildSmokeBatches() // batch-2026-06-12-payroll … batch-2026-06-21-close-out
```

## Quick start

```bash
# 1. Start the simulator (10 batches by default)
cd backend/payout-smoke-simulator
docker compose -f docker-compose.smoke.yml up -d --build

# 2. Wire the console to the simulator
cd ../zord-console
cp .env.smoke.example .env.local
npm install
npm run dev
```

Open http://localhost:3000/payout-command-view/today and sign in with **any** email/password.

## Default batch catalogue (10 dated demo days)

Each batch = **15 payment intents** + **15 settlement observations** on that calendar day. Home trend uses `GET /v1/intelligence/dashboard/leakage?from_date=&to_date=` per day.

| Batch ID | Day | Intent ₹ | Settlement ₹ | DLQ | Partner |
|----------|-----|----------|--------------|-----|---------|
| `batch-2026-06-12-payroll` | 12 Jun payroll | 55,000 | 44,000 | 2 | razorpay |
| `batch-2026-06-13-vendor-run` | 13 Jun vendor run | 68,000 | 61,000 | 0 | cashfree |
| `batch-2026-06-14-refunds` | 14 Jun refunds | 48,000 | 51,000 | 1 | razorpay |
| `batch-2026-06-15-contractor` | 15 Jun contractor | 71,000 | 52,000 | 3 | cashfree |
| `batch-2026-06-16-incentives` | 16 Jun incentives | 53,000 | 49,000 | 1 | razorpay |
| `batch-2026-06-17-peak-run` | 17 Jun peak run | 88,000 | 72,000 | 0 | cashfree |
| `batch-2026-06-18-micro-batch` | 18 Jun micro-batch | 41,000 | 35,000 | 2 | razorpay |
| `batch-2026-06-19-partner-payouts` | 19 Jun partner payouts | 67,000 | 61,000 | 1 | cashfree |
| `batch-2026-06-20-sweep` | 20 Jun sweep | 59,000 | 45,000 | 2 | razorpay |
| `batch-2026-06-21-close-out` | 21 Jun close-out | 76,000 | 68,000 | 0 | cashfree |

Use **Month** period on Home (Jun 2026) to see bars move up/down across these days.

Counts use deterministic formulas so each batch differs (pagination still works on large observation sets).

Change batch count:

```bash
SMOKE_BATCH_COUNT=10 docker compose -f docker-compose.smoke.yml up -d --build
```

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `SMOKE_SIMULATOR_PORT` | `8099` | Host port mapping |
| `SMOKE_TENANT_ID` | `00000000-0000-0000-0000-000000000001` | Tenant on all fixtures |
| `SMOKE_API_KEY` | `zord-local-dev-api-key` | Accepted Bearer key for settlement routes |
| `SMOKE_BATCH_COUNT` | `10` | Number of batches to generate |
| `SMOKE_LATENCY_MS` | `120` | Artificial delay on heavy list routes |

## Health check

```bash
curl -s http://localhost:8099/healthz
curl -s "http://localhost:8099/api/prod/intents/batch-ids?tenant_id=00000000-0000-0000-0000-000000000001" | jq '.items | length'
curl -s "http://localhost:8099/v1/settlement/observations/batches?tenant_id=00000000-0000-0000-0000-000000000001&client_batch_id=batch-2026-06-12-payroll&page=1&page_size=100" | jq '.pagination'
```

## Local run (without Docker)

```bash
cd backend/payout-smoke-simulator
SMOKE_BATCH_COUNT=10 npm start
```

## Console env

Copy `backend/zord-console/.env.smoke.example` → `.env.local`. All `ZORD_*_URL` values point to `http://localhost:8099`.

## Notes

- Not a replacement for intelligence integration tests or Kafka-driven projections.
- Unimplemented routes return HTTP 404 with `{ error: "smoke_simulator_no_route" }`.

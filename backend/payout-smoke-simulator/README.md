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
buildSmokeBatches(10) // smoke-batch-01 … smoke-batch-10
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

## Default batch catalogue (10 batches)

| Batch ID | Label | Intents | Settlement rows | Partner | Finality |
|----------|-------|---------|-----------------|---------|----------|
| `smoke-batch-01` | Alpha payroll | 17 | 11 | razorpay | OPEN |
| `smoke-batch-02` | Beta vendor run | 22 | 22 | cashfree | PARTIALLY_SETTLED |
| `smoke-batch-03` | Gamma refunds | 12 | 33 | razorpay | FULLY_SETTLED |
| … | … | varies | varies | alternates | cycles 3 states |
| `smoke-batch-10` | Kappa close-out | 17 | 11 | cashfree | OPEN |

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
| `SMOKE_API_KEY` | `smoke-local-api-key` | Accepted Bearer key for settlement routes |
| `SMOKE_BATCH_COUNT` | `10` | Number of batches to generate |
| `SMOKE_LATENCY_MS` | `120` | Artificial delay on heavy list routes |

## Health check

```bash
curl -s http://localhost:8099/healthz
curl -s "http://localhost:8099/api/prod/intents/batch-ids?tenant_id=00000000-0000-0000-0000-000000000001" | jq '.items | length'
curl -s "http://localhost:8099/v1/settlement/observations/batches?tenant_id=00000000-0000-0000-0000-000000000001&client_batch_id=smoke-batch-03&page=1&page_size=100" | jq '.pagination'
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

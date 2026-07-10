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
docker compose up -d --build

# 2. Wire the console to the simulator
cd ../zord-console
cp .env.smoke.example .env.local
npm install
npm run dev
```

Open http://localhost:3000/payout-command-view/today and sign in with **any** email/password.

## Default batch catalogue

- **`SMOKE_DEMO_DAY_COUNT` (default 366)** — full calendar year of dated values for Home Month/Quarter/Year charts.
- **`SMOKE_BATCH_COUNT` (default 10)** — capped journal/evidence sidebar list (plus pinned Jun demo batches).

Each listed journal batch = **15 payment intents** + **15 settlement observations**. Home trend uses `GET /v1/intelligence/dashboard/leakage?from_date=&to_date=` per day against the full-year catalogue.

Pinned journal deep-link batches (always included when the list is capped):

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

Use **Month** period on Home to see bars across the full current month (same as master).

Counts use deterministic formulas so each batch differs (pagination still works on large observation sets).

Change journal list size (charts stay full-year unless you also lower `SMOKE_DEMO_DAY_COUNT`):

```bash
SMOKE_BATCH_COUNT=10 docker compose up -d --build
```

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `SMOKE_SIMULATOR_PORT` | `8099` | Host port mapping |
| `SMOKE_TENANT_ID` | `00000000-0000-0000-0000-000000000001` | Tenant on all fixtures |
| `SMOKE_API_KEY` | `zord-local-dev-api-key` | Accepted Bearer key for settlement routes |
| `SMOKE_DEMO_DAY_COUNT` | `366` | Days for home/leakage trend charts |
| `SMOKE_BATCH_COUNT` | `10` | Journal/evidence list batch count |
| `SMOKE_LATENCY_MS` | `0` | Artificial delay on heavy list routes |

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

| File | When to use |
|------|-------------|
| `zord-console/.env.smoke.example` | Console talks to **this smoke simulator** (all `ZORD_*_URL` → one host) |
| `zord-console/.env.live.example` | Console talks to **real microservices** (each `ZORD_*_URL` → its own service) |

Local: copy the smoke example → `.env.local` (gitignored). All `ZORD_*_URL` values point to `http://localhost:8099`.

### AWS / deployed console

Do **not** commit `.env.local`. Set the same keys as runtime env (ECS task definition, Amplify, Parameter Store, etc.):

1. **Demo / UI review against smoke** — start from `.env.smoke.example`, replace every `http://localhost:8099` with your smoke service URL (ALB / ECS public URL), e.g. `https://smoke.example.com`. Keep API keys aligned with the smoke container (`SMOKE_API_KEY`).
2. **Real backends** — start from `.env.live.example`, set each `ZORD_*_URL` / `PROMPT_LAYER_URL` to that service’s AWS URL. Do not point them at smoke.

Smoke and live are mutually exclusive for a given console deployment: one set of URLs, not both.

## Notes

- Not a replacement for intelligence integration tests or Kafka-driven projections.
- Unimplemented routes return HTTP 404 with `{ error: "smoke_simulator_no_route" }`.

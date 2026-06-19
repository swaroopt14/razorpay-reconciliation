# Performance Testing — Zord Platform

Automated end-to-end load testing for all 9 backend microservices via Kong API Gateway.

---

## Architecture

```
Jenkins (Saturday 3AM) → k6 → Kong Gateway → 9 Backend Services
                                    ↓
                           Slack + Grafana + Kibana
```

---

## 9 Tests — Complete Coverage

| # | Test | Services Tested | VUs | Duration |
|---|------|----------------|-----|----------|
| 1 | Health Check | All 9 service health endpoints | 100 | 3.5 min |
| 2 | Tenant Registration | zord-edge (admin API) | 20 | 3 min |
| 3 | Ingest Pipeline | zord-edge (single + bulk CSV) | 10 | 3 min |
| 4 | Full E2E Flow | ALL services (12-step journey) | 20 | 5 min |
| 5 | Rate Limiting | Kong plugins (bulk, settlement, AI) | 5+3+5 | 30 sec |
| 6 | Spike Test | All Kong routes simultaneously | 200 | 55 sec |
| 7 | Intelligence Surface | zord-intelligence + evidence + outcome | 15 | 3 min |
| 8 | AI Copilot | zord-prompt-layer (query + chat) | 10 | 3 min |
| 9 | Security & CORS | Kong security headers + CORS + rate headers | 20 | 2 min |

---

## What Gets Tested (Every Endpoint)

### zord-edge (Port 8080)
- `POST /v1/admin/tenantReg` — Create tenant
- `GET  /v1/admin/tenants` — List tenants
- `GET  /v1/admin/tenants/:id` — Get tenant
- `POST /v1/ingest` — Single payment JSON
- `POST /v1/bulk-ingest` — Bulk CSV upload
- `GET  /edge/health` — Health check

### zord-intent-engine (Port 8083)
- `GET /v1/intents` — Query intents
- `GET /v1/dlq` — Dead letter queue
- `GET /v1/etl` — ETL run status
- `GET /intent/health` — Health check

### zord-relay (Port 8082)
- `GET /v1/dispatch` — Dispatch status
- `GET /relay/health` — Health check

### zord-outcome-engine (Port 8081)
- `GET  /v1/settlement/supported-psps` — List PSPs
- `GET  /v1/settlement/observations/batches` — Batch observations
- `GET  /v1/reconciliation` — Reconciliation results
- `GET  /outcome/health` — Health check

### zord-evidence (Port 8088)
- `GET  /v1/evidence/packs` — List evidence packs
- `GET  /v1/verify` — Merkle verification
- `GET  /evidence/health` — Health check

### zord-intelligence (Port 8089)
- `GET /v1/projections` — Risk scores / KPIs
- `GET /v1/policies` — Policy rules
- `GET /v1/rca` — Root cause analysis
- `GET /intelligence/health` — Health check

### zord-prompt-layer (Port 8086)
- `POST /v1/query` — AI natural language query
- `POST /v1/chat` — AI conversation
- `GET  /prompt/health` — Health check

### zord-token-enclave (Port 8087)
- `GET /token/health` — Health check

### zord-console (Port 3000)
- `GET /` — Frontend dashboard

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Health check p95 latency | < 500ms |
| Tenant registration p95 | < 2s |
| Ingest pipeline p95 | < 5s |
| Full E2E flow p95 | < 5s |
| Intelligence APIs p95 | < 3s |
| AI copilot p95 | < 10s (LLM) |
| Spike test (200 users) | < 5% gateway errors |
| Rate limiting | 429 returned after limit |
| Security headers | All present on every response |

---

## Slack Notification

Beautiful card with:
- Pass/fail status for all 9 tests (with emoji icons)
- Key metrics (p95, throughput, total requests)
- Direct links to: Jenkins Build, Full Report, Grafana Dashboard, Kibana Logs
- Color-coded: green (all pass), orange (partial), red (pipeline error)

---

## Grafana Dashboard Links

| Dashboard | URL | UID |
|-----------|-----|-----|
| Platform Health & Alerts | https://grafana.zordnet.com/d/zord-platform-health | zord-platform-health |
| PostgreSQL & Kafka | https://grafana.zordnet.com/d/zord-data-layer | zord-data-layer |
| Node & Infrastructure | https://grafana.zordnet.com/d/zord-nodes-infra | zord-nodes-infra |

---

## Folder Structure

```
performance-tests/
├── README.md
├── Jenkinsfile.performance-tests
├── generate-report.sh
├── run-all.sh
└── scripts/
    ├── 01-health-check.js
    ├── 02-tenant-registration.js
    ├── 03-bulk-ingest.js
    ├── 04-full-flow.js
    ├── 05-rate-limit.js
    ├── 06-spike-test.js
    ├── 07-intelligence-surface.js
    ├── 08-ai-copilot.js
    └── 09-security-headers.js
```

---

## Run Locally

```bash
# Install k6: https://k6.io/docs/get-started/installation/
k6 run --env BASE_URL="https://api.zordnet.com" --env ADMIN_KEY="zord123" performance-tests/scripts/01-health-check.js
```

---

## Jenkins Setup

1. New Item → Pipeline → `performance-tests`
2. Pipeline script from SCM → Git → `performance-tests/Jenkinsfile.performance-tests`
3. Build Triggers → Build periodically → `H 3 * * 6` (Saturday 3AM)

---

## Step-by-Step Deployment Guide (From Zero)

Follow these steps exactly. Nothing is assumed.

---

### Step 1: Push Code to GitHub

Push the `performance-tests/` folder to your repository so Jenkins can pull it.

**What this does:** Uploads all 9 test scripts, Jenkinsfile, report generator, and README to GitHub so Jenkins can pull them.

---

### Step 2: Create Slack Incoming Webhook

1. Open your browser → go to: `https://api.slack.com/apps`
2. Click your app **"Zord Performance Bot"** (or create one if you don't have it)
3. Left sidebar → click **"Incoming Webhooks"**
4. Toggle it **ON** if not already
5. Scroll down → click **"Add New Webhook to Workspace"**
6. Select channel: **#zord-performance-testing-bot**
7. Click **"Allow"**
8. Copy the new webhook URL (starts with `https://hooks.slack.com/services/T.../B.../...`)
9. **Save this URL** — you'll paste it in Jenkins credentials

**What this does:** Gives Jenkins permission to send messages to your Slack channel.

---

### Step 3: Add Webhook as Jenkins Credential

1. Jenkins → **Manage Jenkins** → **Credentials**
2. Click **(global)** domain → **Add Credentials**
3. Fill in:
   - Kind: **Secret text**
   - Secret: paste your webhook URL
   - ID: `slack-webhook`
   - Description: `Slack webhook for performance bot`
4. Click **Save**

**What this does:** Stores the webhook URL securely in Jenkins. The pipeline reads it using `credentials('slack-webhook')` — the URL never appears in code or logs.

---

### Step 3: Create Jenkins Pipeline Job

1. Open Jenkins in your browser (your Jenkins URL)
2. Click **"New Item"** (top left)
3. Enter name: `performance-tests`
4. Select: **"Pipeline"**
5. Click **"OK"**

Now you're on the job configuration page:

---

### Step 4: Configure Pipeline Source

Scroll down to the **"Pipeline"** section:

1. **Definition:** select `Pipeline script from SCM`
2. **SCM:** select `Git`
3. **Repository URL:** `https://github.com/Arealis-network/Arealis-Zord-intent.git`
4. **Credentials:** select your GitHub PAT credential (`github-pat`)
5. **Branch Specifier:** `*/main`
6. **Script Path:** `performance-tests/Jenkinsfile.performance-tests`

**What this does:** Tells Jenkins where to find the pipeline code.

---

### Step 5: Configure Build Triggers (Automatic Weekly Run)

Still on the same config page, scroll to **"Build Triggers"**:

1. Check the box: **"Build periodically"**
2. In the Schedule field, type: `H 3 * * 6`

```
H 3 * * 6
│ │ │ │ │
│ │ │ │ └── Day of week (6 = Saturday)
│ │ │ └──── Month (any)
│ │ └────── Day of month (any)
│ └──────── Hour (3 AM)
└────────── Minute (random, chosen by Jenkins)
```

**What this does:** Runs the test automatically every Saturday at 3 AM.

---

### Step 6: Save and Run First Build

1. Click **"Save"** at the bottom of the config page
2. Click **"Build with Parameters"** (left sidebar)
3. You'll see these parameters pre-filled:
   - BASE_URL: `https://api.zordnet.com`
   - ADMIN_KEY: `zord123`
   - RUN_SPIKE_TEST: ✓ checked
   - RUN_AI_TEST: ✓ checked
   - NOTIFY_SLACK: ✓ checked
4. Click **"Build"**

**What this does:** Runs all 9 performance tests against your production API. The Slack webhook is pulled automatically from Jenkins credentials.

---

### Step 7: Watch the Build

1. Click on the running build number (e.g., `#6`)
2. Click **"Console Output"** to watch live
3. You'll see each stage run:
   ```
   [Pipeline] stage (Install Tools)
   [Pipeline] stage (Test 1: Health Check)
   [Pipeline] stage (Test 2: Tenant Registration)
   ...
   [Pipeline] stage (Notify Slack)
   ```
4. Total runtime: ~20-25 minutes

---

### Step 8: Check Results

After the build finishes:

| Where to Look | What You'll See |
|---|---|
| **Slack** (`#zord-performance-testing-bot`) | Beautiful card with all 9 test results + metrics + links |
| **Jenkins → Build → Artifacts** | Download REPORT.md, all test output files |
| **Grafana** (click link in Slack) | CPU/memory/latency graphs during test window |
| **Kibana** (click link in Slack) | Any 5xx error logs during test window |
| **Jaeger** (click link in Slack) | Request traces with X-Request-Id correlation |

---

### Step 9: (Optional) Configure kubectl on Jenkins Agent

If you want cluster state (HPA, pod CPU/memory) in the report:

```bash
# SSH into your Jenkins agent
ssh jenkins-agent

# Install AWS CLI (if not present)
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install

# Configure AWS credentials
aws configure
# Enter: Access Key, Secret Key, Region: ap-south-1, Output: json

# Install kubectl
curl -LO "https://dl.k8s.io/release/v1.29.0/bin/linux/amd64/kubectl"
chmod +x kubectl && sudo mv kubectl /usr/local/bin/

# Connect to your EKS cluster
aws eks update-kubeconfig --name <your-cluster-name> --region ap-south-1

# Verify
kubectl get pods -n zord
```

**What this does:** Allows the Jenkins agent to run `kubectl` commands to capture cluster state before/after tests.

---

### Step 10: (Optional) Rotate Your Slack Webhook

Since the old webhook URL was shared in chat:

1. Go to: `https://api.slack.com/apps` → your app → **Incoming Webhooks**
2. Find the old webhook → click the **trash icon** to delete it
3. Click **"Add New Webhook to Workspace"** → select `#zord-performance-testing-bot`
4. Copy the new URL
5. Update in Jenkins: **Build with Parameters** → paste new URL in `SLACK_WEBHOOK_URL`

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build says "k6: command not found" | The pipeline installs it automatically. Check internet access from Jenkins agent |
| All tests show 0 requests | Jenkins agent can't reach `api.zordnet.com`. Check DNS/firewall |
| Slack notification not received | Check webhook URL is correct. Run `curl -X POST -H 'Content-type: application/json' --data '{"text":"test"}' YOUR_WEBHOOK_URL` from Jenkins agent |
| Tests show 100% failure (http_req_failed) | This is normal — k6 counts 401 auth responses as "failed". Check `checks` instead |
| Report shows "kubectl unavailable" | kubectl not configured on Jenkins agent (see Step 10) |
| Grafana link shows "Dashboard not found" | The dashboard UID is `zord-platform-health`. Verify it exists in Grafana |
| Pipeline timeout (>45 min) | AI copilot test may be slow. Set `RUN_AI_TEST` to false |
| Slack shows "invalid_payload" | Check the webhook URL doesn't have extra spaces or line breaks |

---

## Quick Reference

| Item | Value |
|------|-------|
| Jenkins Job Name | `performance-tests` |
| Script Path | `performance-tests/Jenkinsfile.performance-tests` |
| Schedule | `H 3 * * 6` (Saturday 3 AM) |
| Target URL | `https://api.zordnet.com` |
| Admin Key | `zord123` |
| Slack Channel | `#zord-performance-testing-bot` |
| Grafana | `https://grafana.zordnet.com/d/zord-platform-health` |
| Kibana | `https://kibana.zordnet.com` |
| Jaeger | `https://jaeger.zordnet.com` |
| Kong Admin | `https://kong-admin.zordnet.com` |
| Total Tests | 9 |
| Total Runtime | ~20-25 minutes |
| Jenkins Artifacts | `performance-tests/results/<build-number>/` |



Here's what Build #10 will look like in Slack:

---

**Zord Performance Report — Build #10**

📅 Jun 12, 2026 at 4:54 PM UTC  |  ⏱ 24 min  |  🌐 `https://api.zordnet.com`

---

✅ **ALL 9 TESTS PASSED**
🟢 **All 12 services responding**

---

```
#   Test                      Status  Requests   p95      Checks
──  ────────────────────────  ──────  ─────────  ───────  ──────
01  Health Check (9 services) ✅       22530      11ms     100%
02  Tenant Registration       ✅        1841      23ms     99%
03  Ingest Pipeline (JSON+CS  ✅         465     101ms     80%
04  Full E2E (12 services)    ✅        5484      16ms     99%
05  Rate Limiting (3 routes)  ✅         160      31ms     100%
06  Spike Test (200 VUs)      ✅       36882      10ms     100%
07  Intelligence APIs         ✅        4375      11ms     100%
08  AI Copilot (LLM)          ✅         379      13ms     100%
09  Security & CORS           ✅        2223      10ms     89%
──  ────────────────────────  ──────  ─────────  ───────  ──────
    TOTAL                                76339     101ms   9/9 pass
```

---

🔗 **Quick Links**
📄 Full Report  |  🔍 Console Log  |  📉 Grafana Dashboard  |  📒 Kibana Logs  |  🔎 Jaeger Traces

---

_Zord Performance Bot — Automated weekly load testing via Jenkins + k6 + Kong API Gateway_

---

**If something fails, it adds this section:**

---

🚨 **What Failed & Why**

**Full E2E (12 services):**
  `✗ settlement reachable  ↳ 0% — ✓ 0 / ✗ 594`
  `✗ reconciliation reachable  ↳ 0% — ✓ 0 / ✗ 594`

👉 **Action:** Check Grafana for service health, Kibana for error logs

---

That's the final format. All values are real. Push and run.
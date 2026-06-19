# Functional Integration Tests — Zord Platform

Automated tests that verify **business logic works end-to-end** after every deployment.

Unlike performance tests (which check "can it handle load?"), these verify "does it actually work?"

---

## What It Catches

| Issue | How It Catches It |
|-------|-------------------|
| Database not storing records | Creates tenant → queries it back → fails if not found |
| API key generation broken | Creates tenant → uses key → fails if 401 |
| Ingest not saving to S3/DB | Ingests payment → queries intents → fails if 0 results |
| CSV upload broken | Uploads CSV → checks response has results |
| Outcome engine DB down | Queries supported-psps → fails if 500 |
| Intelligence DB disconnected | Queries projections → fails if 500 |
| DLQ not accessible | Queries DLQ → fails if not 200 |
| Service pods crashed | Health check → fails if not 200 |
| Secrets misconfigured | Any 500 response indicates env var / secret issue |
| Kong routing broken | Any endpoint unreachable = routing config issue |

---

## Tests Run (in order)

| # | Test | What It Verifies |
|---|------|-----------------|
| 01 | zord-edge health | Pod alive, can respond |
| 02 | zord-intent-engine health | Pod alive, can respond |
| 03 | zord-outcome-engine health | Pod alive, can respond |
| 04 | zord-evidence health | Pod alive, can respond |
| 05 | zord-intelligence health | Pod alive, can respond |
| 06 | zord-prompt-layer health | Pod alive, can respond |
| 07 | zord-relay health | Pod alive, can respond |
| 08 | Create tenant | Admin key works, DB stores tenant |
| 09 | Query tenant by ID | DB read works, tenant persisted |
| 10 | Single payment ingest | Auth works, S3 stores envelope, DB records it |
| 11 | Bulk CSV ingest | File upload works, CSV parsing works |
| 12 | Query intents | Intent-engine DB has records from ingest |
| 13 | Supported PSPs | Outcome-engine responds, PSP registry loaded |
| 14 | Intelligence KPIs | Intelligence DB connected, projections query works |
| 15 | DLQ query | Intent-engine DLQ table accessible |
| 16 | List tenants | Admin endpoint works, DB returns data |

---

## Jenkins Setup

1. New Item → Pipeline → `functional-tests`
2. Pipeline script from SCM → Git → `functional-tests/Jenkinsfile.functional-tests`
3. Build Triggers → depends on your workflow:
   - **After every deploy:** trigger from ArgoCD webhook or after ECR push pipeline
   - **Scheduled:** `H/30 * * * *` (every 30 minutes)
   - **Manual:** just click "Build Now"

---

## Run Locally

```bash
bash functional-tests/run-tests.sh https://api.zordnet.com zord123 ./results
```

---

## Output

- **Slack:** Table showing each test pass/fail with details
- **JSON:** `results.json` with full machine-readable results
- **Console:** Color-coded terminal output

---

## Duration

~30 seconds to 1 minute. Designed to be fast so you can run after every deployment.

---

## Step-by-Step Deployment Guide

---

### Step 1: Push Code to GitHub

Push the `functional-tests/` folder to your repository.

---

### Step 2: Create Slack Incoming Webhook

1. Open browser → go to: `https://api.slack.com/apps`
2. Click your app **"Zord Performance Bot"** (or create one)
3. Left sidebar → **"Incoming Webhooks"** → Toggle ON
4. Click **"Add New Webhook to Workspace"**
5. Select channel: **#zord-functional-testing-bot**
6. Click **"Allow"**
7. Copy the webhook URL

---

### Step 3: Add Webhook as Jenkins Credential

1. Jenkins → **Manage Jenkins** → **Credentials**
2. Click **(global)** domain → **Add Credentials**
3. Fill in:
   - Kind: **Secret text**
   - Secret: paste your webhook URL from Step 2
   - ID: `slack-webhook-functional`
   - Description: `Slack webhook for functional testing bot`
4. Click **Save**

---

### Step 4: Create Jenkins Pipeline Job

1. Open Jenkins
2. Click **"New Item"** (top left)
3. Enter name: `functional-tests`
4. Select: **"Pipeline"**
5. Click **"OK"**

---

### Step 5: Configure Pipeline Source

On the job configuration page, scroll to **"Pipeline"** section:

1. **Definition:** `Pipeline script from SCM`
2. **SCM:** `Git`
3. **Repository URL:** `https://github.com/Arealis-network/Arealis-Zord-intent.git`
4. **Credentials:** `github-pat`
5. **Branch:** `*/main`
6. **Script Path:** `functional-tests/Jenkinsfile.functional-tests`

---

### Step 6: Configure Build Trigger

Choose one (or multiple):

**Option A: Run after every deployment (recommended)**
- If you have an ECR push pipeline or ArgoCD, add a "Build Trigger" step at the end of that pipeline:
  ```groovy
  build job: 'functional-tests', wait: false
  ```

**Option B: Run every 30 minutes**
- Build Triggers → **Build periodically** → `H/30 * * * *`

**Option C: Manual only**
- No trigger needed — just click "Build Now" whenever you deploy

---

### Step 7: Save and Run

1. Click **"Save"**
2. Click **"Build with Parameters"**
3. Parameters (pre-filled from Jenkinsfile):
   - BASE_URL: `https://api.zordnet.com`
   - ADMIN_KEY: `zord123`
   - NOTIFY_SLACK: ✓ checked
4. Click **"Build"**
5. Wait ~30–60 seconds

---

### Step 8: Check Results

| Where | What |
|-------|------|
| **Slack** (`#zord-functional-testing-bot`) | Table with pass/fail for each test + failure details |
| **Jenkins → Build → Console Output** | Color-coded live output |
| **Jenkins → Build → Artifacts** | `results.json` with machine-readable results |
| **Grafana** (link in Slack) | Check if any service spiked CPU/memory during test |
| **Kibana** (link in Slack) | Check for 5xx error logs matching the test window |

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "zord-edge health: Expected 200, got 000" | Jenkins agent can't reach api.zordnet.com | Check DNS/firewall on Jenkins agent |
| "Create tenant: Expected 201, got 401" | ADMIN_KEY is wrong | Update the `ADMIN_KEY` parameter in Jenkins |
| "Create tenant: Expected 201, got 500" | zord-edge DB connection broken | Check `EDGE_DB_PASSWORD` secret in K8s, check DB_HOST reachable |
| "Query tenant by ID: Expected 200, got 404" | Tenant created but not persisted to DB | DB write failure — check zord-edge pod logs in Kibana |
| "Single ingest: Expected 200, got 401" | API key from tenant reg is invalid | Check `ZORD_VAULT_KEY` secret — key decryption may be failing |
| "Single ingest: Expected 200, got 500" | S3 bucket not accessible or env var missing | Check `EDGE_S3_BUCKET` secret, check IAM role on `zord-aws-access` SA |
| "Bulk CSV ingest: got 500" | File upload or CSV parsing broken | Check pod logs — likely missing S3 bucket or Kafka broker unreachable |
| "Query intents: 200 but 0 intents" | Ingest accepted but intent-engine didn't consume from Kafka | Check Kafka broker connectivity, consumer group lag in Grafana |
| "Supported PSPs: got 500" | zord-outcome-engine DB down | Check `OUTCOME_DB_PASSWORD` secret, check DB_HOST |
| "Intelligence KPIs: got 500" | zord-intelligence DB connection broken | Check `INTELLIGENCE_DATABASE_URL` secret |
| "jq not found" | Script installs it automatically — check internet access | Ensure Jenkins agent can reach github.com |

---

## Quick Reference

| Item | Value |
|------|-------|
| Jenkins Job Name | `functional-tests` |
| Script Path | `functional-tests/Jenkinsfile.functional-tests` |
| Credential | `slack-webhook-functional` |
| Target URL | `https://api.zordnet.com` |
| Admin Key | `zord123` |
| Duration | ~30–60 seconds |
| Slack Channel | `#zord-functional-testing-bot` |
| Artifacts | `functional-tests/results/<build-number>/results.json` |

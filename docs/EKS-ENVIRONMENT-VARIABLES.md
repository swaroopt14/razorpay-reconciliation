# AWS Secrets Manager — Complete Values for EKS Deployment

You need to create **3 secrets** in AWS Secrets Manager.

**Secret names in AWS (production):**
- `production/zord/app-secrets`
- `production/zord/edge-signing-key`
- `production/zord/evidence-signing-key`

---

## How to Create Secrets in AWS Console

### Step 1: Go to AWS Secrets Manager

```
AWS Console → Secrets Manager → Store a new secret
```

### Step 2: Create `production/zord/app-secrets`

1. Secret type: **Other type of secret**
2. Key/value: Switch to **Plaintext** tab
3. Paste the full JSON below
4. Click **Next**
5. Secret name: `production/zord/app-secrets`
6. Description: `Application secret bundle for Arealis Zord workloads (production)`
7. Click **Next** → **Next** → **Store**

### Step 3: Create `production/zord/edge-signing-key`

1. Secret type: **Other type of secret**
2. Key/value: Switch to **Plaintext** tab
3. Paste the JSON from Secret 2 below
4. Click **Next**
5. Secret name: `production/zord/edge-signing-key`
6. Description: `Edge signing private key for Arealis Zord (production)`
7. Click **Next** → **Next** → **Store**

### Step 4: Create `production/zord/evidence-signing-key`

1. Secret type: **Other type of secret**
2. Key/value: Switch to **Plaintext** tab
3. Paste the JSON from Secret 3 below
4. Click **Next**
5. Secret name: `production/zord/evidence-signing-key`
6. Description: `Evidence signing private key for Arealis Zord (production)`
7. Click **Next** → **Next** → **Store**

---

## Secret 1: `production/zord/app-secrets`

This is a single JSON object. Paste this as `ZORD_APP_SECRETS_JSON` in GitHub Actions secrets.

```json
{
  "POSTGRES_SUPERUSER_PASSWORD": "arealis_password",
  "EDGE_DB_PASSWORD": "zord_password",
  "INTENT_DB_PASSWORD": "intent_password",
  "RELAY_DB_PASSWORD": "relay_password",
  "TOKEN_DB_PASSWORD": "token_password",
  "OUTCOME_DB_PASSWORD": "outcome_password",
  "EVIDENCE_DB_PASSWORD": "evidence_password",
  "INTELLIGENCE_DB_PASSWORD": "zpi_secret",
  "ZORD_VAULT_KEY": "00Ofxp50eVCizf58ZoX4Zy2T83O38sMSrc3s9Cpb/ac=",
  "INTERNAL_ADMIN_KEY": "zord123",
  "MASTER_KEY": "W2MSQaooUlXVmVxGB7NgU06keCyKgQ+NlbdaDHCERAE=",
  "TOKEN_SECRET": "v8N6/H/BvzD6DkQv0P9x5Y5J6R7T8U9V0W1X2Y3Z4A5=",
  "JWT_SIGNING_SECRET": "EdlV//G0juhLagjNDs1qNxvHLj+kzvG7GkNVW1Do1Yo=",
  "EVIDENCE_ARCHIVE_ENCRYPTION_KEY_BASE64": "",
  "TOKENIZED_DATA_HASH_MASTER_SECRET": "KCwIL8zs5PffXcuwSnm0i/Oici4W9BqTxRYHaJhIlYw=",
  "GEMINI_API_KEYS": "AQ.Ab8RN6Jj4b21usaPbCUZTQElKl3vQ3vpvFUoN_X-P1J9N5HuCg",
  "CANNONICALS3_BUCKET": "zord-intent-engine-canonical",
  "NIRS3_BUCKET": "zord-intent-engine-nir",
  "GOVERNANCES3_BUCKET": "zord-intent-engine-governance",
  "EDGE_S3_BUCKET": "zord-edge-ingress",
  "OUTCOME_S3_BUCKET": "zord-outcome-engine-settlement-ingress",
  "EVIDENCE_S3_BUCKET": "zord-evidence-vault",
  "RELAY_SERVICES_0_AUTH_TOKEN": "dev-dummy-token-123",
  "RELAY_SERVICES_1_AUTH_TOKEN": "dev-dummy-token-123",
  "RELAY_SERVICES_2_AUTH_TOKEN": "dev-dummy-token-123",
  "RELAY_DB_URL": "postgres://relay_user:relay_password@zord-postgres:5432/zord_relay_db?sslmode=disable",
  "INTELLIGENCE_DATABASE_URL": "postgres://zpi:zpi_secret@zord-postgres:5432/zord_intelligence?sslmode=disable",
  "EDGE_READ_DSN": "postgres://zord_user:zord_password@zord-postgres:5432/zord_edge_db?sslmode=disable",
  "INTENT_READ_DSN": "postgres://intent_user:intent_password@zord-postgres:5432/zord_intent_engine_db?sslmode=disable",
  "RELAY_READ_DSN": "postgres://relay_user:relay_password@zord-postgres:5432/zord_relay_db?sslmode=disable",
  "INTELLIGENCE_READ_DSN": "postgres://zpi:zpi_secret@zord-postgres:5432/zord_intelligence?sslmode=disable",
  "EVIDENCE_READ_DSN": "postgres://evidence_user:evidence_password@zord-postgres:5432/zord_evidence_db?sslmode=disable",
  "OUTCOME_READ_DSN": "postgres://outcome_user:outcome_password@zord-postgres:5432/zord_outcome_db?sslmode=disable",
  "ENCLAVE_INTERNAL_TOKEN": "TcDKki6Tm0OAeYwk+sIjhLvEEhkELaU9q93HyfA+bJE=",
  "INTENT_ENGINE_INTERNAL_SERVICE_TOKEN": "sKC8qWspAWoZIGItC6sObQk9fL27JlWTSIM8Ytw1Oho=",
  "SLACK_LEADS_WEBHOOK_URL": "https://hooks.slack.com/services/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",
  "SLACK_SUPPORT_WEBHOOK_URL": "https://hooks.slack.com/services/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"
}
```

### Key-by-Key Explanation

| # | Key | Value | Used By |
|---|-----|-------|---------|
| 1 | `POSTGRES_SUPERUSER_PASSWORD` | `arealis_password` | zord-postgres bootstrap |
| 2 | `EDGE_DB_PASSWORD` | `zord_password` | zord-edge, postgres-bootstrap |
| 3 | `INTENT_DB_PASSWORD` | `intent_password` | zord-intent-engine, postgres-bootstrap |
| 4 | `RELAY_DB_PASSWORD` | `relay_password` | zord-relay, postgres-bootstrap |
| 5 | `TOKEN_DB_PASSWORD` | `token_password` | zord-token-enclave, postgres-bootstrap |
| 6 | `OUTCOME_DB_PASSWORD` | `outcome_password` | zord-outcome-engine, postgres-bootstrap |
| 7 | `EVIDENCE_DB_PASSWORD` | `evidence_password` | zord-evidence, postgres-bootstrap |
| 8 | `INTELLIGENCE_DB_PASSWORD` | `zpi_secret` | zord-intelligence, postgres-bootstrap |
| 9 | `ZORD_VAULT_KEY` | `00Ofxp50eVCizf58ZoX4Zy2T83O38sMSrc3s9Cpb/ac=` | zord-edge, zord-intent-engine, zord-outcome-engine |
| 10 | `INTERNAL_ADMIN_KEY` | `zord123` | zord-edge |
| 11 | `MASTER_KEY` | `W2MSQaooUlXVmVxGB7NgU06keCyKgQ+NlbdaDHCERAE=` | zord-token-enclave |
| 12 | `TOKEN_SECRET` | `v8N6/H/BvzD6DkQv0P9x5Y5J6R7T8U9V0W1X2Y3Z4A5=` | zord-token-enclave |
| 13 | `JWT_SIGNING_SECRET` | `your-jwt-signing-secret-here` | zord-edge (signs JWTs), Kong API Gateway (validates JWTs) |
| 14 | `EVIDENCE_ARCHIVE_ENCRYPTION_KEY_BASE64` | `` (empty) | zord-evidence (auto-generates) |
| 15 | `TOKENIZED_DATA_HASH_MASTER_SECRET` | `KCwIL8zs5PffXcuwSnm0i/Oici4W9BqTxRYHaJhIlYw=` | zord-token-enclave, zord-intent-engine (hash verification) |
| 16 | `GEMINI_API_KEYS` | `AQ.Ab8RN6Jj4b21usaPbCUZTQElKl3vQ3vpvFUoN_X-P1J9N5HuCg` | zord-prompt-layer |
| 17 | `CANNONICALS3_BUCKET` | `zord-intent-engine-canonical` | zord-intent-engine (canonical storage) |
| 18 | `NIRS3_BUCKET` | `zord-intent-engine-nir` | zord-intent-engine (NIR storage) |
| 19 | `GOVERNANCES3_BUCKET` | `zord-intent-engine-governance` | zord-intelligence (governance storage) |
| 20 | `EDGE_S3_BUCKET` | `zord-edge-ingress` | zord-edge |
| 21 | `INTENT_S3_BUCKET` | `zord-edge-ingress` | zord-intent-engine |
| 22 | `OUTCOME_S3_BUCKET` | `zord-outcome-engine-settlement-ingress` | zord-outcome-engine |
| 23 | `EVIDENCE_S3_BUCKET` | `zord-evidence-vault` | zord-evidence |
| 24 | `RELAY_SERVICES_0_AUTH_TOKEN` | `dev-dummy-token-123` | zord-relay, zord-intent-engine |
| 25 | `RELAY_SERVICES_1_AUTH_TOKEN` | `dev-dummy-token-123` | zord-relay, zord-edge |
| 26 | `RELAY_SERVICES_2_AUTH_TOKEN` | `dev-dummy-token-123` | zord-relay, zord-outcome-engine |
| 27 | `RELAY_DB_URL` | `postgres://relay_user:relay_password@zord-postgres:5432/zord_relay_db?sslmode=disable` | zord-relay |
| 28 | `INTELLIGENCE_DATABASE_URL` | `postgres://zpi:zpi_secret@zord-postgres:5432/zord_intelligence?sslmode=disable` | zord-intelligence |
| 29 | `EDGE_READ_DSN` | `postgres://zord_user:zord_password@zord-postgres:5432/zord_edge_db?sslmode=disable` | zord-prompt-layer |
| 30 | `INTENT_READ_DSN` | `postgres://intent_user:intent_password@zord-postgres:5432/zord_intent_engine_db?sslmode=disable` | zord-prompt-layer |
| 31 | `RELAY_READ_DSN` | `postgres://relay_user:relay_password@zord-postgres:5432/zord_relay_db?sslmode=disable` | zord-prompt-layer |
| 32 | `INTELLIGENCE_READ_DSN` | `postgres://zpi:zpi_secret@zord-postgres:5432/zord_intelligence?sslmode=disable` | zord-prompt-layer |
| 33 | `EVIDENCE_READ_DSN` | `postgres://evidence_user:evidence_password@zord-postgres:5432/zord_evidence_db?sslmode=disable` | zord-prompt-layer |
| 34 | `OUTCOME_READ_DSN` | `postgres://outcome_user:outcome_password@zord-postgres:5432/zord_outcome_db?sslmode=disable` | zord-prompt-layer |
| 35 | `ENCLAVE_INTERNAL_TOKEN` | `TcDKki6Tm0OAeYwk+sIjhLvEEhkELaU9q93HyfA+bJE=` | zord-token-enclave (auth gate), zord-intent-engine (sends as header) |
| 36 | `INTENT_ENGINE_INTERNAL_SERVICE_TOKEN` | `sKC8qWspAWoZIGItC6sObQk9fL27JlWTSIM8Ytw1Oho=` | zord-intent-engine (auth gate for /internal/* routes), zord-console (sends as header) |
| 37 | `SLACK_LEADS_WEBHOOK_URL` | `https://hooks.slack.com/services/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` | zord-console (lead capture to Slack) |
| 37 | `SLACK_SUPPORT_WEBHOOK_URL` | `https://hooks.slack.com/services/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` | zord-console (support tickets to Slack) |

**Total: 37 keys**

---

## Secret 2: `production/zord/edge-signing-key`

This is a single JSON object. Paste this as `ZORD_EDGE_SIGNING_KEY_JSON` in GitHub Actions secrets.

```json
{
  "ed25519_private.pem": "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIJz8ZGsamdmojBOHIXTHD68xxjytpoBdUhzvCCKm9VeH\n-----END PRIVATE KEY-----"
}
```

| # | Key | Value | Used By |
|---|-----|-------|---------|
| 1 | `ed25519_private.pem` | Full PEM private key (see above) | zord-edge (mounted as file at `/run/secrets/ed25519_private.pem`) |

**Total: 1 key**

---

## Secret 3: `production/zord/evidence-signing-key`

This is a single JSON object. Paste this as `ZORD_EVIDENCE_SIGNING_KEY_JSON` in GitHub Actions secrets.

```json
{
  "signing_key.pem": "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIJz8ZGsamdmojBOHIXTHD68xxjytpoBdUhzvCCKm9VeH\n-----END PRIVATE KEY-----"
}
```

| # | Key | Value | Used By |
|---|-----|-------|---------|
| 1 | `signing_key.pem` | Full PEM ed25519 private key | zord-evidence (mounted as file at `/run/secrets/signing_key.pem`) |

**Total: 1 key**

**Important:**
- Use `\n` for newlines in the JSON string (same format as Secret 2)
- Never regenerate this key after deployment — old evidence packs won't be verifiable with a new key
- Back up this key securely

---

## GitHub Actions Secrets Summary

You need these 3 GitHub Actions secrets for your Terraform workflow:

| GitHub Actions Secret Name | Content |
|---------------------------|---------|
| `ZORD_APP_SECRETS_JSON` | The full JSON from Secret 1 above |
| `ZORD_EDGE_SIGNING_KEY_JSON` | The full JSON from Secret 2 above |
| `ZORD_EVIDENCE_SIGNING_KEY_JSON` | The full JSON from Secret 3 above |

**Note:** Secret 3 (`production/zord/evidence-signing-key`) is also managed via Terraform + GitHub Actions — same flow as Secret 2.

---

## How It Works

1. You paste the JSON into GitHub Actions secrets
2. Terraform reads `ZORD_APP_SECRETS_JSON`, `ZORD_EDGE_SIGNING_KEY_JSON`, and `ZORD_EVIDENCE_SIGNING_KEY_JSON`
3. Terraform creates `production/zord/app-secrets`, `production/zord/edge-signing-key`, and `production/zord/evidence-signing-key` in AWS Secrets Manager
4. External Secrets Operator in EKS reads from AWS Secrets Manager
5. Kubernetes creates `zord-app-secrets`, `zord-edge-signing-key`, and `zord-evidence-signing-key` secrets in the `zord` namespace
6. Pods mount signing keys as files and read env vars from secrets

---

## Notes

- **NEW (July 2026):** Added `CANONICAL_S3_BUCKET`, `NIR_S3_BUCKET`, `GOVERNANCE_S3_BUCKET` — new S3 buckets for canonical, NIR, and governance data storage
- **NEW (July 2026):** Added `TOKENIZED_DATA_HASH_MASTER_SECRET` — used by zord-token-enclave and zord-intent-engine for tokenized data hash verification
- **UPDATED (July 2026):** `EVIDENCE_ARCHIVE_ENCRYPTION_KEY_BASE64` left empty — service auto-generates
- **REMOVED (July 2026):** `EVIDENCE_SIGNING_PRIVATE_KEY_BASE64` — removed from app-secrets (signing now handled exclusively via mounted PEM file from Secret 3)
- **NEW (June 2026):** Added `SLACK_LEADS_WEBHOOK_URL` — required by zord-console for lead capture notifications to Slack
- **NEW (June 2026):** `ZORD_BULK_INGEST_API_KEY` and `ZORD_SETTLEMENT_API_KEY` are NOT needed — users authenticate via session JWT access_token instead
- **NEW (June 2026):** Added `JWT_SIGNING_SECRET` — used by both zord-edge (to sign JWTs) and Kong API Gateway (to validate JWTs at the gateway level). Must be the same value in both.
- **UPDATED (June 2026):** `GEMINI_API_KEYS` updated to new key. `GEMINI_MODEL` changed from `gemini-2.5-flash` to `gemini-3.1-flash-lite`.
- **NEW (June 2025):** Added `OUTCOME_READ_DSN` — required by `zord-prompt-layer` to read outcome/settlement data for AI queries
- `EVIDENCE_ARCHIVE_ENCRYPTION_KEY_BASE64` in Secret 1 should remain empty — evidence service auto-generates the key
- All database hostnames use `zord-postgres` (Kubernetes internal DNS)
- All Kafka brokers use `zord-kafka:9092` (Kubernetes internal DNS)
- The relay auth tokens (`dev-dummy-token-123`) are shared between relay and the services it polls
- S3 bucket names: `zord-edge-ingress` (edge, intent), `zord-intent-engine-canonical` (canonical), `zord-intent-engine-nir` (NIR), `zord-intent-engine-governance` (governance), `zord-outcome-engine-settlement-ingress` (outcome), `zord-evidence-vault` (evidence)
- The ed25519 private keys in Secret 2 and Secret 3 must have `\n` for newlines in the JSON string
- Never regenerate the evidence signing key — old evidence packs won't be verifiable with a new key


---

## PLAT-06: Kafka SASL/SCRAM Credentials (Future — DO NOT ADD YET)

> ⚠️ **These are for PLAT-06 Kafka security upgrade. Only add when deploying the secured Kafka StatefulSet.**

Add these keys to `production/zord/app-secrets` when ready to deploy PLAT-06:

```json
{
  "KAFKA_ADMIN_PASSWORD": "Kfk@dm1n#Z0rd$2026!xQ9",
  "KAFKA_BROKER_JAAS_CONFIG": "org.apache.kafka.common.security.scram.ScramLoginModule required username=\"admin\" password=\"Kfk@dm1n#Z0rd$2026!xQ9\";",
  "RELAY_KAFKA_SASL_USERNAME": "relay-service",
  "RELAY_KAFKA_SASL_PASSWORD": "R3l@yKfk$Pr0d!mN7vW2",
  "KAFKA_EDGE_USERNAME": "edge-service",
  "KAFKA_EDGE_PASSWORD": "3dg3Kfk$Pr0d!bT4xL8",
  "KAFKA_INTENT_USERNAME": "intent-service",
  "KAFKA_INTENT_PASSWORD": "1nt3ntKfk$Pr0d!qR5yH",
  "KAFKA_OUTCOME_USERNAME": "outcome-service",
  "KAFKA_OUTCOME_PASSWORD": "0utc0m3Kfk$Pr0d!wK6z",
  "KAFKA_EVIDENCE_USERNAME": "evidence-service",
  "KAFKA_EVIDENCE_PASSWORD": "3v1d3nc3Kfk$Pr0d!pJ8",
  "KAFKA_INTELLIGENCE_USERNAME": "intelligence-service",
  "KAFKA_INTELLIGENCE_PASSWORD": "1nt3lKfk$Pr0d!sV9nF",
  "KAFKA_ML_USERNAME": "ml-service",
  "KAFKA_ML_PASSWORD": "MlS3rv1c3Kfk$Pr0d!cD4"
}
```

### Key-by-Key Explanation (PLAT-06)

| # | Key | Value | Used By |
|---|-----|-------|---------|
| 38 | `KAFKA_ADMIN_PASSWORD` | `Kfk@dm1n#Z0rd$2026!xQ9` | Kafka broker inter-broker auth (super user) |
| 39 | `KAFKA_BROKER_JAAS_CONFIG` | JAAS config string (see above) | Kafka StatefulSet (broker SASL) |
| 40 | `RELAY_KAFKA_SASL_USERNAME` | `relay-service` | zord-relay (Kafka producer/consumer) |
| 41 | `RELAY_KAFKA_SASL_PASSWORD` | `R3l@yKfk$Pr0d!mN7vW2` | zord-relay (Kafka auth) |
| 42 | `KAFKA_EDGE_USERNAME` | `edge-service` | zord-edge (Kafka producer) |
| 43 | `KAFKA_EDGE_PASSWORD` | `3dg3Kfk$Pr0d!bT4xL8` | zord-edge (Kafka auth) |
| 44 | `KAFKA_INTENT_USERNAME` | `intent-service` | zord-intent-engine (Kafka consumer/producer) |
| 45 | `KAFKA_INTENT_PASSWORD` | `1nt3ntKfk$Pr0d!qR5yH` | zord-intent-engine (Kafka auth) |
| 46 | `KAFKA_OUTCOME_USERNAME` | `outcome-service` | zord-outcome-engine (Kafka consumer/producer) |
| 47 | `KAFKA_OUTCOME_PASSWORD` | `0utc0m3Kfk$Pr0d!wK6z` | zord-outcome-engine (Kafka auth) |
| 48 | `KAFKA_EVIDENCE_USERNAME` | `evidence-service` | zord-evidence (Kafka consumer/producer) |
| 49 | `KAFKA_EVIDENCE_PASSWORD` | `3v1d3nc3Kfk$Pr0d!pJ8` | zord-evidence (Kafka auth) |
| 50 | `KAFKA_INTELLIGENCE_USERNAME` | `intelligence-service` | zord-intelligence (Kafka consumer) |
| 51 | `KAFKA_INTELLIGENCE_PASSWORD` | `1nt3lKfk$Pr0d!sV9nF` | zord-intelligence (Kafka auth) |
| 52 | `KAFKA_ML_USERNAME` | `ml-service` | ml-service (Kafka consumer/producer) |
| 53 | `KAFKA_ML_PASSWORD` | `MlS3rv1c3Kfk$Pr0d!cD4` | ml-service (Kafka auth) |

### SMTP Credentials (Added August 2026)

| # | Key | Value | Used By |
|---|-----|-------|---------|
| 54 | `SMTP_HOST` | `smtp.gmail.com` | zord-console (demo request emails) |
| 55 | `SMTP_PORT` | `587` | zord-console |
| 56 | `SMTP_USER` | `careers@arealis.io` | zord-console |
| 57 | `SMTP_PASS` | `iomh pkkl zsnd spes` | zord-console |
| 58 | `SMTP_FROM` | `Arealis Zord <careers@arealis.io>` | zord-console |

### Deployment Order for PLAT-06

```
1. Add Kafka credentials to AWS Secrets Manager
2. Sync ExternalSecret to K8s
3. Apply new Kafka StatefulSet (SASL enabled)
4. Run SCRAM users job (creates per-service users)
5. Run topics job (creates topics with retention)
6. Run ACLs job (per-service permissions)
7. Update relay-config.yaml with SASL settings
8. Restart all services (they read SASL creds from env)
```

### Rollback

If Kafka SASL breaks services:
```bash
# Revert StatefulSet to PLAINTEXT
kubectl edit statefulset zord-kafka -n zord
# Change SASL_PLAINTEXT back to PLAINTEXT in listeners
# Remove SASL env vars
# Remove authorizer config
```

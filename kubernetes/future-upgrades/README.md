# Future Upgrades — AWS RDS & AWS MSK Migration Guide

This guide explains how to migrate from in-cluster Postgres and Kafka to managed AWS services (RDS and MSK).

---

## Why Upgrade?

| Current (In-Cluster) | Future (AWS Managed) | Benefit |
|---------------------|---------------------|---------|
| Single Postgres pod (1 replica) | AWS RDS Multi-AZ | Auto-failover, backups, no data loss |
| Single Kafka pod (1 replica) | AWS MSK (3+ brokers) | High availability, auto-scaling, no message loss |
| You manage upgrades/patches | AWS manages everything | Less ops work |
| Pod dies = downtime | Instance dies = auto-recovery | Zero downtime |

---

## Part 1: Migrate to AWS RDS (PostgreSQL)

### Step 1: Create RDS Instance

Go to AWS Console → RDS → Create Database:

| Setting | Value |
|---------|-------|
| Engine | PostgreSQL 16 |
| Template | Production |
| Deployment | Multi-AZ |
| Instance class | db.t3.medium (start small, scale later) |
| Storage | 100 GB gp3, auto-scaling enabled |
| VPC | Same VPC as your EKS cluster |
| Subnet group | Private subnets (same as EKS nodes) |
| Security group | Allow port 5432 from EKS node security group |
| Master username | postgres |
| Master password | (use a strong password) |
| Database name | postgres |
| Backup retention | 7 days |
| Encryption | Enabled (KMS) |

### Step 2: Get the RDS Endpoint

After creation, go to RDS → Databases → your instance → Connectivity & security:

```
Endpoint: zord-db.xxxxxxxxxxxx.ap-south-1.rds.amazonaws.com
Port: 5432
```

### Step 3: Run the Bootstrap Script on RDS

Connect to RDS and create all 7 databases + users:

```bash
# From your local machine or a bastion host
psql -h zord-db.xxxxxxxxxxxx.ap-south-1.rds.amazonaws.com -U postgres -d postgres
```

Then run this SQL (same as your bootstrap ConfigMap but adapted):

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create roles
CREATE ROLE zord_user LOGIN PASSWORD '<EDGE_DB_PASSWORD>';
CREATE ROLE intent_user LOGIN PASSWORD '<INTENT_DB_PASSWORD>';
CREATE ROLE relay_user LOGIN PASSWORD '<RELAY_DB_PASSWORD>';
CREATE ROLE token_user LOGIN PASSWORD '<TOKEN_DB_PASSWORD>';
CREATE ROLE outcome_user LOGIN PASSWORD '<OUTCOME_DB_PASSWORD>';
CREATE ROLE evidence_user LOGIN PASSWORD '<EVIDENCE_DB_PASSWORD>';
CREATE ROLE zpi LOGIN PASSWORD '<INTELLIGENCE_DB_PASSWORD>';

-- Create databases
CREATE DATABASE zord_edge_db OWNER zord_user;
CREATE DATABASE zord_intent_engine_db OWNER intent_user;
CREATE DATABASE zord_relay_db OWNER relay_user;
CREATE DATABASE zord_token_enclave_db OWNER token_user;
CREATE DATABASE zord_outcome_db OWNER outcome_user;
CREATE DATABASE zord_evidence_db OWNER evidence_user;
CREATE DATABASE zord_intelligence OWNER zpi;

-- Enable extensions on each database
\c zord_edge_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c zord_intent_engine_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c zord_relay_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c zord_token_enclave_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c zord_outcome_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c zord_evidence_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c zord_intelligence
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### Step 4: Update AWS Secrets Manager

Update `production/zord/app-secrets` in AWS Secrets Manager with the new RDS endpoint:

| Key | Old Value | New Value |
|-----|-----------|-----------|
| `RELAY_DB_URL` | `postgres://relay_user:relay_password@zord-postgres:5432/zord_relay_db?sslmode=disable` | `postgres://relay_user:<password>@zord-db.xxxxxxxxxxxx.ap-south-1.rds.amazonaws.com:5432/zord_relay_db?sslmode=require` |
| `INTELLIGENCE_DATABASE_URL` | `postgres://zpi:zpi_secret@zord-postgres:5432/zord_intelligence?sslmode=disable` | `postgres://zpi:<password>@zord-db.xxxxxxxxxxxx.ap-south-1.rds.amazonaws.com:5432/zord_intelligence?sslmode=require` |
| `EDGE_READ_DSN` | `postgres://zord_user:zord_password@zord-postgres:5432/zord_edge_db?sslmode=disable` | `postgres://zord_user:<password>@zord-db.xxxxxxxxxxxx.ap-south-1.rds.amazonaws.com:5432/zord_edge_db?sslmode=require` |
| `INTENT_READ_DSN` | `postgres://intent_user:intent_password@zord-postgres:5432/zord_intent_engine_db?sslmode=disable` | `postgres://intent_user:<password>@zord-db.xxxxxxxxxxxx.ap-south-1.rds.amazonaws.com:5432/zord_intent_engine_db?sslmode=require` |
| `RELAY_READ_DSN` | `postgres://relay_user:relay_password@zord-postgres:5432/zord_relay_db?sslmode=disable` | `postgres://relay_user:<password>@zord-db.xxxxxxxxxxxx.ap-south-1.rds.amazonaws.com:5432/zord_relay_db?sslmode=require` |
| `INTELLIGENCE_READ_DSN` | `postgres://zpi:zpi_secret@zord-postgres:5432/zord_intelligence?sslmode=disable` | `postgres://zpi:<password>@zord-db.xxxxxxxxxxxx.ap-south-1.rds.amazonaws.com:5432/zord_intelligence?sslmode=require` |
| `EVIDENCE_READ_DSN` | `postgres://evidence_user:evidence_password@zord-postgres:5432/zord_evidence_db?sslmode=disable` | `postgres://evidence_user:<password>@zord-db.xxxxxxxxxxxx.ap-south-1.rds.amazonaws.com:5432/zord_evidence_db?sslmode=require` |

**Important:** Change `sslmode=disable` to `sslmode=require` for RDS (encrypted connections).

### Step 5: Update the ConfigMap

**File to change:** `kubernetes/eks/shared/aws-config.yaml`

```yaml
# BEFORE (in-cluster Postgres)
data:
  DB_HOST: zord-postgres
  DB_PORT: "5432"
  DB_SSLMODE: disable

# AFTER (AWS RDS)
data:
  DB_HOST: zord-db.xxxxxxxxxxxx.ap-south-1.rds.amazonaws.com
  DB_PORT: "5432"
  DB_SSLMODE: require
```

### Step 6: Remove In-Cluster Postgres from Kustomization

**File to change:** `kubernetes/eks/kustomization.yaml`

Comment out or remove these lines:

```yaml
# Remove these:
  # - shared/postgres-bootstrap-config.yaml    ← no longer needed
  # - infrastructure/postgres/service.yaml     ← no longer needed
  # - infrastructure/postgres/statefulset.yaml ← no longer needed
```

### Step 7: Deploy

```bash
# Apply the updated config
kubectl apply -k kubernetes/eks

# Restart all services to pick up new DB_HOST
kubectl rollout restart deployment -n zord

# Delete the old Postgres pod (optional — saves resources)
kubectl delete statefulset zord-postgres -n zord
kubectl delete pvc data-zord-postgres-0 -n zord
```

### Step 8: Verify

```bash
# Check all services are running
kubectl get pods -n zord

# Check a service can connect to RDS
kubectl logs -n zord deploy/zord-edge --tail=10
# Should NOT show "connection refused" errors
```

---

## Part 2: Migrate to AWS MSK (Kafka)

### Step 1: Create MSK Cluster

Go to AWS Console → Amazon MSK → Create Cluster:

| Setting | Value |
|---------|-------|
| Cluster type | Provisioned |
| Kafka version | 3.6.x |
| Number of brokers | 3 (one per AZ) |
| Broker instance type | kafka.m5.large |
| Storage per broker | 100 GB (auto-scaling enabled) |
| VPC | Same VPC as your EKS cluster |
| Subnets | Private subnets (same as EKS nodes) |
| Security group | Allow port 9092 from EKS node security group |
| Encryption in transit | TLS (recommended) or PLAINTEXT |
| Encryption at rest | Enabled (KMS) |
| Authentication | IAM (recommended) or SASL/SCRAM |
| Auto-create topics | Enabled |

### Step 2: Get the MSK Bootstrap Brokers

After creation, go to MSK → Clusters → your cluster → View client information:

```
Bootstrap brokers (PLAINTEXT):
  b-1.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9092,
  b-2.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9092,
  b-3.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9092

Bootstrap brokers (TLS):
  b-1.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9094,
  b-2.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9094,
  b-3.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9094
```

### Step 3: Create Topics on MSK

```bash
# Install kafka CLI or use a bastion host
kafka-topics --bootstrap-server b-1.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9092 \
  --create --topic payments.ledger.events.v1 --partitions 6 --replication-factor 3

kafka-topics --bootstrap-server b-1.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9092 \
  --create --topic payments.intent.events.v1 --partitions 6 --replication-factor 3

kafka-topics --bootstrap-server b-1.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9092 \
  --create --topic payments.dispatch.events.v1 --partitions 6 --replication-factor 3

kafka-topics --bootstrap-server b-1.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9092 \
  --create --topic payments.outcome.events.v1 --partitions 6 --replication-factor 3

kafka-topics --bootstrap-server b-1.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9092 \
  --create --topic relay.dlq.publish_failure --partitions 3 --replication-factor 3

kafka-topics --bootstrap-server b-1.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9092 \
  --create --topic relay.dlq.poison --partitions 3 --replication-factor 3

# Create all other topics from the topic-job.yaml list with --partitions 6 --replication-factor 3
```

**Note:** With MSK (3 brokers), use `--replication-factor 3` and `--partitions 6` for better throughput and durability.

### Step 4: Update the ConfigMap

**File to change:** `kubernetes/eks/shared/aws-config.yaml`

```yaml
# BEFORE (in-cluster Kafka)
data:
  KAFKA_BROKERS: zord-kafka:9092

# AFTER (AWS MSK — PLAINTEXT)
data:
  KAFKA_BROKERS: b-1.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9092,b-2.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9092,b-3.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9092
```

### Step 5: Update Relay Config

**File to change:** `kubernetes/eks/shared/relay-config.yaml`

```yaml
# BEFORE
kafka:
  brokers: "zord-kafka:9092"
  sasl_mechanism: SCRAM-SHA-512
  sasl_username: ""
  sasl_password: ""
  tls_enabled: false

# AFTER (MSK with PLAINTEXT — simplest)
kafka:
  brokers: "b-1.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9092,b-2.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9092,b-3.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9092"
  sasl_mechanism: ""
  sasl_username: ""
  sasl_password: ""
  tls_enabled: false

# AFTER (MSK with TLS — recommended for production)
kafka:
  brokers: "b-1.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9094,b-2.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9094,b-3.zord-msk.xxxx.kafka.ap-south-1.amazonaws.com:9094"
  sasl_mechanism: ""
  sasl_username: ""
  sasl_password: ""
  tls_enabled: true
```

### Step 6: Remove In-Cluster Kafka from Kustomization

**File to change:** `kubernetes/eks/kustomization.yaml`

Comment out or remove these lines:

```yaml
# Remove these:
  # - infrastructure/kafka/headless-service.yaml  ← no longer needed
  # - infrastructure/kafka/service.yaml           ← no longer needed
  # - infrastructure/kafka/statefulset.yaml       ← no longer needed
  # - infrastructure/kafka/topic-job.yaml         ← no longer needed (topics created manually on MSK)
```

### Step 7: Deploy

```bash
# Apply the updated config
kubectl apply -k kubernetes/eks

# Restart all Kafka-consuming services
kubectl rollout restart deployment \
  zord-relay \
  zord-intent-engine \
  zord-intelligence \
  zord-outcome-engine \
  -n zord

# Delete the old Kafka pod (optional — saves resources)
kubectl delete statefulset zord-kafka -n zord
kubectl delete pvc data-zord-kafka-0 -n zord
kubectl delete job zord-kafka-topics -n zord
```

### Step 8: Verify

```bash
# Check all services are running
kubectl get pods -n zord

# Check relay can connect to MSK
kubectl logs -n zord deploy/zord-relay --tail=20
# Should show "connected to kafka" or similar

# Check intent-engine consuming
kubectl logs -n zord deploy/zord-intent-engine --tail=20
```

---

## Summary: Files to Change

### For RDS Migration (3 files)

| File | What to Change |
|------|---------------|
| `kubernetes/eks/shared/aws-config.yaml` | Change `DB_HOST` to RDS endpoint, `DB_SSLMODE` to `require` |
| AWS Secrets Manager (`production/zord/app-secrets`) | Update all `*_DB_URL` and `*_READ_DSN` values with RDS endpoint |
| `kubernetes/eks/kustomization.yaml` | Remove postgres resources (3 lines) |

### For MSK Migration (3 files)

| File | What to Change |
|------|---------------|
| `kubernetes/eks/shared/aws-config.yaml` | Change `KAFKA_BROKERS` to MSK bootstrap brokers |
| `kubernetes/eks/shared/relay-config.yaml` | Change `kafka.brokers` to MSK bootstrap brokers, set `tls_enabled` |
| `kubernetes/eks/kustomization.yaml` | Remove kafka resources (4 lines) |

### For Both Migrations Together (4 files total)

| File | Changes |
|------|---------|
| `kubernetes/eks/shared/aws-config.yaml` | `DB_HOST`, `DB_SSLMODE`, `KAFKA_BROKERS` |
| `kubernetes/eks/shared/relay-config.yaml` | `kafka.brokers`, `tls_enabled` |
| `kubernetes/eks/kustomization.yaml` | Remove 7 lines (postgres + kafka resources) |
| AWS Secrets Manager | Update all connection strings |

---

## Security Group Rules Needed

### For RDS

| Rule | Source | Port | Protocol |
|------|--------|------|----------|
| Inbound | EKS node security group | 5432 | TCP |

### For MSK

| Rule | Source | Port | Protocol |
|------|--------|------|----------|
| Inbound | EKS node security group | 9092 (PLAINTEXT) | TCP |
| Inbound | EKS node security group | 9094 (TLS) | TCP |

---

## Cost Estimate

| Service | Instance | Monthly Cost (ap-south-1) |
|---------|----------|--------------------------|
| RDS PostgreSQL (db.t3.medium, Multi-AZ, 100GB) | 1 instance | ~$80-120/month |
| MSK (kafka.m5.large, 3 brokers, 100GB each) | 3 brokers | ~$300-400/month |

Compare with current: EKS nodes running Postgres + Kafka pods consume node resources that could be used by your app services instead.

---

## Rollback Plan

If something goes wrong after migration:

### Rollback RDS → In-Cluster Postgres

1. Uncomment postgres resources in `kustomization.yaml`
2. Revert `aws-config.yaml` to `DB_HOST: zord-postgres`, `DB_SSLMODE: disable`
3. Revert secrets in AWS Secrets Manager
4. `kubectl apply -k kubernetes/eks`
5. Wait for Postgres to start, then restart services

### Rollback MSK → In-Cluster Kafka

1. Uncomment kafka resources in `kustomization.yaml`
2. Revert `aws-config.yaml` to `KAFKA_BROKERS: zord-kafka:9092`
3. Revert `relay-config.yaml` brokers
4. `kubectl apply -k kubernetes/eks`
5. Wait for Kafka to start (2 min), then restart services

---

## Checklist

### Before RDS Migration
- [ ] RDS instance created and accessible from EKS VPC
- [ ] Security group allows port 5432 from EKS nodes
- [ ] Bootstrap SQL executed (all 7 databases + users created)
- [ ] Extensions installed (pgcrypto, uuid-ossp) on all databases
- [ ] AWS Secrets Manager updated with new connection strings
- [ ] Tested connection from a pod: `kubectl run test --rm -it --image=postgres:16-alpine -- psql -h <RDS_ENDPOINT> -U postgres`

### Before MSK Migration
- [ ] MSK cluster created and accessible from EKS VPC
- [ ] Security group allows port 9092/9094 from EKS nodes
- [ ] All topics created with replication-factor 3
- [ ] Tested connection from a pod: `kubectl run test --rm -it --image=confluentinc/cp-kafka:7.6.0 -- kafka-topics --bootstrap-server <MSK_BROKERS> --list`

### After Migration
- [ ] All pods in Running state
- [ ] No "connection refused" errors in logs
- [ ] Health checks passing for all services
- [ ] Test bulk ingest works end-to-end
- [ ] Test settlement upload works
- [ ] Monitor for 24 hours before deleting old in-cluster resources

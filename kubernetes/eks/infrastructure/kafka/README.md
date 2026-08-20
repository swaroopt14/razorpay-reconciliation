# Kafka Security — PLAT-06

## What Changed

| Before | After |
|--------|-------|
| PLAINTEXT listeners | SASL_PLAINTEXT (SCRAM-SHA-512) |
| auto.create.topics=true | auto.create.topics=false |
| No ACLs | Per-service ACLs |
| No retention policy | 7d/30d/3d tiered retention |
| Any pod can publish anywhere | Only authorized services can publish to their topics |

## Deployment Order

```bash
# 1. Add Kafka secrets to AWS Secrets Manager (passwords)
# 2. Apply Kafka StatefulSet (restarts broker with SASL)
kubectl apply -f statefulset.yaml

# 3. Wait for Kafka to be ready
kubectl rollout status statefulset/zord-kafka -n zord

# 4. Create SCRAM users
kubectl apply -f scram-users-job.yaml

# 5. Create topics with retention
kubectl apply -f topic-job.yaml

# 6. Apply ACLs
kubectl apply -f acl-job.yaml

# 7. Update all services with SASL credentials (env vars)
# 8. Restart all services
```

## Per-Service Kafka Credentials

| Service | Username | Can Produce | Can Consume |
|---------|----------|-------------|-------------|
| admin | admin | ALL (super user) | ALL |
| relay | relay-service | ALL topics | ALL topics |
| edge | edge-service | payments.ledger.events.v1 | - |
| intent-engine | intent-service | payments.intent.events.v1, DLQ | payments.ledger.events.v1 |
| outcome-engine | outcome-service | payments.outcome.events.v1 | payments.intent.events.v1 |
| evidence | evidence-service | evidence.pack.created | payments.outcome.events.v1 |
| intelligence | intelligence-service | zpi.actuation.* | multiple |
| ml-service | ml-service | ml.result.events | ml.request.events |

## Topic Retention

| Category | Retention | Topics |
|----------|-----------|--------|
| Core events | 7 days | payments.*.v1, evidence.*, canonical.* |
| DLQ | 30 days | *.dlq.*, payments.intent.dlq |
| Operational | 3 days | ml.*, pii.*, sla.*, corridor.* |

## Secrets to Add in AWS Secrets Manager

Add to `production/zord/app-secrets`:
```
KAFKA_ADMIN_PASSWORD=<generate-strong-password>
KAFKA_RELAY_PASSWORD=<generate-strong-password>
KAFKA_EDGE_PASSWORD=<generate-strong-password>
KAFKA_INTENT_PASSWORD=<generate-strong-password>
KAFKA_OUTCOME_PASSWORD=<generate-strong-password>
KAFKA_EVIDENCE_PASSWORD=<generate-strong-password>
KAFKA_INTELLIGENCE_PASSWORD=<generate-strong-password>
KAFKA_ML_PASSWORD=<generate-strong-password>
KAFKA_BROKER_JAAS_CONFIG=org.apache.kafka.common.security.scram.ScramLoginModule required username="admin" password="<ADMIN_PASSWORD>";
```

## Service Config Update (relay example)

In relay-config.yaml:
```yaml
kafka:
  brokers: "zord-kafka:9092"
  sasl_mechanism: SCRAM-SHA-512
  sasl_username: "relay-service"
  sasl_password: ""  # injected via RELAY_KAFKA_SASL_PASSWORD env
  tls_enabled: false
```

## Rollback

If something breaks, revert to PLAINTEXT:
```bash
# Change listeners back to PLAINTEXT
kubectl edit statefulset zord-kafka -n zord
# Remove SASL_ from listeners, disable authorizer
```

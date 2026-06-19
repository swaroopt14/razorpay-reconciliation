# Zord Platform — Production Database & Service Testing Guide

Server-by-server guide. Enter each database, then run SQL queries inside `psql`.

---

## Prerequisites

```bash
aws eks update-kubeconfig --region ap-south-1 --name <your-cluster-name>
kubectl get nodes
kubectl get pods -n zord
```

---
---

# SERVICE 1: zord-edge

**Port:** 8080 | **Database:** `zord_edge_db` | **User:** `zord_user` | **Health:** `/health`

## Enter Database

```bash
kubectl exec -it statefulset/zord-postgres -n zord -- psql -U postgres -d zord_edge_db
```

## Queries (run inside psql)

```sql
-- List all tables
\dt

-- Describe intents table structure
\d intents

-- Count total records
SELECT COUNT(*) FROM intents;

-- Latest 10 records
SELECT * FROM intents ORDER BY created_at DESC LIMIT 10;

-- Status distribution
SELECT status, COUNT(*) FROM intents GROUP BY status;

-- Failed records
SELECT * FROM intents WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10;

-- Records by tenant
SELECT tenant_id, COUNT(*) FROM intents GROUP BY tenant_id ORDER BY COUNT(*) DESC;

-- Today's records
SELECT * FROM intents WHERE created_at >= CURRENT_DATE ORDER BY created_at DESC;

-- Table sizes
SELECT relname AS table_name, pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC;

-- Row counts all tables
SELECT schemaname, relname AS table_name, n_live_tup AS row_count
FROM pg_stat_user_tables ORDER BY n_live_tup DESC;

-- Check indexes
\di

-- Active connections to this DB
SELECT usename, state, query FROM pg_stat_activity WHERE datname = 'zord_edge_db';

-- Exit
\q
```

## Health Check

```bash
kubectl exec -n zord deploy/zord-edge -- wget -qO- http://127.0.0.1:8080/health
```

## Logs

```bash
kubectl logs -f deploy/zord-edge -n zord --tail=100
```

## Test API (production)

```bash
curl -s https://api.zordnet.com/edge/health

curl -X POST https://api.zordnet.com/v1/ingest \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: test-tenant-001" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"source":"test","type":"payment_intent","payload":{"amount":1000,"currency":"INR","beneficiary":"test-beneficiary","reference":"E2E-TEST-001"}}'
```

## Restart

```bash
kubectl rollout restart deploy/zord-edge -n zord
kubectl rollout status deploy/zord-edge -n zord --timeout=60s
```

---
---

# SERVICE 2: zord-intent-engine

**Port:** 8083 | **Database:** `zord_intent_engine_db` | **User:** `intent_user` | **Health:** `/health`

## Enter Database

```bash
kubectl exec -it statefulset/zord-postgres -n zord -- psql -U postgres -d zord_intent_engine_db
```

## Queries (run inside psql)

```sql
-- List all tables
\dt

-- Describe canonical_intents table
\d canonical_intents

-- Count total
SELECT COUNT(*) FROM canonical_intents;

-- Latest processed intents
SELECT * FROM canonical_intents ORDER BY created_at DESC LIMIT 10;

-- Parse success rate
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE parse_status = 'success') AS success,
  ROUND(COUNT(*) FILTER (WHERE parse_status = 'success')::decimal / NULLIF(COUNT(*), 0), 4) AS success_rate
FROM canonical_intents;

-- Status distribution
SELECT status, COUNT(*) FROM canonical_intents GROUP BY status;

-- Parse failures
SELECT * FROM canonical_intents WHERE parse_status = 'failed' ORDER BY created_at DESC LIMIT 10;

-- ETL ingest runs
SELECT * FROM etl_ingest_runs ORDER BY started_at DESC LIMIT 5;

-- By tenant
SELECT tenant_id, COUNT(*) FROM canonical_intents GROUP BY tenant_id ORDER BY COUNT(*) DESC;

-- Today's records
SELECT * FROM canonical_intents WHERE created_at >= CURRENT_DATE ORDER BY created_at DESC;

-- Row counts all tables
SELECT schemaname, relname AS table_name, n_live_tup AS row_count
FROM pg_stat_user_tables ORDER BY n_live_tup DESC;

-- Table sizes
SELECT relname AS table_name, pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC;

-- Indexes
\di

-- Exit
\q
```

## Health Check

```bash
kubectl exec -n zord deploy/zord-intent-engine -- wget -qO- http://127.0.0.1:8083/health
```

## Logs

```bash
kubectl logs -f deploy/zord-intent-engine -n zord --tail=100
```

## Restart

```bash
kubectl rollout restart deploy/zord-intent-engine -n zord
kubectl rollout status deploy/zord-intent-engine -n zord --timeout=60s
```

---
---

# SERVICE 3: zord-relay

**Port:** 8082 | **Database:** `zord_relay_db` | **User:** `relay_user` | **Health:** `/health` | **Readiness:** `/ready`

## Enter Database

```bash
kubectl exec -it statefulset/zord-postgres -n zord -- psql -U postgres -d zord_relay_db
```

## Queries (run inside psql)

```sql
-- List all tables
\dt

-- Describe outbox table
\d outbox

-- Count outbox messages
SELECT COUNT(*) FROM outbox;

-- Outbox status distribution
SELECT status, COUNT(*) FROM outbox GROUP BY status;

-- Latest outbox entries
SELECT * FROM outbox ORDER BY created_at DESC LIMIT 10;

-- Pending messages (not dispatched yet)
SELECT * FROM outbox WHERE status = 'pending' ORDER BY created_at ASC LIMIT 10;

-- Failed dispatches
SELECT * FROM outbox WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10;

-- Outbox by topic
SELECT topic, status, COUNT(*) FROM outbox GROUP BY topic, status ORDER BY topic;

-- Dead letter queue
SELECT * FROM dead_letter_queue ORDER BY created_at DESC LIMIT 10;

-- DLQ count
SELECT COUNT(*) FROM dead_letter_queue;

-- Today's messages
SELECT * FROM outbox WHERE created_at >= CURRENT_DATE ORDER BY created_at DESC;

-- Row counts all tables
SELECT schemaname, relname AS table_name, n_live_tup AS row_count
FROM pg_stat_user_tables ORDER BY n_live_tup DESC;

-- Exit
\q
```

## Health Check

```bash
kubectl exec -n zord deploy/zord-relay -- wget -qO- http://127.0.0.1:8082/health
kubectl exec -n zord deploy/zord-relay -- wget -qO- http://127.0.0.1:8082/ready
```

## Logs

```bash
kubectl logs -f deploy/zord-relay -n zord --tail=100
```

## Restart

```bash
kubectl rollout restart deploy/zord-relay -n zord
kubectl rollout status deploy/zord-relay -n zord --timeout=60s
```

---
---

# SERVICE 4: zord-token-enclave

**Port:** 8087 | **Database:** `zord_token_enclave_db` | **User:** `token_user` | **Health:** `/v1/health`

## Enter Database

```bash
kubectl exec -it statefulset/zord-postgres -n zord -- psql -U postgres -d zord_token_enclave_db
```

## Queries (run inside psql)

```sql
-- List all tables
\dt

-- Describe tokens table
\d tokens

-- Count total tokens
SELECT COUNT(*) FROM tokens;

-- Latest tokenizations
SELECT id, token_type, created_at FROM tokens ORDER BY created_at DESC LIMIT 10;

-- Token type distribution
SELECT token_type, COUNT(*) FROM tokens GROUP BY token_type ORDER BY COUNT(*) DESC;

-- Tokens by tenant
SELECT tenant_id, COUNT(*) FROM tokens GROUP BY tenant_id ORDER BY COUNT(*) DESC;

-- Today's tokens
SELECT * FROM tokens WHERE created_at >= CURRENT_DATE ORDER BY created_at DESC;

-- Row counts all tables
SELECT schemaname, relname AS table_name, n_live_tup AS row_count
FROM pg_stat_user_tables ORDER BY n_live_tup DESC;

-- Table sizes
SELECT relname AS table_name, pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC;

-- Exit
\q
```

## Health Check

```bash
kubectl exec -n zord deploy/zord-token-enclave -- wget -qO- http://127.0.0.1:8087/v1/health
```

## Logs

```bash
kubectl logs -f deploy/zord-token-enclave -n zord --tail=100
```

## Test API (production)

```bash
curl -X POST https://api.zordnet.com/v1/tokenize \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: test-tenant-001" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"tenant_id":"test-tenant-001","fields":{"pan":"4111111111111111","name":"Test User"}}'
```

## Restart

```bash
kubectl rollout restart deploy/zord-token-enclave -n zord
kubectl rollout status deploy/zord-token-enclave -n zord --timeout=60s
```

---
---

# SERVICE 5: zord-outcome-engine

**Port:** 8081 | **Database:** `zord_outcome_db` | **User:** `outcome_user` | **Health:** `/v1/health`

## Enter Database

```bash
kubectl exec -it statefulset/zord-postgres -n zord -- psql -U postgres -d zord_outcome_db
```

## Queries (run inside psql)

```sql
-- List all tables (23 tables)
\dt

-- Describe key tables
\d canonical_settlement_observations
\d attachment_decisions
\d settlement_batches
\d settlement_parsed_rows
\d variance_records
\d finality_certificates
\d fused_outcomes
\d outcome_outbox
\d unresolved_intent_records

-- Count records in key tables
SELECT COUNT(*) FROM canonical_settlement_observations;
SELECT COUNT(*) FROM attachment_decisions;
SELECT COUNT(*) FROM settlement_batches;
SELECT COUNT(*) FROM settlement_parsed_rows;
SELECT COUNT(*) FROM variance_records;
SELECT COUNT(*) FROM finality_certificates;
SELECT COUNT(*) FROM fused_outcomes;
SELECT COUNT(*) FROM unresolved_intent_records;

-- Latest settlement observations
SELECT settlement_observation_id, tenant_id, source_system, observation_kind,
       amount, currency_code, settlement_status, created_at
FROM canonical_settlement_observations ORDER BY created_at DESC LIMIT 10;

-- Latest attachment decisions
SELECT attachment_decision_id, decision_type, decision_reason_code,
       winning_score, confidence_score, created_at
FROM attachment_decisions ORDER BY created_at DESC LIMIT 10;

-- Settlement batches
SELECT * FROM settlement_batches ORDER BY created_at DESC LIMIT 10;

-- Settlement ingest runs
SELECT * FROM settlement_ingest_runs ORDER BY created_at DESC LIMIT 5;

-- Parse errors
SELECT * FROM settlement_parse_errors ORDER BY created_at DESC LIMIT 10;

-- Variance records
SELECT * FROM variance_records ORDER BY created_at DESC LIMIT 10;

-- Finality certificates
SELECT * FROM finality_certificates ORDER BY created_at DESC LIMIT 10;

-- Fused outcomes
SELECT * FROM fused_outcomes ORDER BY created_at DESC LIMIT 10;

-- Unresolved intents
SELECT * FROM unresolved_intent_records ORDER BY created_at DESC LIMIT 10;

-- Outcome outbox status
SELECT status, COUNT(*) FROM outcome_outbox GROUP BY status;

-- Settlement outbox status
SELECT status, COUNT(*) FROM settlement_outbox_events GROUP BY status;

-- Attachment outbox status
SELECT status, COUNT(*) FROM attachment_outbox_events GROUP BY status;

-- Decision type distribution
SELECT decision_type, COUNT(*) FROM attachment_decisions GROUP BY decision_type;

-- Settlement status distribution
SELECT settlement_status, COUNT(*) FROM canonical_settlement_observations GROUP BY settlement_status;

-- By tenant
SELECT tenant_id, COUNT(*) FROM canonical_settlement_observations GROUP BY tenant_id ORDER BY COUNT(*) DESC;

-- By source system
SELECT source_system, COUNT(*) FROM canonical_settlement_observations GROUP BY source_system;

-- Today's observations
SELECT * FROM canonical_settlement_observations WHERE created_at >= CURRENT_DATE ORDER BY created_at DESC;

-- Row counts all tables
SELECT schemaname, relname AS table_name, n_live_tup AS row_count
FROM pg_stat_user_tables ORDER BY n_live_tup DESC;

-- Table sizes
SELECT relname AS table_name, pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC;

-- Exit
\q
```

## Health Check

```bash
kubectl exec -n zord deploy/zord-outcome-engine -- wget -qO- http://127.0.0.1:8081/v1/health
```

## Logs

```bash
kubectl logs -f deploy/zord-outcome-engine -n zord --tail=100
```

## Test API (production)

```bash
curl -X POST https://api.zordnet.com/v1/settlement/upload \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: test-tenant-001" \
  -H "X-API-Key: <your-settlement-api-key>" \
  -d '{"batch_id":"SETTLE-TEST-001","records":[{"reference":"E2E-TEST-001","status":"settled","amount":1000}]}'
```

## Restart

```bash
kubectl rollout restart deploy/zord-outcome-engine -n zord
kubectl rollout status deploy/zord-outcome-engine -n zord --timeout=60s
```

---
---

# SERVICE 6: zord-evidence

**Port:** 8088 | **Database:** `zord_evidence_db` | **User:** `evidence_user` | **Health:** `/healthz`

## Enter Database

```bash
kubectl exec -it statefulset/zord-postgres -n zord -- psql -U postgres -d zord_evidence_db
```

## Queries (run inside psql)

```sql
-- List all tables
\dt

-- Describe evidence_packs table
\d evidence_packs

-- Count evidence packs
SELECT COUNT(*) FROM evidence_packs;

-- Latest evidence packs
SELECT * FROM evidence_packs ORDER BY created_at DESC LIMIT 10;

-- Pack status distribution
SELECT status, COUNT(*) FROM evidence_packs GROUP BY status;

-- Failed packs
SELECT * FROM evidence_packs WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10;

-- By tenant
SELECT tenant_id, COUNT(*) FROM evidence_packs GROUP BY tenant_id ORDER BY COUNT(*) DESC;

-- Today's packs
SELECT * FROM evidence_packs WHERE created_at >= CURRENT_DATE ORDER BY created_at DESC;

-- Row counts all tables
SELECT schemaname, relname AS table_name, n_live_tup AS row_count
FROM pg_stat_user_tables ORDER BY n_live_tup DESC;

-- Table sizes
SELECT relname AS table_name, pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC;

-- Exit
\q
```

## Health Check

```bash
kubectl exec -n zord deploy/zord-evidence -- wget -qO- http://127.0.0.1:8088/healthz
```

## Logs

```bash
kubectl logs -f deploy/zord-evidence -n zord --tail=100
```

## Restart

```bash
kubectl rollout restart deploy/zord-evidence -n zord
kubectl rollout status deploy/zord-evidence -n zord --timeout=60s
```

---
---

# SERVICE 7: zord-intelligence

**Port:** 8089 | **Database:** `zord_intelligence` | **User:** `zpi` | **Health:** `/healthz` | **Readiness:** `/readyz`

## Enter Database

```bash
kubectl exec -it statefulset/zord-postgres -n zord -- psql -U postgres -d zord_intelligence
```

## Queries (run inside psql)

```sql
-- List all tables
\dt

-- Describe key tables
\d policies
\d rca_results
\d batch_summaries
\d governance_decisions

-- Count records
SELECT COUNT(*) FROM policies;
SELECT COUNT(*) FROM rca_results;
SELECT COUNT(*) FROM batch_summaries;
SELECT COUNT(*) FROM governance_decisions;

-- Latest policies
SELECT * FROM policies ORDER BY updated_at DESC LIMIT 10;

-- Latest RCA results
SELECT * FROM rca_results ORDER BY created_at DESC LIMIT 10;

-- Batch summaries
SELECT * FROM batch_summaries ORDER BY created_at DESC LIMIT 5;

-- Governance decisions
SELECT * FROM governance_decisions ORDER BY created_at DESC LIMIT 10;

-- Today's activity
SELECT * FROM rca_results WHERE created_at >= CURRENT_DATE ORDER BY created_at DESC;

-- Row counts all tables
SELECT schemaname, relname AS table_name, n_live_tup AS row_count
FROM pg_stat_user_tables ORDER BY n_live_tup DESC;

-- Table sizes
SELECT relname AS table_name, pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC;

-- Exit
\q
```

## Health Check

```bash
kubectl exec -n zord deploy/zord-intelligence -- wget -qO- http://127.0.0.1:8089/healthz
kubectl exec -n zord deploy/zord-intelligence -- wget -qO- http://127.0.0.1:8089/readyz
```

## Logs

```bash
kubectl logs -f deploy/zord-intelligence -n zord --tail=100
```

## Test API (production)

```bash
curl -s https://api.zordnet.com/intelligence/healthz
```

## Restart

```bash
kubectl rollout restart deploy/zord-intelligence -n zord
kubectl rollout status deploy/zord-intelligence -n zord --timeout=60s
```

---
---

# SERVICE 8: zord-prompt-layer

**Port:** 8086 | **Database:** None (reads from other DBs) | **Redis:** `zord-prompt-layer-redis:6379` | **Health:** `/health`

## No Own Database

This service reads from other databases via read-only DSNs:
- Reads `zord_edge_db`
- Reads `zord_intent_engine_db`
- Reads `zord_relay_db`
- Reads `zord_intelligence`
- Reads `zord_evidence_db`

## Health Check

```bash
kubectl exec -n zord deploy/zord-prompt-layer -- wget -qO- http://127.0.0.1:8086/health
```

## Logs

```bash
kubectl logs -f deploy/zord-prompt-layer -n zord --tail=100
```

## Test API (production)

```bash
curl -X POST https://zordnet.com/api/prompt-layer/v1/query \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: test-tenant-001" \
  -d '{"query":"What is the payment status for reference E2E-TEST-001?"}'

curl -X POST https://zordnet.com/api/prompt-layer/v1/chat \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: test-tenant-001" \
  -d '{"message":"Show me all failed payments today"}'
```

## Restart

```bash
kubectl rollout restart deploy/zord-prompt-layer -n zord
kubectl rollout status deploy/zord-prompt-layer -n zord --timeout=60s
```

---
---

# SERVICE 9: zord-console

**Port:** 3000 | **Database:** None (proxies to all services) | **Health:** `/api/health` | **URL:** `https://zordnet.com`

## No Own Database

Proxies requests to all backend services via K8s internal DNS.

## Health Check

```bash
kubectl exec -n zord deploy/zord-console -- wget -qO- http://127.0.0.1:3000/api/health
```

## Logs

```bash
kubectl logs -f deploy/zord-console -n zord --tail=100
```

## Test (production)

```bash
curl -s -o /dev/null -w "%{http_code}" https://zordnet.com/
curl -s https://zordnet.com/api/health
```

## Restart

```bash
kubectl rollout restart deploy/zord-console -n zord
kubectl rollout status deploy/zord-console -n zord --timeout=60s
```

---
---

# KAFKA

**Host:** `zord-kafka:9092` | **Image:** `confluentinc/cp-kafka:7.6.0` | **Mode:** KRaft (no ZooKeeper)

## Enter Kafka Shell

```bash
kubectl exec -it statefulset/zord-kafka -n zord -- bash
```

## Commands (run inside Kafka shell)

```bash
# List all topics
kafka-topics --bootstrap-server zord-kafka:9092 --list

# Describe all topics
kafka-topics --bootstrap-server zord-kafka:9092 --describe

# Describe specific topic
kafka-topics --bootstrap-server zord-kafka:9092 --describe --topic payments.intent.events.v1

# List consumer groups
kafka-consumer-groups --bootstrap-server zord-kafka:9092 --list

# Check ALL consumer group lag
kafka-consumer-groups --bootstrap-server zord-kafka:9092 --describe --all-groups

# Check specific consumer group
kafka-consumer-groups --bootstrap-server zord-kafka:9092 --describe --group zord-intelligence-group
kafka-consumer-groups --bootstrap-server zord-kafka:9092 --describe --group zord-evidence-group

# Consume first 5 messages from a topic
kafka-console-consumer --bootstrap-server zord-kafka:9092 --topic payments.intent.events.v1 --from-beginning --max-messages 5

# Consume live (real-time tail — Ctrl+C to stop)
kafka-console-consumer --bootstrap-server zord-kafka:9092 --topic payments.intent.events.v1

# Consume canonical intent events
kafka-console-consumer --bootstrap-server zord-kafka:9092 --topic canonical.intent.created --from-beginning --max-messages 5

# Consume dispatch events
kafka-console-consumer --bootstrap-server zord-kafka:9092 --topic payments.dispatch.events.v1 --from-beginning --max-messages 5

# Consume outcome events
kafka-console-consumer --bootstrap-server zord-kafka:9092 --topic payments.outcome.events.v1 --from-beginning --max-messages 5

# Check DLQ (dead letter queue)
kafka-console-consumer --bootstrap-server zord-kafka:9092 --topic dlq.event --from-beginning --max-messages 10
kafka-console-consumer --bootstrap-server zord-kafka:9092 --topic relay.dlq.publish_failure --from-beginning --max-messages 10
kafka-console-consumer --bootstrap-server zord-kafka:9092 --topic relay.dlq.poison --from-beginning --max-messages 10

# Check evidence events
kafka-console-consumer --bootstrap-server zord-kafka:9092 --topic evidence.pack.ready --from-beginning --max-messages 5

# Check intelligence alerts
kafka-console-consumer --bootstrap-server zord-kafka:9092 --topic zpi.actuation.alert --from-beginning --max-messages 5

# Check settlement events
kafka-console-consumer --bootstrap-server zord-kafka:9092 --topic canonical.settlement.created --from-beginning --max-messages 5

# Check under-replicated partitions (health)
kafka-topics --bootstrap-server zord-kafka:9092 --describe --under-replicated-partitions

# Broker health check
kafka-broker-api-versions --bootstrap-server zord-kafka:9092

# Topic offsets (total message count)
kafka-run-class kafka.tools.GetOffsetShell --broker-list zord-kafka:9092 --topic payments.intent.events.v1

# Exit
exit
```

## All 29 Topics

| Topic | Purpose |
|-------|---------|
| `payments.ledger.events.v1` | Ledger events |
| `payments.intent.events.v1` | Intent creation events |
| `payments.dispatch.events.v1` | Dispatch events |
| `payments.outcome.events.v1` | Outcome events |
| `pii.tokenize.request` | PII tokenization requests |
| `pii.tokenize.result` | PII tokenization results |
| `relay.dlq.publish_failure` | Relay DLQ — publish failures |
| `relay.dlq.poison` | Relay DLQ — poison messages |
| `z.dispatch.events.v1` | Dispatch events (v1) |
| `z.outcome.events.v1` | Outcome events (v1) |
| `canonical.intent.created` | Canonical intent created |
| `dispatch.attempt.created` | Dispatch attempt created |
| `outcome.event.normalized` | Normalized outcome event |
| `finality.certificate.issued` | Finality certificate issued |
| `final.contract.updated` | Final contract updated |
| `evidence.pack.ready` | Evidence pack ready |
| `dlq.event` | Dead letter queue events |
| `statement.match.event` | Statement matching |
| `corridor.health.tick` | Corridor health tick |
| `sla.timer.tick` | SLA timer tick |
| `canonical.settlement.created` | Settlement created |
| `attachment.decision.created` | Attachment decision |
| `variance.record.created` | Variance records |
| `batch.summary.updated` | Batch summary updates |
| `governance.decision.created` | Governance decisions |
| `zpi.actuation.retry` | Intelligence retries |
| `zpi.actuation.evidence` | Intelligence evidence |
| `zpi.actuation.alert` | Intelligence alerts |
| `zpi.actuation.batch_patch` | Intelligence batch patches |

## Kafka Logs

```bash
kubectl logs -f statefulset/zord-kafka -n zord --tail=100
```

---
---

# REDIS

**Host:** `zord-prompt-layer-redis:6379` | **Image:** `redis:7-alpine` | **Max Memory:** `256mb`

## Enter Redis Shell

```bash
kubectl exec -it deploy/zord-prompt-layer-redis -n zord -- redis-cli
```

## Commands (run inside redis-cli)

```bash
# Check alive
PING

# Total key count
DBSIZE

# List all keys
KEYS *

# Get memory usage
INFO memory

# Get stats (hits, misses, connections)
INFO stats

# Get keyspace info
INFO keyspace

# Get connected clients
CLIENT LIST

# Get server info (version, uptime)
INFO server

# Get a key value
GET <key-name>

# Check TTL of a key
TTL <key-name>

# Check key type
TYPE <key-name>

# Check max memory config
CONFIG GET maxmemory

# Monitor real-time commands (Ctrl+C to stop)
MONITOR

# Exit
exit
```

## Redis Logs

```bash
kubectl logs -f deploy/zord-prompt-layer-redis -n zord --tail=100
```

---
---

# POSTGRESQL GLOBAL

## Enter PostgreSQL (superuser)

```bash
kubectl exec -it statefulset/zord-postgres -n zord -- psql -U postgres
```

## Global Queries (run inside psql)

```sql
-- List all databases
\l

-- Check all database sizes
SELECT datname, pg_size_pretty(pg_database_size(datname)) AS size
FROM pg_database WHERE datistemplate = false
ORDER BY pg_database_size(datname) DESC;

-- Check all active connections
SELECT datname, usename, state, COUNT(*)
FROM pg_stat_activity
GROUP BY datname, usename, state
ORDER BY datname;

-- Check max connections
SHOW max_connections;

-- Check PostgreSQL version
SELECT version();

-- Check all roles/users
\du

-- Switch to another database
\c zord_edge_db
\c zord_intent_engine_db
\c zord_relay_db
\c zord_token_enclave_db
\c zord_outcome_db
\c zord_evidence_db
\c zord_intelligence

-- Check extensions (after connecting to a DB)
SELECT * FROM pg_extension;

-- Exit
\q
```

## Get Passwords

```bash
kubectl get secret zord-app-secrets -n zord -o jsonpath='{.data.POSTGRES_SUPERUSER_PASSWORD}' | base64 -d && echo
kubectl get secret zord-app-secrets -n zord -o jsonpath='{.data.EDGE_DB_PASSWORD}' | base64 -d && echo
kubectl get secret zord-app-secrets -n zord -o jsonpath='{.data.INTENT_DB_PASSWORD}' | base64 -d && echo
kubectl get secret zord-app-secrets -n zord -o jsonpath='{.data.RELAY_DB_PASSWORD}' | base64 -d && echo
kubectl get secret zord-app-secrets -n zord -o jsonpath='{.data.TOKEN_DB_PASSWORD}' | base64 -d && echo
kubectl get secret zord-app-secrets -n zord -o jsonpath='{.data.OUTCOME_DB_PASSWORD}' | base64 -d && echo
kubectl get secret zord-app-secrets -n zord -o jsonpath='{.data.EVIDENCE_DB_PASSWORD}' | base64 -d && echo
kubectl get secret zord-app-secrets -n zord -o jsonpath='{.data.INTELLIGENCE_DB_PASSWORD}' | base64 -d && echo
```

## Check PostgreSQL is Ready

```bash
kubectl exec -it statefulset/zord-postgres -n zord -- pg_isready -U postgres
```

## PostgreSQL Logs

```bash
kubectl logs -f statefulset/zord-postgres -n zord --tail=100
```

---
---

# KONG API GATEWAY

**Port:** 8000 (proxy) / 8001 (admin) | **Namespace:** `api-gateway` | **Mode:** DB-less

## Enter Kong Shell

```bash
kubectl exec -it deploy/kong-gateway -n api-gateway -- sh
```

## Commands (run inside Kong shell)

```bash
# Check status
wget -qO- http://127.0.0.1:8001/status

# List routes
wget -qO- http://127.0.0.1:8001/routes

# List services
wget -qO- http://127.0.0.1:8001/services

# List plugins
wget -qO- http://127.0.0.1:8001/plugins

# Validate config
kong config parse /etc/kong/kong.yaml

# Check metrics
wget -qO- http://127.0.0.1:8100/metrics | head -50

# Exit
exit
```

## Test Kong Routing (production)

```bash
curl -s https://zordnet.com/api/health
curl -s https://api.zordnet.com/edge/health
curl -s -o /dev/null -w "%{http_code}" https://zordnet.com/
```

## Kong Logs

```bash
kubectl logs -f deploy/kong-gateway -n api-gateway --tail=100
```

---
---

# QUICK FULL PLATFORM CHECK

```bash
# All pods status
kubectl get pods -n zord
kubectl get pods -n api-gateway

# HPAs
kubectl get hpa -n zord
kubectl get hpa -n api-gateway

# PVCs
kubectl get pvc -n zord

# External secrets
kubectl get externalsecret -n zord

# All services
kubectl get svc -n zord

# Ingress
kubectl get ingress -n api-gateway
```

---

**Last Updated:** June 2025
**Author:** Yaswanth Reddy — Lead DevOps Engineer, Arealis Networks

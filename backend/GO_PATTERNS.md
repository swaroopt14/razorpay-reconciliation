# Arealis-Zord — Go Patterns Reference

## Kafka Topics

```
payments.intent.events.v1        → relay: main dispatch events
payments.dispatch.events.v1      → relay: relay loop downstream events
payments.ledger.events.v1        → edge: ledger events from outbox
relay.dlq.publish_failure        → relay: dead letter for failed publishes
relay.dlq.poison                 → relay: unprocessable/corrupt messages
statement.match.event            → intelligence: settlement matching
canonical.settlement.created     → intelligence: settlement creation
attachment.decision.created      → intelligence: attachment decisions
batch.summary.updated            → intelligence: batch completion
payments.intent.dlq              → intelligence: intent DLQ events
```

Topic routing is in `zord-relay/config/config.go` via `ServiceConfig.TopicMap` which maps event_type to topic name.

---

## Struct Patterns

**Event structs** in `zord-relay/model/event.go`:
- `OutboxEvent` — normalized cross-service event envelope (40+ fields)
- `DLQMessage` — dead letter queue envelope
- `DLQItemEvent` — individual DLQ item
- `BatchCanonicalizationCompletedEvent` — batch quality scores

**Domain structs** in `zord-relay/model/dispatch.go`:
- `Dispatch` — PSP dispatch attempt with status lifecycle
- `DispatchStatus` — string enum: PENDING, HELD, SENT, PROVIDER_ACKED, AWAITING_PROVIDER_SIGNAL, FAILED_RETRYABLE, FAILED_TERMINAL, REQUIRES_MANUAL_REVIEW
- `GovernanceDecision` — string enum: ALLOW_DISPATCH, HOLD_DISPATCH, TERMINAL_FAIL, REQUIRE_MANUAL_REVIEW
- `RetryClass` — string enum: RETRYABLE_TECHNICAL, RETRYABLE_AFTER_BACKOFF, WAIT_FOR_SIGNAL, NEVER_RETRY, MANUAL_REVIEW_REQUIRED, CIRCUIT_OPEN_HOLD

**Domain structs** in `zord-edge/model/universal_intent_shape.go`:
- `UniversalIntentShape` — canonical nested payment intent (60+ fields)
- `Amount` — value + currency
- `Beneficiary` — instrument, name, country
- `Instrument` — kind, IFSC, VPA
- `Remitter` — phone, email, customer_id

**Config structs** in `zord-relay/config/config.go`:
- `Config` root with nested: `KafkaConfig`, `ServiceConfig`, `DBConfig`, `DispatchConfig`
- Uses `mapstructure` tags + viper for YAML/env loading
- `KafkaConfig` has brokers, SASL auth, TLS, acks, compression, DLQ topics
- `ServiceConfig` has base_url, auth_token, topic_map, retry settings

**Outbox structs** in `zord-relay/model/relay_outbox.go`:
- `RelayOutboxRow` — relay's own outbox for Kafka publish
- Uses `db:"..."` tags for database column mapping

---

## Handler Patterns

Framework is Gin (`github.com/gin-gonic/gin`).

**Handler struct** in `zord-edge/handler/intent_handler.go`:
```go
func (h *Handler) IntentHandler(context *gin.Context) {
    tenantID := context.MustGet("tenant_id").(uuid.UUID)
    idempotencyKey := context.GetString("idempotency_key")
    // ... validate, encrypt, persist, respond
    context.JSON(http.StatusAccepted, gin.H{...})
}
```

**Route groups** in `zord-edge/routes/intent_route.go`:
```
public:        /health
admin:         AdminAuthMiddleware → tenant CRUD
webhooks:      VerifyWebhookSignature → TransportValidation → WebhookHandler
protected:     Authenticate → TransportValidation → ValidateIntentRequest → GetIdempotencyKey → IntentHandler
jwtProtected:  JWTAuthenticate → SessionActivityMiddleware → SessionRoutes
```

**Error response pattern** — always structured gin.H:
```go
gin.H{"ErrorCode": "DUPLICATE_IDEMPOTENCY_KEY", "ErrorMsg": "request already processed", "EnvelopeID": id}
gin.H{"TraceID": traceID, "ErrorCode": "INTERNAL_ERROR", "ErrorMsg": err.Error()}
```

**Webhook handler** in `zord-edge/handler/webhook_handler.go`:
- Extracts provider, connector_id, tenant_id from verified context
- Builds fingerprint for strong idempotency
- Encrypts payload via vault
- Persists to S3 + DB in single transaction

---

## Kafka Usage

Library is `github.com/IBM/sarama`.

**Producer** in `zord-relay/publisher/kafka.go`:
- `KafkaPublisher` wraps `sarama.SyncProducer`
- Idempotent mode: `RequiredAcks = WaitForAll`, `Idempotent = true`
- Headers: trace_id, tenant_id, event_id, event_type + OTEL propagation
- Message size limit: 1 MiB
- Compression: snappy/lz4/zstd configurable
- Methods: `Publish()`, `PublishDLQItem()`, `PublishBatchCompleted()`, `PublishDLQ()`
- Has `PoisonErr` type for messages that should go straight to DLQ

**Consumer** in `zord-relay/services/dispatch_consumer.go`:
- `DispatchConsumer` with worker pool fan-out
- Manual offset commits (`AutoCommit.Enable = false`)
- Worker pool: workItem channel → N goroutines → `handleMessage()`
- Peek-then-unmarshal pattern for poison detection
- Method `commitOffset()` calls `session.MarkMessage()`

**Simple consumer** in `zord-token-enclave/kafka/consumer.go`:
```go
func StartConsumer(ctx, brokers, groupID, topic, handler func([]byte) error)
// Simple callback pattern, marks message after processing
```

**Consumer config** uses `sarama.NewConsumerGroup()` with:
- `BalanceStrategyRange` for partition assignment
- `OffsetOldest` for initial offset

---

## SQL Patterns

Database is PostgreSQL with `database/sql` + `lib/pq`.

**Repository pattern** — every service has its own repo struct:
```go
type DispatchRepo struct { db *sql.DB }
func NewDispatchRepo(db *sql.DB) *DispatchRepo
```

**Transaction pattern** in `zord-edge/services/ingest_service.go`:
```go
tx, err := db.BeginTx(ctx, nil)
defer func() {
    if err != nil { _ = tx.Rollback() }
}()
// ... exec queries with tx ...
return tx.Commit()
```

**Query style** — positional params ($1, $2...):
```go
r.db.QueryRowContext(ctx, `
    SELECT dispatch_id, contract_id, ... FROM dispatches
    WHERE contract_id = $1 AND attempt_count = $2
    LIMIT 1
`, contractID, attemptCount)
```

**Nullable columns** use `sql.NullString`, `sql.NullTime`:
```go
var corridorID sql.NullString
// ... scan ...
if corridorID.Valid { d.CorridorID = corridorID.String }
```

**Key tables:**

```
tenants              → multi-tenant registry
idempotency_keys     → request deduplication
ingress_envelopes    → raw ingress audit trail
ingress_outbox       → outbox pattern for Kafka publish
dispatches           → PSP dispatch lifecycle
projection_state     → computed KPI projections (JSONB)
processed_events     → Kafka event idempotency
relay_outbox         → relay's own outbox for Kafka
```

**Advanced patterns:**

`FOR UPDATE SKIP LOCKED` for concurrent workers:
```sql
SELECT ... FROM dispatches
WHERE status = 'FAILED_RETRYABLE'
  AND next_dispatch_attempt_at <= now()
ORDER BY next_dispatch_attempt_at ASC
LIMIT $1
FOR UPDATE SKIP LOCKED
```

JSONB for flexible schemas:
```sql
value_json JSONB NOT NULL
-- stores different shapes per projection type
```

Auto-migration at startup:
```go
func CreateTable() error {
    _, err := DB.Exec(`CREATE TABLE IF NOT EXISTS "tenants" (...)`)
    // ... more tables ...
}
```

Idempotent upsert via UNIQUE constraint:
```sql
CONSTRAINT uq_projection
    UNIQUE (tenant_id, projection_key, window_start, projection_version)
```

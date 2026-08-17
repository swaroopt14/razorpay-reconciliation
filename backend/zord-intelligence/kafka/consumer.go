package kafka

// FILE: kafka/consumer.go
//
// WHAT IS THIS FILE?
// This file is the "ears" of ZPI — it listens to Kafka topics and routes
// each incoming message to the correct handler function.
//
// HOW KAFKA WORKS (simple explanation):
// Kafka is a message queue. Other services (S2, S4, S5, S6) PUBLISH events
// to named topics. ZPI SUBSCRIBES to those topics and receives every message.
// Think of it like a radio: services broadcast on frequencies (topics),
// ZPI tunes in and processes every broadcast.
//
// WHAT CHANGED IN PHASE 2:
// The EventHandler interface gains 5 new methods for Grade A events.
// StartConsumers wires 5 new topics to 5 new handler functions.
// The existing 8 topic handlers are UNTOUCHED — zero risk of regression.
//
// INTERFACE PATTERN (important Go concept):
// An "interface" in Go is a contract. It says:
//   "Any type that has these methods satisfies this interface."
// ProjectionService (in services/) implements ALL methods of EventHandler.
// If ProjectionService is missing even one method, Go refuses to compile.
// This is the compile-time safety net that prevents forgetting to wire a handler.
//
// GRADE A vs GRADE B topics:
// Grade B (original 8) = dispatch/finality/outcome mode
// Grade A (new 5)      = attachment/settlement/variance mode
// Both sets are wired here. ZPI handles whichever events arrive.
// =============================================================================

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/segmentio/kafka-go"
	"github.com/zord/zord-intelligence/config"
	"github.com/zord/zord-intelligence/internal/models"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// =============================================================================
// EventHandler interface
// =============================================================================
//
// WHAT IS AN INTERFACE?
// An interface is a list of method signatures (name + inputs + outputs).
// Any Go struct that has ALL those methods "implements" the interface —
// no explicit declaration needed (unlike Java's "implements" keyword).
//
// WHY USE AN INTERFACE HERE?
// consumer.go does not need to know about services.ProjectionService directly.
// It only needs to know: "whoever handles events must have these methods."
// This makes consumer.go easy to test (you can swap in a fake handler)
// and prevents circular imports (kafka package ↔ services package).
//
// PHASE 2 ADDITIONS:
// 5 new methods added for the Grade A event types.
// ProjectionService must implement all 13 methods to satisfy this interface.
// =============================================================================

// EventHandler is the contract that any Kafka event processor must satisfy.
// ProjectionService in internal/services/ implements all these methods.
type EventHandler interface {
	// ── Grade B methods (original 8 — dispatch/finality mode) ────────────────
	HandleIntentCreated(ctx context.Context, e models.IntentCreatedEvent) error
	HandleDispatchCreated(ctx context.Context, e models.DispatchAttemptCreatedEvent) error
	HandleOutcomeNormalized(ctx context.Context, e models.OutcomeNormalizedEvent) error
	HandleFinalityCertIssued(ctx context.Context, e models.FinalityCertIssuedEvent) error
	HandleFinalContractUpdated(ctx context.Context, e models.FinalContractUpdatedEvent) error
	HandleEvidencePackReady(ctx context.Context, e models.EvidencePackReadyEvent) error
	HandleDLQEvent(ctx context.Context, e models.DLQEvent) error
	HandleStatementMatch(ctx context.Context, e models.StatementMatchEvent) error

	// ── Grade A methods (Phase 2 — attachment/settlement mode) ───────────────
	// These 5 new methods handle the pivoted spec's upstream inputs.
	// ProjectionService must add stub implementations in Phase 2
	// so the code compiles. Full logic is wired in Phase 4.
	HandleSettlementCreated(ctx context.Context, e models.CanonicalSettlementCreatedEvent) error
	HandleAttachmentDecision(ctx context.Context, e models.AttachmentDecisionCreatedEvent) error
	HandleVarianceRecord(ctx context.Context, e models.VarianceRecordCreatedEvent) error
	HandleBatchSummaryUpdated(ctx context.Context, e models.BatchSummaryUpdatedEvent) error
	HandleGovernanceDecision(ctx context.Context, e models.GovernanceDecisionCreatedEvent) error

	// ── Pattern Intelligence method ───────────────────────────────────────────
	// Handles per-intent manual review events from Service 2.
	// Used to compute manual_review_rate_by_source and trigger source-fix recommendations.
	HandleDLQItem(ctx context.Context, e models.DLQItemEvent) error
}

// CorridorHealthTickHandler is a separate optional interface.
// It is "optional" because not every handler needs to process health ticks.
// consumer.go checks at runtime: "does this handler also support health ticks?"
// If yes, wire it. If not, skip. This avoids forcing every handler to implement it.
type CorridorHealthTickHandler interface {
	HandleCorridorHealthTick(ctx context.Context, e models.CorridorHealthTickEvent) error
}

// SLATimerTickHandler is a separate optional interface for SLA ticks.
// Same pattern as CorridorHealthTickHandler above.
type SLATimerTickHandler interface {
	HandleSLATimerTick(ctx context.Context, e models.SLATimerTickEvent) error
}

// StartConsumers — wire topics to handlers and start consuming
//
// HOW THIS FUNCTION WORKS:
// 1. Build a map: topic name → function that handles one message from that topic
// 2. Optionally add health tick and SLA tick handlers (interface type assertion)
// 3. Start a single goroutine that reads ALL topics in one consumer group
//
// WHY ONE GOROUTINE FOR ALL TOPICS?
// kafka-go's GroupTopics feature lets one reader subscribe to multiple topics.
// Kafka assigns partitions to this reader automatically.
// One goroutine is simpler, uses less memory, and is easier to shut down cleanly.
//
// TOPIC SKIPPING:
// If a topic config value is empty string (""), we skip wiring it.
// This means: if TOPIC_ATTACHMENT_DECISION is not set, we simply do not
// subscribe to that topic. The service starts cleanly. No panic.
// This is the "graceful degradation" pattern for phased rollouts.
// =============================================================================

// StartConsumers builds the topic→handler map and starts the Kafka reader goroutine.
// Call this once from main.go after all services are created.
//
// producer is the SAME Producer instance main.go already constructs for
// outbox delivery — reused here (not a dedicated second producer) to
// publish permanently-failed events to cfg.TopicIntelligenceDLQ before
// their source offset is committed (corrective-action-report P0-02).
func StartConsumers(ctx context.Context, cfg *config.Config, handler EventHandler, producer *Producer) {
	brokers := strings.Split(cfg.KafkaBrokers, ",")

	// topicHandlers maps each Kafka topic name to a function that:
	//   1. Deserialises (JSON decode) the raw message bytes into a typed struct
	//   2. Calls the correct handler method
	//   3. Returns an error if something goes wrong (message will NOT be committed)
	//
	// WHY A CLOSURE (func(context.Context, kafka.Message) error)?
	// Each topic needs different deserialization logic.
	// A closure captures the specific event type for its topic.
	// Without closures, we'd need a separate function for each topic — 13+ functions.
	//
	// PHASE 1 REFACTOR: the closure now receives a per-message context (built in
	// consumeSingleTopic) instead of closing over StartConsumers' service-lifetime
	// ctx. That per-message context carries the OTel trace link (previously built
	// but never actually passed to handlers — a pre-existing gap) AND the Kafka
	// envelope metadata (payload hash, topic, event source/version) that handlers
	// need to claim an event_receipts row before writing any projection counters.
	topicHandlers := map[string]func(context.Context, kafka.Message) error{}

	// ── Grade B topic handlers (original — unchanged) ─────────────────────────
	// These are wired exactly as before. No changes to existing behaviour.

	wireHandler(topicHandlers, cfg.TopicIntentCreated,
		func(ctx context.Context, msg kafka.Message) error {
			var re models.RelayEvent
			if err := json.Unmarshal(msg.Value, &re); err != nil {
				return err
			}
			var e models.IntentCreatedEvent
			if err := json.Unmarshal(re.Payload, &e); err != nil {
				return err
			}
			e.EventID = re.EventID
			e.TenantID = re.TenantID
			e.TraceID = re.TraceID
			e.ContractID = re.ContractID
			e.EventType = re.EventType
			e.EventVersion = re.EventVersion
			e.SchemaVersion = re.SchemaVersion
			e.SourceService = re.SourceService
			if re.ClientBatchID != "" {
				e.ClientBatchRef = re.ClientBatchID
			}
			// INT-10: copy decision/quality reason codes and score fields
			// from the envelope explicitly, rather than relying on the
			// nested Payload nested-JSON unmarshal above to happen to
			// carry matching keys — see RelayEvent/IntentCreatedEvent in
			// internal/models/events.go for why.
			e.GovernanceReasonCodesJSON = re.GovernanceReasonCodesJSON
			e.ScoreVersion = re.ScoreVersion
			e.ScoreValidityStatus = re.ScoreValidityStatus
			e.ScoreBreakdownJSON = re.ScoreBreakdownJSON
			e.ScoreReasonCodesJSON = re.ScoreReasonCodesJSON
			e.ScoredAt = re.ScoredAt
			e.ReferenceQualityScore = re.ReferenceQualityScore
			e.DuplicateRiskScore = re.DuplicateRiskScore
			e.MappingConfidenceScore = re.MappingConfidenceScore
			e.SchemaCompletenessScore = re.SchemaCompletenessScore
			e.DuplicateReasonCode = re.DuplicateReasonCode
			e.IntentQualityScore = re.IntentQualityScore
			e.MatchabilityScore = re.MatchabilityScore
			e.ProofReadinessScore = re.ProofReadinessScore
			return handler.HandleIntentCreated(ctx, e)
		})

	wireHandler(topicHandlers, cfg.TopicEvidenceReady,
		func(ctx context.Context, msg kafka.Message) error {
			var re models.RelayEvent
			if err := json.Unmarshal(msg.Value, &re); err != nil {
				return err
			}
			var e models.EvidencePackReadyEvent
			if err := json.Unmarshal(re.Payload, &e); err != nil {
				return err
			}
			e.EventID = re.EventID
			e.TenantID = re.TenantID
			e.TraceID = re.TraceID
			return handler.HandleEvidencePackReady(ctx, e)
		})

	if !cfg.IntelligenceMode.IsGradeA() {
		wireHandler(topicHandlers, cfg.TopicDispatchCreated,
			func(ctx context.Context, msg kafka.Message) error {
				var re models.RelayEvent
				if err := json.Unmarshal(msg.Value, &re); err != nil {
					return err
				}
				var e models.DispatchAttemptCreatedEvent
				if err := json.Unmarshal(re.Payload, &e); err != nil {
					return err
				}
				e.EventID = re.EventID
				e.TenantID = re.TenantID
				e.TraceID = re.TraceID
				return handler.HandleDispatchCreated(ctx, e)
			})

		wireHandler(topicHandlers, cfg.TopicOutcomeNormalized,
			func(ctx context.Context, msg kafka.Message) error {
				var re models.RelayEvent
				if err := json.Unmarshal(msg.Value, &re); err != nil {
					return err
				}
				var e models.OutcomeNormalizedEvent
				if err := json.Unmarshal(re.Payload, &e); err != nil {
					return err
				}
				e.EventID = re.EventID
				e.TenantID = re.TenantID
				e.TraceID = re.TraceID
				return handler.HandleOutcomeNormalized(ctx, e)
			})

		wireHandler(topicHandlers, cfg.TopicFinalityCert,
			func(ctx context.Context, msg kafka.Message) error {
				var re models.RelayEvent
				if err := json.Unmarshal(msg.Value, &re); err != nil {
					return err
				}
				var e models.FinalityCertIssuedEvent
				if err := json.Unmarshal(re.Payload, &e); err != nil {
					return err
				}
				e.EventID = re.EventID
				e.TenantID = re.TenantID
				e.TraceID = re.TraceID
				return handler.HandleFinalityCertIssued(ctx, e)
			})

		wireHandler(topicHandlers, cfg.TopicFinalContract,
			func(ctx context.Context, msg kafka.Message) error {
				var re models.RelayEvent
				if err := json.Unmarshal(msg.Value, &re); err != nil {
					return err
				}
				var e models.FinalContractUpdatedEvent
				if err := json.Unmarshal(re.Payload, &e); err != nil {
					return err
				}
				e.EventID = re.EventID
				e.TenantID = re.TenantID
				e.TraceID = re.TraceID
				return handler.HandleFinalContractUpdated(ctx, e)
			})

		wireHandler(topicHandlers, cfg.TopicDLQ,
			func(ctx context.Context, msg kafka.Message) error {
				var e models.DLQEvent
				if err := json.Unmarshal(msg.Value, &e); err != nil {
					return err
				}
				return handler.HandleDLQEvent(ctx, e)
			})

		wireHandler(topicHandlers, cfg.TopicStatementMatch,
			func(ctx context.Context, msg kafka.Message) error {
				var re models.RelayEvent
				if err := json.Unmarshal(msg.Value, &re); err != nil {
					return err
				}
				var e models.StatementMatchEvent
				if err := json.Unmarshal(re.Payload, &e); err != nil {
					return err
				}
				e.EventID = re.EventID
				e.TenantID = re.TenantID
				e.TraceID = re.TraceID
				return handler.HandleStatementMatch(ctx, e)
			})
	}

	// ── Grade A topic handlers (Phase 2 — new) ────────────────────────────────
	// These 5 handlers are wired using wireHandler, which skips empty-string topics.
	// If a topic is not yet deployed by upstream services, the handler is simply
	// not registered — the service starts and runs all existing Grade B handlers.

	wireHandler(topicHandlers, cfg.TopicSettlementCreated,
		func(ctx context.Context, msg kafka.Message) error {
			var re models.RelayEvent
			if err := json.Unmarshal(msg.Value, &re); err != nil {
				return err
			}
			var e models.CanonicalSettlementCreatedEvent
			if err := json.Unmarshal(re.Payload, &e); err != nil {
				return err
			}
			e.EventID = re.EventID
			e.TenantID = re.TenantID
			e.TraceID = re.TraceID

			return handler.HandleSettlementCreated(ctx, e)
		})

	wireHandler(topicHandlers, cfg.TopicAttachmentDecision,
		func(ctx context.Context, msg kafka.Message) error {
			var re models.RelayEvent
			if err := json.Unmarshal(msg.Value, &re); err != nil {
				return err
			}
			var e models.AttachmentDecisionCreatedEvent
			if err := json.Unmarshal(re.Payload, &e); err != nil {
				return err
			}
			// Map envelope fields to ensure identity is preserved
			e.EventID = re.EventID
			e.TenantID = re.TenantID
			e.TraceID = re.TraceID
			return handler.HandleAttachmentDecision(ctx, e)
		})

	wireHandler(topicHandlers, cfg.TopicVarianceRecord,
		func(ctx context.Context, msg kafka.Message) error {
			var re models.RelayEvent
			if err := json.Unmarshal(msg.Value, &re); err != nil {
				return err
			}
			var e models.VarianceRecordCreatedEvent
			if err := json.Unmarshal(re.Payload, &e); err != nil {
				return err
			}
			e.EventID = re.EventID
			e.TenantID = re.TenantID
			e.TraceID = re.TraceID
			return handler.HandleVarianceRecord(ctx, e)
		})

	wireHandler(topicHandlers, cfg.TopicBatchSummary,
		func(ctx context.Context, msg kafka.Message) error {
			var re models.RelayEvent
			if err := json.Unmarshal(msg.Value, &re); err != nil {
				return err
			}
			var e models.BatchSummaryUpdatedEvent
			if err := json.Unmarshal(re.Payload, &e); err != nil {
				return err
			}
			e.EventID = re.EventID
			e.TenantID = re.TenantID
			e.TraceID = re.TraceID
			return handler.HandleBatchSummaryUpdated(ctx, e)
		})

	wireHandler(topicHandlers, cfg.TopicGovernanceDecision,
		func(ctx context.Context, msg kafka.Message) error {
			var re models.RelayEvent
			if err := json.Unmarshal(msg.Value, &re); err != nil {
				return err
			}
			var e models.GovernanceDecisionCreatedEvent
			if err := json.Unmarshal(re.Payload, &e); err != nil {
				return err
			}
			e.EventID = re.EventID
			e.TenantID = re.TenantID
			e.TraceID = re.TraceID
			return handler.HandleGovernanceDecision(ctx, e)
		})

	// ── Pattern Intelligence: manual review DLQ handler ──────────────────────
	// payments.intent.dlq is published by zord-relay's PublishDLQItem function
	// as a DIRECT flat JSON object (NOT a RelayEvent envelope).
	// The relay maps DLQItemEvent fields directly: event_id, tenant_id, trace_id,
	// occurred_at, intent_id, batch_id, source_system, amount, reason_code.
	wireHandler(topicHandlers, cfg.TopicDLQItem,
		func(ctx context.Context, msg kafka.Message) error {
			var e models.DLQItemEvent
			if err := json.Unmarshal(msg.Value, &e); err != nil {
				return err
			}
			return handler.HandleDLQItem(ctx, e)
		})

	// ── Optional tick handlers (interface type assertion) ─────────────────────
	//
	// HOW TYPE ASSERTION WORKS:
	//   handler.(CorridorHealthTickHandler)
	// This checks at RUNTIME: "does the concrete type behind the EventHandler
	// interface also implement CorridorHealthTickHandler?"
	//
	//   ok = true  → it does. Use corridorHealthHandler.HandleCorridorHealthTick
	//   ok = false → it doesn't. Skip wiring. No panic.
	//
	// This is Go's way of asking: "can this thing do extra things?"
	// It is called a "type assertion" or "interface satisfaction check".
	if !cfg.IntelligenceMode.IsGradeA() {
		if corridorHealthHandler, ok := handler.(CorridorHealthTickHandler); ok {
			wireHandler(topicHandlers, cfg.TopicCorridorHealthTick,
				func(ctx context.Context, msg kafka.Message) error {
					var e models.CorridorHealthTickEvent
					if err := json.Unmarshal(msg.Value, &e); err != nil {
						return err
					}
					return corridorHealthHandler.HandleCorridorHealthTick(ctx, e)
				})
		}

		if slaTimerHandler, ok := handler.(SLATimerTickHandler); ok {
			wireHandler(topicHandlers, cfg.TopicSLATimerTick,
				func(ctx context.Context, msg kafka.Message) error {
					var e models.SLATimerTickEvent
					if err := json.Unmarshal(msg.Value, &e); err != nil {
						return err
					}
					return slaTimerHandler.HandleSLATimerTick(ctx, e)
				})
		}
	}

	// Start one goroutine per topic for parallel processing.
	// Per-tenant ordering is preserved within each topic: tenantID is the message key,
	// so same-tenant events always land on the same partition and are processed sequentially.
	// Different topics (e.g. attachment.decision vs batch.summary) process concurrently —
	// this is the main throughput multiplier at 1500-2000 events/sec.
	//
	// INTEL-04: topics exempted from the required-field gate below — see
	// requiredFieldExemptTopics' doc comment for why cfg.TopicDLQItem
	// ("payments.intent.dlq") is deliberately NOT among them despite
	// superficially looking like the same kind of flat, non-RelayEvent-
	// enveloped topic as cfg.TopicDLQ.
	//
	// cfg.TopicCorridorHealthTick / cfg.TopicSLATimerTick (senior-engineer
	// review fix, confirmed against models.CorridorHealthTickEvent /
	// SLATimerTickEvent in internal/models/events.go): both are flat,
	// non-RelayEvent-enveloped internal heartbeat/tick events — carrying
	// EventID/TenantID/CorridorID/TickAt/TraceID but structurally no
	// EventType or SchemaVersion field at all, the same shape as
	// cfg.TopicDLQ's DLQEvent, not payments.intent.dlq's DLQItemEvent.
	// Without this exemption every message on either topic would
	// permanently fail schemaVersion == "" and go straight to the DLQ.
	requiredFieldExemptTopics := map[string]bool{
		cfg.TopicDLQ:                true,
		cfg.TopicCorridorHealthTick: true,
		cfg.TopicSLATimerTick:       true,
	}

	// INTEL-06: source_service values permitted to send an empty or literal
	// "legacy" schema_version on live (non-exempt) topics. Parsed once here
	// from cfg.LegacySchemaAllowedSources (comma-separated); empty by
	// default, so live production topics fail closed unless an ops-run
	// backfill/replay tool's source_service is explicitly listed.
	legacyAllowedSources := map[string]bool{}
	for _, s := range strings.Split(cfg.LegacySchemaAllowedSources, ",") {
		if s = strings.TrimSpace(s); s != "" {
			legacyAllowedSources[s] = true
		}
	}

	topicCount := 0
	for topic, fn := range topicHandlers {
		t, f := topic, fn // capture loop variables before goroutine launch
		exempt := requiredFieldExemptTopics[t]
		go consumeSingleTopic(ctx, brokers, cfg.KafkaGroupID, t, f, producer, cfg.TopicIntelligenceDLQ, exempt, legacyAllowedSources)
		topicCount++
	}

	log.Printf("kafka: %d parallel consumer goroutines started", topicCount)
}

// wireHandler — safely add a topic→handler mapping
//
// WHY THIS HELPER EXISTS:
// Before Phase 2 we had 8 inline map assignments. Now we have 13.
// Repeating the empty-string check 13 times is error-prone and noisy.
// This helper centralises that check.
//
// HOW IT WORKS:
//
//	if topic == ""  → skip (upstream not deployed yet)
//	if topic != ""  → add to map
//
// This is the "graceful degradation" pattern for phased rollouts.
// You can deploy ZPI Phase 2 before Service 5C deploys its new topics.
// ZPI will start fine — it just won't process Grade A events yet.
// When Service 5C deploys, the topics become active automatically.
// =============================================================================
func wireHandler(
	handlers map[string]func(context.Context, kafka.Message) error,
	topic string,
	fn func(context.Context, kafka.Message) error,
) {
	// Skip empty-string topics. This happens when an env var is not set
	// or when a topic is intentionally disabled.
	if topic == "" {
		return
	}
	handlers[topic] = fn
}

// KafkaGoHeaderCarrier implements propagation.TextMapCarrier for kafka-go headers.
// Enables extracting W3C traceparent from Kafka message headers for end-to-end tracing.
type KafkaGoHeaderCarrier []kafka.Header

func (c KafkaGoHeaderCarrier) Get(key string) string {
	for _, h := range c {
		if h.Key == key {
			return string(h.Value)
		}
	}
	return ""
}

func (c KafkaGoHeaderCarrier) Set(key string, value string) {}

func (c KafkaGoHeaderCarrier) Keys() []string {
	keys := make([]string, len(c))
	for i, h := range c {
		keys[i] = h.Key
	}
	return keys
}

// consumeSingleTopic reads one Kafka topic in a dedicated goroutine.
// One goroutine per topic allows different topic types to process in parallel.
// Per-tenant ordering within each topic is preserved: tenantID is the message key,
// so all events for the same tenant land on the same partition and are processed
// sequentially by this goroutine — no cross-tenant race conditions.
//
// CommitInterval: 0 (manual commit) — offset is committed only after a
// successful handler call OR (corrective-action-report P0-02) after a
// permanently-failed event's durable DLQ record is confirmed published to
// dlqTopic via producer. The offset is NEVER advanced while that DLQ
// publish is still failing — see the retry loop below.
//
// exemptFromRequiredFieldCheck disables the INTEL-04 missing-schema_version/
// missing-trace_id gate for this topic only — see requiredFieldExemptTopics
// in StartConsumers for which topic that is and why.
//
// legacyAllowedSources (INTEL-06) is the set of source_service values
// permitted to send an empty or literal "legacy" schema_version on this
// topic when it is NOT exempt — see StartConsumers for how it's parsed from
// cfg.LegacySchemaAllowedSources. Empty by default (fail closed).
func consumeSingleTopic(
	ctx context.Context,
	brokers []string,
	groupID, topic string,
	handle func(context.Context, kafka.Message) error,
	producer *Producer,
	dlqTopic string,
	exemptFromRequiredFieldCheck bool,
	legacyAllowedSources map[string]bool,
) {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        brokers,
		GroupID:        groupID,
		Topic:          topic, // single topic per goroutine
		CommitInterval: 0,     // manual commit — commit only on success
		MaxWait:        3e9,   // 3 seconds: max time to wait for a new message
		Dialer:         NewSASLDialer(), // PLAT-06: SASL/SCRAM-SHA-512 auth
	})
	defer func() {
		if err := reader.Close(); err != nil {
			log.Printf("kafka: error closing reader topic=%s group=%s: %v", topic, groupID, err)
		}
	}()

	log.Printf("kafka: consumer started topic=%s group=%s", topic, groupID)
	tracer := otel.Tracer("zord-intelligence/consumer")

	for {
		msg, err := reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				log.Printf("kafka: consumer shutting down topic=%s", topic)
				return
			}
			log.Printf("kafka: fetch error topic=%s: %v", topic, err)
			continue
		}

		// Extract trace context from Kafka headers (W3C traceparent)
		carrier := KafkaGoHeaderCarrier(msg.Headers)
		msgCtx := otel.GetTextMapPropagator().Extract(ctx, carrier)

		// Start a consumer span linked to the producer's trace
		msgCtx, span := tracer.Start(msgCtx, "consume."+msg.Topic,
			trace.WithSpanKind(trace.SpanKindConsumer),
			trace.WithAttributes(
				attribute.String("messaging.system", "kafka"),
				attribute.String("messaging.destination", msg.Topic),
				attribute.Int64("messaging.kafka.partition", int64(msg.Partition)),
				attribute.Int64("messaging.kafka.offset", msg.Offset),
			),
		)

		// PHASE 1 REFACTOR / P1-01: attach envelope metadata (payload hash +
		// source topic + domain event type/version) so handlers can claim an
		// event_receipts row before writing any projection counters.
		// SourceTopic is always the Kafka topic (transport identity).
		// EventType/EventVersion are read out of the envelope payload itself
		// (zord-relay's OutboxEvent already carries real event_type/
		// schema_version fields — see envelope_meta.go's package doc) via a
		// best-effort partial decode, since the typed RelayEvent unmarshal
		// only happens inside each topic's handler closure below. Falls back
		// to the topic name / "legacy" for the two flat, non-enveloped
		// topics that carry neither field.
		hash := sha256.Sum256(msg.Value)
		domainEventType, schemaVersion, traceID, tenantID, sourceService := extractEnvelopeFieldsBestEffort(msg.Value)
		if domainEventType == "" {
			domainEventType = msg.Topic
		}
		eventVersion := schemaVersion
		if eventVersion == "" {
			eventVersion = models.DefaultEventVersion
		}
		// INTEL-05: EventSource is the envelope-derived domain producer
		// (e.g. zord-outcome-engine), never a hardcoded transport identity.
		// Left "" here for the 3 exempt topics that carry no such field —
		// EnvelopeMetaFromContext's existing fallback still applies when this
		// is read back downstream. SourceTopic (below) already carries the
		// actual transport/relay hop.
		msgCtx = models.ContextWithEnvelopeMeta(msgCtx, models.EnvelopeMeta{
			EventSource:  sourceService,
			SourceTopic:  msg.Topic,
			EventType:    domainEventType,
			EventVersion: eventVersion,
			PayloadHash:  hex.EncodeToString(hash[:]),
			TraceID:      traceID,
			TenantID:     tenantID,
		})

		// Unknown major schema version: route straight to the DLQ without
		// ever calling the handler — an unrecognized version means this
		// build cannot safely interpret the payload (corrective-action-report
		// P1-01), the same "don't guess, quarantine it" principle as a
		// poison/unmarshal-error message. Reuses the `err` already declared
		// by FetchMessage above (always nil here — the fetch-error branch
		// continues the loop before reaching this point).
		//
		// INTEL-04: on top of the unsupported-version check above, a
		// *supported* production event topic must also carry a non-empty
		// schema_version and trace_id, full stop — this deliberately
		// reopens the "ZPI never rejects on schema_version absence" leniency
		// (Locked Decision A.2) per explicit product direction. Checked
		// against schemaVersion/traceID (the raw extracted values, before
		// eventVersion's "legacy" default is applied above) so an absent
		// value is never laundered into a passing "legacy" version by the
		// defaulting that happens for logging/lineage purposes elsewhere.
		// exemptFromRequiredFieldCheck carves out cfg.TopicDLQ only — see
		// requiredFieldExemptTopics in StartConsumers.
		//
		// INTEL-03: tenant_id joins the same required-field gate — a
		// supported-event topic with no tenant_id cannot be safely attributed
		// to a tenant anywhere downstream (DLQ records, metrics, replay
		// authorization), so it is rejected here rather than silently
		// defaulting TenantID to "" (or, as before this fix, to the wrong
		// value read off the Kafka partition key). Same exemption set as
		// schema_version/trace_id above.
		//
		// INTEL-05: source_service joins the gate too — a supported-event
		// topic with no domain producer identity must not silently persist
		// with a defaulted/wrong lineage value (event_source is part of
		// event_receipts' primary key and is returned directly in the
		// customer-facing trace/RCA API). Same exemption set again.
		//
		// INTEL-06: a *live* (non-exempt) topic's message with schema_version
		// explicitly set to the literal "legacy" string is scoped to an
		// explicit source_service allow-list, not accepted unconditionally —
		// closing the gap where models.IsKnownSchemaVersion's blanket
		// "legacy" leniency let any producer bypass real versioning on any
		// topic. Checked against the raw schemaVersion (== DefaultEventVersion,
		// i.e. the literal string, not merely defaulted from empty by
		// eventVersion above) so this is distinct from — and evaluated before
		// — the required-field gate below, which continues to unconditionally
		// reject a genuinely empty schema_version regardless of allow-list: an
		// approved backfill/replay source must explicitly say "legacy", never
		// rely on an absent field.
		switch {
		case !models.IsKnownSchemaVersion(eventVersion):
			err = fmt.Errorf("%w: schema_version=%q topic=%s", errUnsupportedSchemaVersion, eventVersion, msg.Topic)
		case isUnapprovedLegacySchema(schemaVersion, sourceService, exemptFromRequiredFieldCheck, legacyAllowedSources):
			err = fmt.Errorf("%w: schema_version=%q source_service=%q topic=%s", errUnapprovedLegacySchema, schemaVersion, sourceService, msg.Topic)
		case !exemptFromRequiredFieldCheck && (schemaVersion == "" || traceID == "" || tenantID == "" || sourceService == ""):
			err = fmt.Errorf("%w: schema_version=%q trace_id=%q tenant_id=%q source_service=%q topic=%s", errMissingRequiredField, schemaVersion, traceID, tenantID, sourceService, msg.Topic)
		default:
			err = handle(msgCtx, msg)
		}

		if err != nil {
			span.RecordError(err)
			log.Printf("kafka: handler error topic=%s partition=%d offset=%d: %v",
				msg.Topic, msg.Partition, msg.Offset, err)

			// Bounded retry for transient failures (e.g. Postgres briefly
			// unavailable) — event_receipt_repo.RunOnce only retries
			// deadlock/serialization errors internally, not connection
			// failures, so without this a brief outage would go straight to
			// the DLQ instead of recovering. A genuine poison message (bad
			// JSON), an unsupported schema version, a missing required
			// field (INTEL-04), or an unapproved legacy schema_version
			// (INTEL-06) skips this — retrying identical bytes cannot
			// supply a field the message never carried, or make an
			// unapproved source approved.
			if !isUnmarshalError(err) && !errors.Is(err, errUnsupportedSchemaVersion) && !errors.Is(err, errMissingRequiredField) && !errors.Is(err, errUnapprovedLegacySchema) {
				for attempt, backoff := 2, time.Second; attempt <= 3 && err != nil; attempt, backoff = attempt+1, backoff*3 {
					time.Sleep(backoff)
					log.Printf("kafka: retrying handler topic=%s partition=%d offset=%d attempt=%d/3",
						msg.Topic, msg.Partition, msg.Offset, attempt)
					err = handle(msgCtx, msg)
				}
			}

			if err != nil {
				// Permanent failure: durably record it BEFORE advancing the
				// offset (corrective-action-report P0-02). This blocks —
				// deliberately — until the DLQ publish succeeds or the
				// service is shutting down; not committing means Kafka will
				// redeliver this same message on restart, which is correct.
				rec := buildDLQRecord(msgCtx, msg, err)
				for {
					if perr := producer.Publish(ctx, dlqTopic, rec.TenantID, rec); perr != nil {
						log.Printf("kafka: CRITICAL dlq publish failed, offset NOT advancing topic=%s partition=%d offset=%d: %v",
							msg.Topic, msg.Partition, msg.Offset, perr)
						if ctx.Err() != nil {
							span.End()
							return
						}
						time.Sleep(5 * time.Second)
						continue
					}
					break
				}
				log.Printf("kafka: event sent to DLQ topic=%s dlq_topic=%s partition=%d offset=%d event_id=%s error_class=%s: %v",
					msg.Topic, dlqTopic, msg.Partition, msg.Offset, rec.EventID, rec.ErrorClass, err)
			}
		}

		if err := reader.CommitMessages(ctx, msg); err != nil {
			log.Printf("kafka: commit error topic=%s offset=%d: %v",
				msg.Topic, msg.Offset, err)
		}

		span.End()
		log.Printf("kafka: processed topic=%s partition=%d offset=%d",
			msg.Topic, msg.Partition, msg.Offset)
	}
}

// isUnmarshalError reports whether err is a JSON decoding failure (a genuine
// poison message) rather than a downstream handler/database error —
// corrective-action-report P0-02's retry loop skips straight to the DLQ for
// these, since retrying identical malformed bytes cannot succeed.
func isUnmarshalError(err error) bool {
	var syntaxErr *json.SyntaxError
	var typeErr *json.UnmarshalTypeError
	return errors.As(err, &syntaxErr) || errors.As(err, &typeErr)
}

// isUnapprovedLegacySchema reports whether schemaVersion is the literal
// models.DefaultEventVersion ("legacy") string on a non-exempt (live) topic
// whose source_service is not on the configured backfill allow-list
// (INTEL-06). schemaVersion must be the raw extracted value — not the
// eventVersion defaulted-from-empty value — so a genuinely empty
// schema_version is never confused with an explicit "legacy" claim; the
// former is always handled by the required-field gate regardless of this
// function or the allow-list.
func isUnapprovedLegacySchema(schemaVersion, sourceService string, exempt bool, legacyAllowedSources map[string]bool) bool {
	return !exempt && schemaVersion == models.DefaultEventVersion && !legacyAllowedSources[sourceService]
}

// errUnsupportedSchemaVersion is the sentinel wrapped into the synthetic
// error consumeSingleTopic raises when a message's schema_version is not in
// models.SupportedSchemaVersions (corrective-action-report P1-01). Like a
// poison message, retrying cannot help — the event goes straight to the DLQ.
var errUnsupportedSchemaVersion = errors.New("unsupported schema version")

// errMissingRequiredField is the sentinel wrapped into the synthetic error
// consumeSingleTopic raises when a supported-event topic's message is
// missing schema_version and/or trace_id (INTEL-04). Like an unsupported
// schema version, retrying cannot help — the event goes straight to the DLQ.
// See requiredFieldExemptTopics in StartConsumers for the one topic (dlq.event)
// this check does not apply to.
var errMissingRequiredField = errors.New("missing required event field")

// errUnapprovedLegacySchema is the sentinel wrapped into the synthetic error
// consumeSingleTopic raises when a live (non-exempt) topic's message has an
// empty or literal "legacy" schema_version and source_service is not on the
// configured backfill allow-list (INTEL-06). Unlike errMissingRequiredField,
// this isn't about a field being absent — trace_id/tenant_id/source_service
// may all be present — it's specifically about an unapproved source claiming
// legacy/no-version status on a topic that requires a real one.
var errUnapprovedLegacySchema = errors.New("unapproved legacy schema_version")

// extractEnvelopeFieldsBestEffort tries to pull the domain event_type,
// schema_version, and trace_id out of raw message bytes without knowing the
// topic's real shape — same best-effort, topic-agnostic idiom as
// extractEventIDBestEffort below, used because the typed RelayEvent unmarshal
// only happens inside each topic's own handler closure in StartConsumers, not
// here.
//
// CORRECTION (INTEL-04 investigation): this doc previously claimed all three
// fields come back "" for both flat, non-RelayEvent-enveloped topics
// (dlq.event, payments.intent.dlq). That was only ever true for dlq.event
// (models.DLQEvent has no event_type/schema_version field at all — see
// requiredFieldExemptTopics in StartConsumers, which is why it's the one
// topic exempted from the INTEL-04 required-field gate). payments.intent.dlq
// is different: zord-relay's DLQItemEvent carries event_type/event_version/
// schema_version/trace_id as real flat top-level JSON fields (stamped by
// zord-intent-engine's DLQ lease handler), which this generic top-level
// probe successfully reads — verified against zord-relay/model/event.go's
// DLQItemEvent struct tags, which match this probe's field names exactly.
// For any topic without a real value, the caller falls back to the topic
// name and DefaultEventVersion.
//
// schema_version has a nested fallback: some producers (confirmed live
// 2026-08-06 for zord-outcome-engine-sourced events — variance.record.created,
// attachment.decision.created, canonical.settlement.created, etc.) set a real
// schema_version inside the envelope's "payload" object but never promote it
// to the envelope's own top level, so the top-level check alone silently
// under-reports it as "legacy" even though a real value exists one level
// down. trace_id deliberately has NO such fallback: the same live check found
// its nested payload value is independently just as unset (zord-outcome-
// engine's own uuid.Nil default) as the top-level one — a fallback there
// would just read a different flavor of the same non-value. That is an
// upstream data-quality gap (see the outcome-engine buildRow()/observation-
// lookup code), not an extraction-location gap, so no ZPI-side fallback fixes
// it.
//
// TENANT_ID (INTEL-03): unlike schema_version, tenant_id has no nested-
// payload fallback — every producer stamps it as a real top-level field
// (models.RelayEvent.TenantID for enveloped topics; a top-level tenant_id on
// the flat DLQEvent/DLQItemEvent/CorridorHealthTickEvent/SLATimerTickEvent
// shapes too), so the top-level probe alone is sufficient. This is the field
// buildDLQRecord below now uses for TenantID — the raw Kafka partition key
// is NOT a reliable tenant proxy: an audit of every zord-relay producer call
// site found most topics ZPI consumes are keyed by event_id/dlq_id/batch_id/
// dispatch_id, not tenant_id.
//
// SOURCE_SERVICE (INTEL-05): a real field on every RelayEvent-enveloped
// topic (models.RelayEvent.SourceService) and on the flat DLQItemEvent
// shape. Only dlq.event, corridor.health.tick, and sla.timer.tick genuinely
// carry no such field — the same three topics already exempted from this
// required-field gate. This is the domain producer identity (intent-engine,
// outcome-engine, evidence, ...); it must never be defaulted to
// "zord-relay", which is only the transport hop these events pass through —
// see SourceTopic for that.
//
// CORRECTION (live-traffic investigation after INTEL-05 shipped): this doc
// previously claimed source_service, like tenant_id, is always a top-level
// field with no nested fallback needed. False for zord-outcome-engine:
// confirmed against its outbox pipeline (zord-outcome-engine/models/
// outbox_model.go's OutboxEvent — the struct its Lease HTTP handler
// serializes for zord-relay to republish — has no top-level source_service
// field at all, only event_version/schema_version, which the handler stamps
// as producer-constants the same way; source_service was simply never added
// there). Every zord-outcome-engine outbox builder DOES set source_service
// correctly, but only inside the payload map it JSON-marshals into the
// event's nested payload column — so it never reaches the envelope's own
// top level. Given the same nested fallback already exists for
// schema_version below (needed for the identical reason, on the identical
// producer), source_service gets one too.
func extractEnvelopeFieldsBestEffort(payload []byte) (eventType, schemaVersion, traceID, tenantID, sourceService string) {
	var v struct {
		EventType     string          `json:"event_type"`
		SchemaVersion string          `json:"schema_version"`
		TraceID       string          `json:"trace_id"`
		TenantID      string          `json:"tenant_id"`
		SourceService string          `json:"source_service"`
		Payload       json.RawMessage `json:"payload"`
	}
	_ = json.Unmarshal(payload, &v)

	schemaVersion = v.SchemaVersion
	sourceService = v.SourceService
	if (schemaVersion == "" || sourceService == "") && len(v.Payload) > 0 {
		var nested struct {
			SchemaVersion string `json:"schema_version"`
			SourceService string `json:"source_service"`
		}
		if json.Unmarshal(v.Payload, &nested) == nil {
			if schemaVersion == "" {
				schemaVersion = nested.SchemaVersion
			}
			if sourceService == "" {
				sourceService = nested.SourceService
			}
		}
	}

	return v.EventType, schemaVersion, v.TraceID, v.TenantID, sourceService
}

// buildDLQRecord assembles the durable failure record for msg.
//
// TenantID (INTEL-03) is read from meta.TenantID — the envelope-derived
// value extracted by extractEnvelopeFieldsBestEffort and carried via
// EnvelopeMeta — NOT from msg.Key. A prior version of this function cast
// msg.Key directly to TenantID on the claim that "every producer uses
// tenant_id as the partition key"; an audit of every zord-relay producer
// call site showed that's false for most topics ZPI consumes (they key by
// event_id/dlq_id/batch_id/dispatch_id instead), so that cast frequently
// mislabeled DLQ records with the wrong tenant. The raw key is still
// captured, just under PartitionKey — transport routing metadata, not
// tenant identity. EventID is recovered best-effort via a minimal,
// topic-agnostic decode, working for both RelayEvent-enveloped topics and
// the flat DLQItemEvent-shaped ones without touching any of the per-topic
// closures in StartConsumers.
func buildDLQRecord(msgCtx context.Context, msg kafka.Message, handlerErr error) models.IntelligenceDLQRecord {
	meta := models.EnvelopeMetaFromContext(msgCtx)
	errClass := models.DLQErrorClassHandler
	switch {
	case isUnmarshalError(handlerErr):
		errClass = models.DLQErrorClassUnmarshal
	case errors.Is(handlerErr, errUnsupportedSchemaVersion):
		errClass = models.DLQErrorClassUnsupportedVersion
	case errors.Is(handlerErr, errMissingRequiredField):
		errClass = models.DLQErrorClassMissingField
	case errors.Is(handlerErr, errUnapprovedLegacySchema):
		errClass = models.DLQErrorClassUnapprovedLegacySchema
	}
	errMsg := handlerErr.Error()
	const maxErrLen = 2000
	if len(errMsg) > maxErrLen {
		errMsg = errMsg[:maxErrLen]
	}
	return models.IntelligenceDLQRecord{
		TenantID:     meta.TenantID,
		PartitionKey: string(msg.Key),
		SourceTopic:  msg.Topic,
		Partition:    msg.Partition,
		Offset:       msg.Offset,
		EventID:      extractEventIDBestEffort(msg.Value),
		EventType:    meta.EventType,
		EventVersion: meta.EventVersion,
		PayloadHash:  meta.PayloadHash,
		Payload:      string(msg.Value),
		ErrorClass:   errClass,
		ErrorMessage: errMsg,
		OccurredAt:   time.Now().UTC(),
	}
}

// extractEventIDBestEffort tries to pull an "event_id" field out of raw
// message bytes without knowing the topic's real shape. Returns "" on any
// failure — this is metadata for the DLQ record, never used for control
// flow, so a miss here is not fatal.
func extractEventIDBestEffort(payload []byte) string {
	var v struct {
		EventID string `json:"event_id"`
	}
	_ = json.Unmarshal(payload, &v)
	return v.EventID
}

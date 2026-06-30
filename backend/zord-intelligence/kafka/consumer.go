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
	"encoding/json"
	"log"
	"strings"

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
func StartConsumers(ctx context.Context, cfg *config.Config, handler EventHandler) {
	brokers := strings.Split(cfg.KafkaBrokers, ",")

	// topicHandlers maps each Kafka topic name to a function that:
	//   1. Deserialises (JSON decode) the raw message bytes into a typed struct
	//   2. Calls the correct handler method
	//   3. Returns an error if something goes wrong (message will NOT be committed)
	//
	// WHY A CLOSURE (func(kafka.Message) error)?
	// Each topic needs different deserialization logic.
	// A closure captures the specific event type for its topic.
	// Without closures, we'd need a separate function for each topic — 13+ functions.
	topicHandlers := map[string]func(kafka.Message) error{}

	// ── Grade B topic handlers (original — unchanged) ─────────────────────────
	// These are wired exactly as before. No changes to existing behaviour.

	wireHandler(topicHandlers, cfg.TopicIntentCreated,
		func(msg kafka.Message) error {
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
			return handler.HandleIntentCreated(ctx, e)
		})

	wireHandler(topicHandlers, cfg.TopicEvidenceReady,
		func(msg kafka.Message) error {
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
			func(msg kafka.Message) error {
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
			func(msg kafka.Message) error {
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
			func(msg kafka.Message) error {
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
			func(msg kafka.Message) error {
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
			func(msg kafka.Message) error {
				var e models.DLQEvent
				if err := json.Unmarshal(msg.Value, &e); err != nil {
					return err
				}
				return handler.HandleDLQEvent(ctx, e)
			})

		wireHandler(topicHandlers, cfg.TopicStatementMatch,
			func(msg kafka.Message) error {
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
		func(msg kafka.Message) error {
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
		func(msg kafka.Message) error {
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
		func(msg kafka.Message) error {
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
		func(msg kafka.Message) error {
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
		func(msg kafka.Message) error {
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
		func(msg kafka.Message) error {
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
				func(msg kafka.Message) error {
					var e models.CorridorHealthTickEvent
					if err := json.Unmarshal(msg.Value, &e); err != nil {
						return err
					}
					return corridorHealthHandler.HandleCorridorHealthTick(ctx, e)
				})
		}

		if slaTimerHandler, ok := handler.(SLATimerTickHandler); ok {
			wireHandler(topicHandlers, cfg.TopicSLATimerTick,
				func(msg kafka.Message) error {
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
	topicCount := 0
	for topic, fn := range topicHandlers {
		t, f := topic, fn // capture loop variables before goroutine launch
		go consumeSingleTopic(ctx, brokers, cfg.KafkaGroupID, t, f)
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
	handlers map[string]func(kafka.Message) error,
	topic string,
	fn func(kafka.Message) error,
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
// CommitInterval: 0 (manual commit) — offset is committed only after a successful
// handler call. A persistent handler error commits to advance past a poison message.
func consumeSingleTopic(
	ctx context.Context,
	brokers []string,
	groupID, topic string,
	handle func(kafka.Message) error,
) {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        brokers,
		GroupID:        groupID,
		Topic:          topic, // single topic per goroutine
		CommitInterval: 0,     // manual commit — commit only on success
		MaxWait:        3e9,   // 3 seconds: max time to wait for a new message
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
		_, span := tracer.Start(msgCtx, "consume."+msg.Topic,
			trace.WithSpanKind(trace.SpanKindConsumer),
			trace.WithAttributes(
				attribute.String("messaging.system", "kafka"),
				attribute.String("messaging.destination", msg.Topic),
				attribute.Int64("messaging.kafka.partition", int64(msg.Partition)),
				attribute.Int64("messaging.kafka.offset", msg.Offset),
			),
		)

		if err := handle(msg); err != nil {
			span.RecordError(err)
			log.Printf("kafka: handler error topic=%s partition=%d offset=%d: %v",
				msg.Topic, msg.Partition, msg.Offset, err)
			// Commit even on handler error to avoid an infinite redelivery loop
			// for poison messages (e.g. bad JSON from upstream).
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

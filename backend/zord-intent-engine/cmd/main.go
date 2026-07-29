package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"zord-intent-engine/internal/auth"
	"zord-intent-engine/internal/models"
	"zord-intent-engine/internal/services"
	"zord-intent-engine/internal/validator"
	"zord-intent-engine/internal/vault"
	"zord-intent-engine/kafka"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	"zord-intent-engine/config"
	"zord-intent-engine/db"
	"zord-intent-engine/internal/handlers"

	"zord-intent-engine/internal/etl"
	"zord-intent-engine/internal/persistence"
	"zord-intent-engine/internal/worker"

	//"zord-intent-engine/internal/pii"

	"zord-intent-engine/storage"
	"zord-intent-engine/tracing"

	"github.com/pressly/goose/v3"
)

func main() {
	// -------- INIT --------
	cleanup := tracing.InitTracing("zord-intent-engine")
	defer cleanup()

	config.InitDB()
	goose.SetBaseFS(nil)
	if err := goose.SetDialect("postgres"); err != nil {
		log.Fatal("goose dialect error:", err)
	}
	if err := goose.Up(db.DB, "db/migrations"); err != nil {
		log.Fatal("migrations failed:", err)
	}

	cfg := config.LoadConfig()

	err := vault.InitVaultKey(cfg.VaultKey)
	if err != nil {
		log.Fatal("failed to initialize vault key:", err)
	}

	// R-01: every public, tenant-scoped handler must run behind a verified
	// principal. Fail startup rather than silently serve with auth disabled.
	if err := auth.InitJWTSigningSecret(); err != nil {
		log.Fatal("failed to initialize JWT signing secret:", err)
	}

	if err := services.InitTokenizedDataHashMasterSecret(); err != nil {
		log.Fatal("failed to initialize tokenized data hash master secret:", err)
	}

	ctx := context.Background()

	// Seed built-in mapping profiles (TALLY, SAP, etc.) from global_profiles.json
	// into mapping_profiles so they resolve with a real, persisted profile_hash
	// instead of only existing as an in-memory fallback. Non-fatal: the
	// in-memory fallback still works if this fails.
	if err := services.SeedGlobalMappingProfilesFromFile(ctx, db.DB); err != nil {
		log.Printf("⚠️ Failed to seed global mapping profiles: %v", err)
	}

	brokers := strings.Split(os.Getenv("KAFKA_BROKERS"), ",")
	topic := os.Getenv("KAFKA_TOPIC")
	groupID := "intent-engine-group"

	resultTopic := "pii.tokenize.result"

	// -------- Repositories --------
	dlqRepo := persistence.NewDLQRepo(db.DB)
	intentRepo := persistence.NewPaymentIntentRepo(db.DB)
	intentQueryRepo := persistence.NewIntentQueryRepo(db.DB)
	outboxPullRepo := persistence.NewOutboxPullRepo(db.DB)
	dlqPullRepo := persistence.NewDLQPullRepo(db.DB)
	batchPullRepo := persistence.NewBatchPullRepo(db.DB)
	consumerFailureRepo := persistence.NewConsumerFailureRepo(db.DB)
	tenantDailyUsageRepo := persistence.NewTenantDailyUsageRepo(db.DB)

	// -------- Validator --------
	intentValidator := validator.NewValidator(dlqRepo)

	// -------- PII Tokenizer --------
	//tokenizer, err := pii.NewTokenizer(os.Getenv("PII_TOKEN_SECRET"))
	// if err != nil {
	// 	log.Fatal("failed to init PII tokenizer:", err)
	// }

	// -------- Intent Service --------
	//------Initializing s3
	s3store, err := storage.NewS3Store(
		ctx,
		os.Getenv("CANNONICALS3_BUCKET"),
		os.Getenv("NIRS3_BUCKET"),
		os.Getenv("GOVERNANCES3_BUCKET"),
		os.Getenv("AWS_REGION"),
	)
	if err != nil {
		log.Fatal(err)
	}

	producer, err := kafka.NewProducer(brokers)
	if err != nil {
		log.Fatalf("Failed to create Kafka producer: %v", err)
	}

	tokenizeQueue := services.NewKafkaTokenizeQueue(producer)
	intentService := services.NewIntentService(
		intentValidator,
		intentRepo,
		s3store,
		tokenizeQueue,
		db.DB,
		tenantDailyUsageRepo,
	)

	// -------- DLQ HTTP (READ-ONLY) --------
	dlqHandler := handlers.NewDLQHandler(dlqRepo)
	intentHandler := handlers.NewIntentHandler(intentQueryRepo)
	outboxHandler := handlers.NewOutboxHandler(outboxPullRepo)
	dlqOutboxHandler := handlers.NewDLQOutboxHandler(dlqPullRepo)
	batchOutboxHandler := handlers.NewBatchOutboxHandler(batchPullRepo)

	runRepo := etl.NewRunRepository(db.DB)
	airflowWorker := worker.NewAirflowWorker(outboxPullRepo, runRepo)
	airflowHandler := handlers.NewAirflowHandler(airflowWorker)
	normHandler := handlers.NewNormalizationHandler(db.DB)

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)

		response := map[string]interface{}{
			"service": "zord-intent-engine",
			"status":  "healthy",
			"time":    time.Now().UTC(),
		}

		if err := json.NewEncoder(w).Encode(response); err != nil {
			http.Error(w, "failed to encode health response", http.StatusInternalServerError)
		}
	})

	// R-01: these routes carry tenant-scoped payment data and are reachable
	// either through the public Kong gateway (/v1/*) or directly by
	// zord-console's server (/api/prod/intents/*) — both must run behind a
	// verified principal so a caller-supplied tenant_id can never diverge
	// from the tenant the caller is actually authenticated as.
	// /internal/* routes are deliberately NOT wrapped here — R-02 covers
	// those with a separate internal-service-token check, not end-user JWTs.
	mux.HandleFunc("/v1/dlq", auth.Protect(dlqHandler.List))
	mux.HandleFunc("/v1/dlq/manual-review", auth.Protect(dlqHandler.GetManualReviewDLQ))
	mux.HandleFunc("/v1/dlq/terminal/count", auth.Protect(dlqHandler.GetTerminalDLQCount))
	mux.HandleFunc("/v1/dlq/", auth.Protect(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/dlq" || r.URL.Path == "/v1/dlq/" {
			dlqHandler.List(w, r)
		} else {
			dlqHandler.GetByID(w, r) // NEW: /v1/dlq/{dlq_id}
		}
	}))
	mux.HandleFunc("/v1/intents/", auth.Protect(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/intents" || r.URL.Path == "/v1/intents/" {
			intentHandler.List(w, r)
		} else {
			intentHandler.GetByID(w, r)
		}
	}))
	mux.HandleFunc("/v1/intents", auth.Protect(intentHandler.List))
	// R-02: cross-tenant internal reads require a signed internal service
	// token + explicit scope, not just gateway-route obscurity.
	mux.HandleFunc("/internal/dlq/count", auth.RequireInternalScope(auth.ScopeIntentReadCrossTenant, dlqHandler.CountAll))
	mux.HandleFunc("/internal/outbox/lease", outboxHandler.Lease)
	mux.HandleFunc("/internal/outbox/ack", outboxHandler.Ack)
	mux.HandleFunc("/internal/outbox/nack", outboxHandler.Nack)
	mux.HandleFunc("/internal/dlq/lease", dlqOutboxHandler.Lease)
	mux.HandleFunc("/internal/dlq/ack", dlqOutboxHandler.Ack)
	mux.HandleFunc("/internal/dlq/nack", dlqOutboxHandler.Nack)
	mux.HandleFunc("/internal/relay/canonical_batches/lease", batchOutboxHandler.Lease)
	mux.HandleFunc("/internal/relay/canonical_batches/ack", batchOutboxHandler.Ack)
	mux.HandleFunc("/internal/relay/canonical_batches/nack", batchOutboxHandler.Nack)
	mux.HandleFunc("/api/prod/intents/batch-ids", auth.Protect(intentHandler.ListBatchIDs))
	mux.HandleFunc("/api/prod/intents/payment-intents", auth.Protect(intentHandler.ListPaymentIntentLiteByBatch))
	mux.HandleFunc("/api/prod/intents/dlq-items", auth.Protect(intentHandler.ListDLQItemsByBatchSimple))
	mux.HandleFunc("/internal/airflow/transform", airflowHandler.Transform)
	mux.HandleFunc("/internal/normalization/quality", normHandler.Quality)

	// ── Admin: Mapping Profile CRUD ───────────────────────────────────────────
	profileHandler := handlers.NewMappingProfileHandler(db.DB)
	mux.HandleFunc("/v1/admin/mapping-profiles", profileHandler.ListOrCreate)
	mux.HandleFunc("/v1/admin/mapping-profiles/", profileHandler.GetUpdateOrDeactivate)

	// ── Admin: Tenant Synonym CRUD ────────────────────────────────────────────
	tenantSynonymHandler := handlers.NewTenantSynonymHandler(db.DB)
	mux.HandleFunc("/v1/admin/tenant-synonyms", tenantSynonymHandler.ListOrCreate)
	mux.HandleFunc("/v1/admin/tenant-synonyms/", tenantSynonymHandler.Deactivate)

	// ── Admin: R-05 held-intent approval ──────────────────────────────────────
	intentApprovalHandler := handlers.NewIntentApprovalHandler(intentService)
	mux.HandleFunc("/v1/admin/intents/", auth.Protect(intentApprovalHandler.Approve))

	handler := func(msg []byte) error {
		var event models.Event
		err := json.Unmarshal(msg, &event)
		if err != nil {
			log.Printf("Invalid Kafka event payload: %v", err)
			return err
		}

		log.Printf("edge event consumed [event_id=%s event_type=%s trace_id=%s tenant_id=%s envelope_id=%s]",
			event.EventID, event.EventType, event.TraceID, event.TenantID, event.EnvelopeID)

		canonical, dlq, err := intentService.ProcessIncomingIntent(ctx, &event)
		if err != nil {
			log.Printf("System error processing intent: %v\n", err)
			return err // Return error to Kafka consumer so it doesn't MarkMessage
		}

		if dlq != nil {
			log.Printf("⚠️ Intent rejected [tenant=%s envelope=%s reason=%s]", event.TenantID, event.EnvelopeID, dlq.ReasonCode)
			if dlq.DLQID == "" {
				if dlq.TenantID == "" {
					dlq.TenantID = event.TenantID.String()
				}
				if dlq.EnvelopeID == "" {
					dlq.EnvelopeID = event.EnvelopeID.String()
				}
				if dlq.ClientBatchRef == "" && event.BatchID != nil {
					dlq.ClientBatchRef = *event.BatchID
				}
				if dlq.BatchID == "" && event.BatchID != nil {
					dlq.BatchID = *event.BatchID
				}
				_, err := dlqRepo.Save(ctx, *dlq)
				if err != nil {
					log.Printf("Failed to save DLQ entry: %v", err)
				}
			}
			return nil // Reject is a terminal state, return nil so message is marked
		}

		if canonical == nil {
			log.Printf("Tokenization queued for async processing [envelope=%s]", event.EnvelopeID)
		} else {
			log.Printf("Intent processed successfully [intent_id=%s envelope=%s]", canonical.IntentID, event.EnvelopeID)
		}

		return nil
	}

	resultHandler := func(msg []byte) error {

		var event models.TokenizeResultEvent

		err := json.Unmarshal(msg, &event)
		if err != nil {
			log.Printf("Invalid tokenize result event: %v", err)
			return err
		}

		log.Printf("Received tokenize result for envelope=%s", event.EnvelopeID)

		_, err = intentService.ProcessTokenizeResult(ctx, &event)
		if err != nil {
			log.Printf("Failed to process tokenize result: %v", err)
			return err
		}

		return nil
	}

	// R-03: durable failure recording for the main event topic — event_id,
	// tenant_id and trace_id come from models.Event when the payload parses;
	// a payload that doesn't even unmarshal still gets a durable record,
	// keyed by topic:partition:offset instead of event_id.
	recordEventFailure := newFailureRecorder(consumerFailureRepo, func(payload []byte) (eventID, tenantID, traceID string) {
		var event models.Event
		if err := json.Unmarshal(payload, &event); err != nil {
			return "", "", ""
		}
		return event.EventID, event.TenantID.String(), event.TraceID.String()
	})

	err = kafka.StartConsumer(
		ctx,
		brokers,
		groupID,
		topic,
		handler,
		recordEventFailure,
	)
	if err != nil {
		log.Fatalf("Kafka consumer failed: %v", err)
	}
	log.Println("Kafka consumer started")

	// -------- TOKENIZE RESULT CONSUMER --------

	// R-03: same durable-failure requirement as the main consumer.
	// TokenizeResultEvent has no event_id field, so its IdempotencyKey
	// stands in for one; falls back to topic:partition:offset if even that
	// isn't present or the payload doesn't parse.
	recordTokenizeResultFailure := newFailureRecorder(consumerFailureRepo, func(payload []byte) (eventID, tenantID, traceID string) {
		var event models.TokenizeResultEvent
		if err := json.Unmarshal(payload, &event); err != nil {
			return "", "", ""
		}
		return event.IdempotencyKey, event.TenantID, event.TraceID
	})

	go func() {
		err := kafka.StartConsumer(
			ctx,
			brokers,
			"intent-engine-tokenize-result-group",
			resultTopic,
			resultHandler,
			recordTokenizeResultFailure,
		)
		if err != nil {
			log.Fatalf("Kafka tokenize result consumer failed: %v", err)
		}
		log.Println("Kafka tokenize result consumer started")
	}()

	// -------- HTTP SERVER --------
	log.Println("Intent Engine (Service-2) running on :8083")
	server := &http.Server{
		Addr:    ":8083",
		Handler: otelhttp.NewHandler(mux, "http"),
	}
	log.Fatal(server.ListenAndServe())
}

// newFailureRecorder builds a kafka.FailureRecorder (R-03) that durably
// writes a permanently-failed message to consumer_failure_receipts before
// kafka.ConsumeClaim is allowed to mark it. parse extracts whatever
// event_id/tenant_id/trace_id the specific topic's payload schema carries —
// the main event topic and the tokenize-result topic use different Go
// types, so each StartConsumer call supplies its own parse func while
// sharing this same recording/idempotency logic.
func newFailureRecorder(
	repo persistence.ConsumerFailureRepository,
	parse func(payload []byte) (eventID, tenantID, traceID string),
) kafka.FailureRecorder {
	return func(ctx context.Context, f kafka.PermanentFailure) error {
		eventID, tenantID, traceID := parse(f.Value)

		headerMap := make(map[string]string, len(f.Headers))
		for _, h := range f.Headers {
			headerMap[string(h.Key)] = string(h.Value)
		}
		headersJSON, _ := json.Marshal(headerMap)

		errorCategory := "PROCESSING_ERROR"
		if eventID == "" && tenantID == "" && traceID == "" {
			// parse() only returns all-empty when the payload itself didn't
			// unmarshal — a real processing failure always resolves at
			// least a tenant_id, since ProcessIncomingIntent needs one too.
			errorCategory = "PAYLOAD_UNMARSHAL_ERROR"
		}

		return repo.Record(ctx, models.ConsumerFailureReceipt{
			IdempotencyKey: persistence.FailureIdempotencyKey(eventID, f.Topic, f.Partition, f.Offset),
			EventID:        eventID,
			Topic:          f.Topic,
			Partition:      f.Partition,
			Offset:         f.Offset,
			TenantID:       tenantID,
			TraceID:        traceID,
			Payload:        f.Value,
			PayloadHash:    persistence.HashPayload(f.Value),
			HeadersJSON:    headersJSON,
			ErrorCategory:  errorCategory,
			ErrorMessage:   f.LastError.Error(),
			AttemptCount:   f.Attempts,
			LastAttemptAt:  time.Now().UTC(),
		})
	}
}

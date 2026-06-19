package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/config"
	"github.com/zord/zord-intelligence/db"
	"github.com/zord/zord-intelligence/internal/handlers"
	"github.com/zord/zord-intelligence/internal/mlclient"
	"github.com/zord/zord-intelligence/internal/persistence"
	"github.com/zord/zord-intelligence/internal/services"
	"github.com/zord/zord-intelligence/internal/worker"
	kafkapkg "github.com/zord/zord-intelligence/kafka"
	"github.com/zord/zord-intelligence/tracing"
)

func init() {
	// Marshal decimal.Decimal as a JSON number (785000) not a quoted string ("785000").
	// This preserves the existing API contract for all amount fields.
	decimal.MarshalJSONWithoutQuotes = true
}

func main() {
	// ── OpenTelemetry ──────────────────────────────────────────────────────
	cleanupTracing := tracing.InitTracing("zord-intelligence")
	defer cleanupTracing()

	// ── Step 1: Load .env file ─────────────────────────────────────────────
	if err := godotenv.Load(); err != nil {
		log.Println("main: no .env file found — using system environment variables")
	}

	// ── Step 2: Load config ────────────────────────────────────────────────
	// PHASE 6: config.Load() now reads INTELLIGENCE_MODE and logs it at startup.
	// Default is GRADE_A — safe for all new deployments.
	cfg := config.Load()
	log.Printf("main: config loaded (env=%s port=%s mode=%s)",
		cfg.Environment, cfg.HTTPPort, cfg.IntelligenceMode.String())

	requiredTopics := []string{
		// ── Input topics (Grade B — original dispatch/finality mode) ──────────
		cfg.TopicIntentCreated,
		cfg.TopicDispatchCreated,
		cfg.TopicOutcomeNormalized,
		cfg.TopicFinalityCert,
		cfg.TopicFinalContract,
		cfg.TopicEvidenceReady,
		cfg.TopicDLQ,
		cfg.TopicStatementMatch,
		cfg.TopicCorridorHealthTick,
		cfg.TopicSLATimerTick,

		// ── Input topics (Grade A — Phase 2 attachment intelligence mode) ─────
		cfg.TopicSettlementCreated,
		cfg.TopicAttachmentDecision,
		cfg.TopicVarianceRecord,
		cfg.TopicBatchSummary,
		cfg.TopicGovernanceDecision,

		// ── Output topics (actuation — ZPI publishes TO these) ────────────────
		cfg.TopicActuationAlert,
		cfg.TopicActuationRetry,
		cfg.TopicActuationEvidence,
		cfg.TopicActuationBatchPatch,

		// ── ML service topics (request-reply with Python ml-service) ──────────
		cfg.TopicMLRequest,
		cfg.TopicMLResult,
	}
	requiredTopics = activeTopicsForMode(cfg)

	if err := ensureTopicsWithRetry(cfg.KafkaBrokers, requiredTopics, 10, 2*time.Second); err != nil {
		log.Fatalf("main: kafka topic ensure failed after retries: %v", err)
	}

	// ── Step 3: Connect to PostgreSQL ──────────────────────────────────────
	pool := db.Connect(cfg)
	defer pool.Close()
	db.EnsureSchema(context.Background(), pool)
	db.ValidateSchema(context.Background(), pool)
	db.EnsureProductionIndexes(context.Background(), pool)
	syncIntelligenceMode(context.Background(), pool, string(cfg.IntelligenceMode))

	// ── Step 4: Create repositories ───────────────────────────────────────
	projRepo := persistence.NewProjectionRepo(pool)
	policyRepo := persistence.NewPolicyRepo(pool)
	actionRepo := persistence.NewActionContractRepo(pool)
	outboxRepo := persistence.NewOutboxRepo(pool)
	slaRepo := persistence.NewSLATimerRepo(pool)

	// ── PHASE 4 & 7: New intelligence repos ───────────────────────────────
	snapshotRepo := persistence.NewIntelligenceSnapshotRepo(pool)
	batchRepo := persistence.NewBatchContractRepo(pool)
	mlRepo := persistence.NewMLFeatureStoreRepo(pool)
	predRepo := persistence.NewMLPredictionRepo(pool)
	explRepo := persistence.NewIntelligenceExplanationRepo(pool)

	// ── Performance: BatchWriter (5ms flush window for high-volume INSERTs) ──
	// Groups concurrent intelligence_snapshot, batch_contract, and projection_state
	// writes into single pgx.SendBatch calls — reduces DB round-trips ~50x at scale.
	batchWriter := persistence.NewBatchWriter(pool)
	batchWriter.Start(context.Background())
	defer batchWriter.Stop()
	snapshotRepo.SetBatchWriter(batchWriter)
	batchRepo.SetBatchWriter(batchWriter)
	projRepo.SetBatchWriter(batchWriter)

	// ── Step 5: Create ML client (request-reply over Kafka with Python ml-service)
	mlClient := mlclient.New(cfg.KafkaBrokers, cfg.TopicMLRequest, cfg.TopicMLResult, cfg.KafkaGroupID)
	mlClient.Start(context.Background())
	defer mlClient.Close()

	// ── Step 6: Create services ────────────────────────────────────────────
	actionService := services.NewActionService(actionRepo, outboxRepo, pool)
	policyService := services.NewPolicyService(policyRepo, projRepo, actionService)

	// ── PHASE 4 & 7: Six intelligence layer services + Explanation ────────
	leakageSvc := services.NewLeakageIntelligenceService(projRepo, snapshotRepo, mlRepo, predRepo, mlClient, batchRepo)
	leakagePredSvc := services.NewLeakagePredictionService(batchRepo, projRepo, mlRepo, predRepo, mlClient)
	ambiguitySvc := services.NewAmbiguityIntelligenceService(context.Background(), projRepo, snapshotRepo, mlRepo, predRepo, mlClient)
	defensibilitySvc := services.NewDefensibilityIntelligenceService(projRepo, snapshotRepo, batchRepo)
	rcaSvc := services.NewRCAIntelligenceService(projRepo, snapshotRepo, mlClient)
	patternSvc := services.NewPatternIntelligenceService(projRepo, snapshotRepo, batchRepo, mlRepo, predRepo, mlClient, slaRepo)
	recommendationSvc := services.NewRecommendationIntelligenceService(snapshotRepo)
	explSvc := services.NewExplanationService(explRepo, snapshotRepo, batchRepo)

	// PHASE 6: NewProjectionService now receives cfg.IntelligenceMode.
	// This controls which intelligence computation runs inside the Grade B handlers.
	// Grade A mode: finality-grade projections are skipped (safe default).
	// Grade B mode: all projections computed (requires dispatch + finality certs).
	projectionService := services.NewProjectionService(
		projRepo,
		batchRepo,
		policyService,
		slaRepo,
		leakageSvc,
		leakagePredSvc,
		ambiguitySvc,
		defensibilitySvc,
		rcaSvc,
		patternSvc,
		recommendationSvc,
		cfg.IntelligenceMode, // PHASE 6: inject mode
	)

	corridorHealthIngestionHandler := handlers.NewCorridorHealthHandler(projRepo)
	slaTimerIngestionHandler := handlers.NewSLATimerHandler(projRepo)
	kafkaIngestionHandler := handlers.NewKafkaIngestionHandler(
		projectionService,
		corridorHealthIngestionHandler,
		slaTimerIngestionHandler,
	)

	// ── Step 6: Create Kafka producer ──────────────────────────────────────
	producer := kafkapkg.NewProducer(cfg.KafkaBrokers)
	defer func() {
		if err := producer.Close(); err != nil {
			log.Printf("main: producer close error: %v", err)
		}
	}()

	// ── Step 7: Create background workers ─────────────────────────────────
	outboxWorker := worker.NewOutboxWorker(outboxRepo, actionRepo, producer, cfg, projRepo)
	slaWorker := worker.NewSLAWorker(slaRepo, actionService, projectionService)
	cronWorker := worker.NewPolicyCronWorker(projRepo, policyService)

	// ── Step 8: Create HTTP handlers ──────────────────────────────────────
	healthHandler := handlers.NewHealthHandler()

	// PHASE 6: KPIHandler now receives mode so it can annotate responses
	// and enforce Grade B guards on finality-grade endpoints.
	kpiHandler := handlers.NewKPIHandler(projRepo, cfg.IntelligenceMode)

	policyHandler := handlers.NewPolicyHandler(policyRepo)
	actionHandler := handlers.NewActionHandler(actionRepo, actionService)

	// PHASE 6 & 7: New handlers for dual-mode architecture and separated intelligence layers
	modeHandler := handlers.NewIntelligenceModeHandler(projectionService, projRepo)

	intelBase := handlers.NewIntelligenceBase(projectionService, snapshotRepo)
	leakageHandler := handlers.NewLeakageHandler(intelBase, projRepo)
	ambiguityHandler := handlers.NewAmbiguityHandler(intelBase)
	defensibilityHandler := handlers.NewDefensibilityHandler(intelBase)
	rcaHandler := handlers.NewRCAHandler(intelBase)
	patternHandler := handlers.NewPatternHandler(intelBase)
	recommendationHandler := handlers.NewRecommendationHandler(intelBase)
	batchHandler := handlers.NewBatchHandler(batchRepo, projRepo, projectionService)
	leakageTimeseriesHandler := handlers.NewLeakageTimeseriesHandler(batchRepo)
	historyHandler := handlers.NewHistoryHandler(projectionService, snapshotRepo)
	explanationHandler := handlers.NewExplanationHandler(explSvc)

	// ── Dashboard handlers (frontend-facing /dashboard/ endpoints) ────────
	intelligenceMode := string(cfg.IntelligenceMode)
	dashLeakageH := handlers.NewDashboardLeakageHandler(snapshotRepo, intelligenceMode)
	dashAmbiguityH := handlers.NewDashboardAmbiguityHandler(snapshotRepo, batchRepo, projRepo, intelligenceMode)
	dashDefensibilityH := handlers.NewDashboardDefensibilityHandler(snapshotRepo, intelligenceMode)
	dashPatternH := handlers.NewDashboardPatternHandler(snapshotRepo, projRepo, intelligenceMode)
	dashRecommendationH := handlers.NewDashboardRecommendationHandler(actionRepo, snapshotRepo, intelligenceMode)
	dashRCAH := handlers.NewDashboardRCAHandler(snapshotRepo, intelligenceMode)
	dashBubbleMapH := handlers.NewDashboardBubbleMapHandler(batchRepo, intelligenceMode)
	dashBatchContractH := handlers.NewDashboardBatchContractHandler(batchRepo, intelligenceMode)

	// ── Step 9: Build the HTTP router ─────────────────────────────────────
	router := handlers.NewRouter(
		healthHandler,
		kpiHandler,
		policyHandler,
		actionHandler,
		modeHandler,
		leakageHandler,
		ambiguityHandler,
		defensibilityHandler,
		rcaHandler,
		patternHandler,
		recommendationHandler,
		batchHandler,
		leakageTimeseriesHandler,
		historyHandler,
		explanationHandler,
		dashLeakageH,
		dashAmbiguityH,
		dashDefensibilityH,
		dashPatternH,
		dashRecommendationH,
		dashRCAH,
		dashBubbleMapH,
		dashBatchContractH,
	)

	// ── Step 10: Create the HTTP server ───────────────────────────────────
	server := &http.Server{
		Addr:         ":" + cfg.HTTPPort,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// ── Step 11: Create a cancellable context ─────────────────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// ── Step 12: Start background workers ─────────────────────────────────
	go outboxWorker.Start(ctx)
	go slaWorker.Start(ctx)
	go cronWorker.Start(ctx)
	log.Println("main: background workers started (outbox + sla + policy-cron)")

	// ── Step 13: Start Kafka consumers ────────────────────────────────────
	kafkapkg.StartConsumers(ctx, cfg, kafkaIngestionHandler)
	log.Println("main: kafka consumers started")

	// ── Step 14: Start HTTP server ────────────────────────────────────────
	serverErrors := make(chan error, 1)
	go func() {
		log.Printf("main: HTTP server listening on :%s", cfg.HTTPPort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			serverErrors <- err
		}
	}()

	// ── Step 15: Wait for shutdown signal ─────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-quit:
		log.Printf("main: received signal %s — starting graceful shutdown", sig)
	case err := <-serverErrors:
		log.Printf("main: server error — %v", err)
	}

	// ── Step 16: Graceful shutdown ────────────────────────────────────────
	log.Println("main: cancelling context (stopping workers and consumers)")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	log.Println("main: shutting down HTTP server (waiting up to 30s for in-flight requests)")
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("main: HTTP server forced shutdown: %v", err)
	}

	time.Sleep(2 * time.Second)
	log.Println("main: shutdown complete")
	fmt.Println("zord-intelligence stopped cleanly")
}

// activeTopicsForMode returns the exact Kafka topics this runtime should touch.
//
// Grade A is intentionally strict: only the seven permitted upstream topics plus
// the actuation output topics are enabled. This avoids accidental use of
// final-truth/finality-grade inputs during a Grade A deployment.
func activeTopicsForMode(cfg *config.Config) []string {
	// ML service topics are always required, regardless of intelligence mode.
	topics := []string{
		cfg.TopicActuationAlert,
		cfg.TopicActuationRetry,
		cfg.TopicActuationEvidence,
		cfg.TopicActuationBatchPatch,
		cfg.TopicMLRequest,
		cfg.TopicMLResult,
	}

	if cfg.IntelligenceMode.IsGradeA() {
		return append(topics,
			cfg.TopicIntentCreated,
			cfg.TopicSettlementCreated,
			cfg.TopicAttachmentDecision,
			cfg.TopicVarianceRecord,
			cfg.TopicEvidenceReady,
			cfg.TopicGovernanceDecision,
			cfg.TopicBatchSummary,
			cfg.TopicDLQItem, // Pattern Intelligence: manual review events
		)
	}

	return append(topics,
		cfg.TopicIntentCreated,
		cfg.TopicDispatchCreated,
		cfg.TopicOutcomeNormalized,
		cfg.TopicFinalityCert,
		cfg.TopicFinalContract,
		cfg.TopicEvidenceReady,
		cfg.TopicDLQ,
		cfg.TopicStatementMatch,
		cfg.TopicCorridorHealthTick,
		cfg.TopicSLATimerTick,
		cfg.TopicSettlementCreated,
		cfg.TopicAttachmentDecision,
		cfg.TopicVarianceRecord,
		cfg.TopicBatchSummary,
		cfg.TopicGovernanceDecision,
		cfg.TopicDLQItem, // Pattern Intelligence: manual review events
	)
}

// syncIntelligenceMode keeps intelligence_mode_config in sync with the env var.
// If the current row already matches the env var mode, it's a no-op.
// If it differs (e.g. operator changed GRADE_A → GRADE_B), it closes the old
// row and inserts a new one, giving a timestamped audit trail of every transition.
func syncIntelligenceMode(ctx context.Context, pool *pgxpool.Pool, mode string) {
	var currentMode string
	err := pool.QueryRow(ctx,
		`SELECT mode FROM intelligence_mode_config WHERE is_current = true LIMIT 1`,
	).Scan(&currentMode)
	if err != nil {
		log.Printf("main: could not read intelligence_mode_config: %v", err)
		return
	}
	if currentMode == mode {
		return // already in sync — no-op
	}

	log.Printf("main: intelligence mode changed %s → %s — updating audit trail", currentMode, mode)

	_, err = pool.Exec(ctx, `
		UPDATE intelligence_mode_config SET is_current = false, ended_at = now()
		WHERE is_current = true
	`)
	if err != nil {
		log.Printf("main: failed to close old intelligence_mode_config row: %v", err)
		return
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO intelligence_mode_config (mode, is_current, initiated_by, notes)
		VALUES ($1, true, 'system', $2)
	`, mode, fmt.Sprintf("Mode changed from %s to %s on startup", currentMode, mode))
	if err != nil {
		log.Printf("main: failed to insert new intelligence_mode_config row: %v", err)
	}
}

// ensureTopicsWithRetry retries topic creation while Kafka is still booting.
func ensureTopicsWithRetry(
	brokers string,
	topics []string,
	maxAttempts int,
	delay time.Duration,
) error {
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		if err := kafkapkg.EnsureTopics(brokers, topics); err == nil {
			log.Printf("main: kafka topics ensured (%d configured)", len(topics))
			return nil
		} else {
			lastErr = err
			log.Printf("main: ensure topics attempt %d/%d failed: %v", attempt, maxAttempts, err)
		}
		if attempt < maxAttempts {
			time.Sleep(delay)
		}
	}
	return fmt.Errorf("ensure topics failed after %d attempts: %w", maxAttempts, lastErr)
}

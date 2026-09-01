package main

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"

	"zord-prompt-layer/client"
	"zord-prompt-layer/config"
	"zord-prompt-layer/handler"
	"zord-prompt-layer/internal/health"
	plmiddleware "zord-prompt-layer/middleware"
	"zord-prompt-layer/repositories"
	"zord-prompt-layer/routes"
	"zord-prompt-layer/services"
	"zord-prompt-layer/tools"
	"zord-prompt-layer/tracing"
)

func main() {
	_ = godotenv.Load(".env", "../.env")

	cfg := config.Load()
	keys := cfg.GeminiAPIKeys
	if len(keys) == 0 && strings.TrimSpace(cfg.GeminiAPIKey) != "" {
		keys = []string{cfg.GeminiAPIKey}
	}
	log.Printf("model=%s base_url=%s gemini_keys=%d", cfg.GeminiModel, cfg.GeminiBaseURL, len(keys))

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(
		gin.Recovery(),
		otelgin.Middleware(cfg.ServiceName),
	)
	router.Use(corsMiddleware())
	router.Use(plmiddleware.RequestIDMiddleware())
	router.Use(plmiddleware.MaxBodyBytesMiddleware(cfg.HTTPMaxBodyBytes))
	router.Use(plmiddleware.RequestTimeoutMiddleware(time.Duration(cfg.HTTPRequestTimeoutSeconds) * time.Second))

	cleanup := tracing.InitTracing(cfg.ServiceName)
	defer cleanup()

	healthHandler := handler.NewHealthHandler(cfg.ServiceName)

	geminiClient := client.NewGeminiClient(keys, cfg.GeminiModel, cfg.GeminiBaseURL)

	llmService := services.NewLLMService(geminiClient)
	intelligenceClient := client.NewIntelligenceClient(cfg.IntelligenceAPIBaseURL, cfg.IntelligenceAPITimeoutS)
	memoryStore, err := repositories.NewRedisChatMemoryStore(cfg.RedisURL, cfg.MemoryTTLSeconds, cfg.MemoryMaxTurns)
	if err != nil {
		log.Fatalf("failed connecting redis memory store: %v", err)
	}
	edgeDB := mustOpenReadOnlyDB("edge", cfg.EdgeReadDSN, cfg.DBStatementTimeoutMS, cfg.DBLockTimeoutMS)
	intentDB := mustOpenReadOnlyDB("intent-engine", cfg.IntentReadDSN, cfg.DBStatementTimeoutMS, cfg.DBLockTimeoutMS)
	relayDB := mustOpenReadOnlyDB("relay", cfg.RelayReadDSN, cfg.DBStatementTimeoutMS, cfg.DBLockTimeoutMS)

	intelligenceDB := mustOpenReadOnlyDB("intelligence", cfg.IntelligenceReadDSN, cfg.DBStatementTimeoutMS, cfg.DBLockTimeoutMS)
	evidenceDB := mustOpenReadOnlyDB("evidence", cfg.EvidenceReadDSN, cfg.DBStatementTimeoutMS, cfg.DBLockTimeoutMS)
	outcomeDB := mustOpenReadOnlyDB("outcome", cfg.OutcomeReadDSN, cfg.DBStatementTimeoutMS, cfg.DBLockTimeoutMS)
	liveRetriever := repositories.NewLiveSQLRetriever(edgeDB, intentDB, relayDB, intelligenceDB, evidenceDB, outcomeDB)
	vectorStateDB := mustOpenDB("vector-index-state", cfg.VectorIndexStateDSN)

	var vectorStateRepo repositories.VectorIndexStateRepository
	if vectorStateDB != nil {
		vectorStateRepo = repositories.NewPostgresVectorIndexStateRepository(vectorStateDB)
		if err := vectorStateRepo.EnsureSchema(context.Background()); err != nil {
			log.Printf("[prompt-layer][vector-index] state schema setup failed err=%v", err)
			vectorStateRepo = nil
		} else {
			log.Printf("[prompt-layer][vector-index] state db ready")
		}
	}
	var vectorRetriever services.VectorRetriever
	if strings.TrimSpace(cfg.PineconeAPIKey) != "" && strings.TrimSpace(cfg.PineconeHost) != "" {
		pineconeClient := client.NewPineconeClient(
			cfg.PineconeAPIKey,
			cfg.PineconeHost,
			cfg.PineconeNamespace,
			cfg.VectorRequestTimeoutSeconds,
		)

		vectorRetriever = repositories.NewPineconeVectorRetriever(
			geminiClient,
			pineconeClient,
			cfg.GeminiEmbeddingModel,
			cfg.GeminiEmbeddingDimension,
			cfg.VectorQueryTopK,
			cfg.VectorRequestTimeoutSeconds,
		)

		vectorIndexer := repositories.NewVectorIndexer(
			liveRetriever,
			geminiClient,
			pineconeClient,
			vectorStateRepo,
			cfg.PineconeNamespace,
			cfg.GeminiEmbeddingModel,
			cfg.GeminiEmbeddingDimension,
			cfg.VectorIndexIntervalSeconds,
			cfg.VectorIndexBatchSize,
			cfg.VectorIndexTimeoutSeconds,
		)

		vectorConsumer := repositories.NewVectorIndexConsumer(
			repositories.VectorIndexConsumerConfig{
				Brokers:    cfg.VectorIndexKafkaBrokers,
				Topic:      cfg.VectorIndexKafkaTopic,
				GroupID:    cfg.VectorIndexKafkaGroupID,
				MaxRetries: cfg.VectorIndexKafkaMaxRetries,
			},
			vectorIndexer,
		)
		vectorConsumer.Start(context.Background())
		go func() {
			interval := time.Duration(cfg.VectorIndexIntervalSeconds) * time.Second
			if interval <= 0 {
				interval = 5 * time.Minute
			}

			ticker := time.NewTicker(interval)
			defer ticker.Stop()

			log.Printf(
				"[prompt-layer][vector-index] deferred retry scheduler started interval_seconds=%d batch_size=%d timeout_seconds=%d",
				cfg.VectorIndexIntervalSeconds,
				cfg.VectorIndexBatchSize,
				cfg.VectorIndexTimeoutSeconds,
			)

			for range ticker.C {
				timeout := time.Duration(cfg.VectorIndexTimeoutSeconds) * time.Second
				if timeout <= 0 {
					timeout = 60 * time.Second
				}

				runCtx, cancel := context.WithTimeout(context.Background(), timeout)
				vectorIndexer.RetryDueRateLimited(runCtx, cfg.VectorIndexBatchSize)
				cancel()
			}
		}()

		log.Printf("[prompt-layer][vector] pinecone query retriever enabled host=%s namespace=%s top_k=%d timeout_seconds=%d", cfg.PineconeHost, cfg.PineconeNamespace, cfg.VectorQueryTopK, cfg.VectorRequestTimeoutSeconds)
	} else {
		log.Printf("[prompt-layer][vector] pinecone query retriever not configured; using sql-only retrieval")
	}

	retriever := services.NewHybridEvidenceRetriever(liveRetriever, vectorRetriever)
	ragService := services.NewDefaultRAGService(cfg.GeminiModel, cfg.DefaultTopK, retriever, llmService, intelligenceClient, memoryStore)
	ragService.SetReconClient(tools.NewOutcomeClient(cfg.OutcomeEngineBaseURL, cfg.OutcomeEngineToken), cfg.DefaultConnectorID)
	queryHandler := handler.NewQueryHandler(ragService)
	authCfg := plmiddleware.AuthConfig{
		SigningSecret: cfg.JWTSigningSecret,
		Issuer:        cfg.JWTIssuer,
		Audience:      cfg.JWTAudience,
	}
	routes.Register(router, healthHandler, queryHandler, authCfg)

	// Readiness endpoint — checks read-only DB connectivity
	var readinessChecks []health.DependencyCheck
	if edgeDB != nil {
		readinessChecks = append(readinessChecks, health.DBCheck("edge-db", edgeDB))
	}
	if intentDB != nil {
		readinessChecks = append(readinessChecks, health.DBCheck("intent-db", intentDB))
	}
	if relayDB != nil {
		readinessChecks = append(readinessChecks, health.DBCheck("relay-db", relayDB))
	}
	readinessH := health.NewReadinessHandler(readinessChecks)
	router.GET("/ready", readinessH.Ready)

	addr := ":" + cfg.HTTPPort
	log.Printf("starting %s on %s", cfg.ServiceName, addr)

	srv := &http.Server{
		Addr:              addr,
		Handler:           router,
		ReadHeaderTimeout: time.Duration(cfg.HTTPReadHeaderTimeoutSeconds) * time.Second,
		ReadTimeout:       time.Duration(cfg.HTTPReadTimeoutSeconds) * time.Second,
		WriteTimeout:      time.Duration(cfg.HTTPWriteTimeoutSeconds) * time.Second,
		IdleTimeout:       time.Duration(cfg.HTTPIdleTimeoutSeconds) * time.Second,
	}

	serverErr := make(chan error, 1)
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
			return
		}
		serverErr <- nil
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	select {
	case sig := <-stop:
		log.Printf("shutdown signal received signal=%s service=%s", sig.String(), cfg.ServiceName)

		shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()

		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Fatalf("server forced shutdown failed: %v", err)
		}

		log.Printf("server shutdown complete service=%s", cfg.ServiceName)

	case err := <-serverErr:
		if err != nil {
			log.Fatalf("server failed: %v", err)
		}
	}
}

func corsMiddleware() gin.HandlerFunc {
	allowedOrigins := map[string]struct{}{
		"http://localhost":      {},
		"http://localhost:80":   {},
		"http://127.0.0.1":      {},
		"http://127.0.0.1:80":   {},
		"http://localhost:3000": {},
		"http://127.0.0.1:3000": {},
	}

	return func(c *gin.Context) {
		origin := strings.TrimSpace(c.GetHeader("Origin"))
		if _, ok := allowedOrigins[origin]; ok {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
		}
		c.Header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Tenant-ID, X-User-ID, X-Session-ID")
		c.Header("Access-Control-Allow-Credentials", "true")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func mustOpenReadOnlyDB(name, dsn string, statementTimeoutMS, lockTimeoutMS int) *sql.DB {
	if dsn == "" {
		log.Printf("%s read-only DSN not configured; retriever will skip this source", name)
		return nil
	}

	hardenedDSN := hardenPostgresReadOnlyDSN(dsn, name, statementTimeoutMS, lockTimeoutMS)

	db, err := sql.Open("postgres", hardenedDSN)
	if err != nil {
		log.Fatalf("failed opening %s db: %v", name, err)
	}

	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)

	if err := db.Ping(); err != nil {
		log.Fatalf("failed pinging %s db: %v", name, err)
	}

	var readOnly string
	if err := db.QueryRow("SHOW default_transaction_read_only").Scan(&readOnly); err != nil {
		log.Fatalf("failed verifying %s read-only mode: %v", name, err)
	}
	if !strings.EqualFold(strings.TrimSpace(readOnly), "on") {
		log.Fatalf("%s db connection is not read-only; refusing to start prompt-layer", name)
	}

	log.Printf("%s read-only db connected with statement_timeout_ms=%d lock_timeout_ms=%d", name, statementTimeoutMS, lockTimeoutMS)
	return db
}
func hardenPostgresReadOnlyDSN(dsn, appName string, statementTimeoutMS, lockTimeoutMS int) string {
	if statementTimeoutMS <= 0 {
		statementTimeoutMS = 5000
	}
	if lockTimeoutMS <= 0 {
		lockTimeoutMS = 1000
	}

	if u, err := url.Parse(dsn); err == nil && u.Scheme != "" && u.Host != "" {
		q := u.Query()
		q.Set("default_transaction_read_only", "on")
		q.Set("statement_timeout", strconv.Itoa(statementTimeoutMS))
		q.Set("lock_timeout", strconv.Itoa(lockTimeoutMS))
		q.Set("idle_in_transaction_session_timeout", "5000")
		q.Set("application_name", "zord-prompt-layer-"+appName)
		u.RawQuery = q.Encode()
		return u.String()
	}

	parts := []string{
		dsn,
		"default_transaction_read_only=on",
		"statement_timeout=" + strconv.Itoa(statementTimeoutMS),
		"lock_timeout=" + strconv.Itoa(lockTimeoutMS),
		"idle_in_transaction_session_timeout=5000",
		"application_name=zord-prompt-layer-" + appName,
	}

	return strings.Join(parts, " ")
}
func mustOpenDB(name, dsn string) *sql.DB {
	if strings.TrimSpace(dsn) == "" {
		log.Printf("%s DSN not configured; vector index state dedupe disabled", name)
		return nil
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("failed opening %s db: %v", name, err)
	}

	if err := db.Ping(); err != nil {
		log.Fatalf("failed pinging %s db: %v", name, err)
	}

	log.Printf("%s db connected", name)
	return db
}

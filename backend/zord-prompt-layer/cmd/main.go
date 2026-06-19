package main

import (
	"database/sql"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"

	"zord-prompt-layer/client"
	"zord-prompt-layer/config"
	"zord-prompt-layer/handler"
	"zord-prompt-layer/repositories"
	"zord-prompt-layer/routes"
	"zord-prompt-layer/services"
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
	edgeDB := mustOpenReadOnlyDB("edge", cfg.EdgeReadDSN)
	intentDB := mustOpenReadOnlyDB("intent-engine", cfg.IntentReadDSN)
	relayDB := mustOpenReadOnlyDB("relay", cfg.RelayReadDSN)

	intelligenceDB := mustOpenReadOnlyDB("intelligence", cfg.IntelligenceReadDSN)
	evidenceDB := mustOpenReadOnlyDB("evidence", cfg.EvidenceReadDSN)
	outcomeDB := mustOpenReadOnlyDB("outcome", cfg.OutcomeReadDSN)
	retriever := repositories.NewLiveSQLRetriever(edgeDB, intentDB, relayDB, intelligenceDB, evidenceDB, outcomeDB)
	ragService := services.NewDefaultRAGService(cfg.GeminiModel, cfg.DefaultTopK, retriever, llmService, intelligenceClient, memoryStore)
	queryHandler := handler.NewQueryHandler(ragService)

	routes.Register(router, healthHandler, queryHandler)

	addr := ":" + cfg.HTTPPort
	log.Printf("starting %s on %s", cfg.ServiceName, addr)

	if err := router.Run(addr); err != nil {
		log.Fatalf("server failed to start: %v", err)
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

func mustOpenReadOnlyDB(name, dsn string) *sql.DB {
	if dsn == "" {
		log.Printf("%s read-only DSN not configured; retriever will skip this source", name)
		return nil
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("failed opening %s db: %v", name, err)
	}
	if err := db.Ping(); err != nil {
		log.Fatalf("failed pinging %s db: %v", name, err)
	}
	log.Printf("%s read-only db connected", name)
	return db
}

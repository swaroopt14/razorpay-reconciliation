package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"zord-edge/config"
	"zord-edge/db"
	"zord-edge/handler"
	"zord-edge/routes"
	"zord-edge/storage"
	"zord-edge/vault"
	"zord-edge/services"
	"zord-edge/tracing"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
)

var (
	// Prometheus metrics
	httpRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests",
		},
		[]string{"method", "endpoint", "status"},
	)

	httpRequestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name: "http_request_duration_seconds",
			Help: "Duration of HTTP requests in seconds",
		},
		[]string{"method", "endpoint"},
	)
)

func init() {
	// Register Prometheus metrics
	prometheus.MustRegister(httpRequestsTotal)
	prometheus.MustRegister(httpRequestDuration)
}

func main() {
	// Shutdown context — cancelled on SIGTERM/SIGINT.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Initialize tracing
	cleanup := tracing.InitTracing("zord-edge")
	defer cleanup()

	gin.SetMode(gin.ReleaseMode)
	server := gin.Default()
	server.Use(
		otelgin.Middleware("zord-edge"),
		prometheusMiddleware(),
	)

	config.InitDB()
	if db.DB == nil {
		log.Fatal("DB is nil after InitDB")
	}

	db.CreateTable()
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found")
	}

	bucket := os.Getenv("S3_BUCKET")
	region := os.Getenv("AWS_REGION")

	if bucket == "" || region == "" {
		log.Fatal("S3_BUCKET or S3_REGION not set in environment")
	}

	s3store, err := storage.NewS3Store(context.Background(), bucket, region)
	if err != nil {
		log.Fatal("Failed to init S3", err)
	}

	h := &handler.Handler{
		S3store: s3store,
	}
	cfg := config.LoadConfig()

	err = vault.InitVaultKey(cfg.VaultKey)
	if err != nil {
		log.Fatal("failed to initialize vault key:", err)
	}
	signingKeyPath := os.Getenv("SIGNING_KEY_PATH")
	if signingKeyPath == "" {
		signingKeyPath = "ed25519_private.pem"
	}
	err = vault.InitSigningKey(signingKeyPath)
	if err != nil {
		log.Fatal("failed to load signing key:", err)
	}

	// Initialize HS256 JWT signing secret (shared with Kong for gateway-level validation).
	if err := services.InitJWTSigningSecret(); err != nil {
		log.Fatal("failed to initialize JWT signing secret:", err)
	}

	routes.Routes(server, h)

	// Add metrics endpoint
	server.GET("/metrics", gin.WrapH(promhttp.Handler()))

	// Add health check endpoint
	server.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "healthy",
			"service": "zord-edge",
			"time":    time.Now().UTC(),
		})
	})

	outboxPullRepo := services.NewOutboxPullRepo(db.DB)
	outboxHandler := handler.NewOutboxHandler(outboxPullRepo)
	server.GET("/internal/outbox/lease", outboxHandler.Lease)
	server.POST("/internal/outbox/ack", outboxHandler.Ack)
	server.POST("/internal/outbox/nack", outboxHandler.Nack)

	log.Println("Starting Zord Edge service on port 8080 with observability enabled")
	srv := &http.Server{
		Addr:              ":8080",
		Handler:           server,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       5 * time.Minute,
		WriteTimeout:      10 * time.Minute,
		IdleTimeout:       10 * time.Minute,
	}

	// Start server in a goroutine so it doesn't block.
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Server failed to start: %v", err)
		}
	}()

	// Wait for interruption signal.
	<-ctx.Done()

	// Restore default behavior on the interrupt signal and notify user of shutdown.
	stop()
	log.Println("Shutting down gracefully, press Ctrl+C again to force")

	// The context is used to inform the server it has 10 seconds to finish
	// the request it is currently handling
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exiting")
}

// prometheusMiddleware adds Prometheus metrics collection
func prometheusMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		c.Next()

		duration := time.Since(start).Seconds()
		status := strconv.Itoa(c.Writer.Status())

		path := c.FullPath()
		if path == "" {
			// Avoid high-cardinality metrics labels for unmatched routes.
			path = "/unmatched"
		}

		httpRequestsTotal.WithLabelValues(c.Request.Method, path, status).Inc()
		httpRequestDuration.WithLabelValues(c.Request.Method, path).Observe(duration)
	}
}

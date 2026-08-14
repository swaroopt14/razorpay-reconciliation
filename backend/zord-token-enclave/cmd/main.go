package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
	"github.com/pressly/goose/v3"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"

	"zord-token-enclave/internal/config"
	"zord-token-enclave/internal/handlers"
	"zord-token-enclave/internal/health"
	"zord-token-enclave/internal/keymanager"
	"zord-token-enclave/internal/models"
	"zord-token-enclave/internal/repository"
	"zord-token-enclave/internal/retryutil"
	"zord-token-enclave/internal/services"
	"zord-token-enclave/kafka"
	"zord-token-enclave/tracing"
)

// internalAuthMiddleware validates X-Zord-Internal-Token on every request
// except /v1/health. The token is read from ENCLAVE_INTERNAL_TOKEN env var.
// If the env var is not set, the service refuses to start (see main).
func internalAuthMiddleware(token string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.URL.Path == "/v1/health" || c.Request.URL.Path == "/ready" {
			c.Next()
			return
		}
		provided := c.GetHeader("X-Zord-Internal-Token")
		if provided == "" || provided != token {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "unauthorized",
			})
			return
		}
		// Set caller_id for handlers to use in audit
		c.Set("caller_id", c.GetHeader("X-Zord-Caller-ID"))
		c.Next()
	}
}

func main() {
	cleanup := tracing.InitTracing("zord-token-enclave")
	defer cleanup()

	cfg := config.Load()

	// Load internal auth token — refuse to start if missing
	internalToken := os.Getenv("ENCLAVE_INTERNAL_TOKEN")
	if internalToken == "" {
		log.Fatal("❌ ENCLAVE_INTERNAL_TOKEN is not set — refusing to start without authentication")
	}

	// ---------------- DB SETUP ----------------
	database, err := sql.Open("postgres", cfg.DBURL)
	if err != nil {
		log.Fatal("❌ Failed to connect DB:", err)
	}

	// Set connection pool limits
	database.SetMaxOpenConns(50)
	database.SetMaxIdleConns(20)
	database.SetConnMaxLifetime(10 * time.Minute)
	database.SetConnMaxIdleTime(5 * time.Minute)

	if err := database.Ping(); err != nil {
		log.Fatal("❌ DB not reachable:", err)
	}

	// TOK-06: versioned goose migrations replace the old runtime
	// CREATE TABLE IF NOT EXISTS calls -- same pattern zord-intent-engine
	// already uses (see its cmd/main.go).
	goose.SetBaseFS(nil)
	if err := goose.SetDialect("postgres"); err != nil {
		log.Fatal("❌ goose dialect error:", err)
	}
	if err := goose.Up(database, "db/migrations"); err != nil {
		log.Fatal("❌ Failed to run migrations:", err)
	}

	// ---------------- REPO + KEY MANAGER ----------------
	tokenRepo := repository.NewTokenRepository(database)
	keyManager := keymanager.NewKeyManager(tokenRepo)

	// ---------------- SERVICE ----------------
	tokenSvc := services.NewTokenService(tokenRepo, keyManager, cfg.TokenSecret)

	// ---------------- MIGRATION WORKER ----------------
	go func() {
		for {
			log.Println("🔁 Starting migration check for all tenants...")
			tenants, err := tokenSvc.GetAllTenants(context.Background())
			if err != nil {
				log.Println("❌ Failed to load tenants for migration:", err)
			} else {
				for _, tenantID := range tenants {
					if err := tokenSvc.MigrateKeys(context.Background(), tenantID); err != nil {
						log.Printf("❌ Migration error for tenant %s: %v", tenantID, err)
					} else {
						log.Printf("✅ Migration cycle completed for tenant %s", tenantID)
					}
				}
			}

			time.Sleep(1 * time.Minute)
		}
	}()

	go func() {
		for {
			log.Println("🔐 Checking if key rotation needed...")

			err := tokenSvc.AutoRotateKeys(context.Background())
			if err != nil {
				log.Println("❌ Auto-rotation error:", err)
			}

			time.Sleep(10 * time.Minute)
		}
	}()

	// ---------------- KAFKA SETUP ----------------
	ctx := context.Background()

	brokers := strings.Split(os.Getenv("KAFKA_BROKERS"), ",")

	producer, err := kafka.NewProducer(brokers)
	if err != nil {
		log.Fatalf("Failed to create Kafka producer: %v", err)
	}

	tokenizeLogic := func(ctx context.Context, event models.TokenizeRequestEvent) error {

		canonical := event.Canonical

		pii := map[string]string{}

		// account number
		if v, ok := canonical["account_number"].(string); ok {
			pii["account_number"] = v
		}

		// beneficiary
		if beneficiary, ok := canonical["beneficiary"].(map[string]interface{}); ok {

			if name, ok := beneficiary["name"].(string); ok {
				pii["name"] = name
			}

			if instrument, ok := beneficiary["instrument"].(map[string]interface{}); ok {

				if ifsc, ok := instrument["ifsc"].(string); ok {
					pii["ifsc"] = ifsc
				}

				if vpa, ok := instrument["vpa"].(string); ok {
					pii["vpa"] = vpa
				}
			}
		}

		// remitter
		if remitter, ok := canonical["remitter"].(map[string]interface{}); ok {

			if phone, ok := remitter["phone"].(string); ok {
				pii["phone"] = phone
			}

			if email, ok := remitter["email"].(string); ok {
				pii["email"] = email
			}
		}

		tokens, err := tokenSvc.TokenizePII(
			ctx,
			event.TenantID,
			event.TraceID,
			"kafka-tokenize-consumer", // actor
			pii,
		)
		if err != nil {
			return err
		}

		result := models.TokenizeResultEvent{
			EventType:  "PII_TOKENIZE_RESULT",
			TraceID:    event.TraceID,
			EnvelopeID: event.EnvelopeID,
			TenantID:   event.TenantID,
			ObjectRef:  event.ObjectRef,
			Tokens:     tokens,
			Canonical:  canonical,
		}

		return producer.Publish(
			ctx,
			"pii.tokenize.result",
			event.EnvelopeID,
			result,
		)
	}

	handler := kafka.BuildTokenizeHandler(ctx, tokenizeLogic)

	// TOK-01: bounded retry, then a durable failure receipt (Postgres) plus
	// a best-effort poison-DLQ publish, before the Kafka offset is ever
	// marked for a failed message. See kafka/retry_wrapper.go and
	// kafka/consumer.go's ConsumeClaim (the actual mark-on-success-only fix).
	tokenizeFailureRepo := repository.NewTokenizeFailureRepo(database)
	tokenizeDLQTopic := os.Getenv("KAFKA_TOPIC_PII_TOKENIZE_REQUEST_DLQ")

	handler = kafka.WithRetryAndPoisonDLQ(handler, retryutil.DefaultPolicy(),
		func(ctx context.Context, rawMsg []byte, attempts int, lastErr error) error {
			if err := tokenizeFailureRepo.Record(ctx, rawMsg, attempts, lastErr); err != nil {
				return err
			}
			// TOK-02: a pure Kafka delivery failure must NOT let the
			// request offset advance -- per the acceptance test, "broker
			// outage prevents request offset advancement." The durable
			// receipt above is still recorded for operational visibility,
			// but we deliberately keep returning an error here so
			// ConsumeClaim never marks this message: it must keep being
			// redelivered until Kafka genuinely recovers, unlike a
			// permanent processing failure (bad data, crypto/DB errors),
			// which correctly gets "resolved" into the poison DLQ and
			// advanced past after exhausting retries.
			if errors.Is(lastErr, kafka.ErrDeliveryFailed) {
				return lastErr
			}
			if tokenizeDLQTopic != "" {
				if pubErr := producer.Publish(ctx, tokenizeDLQTopic, "", json.RawMessage(rawMsg)); pubErr != nil {
					log.Printf("poison DLQ publish failed (non-fatal, durable receipt already recorded): %v", pubErr)
				}
			}
			return nil
		},
	)

	go func() {
		err := kafka.StartConsumer(
			ctx,
			brokers,
			"token-enclave-group",
			"pii.tokenize.request",
			handler,
		)
		if err != nil {
			log.Fatalf("Tokenize consumer failed: %v", err)
		}
	}()

	// ---------------- HTTP HANDLERS ----------------
	tokenHandler := handlers.NewTokenHandler(tokenSvc)
	detokenizeHandler := handlers.NewDetokenizeHandler(tokenSvc)

	// ---------------- ROUTER ----------------
	r := gin.New()
	r.Use(
		gin.Recovery(),
		otelgin.Middleware("zord-token-enclave"),
		internalAuthMiddleware(internalToken), // P0 auth gate
	)

	// health — exempt from auth by middleware
	r.GET("/v1/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Readiness endpoint — checks DB connectivity
	readinessHandler := health.NewReadinessHandler([]health.DependencyCheck{
		health.DBCheck("postgres", database),
	})
	r.GET("/ready", readinessHandler.Ready)

	// APIs
	r.POST("/v1/tokenize", tokenHandler.Tokenize)
	r.POST("/v1/detokenize", detokenizeHandler.Detokenize)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8087"
	}

	log.Println("🔐 Zord Token Enclave running on :" + port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal("❌ Server failed:", err)
	}
}

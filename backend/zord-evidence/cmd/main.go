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
	"zord-evidence/config"
	"zord-evidence/db"
	"zord-evidence/handlers"
	"zord-evidence/kafka"
	"zord-evidence/repositories"
	"zord-evidence/routes"
	"zord-evidence/services"
	"zord-evidence/storage"
	"zord-evidence/tracing"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
)

func main() {
	cleanup := tracing.InitTracing("zord-evidence")
	defer cleanup()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config load failed: %v", err)
	}

	database, err := db.Connect(cfg.PostgresDSN)
	if err != nil {
		log.Fatalf("db connection failed: %v", err)
	}
	defer database.Close()

	bootstrapCtx := context.Background()
	if err := db.EnsureTables(bootstrapCtx, database); err != nil {
		log.Fatalf("ensure tables failed: %v", err)
	}

	// Signing and archive keys are required — no ephemeral fallback.
	signingKeyPath := os.Getenv("SIGNING_KEY_PATH")
	if signingKeyPath == "" {
		signingKeyPath = "signing_key.pem"
	}

	signer, err := services.NewSigner(signingKeyPath)
	if err != nil {
		log.Fatalf("signer init failed: %v", err)
	}

	archiveCrypto, err := services.NewArchiveCrypto(cfg.ArchiveEncryptKey)
	if err != nil {
		log.Fatalf("archive encryption init failed: %v", err)
	}

	// FIX-05c: S3 and Kafka are only required in production. In development
	// (KafkaEnabled=false or S3Bucket=""), nil/no-op implementations are used so
	// the service starts without external dependencies.
	if cfg.S3Bucket == "" || cfg.S3Region == "" {
		log.Fatal("S3_BUCKET and AWS_REGION must be configured")
	}

	s3store, err := storage.NewAWSStore(
		bootstrapCtx,
		cfg.S3Region,
		cfg.S3Bucket,
	)
	if err != nil {
		log.Fatalf("aws s3 store init failed: %v", err)
	}

	// FIX-05d: Kafka publisher — skip in development when brokers are not configured.
	if len(cfg.KafkaBrokers) == 0 || cfg.KafkaBrokers[0] == "" {
		log.Fatal("KAFKA_BROKERS must be configured")
	}

	pub, err := kafka.NewPublisher(
		cfg.KafkaBrokers,
		kafka.TopicEvidencePack,
	)
	if err != nil {
		log.Fatalf("kafka publisher init failed: %v", err)
	}
	defer pub.Close()

	repo := repositories.NewEvidenceRepository(database)
	pendingLeafRepo := repositories.NewPendingLeafRepository(database)
	outboxPullRepo := repositories.NewOutboxPullRepo(database)
	enrichRepo := repositories.NewEnrichmentRepository(database)
	leafReceiptRepo := repositories.NewLeafReceiptRepository(database)

	evidenceSvc := services.NewEvidenceService(
		repo,
		pendingLeafRepo,
		enrichRepo,
		s3store,
		signer,
		archiveCrypto,
		cfg.ArchivePrefix,
		cfg.ReplayCompareStrict,
		pub,
		leafReceiptRepo,
	)

	h := handlers.NewEvidenceHandler(evidenceSvc)
	outboxHandler := handlers.NewOutboxHandler(outboxPullRepo)
	// FIX-05e: Pass AdminToken from config — handler validates token value, not just presence.
	proofHandler := handlers.NewProofHandler(evidenceSvc, enrichRepo, database)

	// FIX-05f: Worker count from config, not hardcoded.
	evidenceSvc.StartWorkers(cfg.WorkerCount)
	log.Printf("evidence.main.workers_started count=%d", cfg.WorkerCount)

	// Cancellable context drives Kafka consumer lifecycle.
	consumerCtx, stopConsumers := context.WithCancel(context.Background())
	defer stopConsumers()

	var consumerHandles []*kafka.ConsumerHandle

	if len(cfg.KafkaBrokers) > 0 && cfg.KafkaBrokers[0] != "" {
		log.Printf("evidence.main.edge_consumer_bootstrap group=%s topic=%s brokers=%v",
			cfg.EdgeKafkaGroup, cfg.EdgeKafkaTopic, cfg.KafkaBrokers)
		if handle, err := kafka.StartEdgeConsumer(consumerCtx, cfg.KafkaBrokers, cfg.EdgeKafkaGroup, cfg.EdgeKafkaTopic, evidenceSvc); err != nil {
			log.Printf("warn: edge consumer init failed: %v", err)
		} else {
			consumerHandles = append(consumerHandles, handle)
		}

		log.Printf("evidence.main.intent_consumer_bootstrap group=%s topic=%s brokers=%v",
			cfg.IntentKafkaGroup, cfg.IntentKafkaTopic, cfg.KafkaBrokers)
		if handle, err := kafka.StartIntentConsumer(consumerCtx, cfg.KafkaBrokers, cfg.IntentKafkaGroup, cfg.IntentKafkaTopic, evidenceSvc); err != nil {
			log.Printf("warn: intent consumer init failed: %v", err)
		} else {
			consumerHandles = append(consumerHandles, handle)
		}

		outcomeTopics := []string{cfg.OutcomeKafkaTopic}
		if cfg.KafkaTopic != "" && cfg.KafkaTopic != cfg.OutcomeKafkaTopic {
			outcomeTopics = append(outcomeTopics, cfg.KafkaTopic)
		}
		outcomeTopics = append(outcomeTopics, "batch.summary.updated")

		log.Printf("evidence.main.outcome_consumer_bootstrap group=%s topics=%v brokers=%v",
			cfg.OutcomeKafkaGroup, outcomeTopics, cfg.KafkaBrokers)
		if handle, err := kafka.StartOutcomeConsumer(
			consumerCtx,
			cfg.KafkaBrokers,
			cfg.OutcomeKafkaGroup,
			outcomeTopics,
			evidenceSvc,
		); err != nil {
			log.Printf("warn: outcome consumer init failed (continuing without outcome consumer): %v", err)
		} else {
			consumerHandles = append(consumerHandles, handle)
		}
	} else {
		log.Printf("evidence.main.kafka_disabled — consumers not started")
	}

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(otelgin.Middleware("zord-evidence"))
	routes.Register(r, h, outboxHandler)
	routes.RegisterProofRoutes(r, proofHandler)

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%s", cfg.HTTPPort),
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       cfg.ReadTimeout,
		WriteTimeout:      cfg.WriteTimeout,
		IdleTimeout:       60 * time.Second,
	}

	serverErrors := make(chan error, 1)
	go func() {
		log.Printf("starting zord-evidence on :%s env=%s", cfg.HTTPPort, cfg.AppEnv)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			serverErrors <- err
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-quit:
		log.Printf("evidence.main.shutdown signal=%s — starting graceful shutdown", sig)
	case err := <-serverErrors:
		log.Printf("evidence.main.server_error err=%v — starting graceful shutdown", err)
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer shutdownCancel()

	// 0. Stop enqueueing new pack jobs; leaves remain buffered in Postgres.
	evidenceSvc.PrepareShutdown()

	// 1. Stop accepting new Kafka messages; in-flight handlers finish their current message.
	log.Printf("evidence.main.shutdown stopping kafka consumers")
	stopConsumers()
	for i, handle := range consumerHandles {
		handle.Wait()
		log.Printf("evidence.main.shutdown kafka consumer stopped index=%d", i)
	}

	// 2. Stop HTTP server; allow in-flight API requests to complete.
	log.Printf("evidence.main.shutdown stopping http server timeout=%s", cfg.ShutdownTimeout)
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("evidence.main.shutdown http forced err=%v", err)
	}

	// 3. Drain async pack-generation workers.
	log.Printf("evidence.main.shutdown draining workers")
	if err := evidenceSvc.ShutdownWorkers(shutdownCtx); err != nil {
		log.Printf("evidence.main.shutdown workers timeout err=%v", err)
	}

	// 4. Flush and close Kafka producer.
	log.Printf("evidence.main.shutdown closing kafka producer")
	pub.Close()

	log.Printf("evidence.main.shutdown complete")
}

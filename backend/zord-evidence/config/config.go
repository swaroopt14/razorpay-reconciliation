package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	ServiceName  string
	HTTPPort     string
	PostgresDSN  string
	AppEnv       string // "production" | "development"
	IsProduction bool

	KafkaBrokers       []string
	KafkaEnabled       bool // false when KAFKA_BROKERS is unset or empty
	KafkaTopic         string
	KafkaConsumerGroup string
	OutcomeKafkaTopic  string
	OutcomeKafkaGroup  string
	EdgeKafkaTopic     string
	EdgeKafkaGroup     string
	IntentKafkaTopic   string
	IntentKafkaGroup   string
	S3Bucket           string
	S3Region           string
	ArchivePrefix      string
	ArchiveEncryptKey  string

	// WorkerCount controls how many async pack-generation goroutines are started.
	WorkerCount         int
	ReplayCompareStrict bool
	ReadTimeout         time.Duration
	WriteTimeout        time.Duration
	ShutdownTimeout     time.Duration

	// InternalServiceKey gates the /internal/evidence/* endpoints.
	// Must be a long random secret, never exposed publicly.
	// Loaded from EVIDENCE_INTERNAL_KEY env var.
	InternalServiceKey string

	// JWTSigningSecret is the shared secret used to validate tokens from zord-edge.
	// Loaded from JWT_SIGNING_SECRET env var.
	JWTSigningSecret string
}

func Load() (*Config, error) {
	if err := godotenv.Load(); err != nil {
		fmt.Printf("Notice: .env file not loaded: %v\n", err)
	}

	port := getenv("PORT", "8088")
	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		dsn = fmt.Sprintf("user=%s password=%s host=%s port=%s dbname=%s sslmode=%s",
			getenv("DB_USER", "postgres"),
			os.Getenv("DB_PASSWORD"),
			getenv("DB_HOST", "localhost"),
			getenv("DB_PORT", "5432"),
			getenv("DB_NAME", "zord"),
			getenv("DB_SSLMODE", "disable"),
		)
	}

	// Use os.Getenv directly (not getenv helper) so that KAFKA_BROKERS=""
	// explicitly disables Kafka rather than falling back to localhost:9092.
	kafkaRaw := strings.TrimSpace(os.Getenv("KAFKA_BROKERS"))
	var brokers []string
	kafkaEnabled := false
	if kafkaRaw != "" {
		for _, b := range strings.Split(kafkaRaw, ",") {
			if b = strings.TrimSpace(b); b != "" {
				brokers = append(brokers, b)
			}
		}
		kafkaEnabled = len(brokers) > 0
	}

	strict, err := strconv.ParseBool(getenv("REPLAY_COMPARE_STRICT", "true"))
	if err != nil {
		strict = true
	}

	shutdownSec, err := strconv.Atoi(getenv("SHUTDOWN_TIMEOUT_SECONDS", "30"))
	if err != nil || shutdownSec <= 0 {
		shutdownSec = 30
	}

	workerCount, err := strconv.Atoi(getenv("EVIDENCE_WORKER_COUNT", "30"))
	if err != nil || workerCount <= 0 {
		workerCount = 30
	}

	appEnv := strings.ToLower(strings.TrimSpace(getenv("APP_ENV", "production")))
	isProduction := appEnv == "production"

	cfg := &Config{
		ServiceName:         "zord-evidence",
		HTTPPort:            port,
		PostgresDSN:         dsn,
		AppEnv:              appEnv,
		IsProduction:        isProduction,
		KafkaBrokers:        brokers,
		KafkaEnabled:        kafkaEnabled,
		KafkaTopic:          getenv("EVIDENCE_KAFKA_TOPIC", "z.outcome.events.v1"),
		KafkaConsumerGroup:  getenv("EVIDENCE_KAFKA_GROUP", "zord-evidence-group"),
		OutcomeKafkaTopic:   getenv("OUTCOME_KAFKA_TOPIC", "payments.outcome.events.v1"),
		OutcomeKafkaGroup:   getenv("OUTCOME_KAFKA_GROUP", "evidence-outcome-consumer-v3-group"),
		EdgeKafkaTopic:      getenv("EDGE_KAFKA_TOPIC", "payments.ledger.events.v1"),
		EdgeKafkaGroup:      getenv("EDGE_KAFKA_GROUP", "evidence-edge-consumer-v3-group"),
		IntentKafkaTopic:    getenv("INTENT_KAFKA_TOPIC", "payments.intent.events.v1"),
		IntentKafkaGroup:    getenv("INTENT_KAFKA_GROUP", "evidence-intent-consumer-v3-group"),
		S3Bucket:            getenv("S3_BUCKET", ""),
		S3Region:            getenv("AWS_REGION", ""),
		ArchivePrefix:       getenv("EVIDENCE_ARCHIVE_PREFIX", "evidence-packs"),
		ArchiveEncryptKey:   os.Getenv("EVIDENCE_ARCHIVE_ENCRYPTION_KEY_BASE64"),
		WorkerCount:         workerCount,
		ReplayCompareStrict: strict,
		ReadTimeout:         10 * time.Second,
		WriteTimeout:        20 * time.Second,
		ShutdownTimeout:     time.Duration(shutdownSec) * time.Second,
		InternalServiceKey:  os.Getenv("EVIDENCE_INTERNAL_KEY"),
		JWTSigningSecret:    os.Getenv("JWT_SIGNING_SECRET"),
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

// validate enforces production-only hard requirements. Development environments
// skip these checks so engineers can run the service without full config.
func (c *Config) validate() error {
	if !c.IsProduction {
		return nil
	}

	var errs []string

	if strings.TrimSpace(c.S3Bucket) == "" {
		errs = append(errs, "S3_BUCKET is required in production")
	}
	if strings.TrimSpace(c.S3Region) == "" {
		errs = append(errs, "AWS_REGION is required in production")
	}
	if len(c.KafkaBrokers) == 0 || c.KafkaBrokers[0] == "" {
		errs = append(errs, "KAFKA_BROKERS is required in production")
	}
	if strings.TrimSpace(c.ArchiveEncryptKey) == "" {
		errs = append(errs, "EVIDENCE_ARCHIVE_ENCRYPTION_KEY_BASE64 is required in production")
	}
	if strings.TrimSpace(c.InternalServiceKey) == "" {
		errs = append(errs, "EVIDENCE_INTERNAL_KEY is required in production")
	}
	if strings.TrimSpace(c.JWTSigningSecret) == "" {
		errs = append(errs, "JWT_SIGNING_SECRET is required in production")
	}

	if len(errs) > 0 {
		return fmt.Errorf("production config validation failed:\n  - %s", strings.Join(errs, "\n  - "))
	}
	return nil
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

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
	ServiceName         string
	HTTPPort            string
	PostgresDSN         string
	KafkaBrokers        []string
	KafkaEnabled        bool // false when KAFKA_BROKERS is unset or empty
	KafkaTopic          string
	KafkaConsumerGroup  string
	// OutcomeKafkaTopic is the topic zord-relay publishes outcome leaf bundles to.
	// Consumed by the OutcomeConsumer goroutine.
	OutcomeKafkaTopic  string
	OutcomeKafkaGroup  string
	EdgeKafkaTopic     string
	EdgeKafkaGroup     string
	IntentKafkaTopic   string
	IntentKafkaGroup   string
	S3Bucket           string
	S3Region            string
	ArchivePrefix       string
	ArchiveEncryptKey   string
	ReplayCompareStrict bool
	SigningPrivateKey    string
	ReadTimeout         time.Duration
	WriteTimeout        time.Duration
	ShutdownTimeout     time.Duration
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

	return &Config{
		ServiceName:         "zord-evidence",
		HTTPPort:            port,
		PostgresDSN:         dsn,
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
		ReplayCompareStrict: strict,
		SigningPrivateKey:   os.Getenv("EVIDENCE_SIGNING_PRIVATE_KEY_BASE64"),
		ReadTimeout:         10 * time.Second,
		WriteTimeout:        20 * time.Second,
		ShutdownTimeout:     time.Duration(shutdownSec) * time.Second,
	}, nil
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

package config

import (
	"os"
	"strconv"
	"strings"
)

type AppConfig struct {
	ServiceName string
	HTTPPort    string

	GeminiAPIKey     string
	GeminiModel      string
	GeminiBaseURL    string
	JWTSigningSecret string
	JWTIssuer        string
	JWTAudience      string

	DBStatementTimeoutMS int
	DBLockTimeoutMS      int
	EdgeReadDSN          string
	IntentReadDSN        string
	RelayReadDSN         string

	DefaultTopK int

	IntelligenceReadDSN         string
	EvidenceReadDSN             string
	OutcomeReadDSN              string
	GeminiAPIKeys               []string
	IntelligenceAPIBaseURL      string
	IntelligenceAPITimeoutS     int
	RedisURL                    string
	MemoryTTLSeconds            int
	MemoryMaxTurns              int
	PineconeAPIKey              string
	PineconeHost                string
	PineconeNamespace           string
	GeminiEmbeddingModel        string
	GeminiEmbeddingDimension    int
	VectorQueryTopK             int
	VectorRequestTimeoutSeconds int
	VectorIndexIntervalSeconds  int
	VectorIndexBatchSize        int
	VectorIndexTimeoutSeconds   int
	VectorIndexKafkaBrokers     []string
	VectorIndexKafkaTopic       string
	VectorIndexKafkaGroupID     string
	VectorIndexKafkaMaxRetries  int
	VectorIndexStateDSN         string
}

func parseCSVKeys(v string) []string {
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		k := strings.TrimSpace(p)
		if k != "" {
			out = append(out, k)
		}
	}
	return out
}

func Load() AppConfig {
	get := func(k, d string) string {
		v := os.Getenv(k)
		if v == "" {
			return d
		}
		return v
	}
	getAny := func(keys []string, d string) string {
		for _, k := range keys {
			if v := strings.TrimSpace(os.Getenv(k)); v != "" {
				return v
			}
		}
		return d
	}

	topK := 5
	if v := os.Getenv("DEFAULT_TOP_K"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			topK = n
		}
	}
	dbStatementTimeoutMS := 5000
	if v := os.Getenv("DB_STATEMENT_TIMEOUT_MS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			dbStatementTimeoutMS = n
		}
	}

	dbLockTimeoutMS := 1000
	if v := os.Getenv("DB_LOCK_TIMEOUT_MS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			dbLockTimeoutMS = n
		}
	}
	intelTimeout := 3
	if v := os.Getenv("INTELLIGENCE_API_TIMEOUT_SEC"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			intelTimeout = n
		}
	}
	memTTL := 3600
	if v := os.Getenv("MEMORY_TTL_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			memTTL = n
		}
	}

	memTurns := 8
	if v := os.Getenv("MEMORY_MAX_TURNS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			memTurns = n
		}
	}
	vectorTopK := 5
	if v := os.Getenv("VECTOR_QUERY_TOP_K"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			vectorTopK = n
		}
	}

	vectorTimeout := 15
	if v := os.Getenv("VECTOR_REQUEST_TIMEOUT_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			vectorTimeout = n
		}
	}
	embeddingDimension := 768
	if v := os.Getenv("GEMINI_EMBEDDING_DIMENSION"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			embeddingDimension = n
		}
	}
	vectorIndexInterval := 300
	if v := os.Getenv("VECTOR_INDEX_INTERVAL_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			vectorIndexInterval = n
		}
	}

	vectorIndexBatchSize := 50
	if v := os.Getenv("VECTOR_INDEX_BATCH_SIZE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			vectorIndexBatchSize = n
		}
	}

	vectorIndexTimeout := 60
	if v := os.Getenv("VECTOR_INDEX_TIMEOUT_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			vectorIndexTimeout = n
		}
	}
	vectorIndexKafkaMaxRetries := 3
	if v := os.Getenv("VECTOR_INDEX_KAFKA_MAX_RETRIES"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			vectorIndexKafkaMaxRetries = n
		}
	}
	return AppConfig{
		ServiceName: get("SERVICE_NAME", "zord-prompt-layer"),
		HTTPPort:    get("HTTP_PORT", "8086"),

		GeminiAPIKey:     os.Getenv("GEMINI_API_KEY"),
		GeminiAPIKeys:    parseCSVKeys(os.Getenv("GEMINI_API_KEYS")),
		GeminiModel:      get("GEMINI_MODEL", "gemini-3.1-flash-lite"),
		GeminiBaseURL:    get("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"),
		JWTSigningSecret: os.Getenv("JWT_SIGNING_SECRET"),
		JWTIssuer:        get("JWT_ISSUER", "zord-edge"),
		JWTAudience:      get("JWT_AUDIENCE", "zord-console"),

		DBStatementTimeoutMS: dbStatementTimeoutMS,
		DBLockTimeoutMS:      dbLockTimeoutMS,
		EdgeReadDSN:          os.Getenv("EDGE_READ_DSN"),
		IntentReadDSN:        os.Getenv("INTENT_READ_DSN"),
		RelayReadDSN:         os.Getenv("RELAY_READ_DSN"),

		DefaultTopK: topK,

		IntelligenceReadDSN:         os.Getenv("INTELLIGENCE_READ_DSN"),
		EvidenceReadDSN:             os.Getenv("EVIDENCE_READ_DSN"),
		OutcomeReadDSN:              os.Getenv("OUTCOME_READ_DSN"),
		IntelligenceAPIBaseURL:      getAny([]string{"INTELLIGENCE_API_BASE_URL", "INTELLIGENCE_BASE_URL"}, "http://zord-intelligence:8089"),
		IntelligenceAPITimeoutS:     intelTimeout,
		RedisURL:                    get("REDIS_URL", "redis://zord-prompt-layer-redis:6379/0"),
		MemoryTTLSeconds:            memTTL,
		MemoryMaxTurns:              memTurns,
		PineconeAPIKey:              os.Getenv("PINECONE_API_KEY"),
		PineconeHost:                os.Getenv("PINECONE_HOST"),
		PineconeNamespace:           get("PINECONE_NAMESPACE", "zord-prompt-layer"),
		GeminiEmbeddingModel:        get("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001"),
		GeminiEmbeddingDimension:    embeddingDimension,
		VectorQueryTopK:             vectorTopK,
		VectorRequestTimeoutSeconds: vectorTimeout,
		VectorIndexIntervalSeconds:  vectorIndexInterval,
		VectorIndexBatchSize:        vectorIndexBatchSize,
		VectorIndexTimeoutSeconds:   vectorIndexTimeout,
		VectorIndexKafkaBrokers:     parseCSVKeys(get("VECTOR_INDEX_KAFKA_BROKERS", "zord-kafka:9092")),
		VectorIndexKafkaTopic:       get("VECTOR_INDEX_KAFKA_TOPIC", "zord.vector.index.request.v1"),
		VectorIndexKafkaGroupID:     get("VECTOR_INDEX_KAFKA_GROUP_ID", "zord-prompt-layer-vector-indexer"),
		VectorIndexKafkaMaxRetries:  vectorIndexKafkaMaxRetries,
		VectorIndexStateDSN:         os.Getenv("VECTOR_INDEX_STATE_DSN"),
	}
}

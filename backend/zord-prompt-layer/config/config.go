package config

import (
	"os"
	"strconv"
	"strings"
)

type AppConfig struct {
	ServiceName string
	HTTPPort    string

	GeminiAPIKey  string
	GeminiModel   string
	GeminiBaseURL string

	EdgeReadDSN   string
	IntentReadDSN string
	RelayReadDSN  string

	DefaultTopK int

	IntelligenceReadDSN     string
	EvidenceReadDSN         string
	OutcomeReadDSN          string
	GeminiAPIKeys           []string
	IntelligenceAPIBaseURL  string
	IntelligenceAPITimeoutS int
	RedisURL                string
	MemoryTTLSeconds        int
	MemoryMaxTurns          int
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
	return AppConfig{
		ServiceName: get("SERVICE_NAME", "zord-prompt-layer"),
		HTTPPort:    get("HTTP_PORT", "8086"),

		GeminiAPIKey:  os.Getenv("GEMINI_API_KEY"),
		GeminiAPIKeys: parseCSVKeys(os.Getenv("GEMINI_API_KEYS")),
		GeminiModel:   get("GEMINI_MODEL", "gemini-2.5-flash"),
		GeminiBaseURL: get("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"),
		EdgeReadDSN:   os.Getenv("EDGE_READ_DSN"),
		IntentReadDSN: os.Getenv("INTENT_READ_DSN"),
		RelayReadDSN:  os.Getenv("RELAY_READ_DSN"),

		DefaultTopK: topK,

		IntelligenceReadDSN:     os.Getenv("INTELLIGENCE_READ_DSN"),
		EvidenceReadDSN:         os.Getenv("EVIDENCE_READ_DSN"),
		OutcomeReadDSN:          os.Getenv("OUTCOME_READ_DSN"),
		IntelligenceAPIBaseURL:  getAny([]string{"INTELLIGENCE_API_BASE_URL", "INTELLIGENCE_BASE_URL"}, "http://zord-intelligence:8089"),
		IntelligenceAPITimeoutS: intelTimeout,
		RedisURL:                get("REDIS_URL", "redis://zord-prompt-layer-redis:6379/0"),
		MemoryTTLSeconds:        memTTL,
		MemoryMaxTurns:          memTurns,
	}
}

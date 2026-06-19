package config

// config.go
//
// Holds every setting zord-intelligence needs to run.
//
// PHASE 6 ADDITIONS:
//
//   IntelligenceMode — dual-mode architecture switch.
//
//   GRADE_A (default) — Attachment Intelligence Mode.
//     Customer provides: payout intents + settlement files.
//     ZPI produces: leakage, ambiguity, defensibility, RCA, pattern, recommendation.
//     Grade B-only computation (finality rates, latency, SLA, retry recovery)
//     is skipped so ZPI does not claim intelligence it cannot deliver.
//     This is the correct default for all new deployments.
//
//   GRADE_B — Full Finality / Control Mode.
//     Customer routes dispatch through ZPI (Service 4 + finality certs).
//     ZPI additionally produces finality-grade success rates, p95 latency,
//     SLA compliance, retry recovery, and Outcome Fusion conflict rates.
//     Set INTELLIGENCE_MODE=GRADE_B only after validating that
//     finality.certificate.issued events are flowing correctly.
//
// SAFETY PRINCIPLE:
//   Defaulting to GRADE_A means a misconfigured or partial deployment
//   never silently serves metrics it cannot support. An explicit opt-in
//   to GRADE_B is required — no accidental finality-grade exposure.

import (
	"fmt"
	"log"
	"os"

	"github.com/zord/zord-intelligence/internal/models"
)

// Config holds every setting zord-intelligence needs to run.
type Config struct {

	// ── Server ──────────────────────────────────────────────────
	HTTPPort    string
	Environment string

	// ── Database ────────────────────────────────────────────────
	DatabaseURL string

	// ── Kafka ───────────────────────────────────────────────────
	KafkaBrokers string
	KafkaGroupID string

	// ── Kafka Input Topics (ZPI reads FROM these) ────────────────
	TopicIntentCreated      string
	TopicDispatchCreated    string
	TopicOutcomeNormalized  string
	TopicFinalityCert       string
	TopicFinalContract      string
	TopicEvidenceReady      string
	TopicDLQ                string
	TopicStatementMatch     string
	TopicCorridorHealthTick string
	TopicSLATimerTick       string

	// ── Grade A Input Topics ────────────────────────────────────
	TopicSettlementCreated  string
	TopicAttachmentDecision string
	TopicVarianceRecord     string
	TopicBatchSummary       string
	TopicGovernanceDecision string

	// ── Pattern Intelligence Input Topics ────────────────────────
	// TopicDLQItem receives per-intent manual review events from Service 2.
	// Emitted when a payment row is routed to human review before dispatch.
	// Used to compute manual_review_rate_by_source and trigger source-fix recommendations.
	TopicDLQItem string

	// ── Kafka Output Topics (ZPI publishes TO these) ──────────────
	TopicActuationRetry      string
	TopicActuationEvidence   string
	TopicActuationAlert      string
	TopicActuationBatchPatch string

	// ── ML Service Topics ─────────────────────────────────────────
	// Go publishes ML requests to TopicMLRequest; Python publishes
	// results back to TopicMLResult.  The mlclient package manages
	// the request-reply lifecycle over these two topics.
	TopicMLRequest string
	TopicMLResult  string

	// ── PHASE 6: Dual-Mode Architecture ─────────────────────────
	//
	// IntelligenceMode controls which intelligence surfaces ZPI computes
	// and which API endpoints return data vs. "requires upgrade" responses.
	//
	// Set via env var: INTELLIGENCE_MODE=GRADE_A (default) or GRADE_B
	//
	// GRADE_A — Attachment Intelligence Mode (safe default)
	//   Produces: leakage, ambiguity, defensibility, RCA, pattern, recommendation
	//   Skips:    finality-grade projections (no false implied capabilities)
	//
	// GRADE_B — Full Finality / Control Mode
	//   Produces: all of Grade A + finality rates, latency, SLA, retry recovery
	//   Requires: dispatch.attempt.created + finality.certificate.issued flowing
	IntelligenceMode models.IntelligenceMode
}

// Load reads all environment variables and returns a filled Config struct.
func Load() *Config {
	mode := loadIntelligenceMode()

	return &Config{

		// ── Server ──────────────────────────────────────────────
		HTTPPort:    getRequired("HTTP_PORT"),
		Environment: getWithDefault("ENVIRONMENT", "development"),

		// ── Database ────────────────────────────────────────────
		DatabaseURL: getRequired("DATABASE_URL"),

		// ── Kafka ───────────────────────────────────────────────
		KafkaBrokers: getRequired("KAFKA_BROKERS"),
		KafkaGroupID: getWithDefault("KAFKA_GROUP_ID", "zord-intelligence-group"),

		// ── Kafka Input Topics ───────────────────────────────────
		TopicIntentCreated:      getWithDefault("TOPIC_INTENT_CREATED", "payments.intent.events.v1"),
		TopicDispatchCreated:    getWithDefault("TOPIC_DISPATCH_CREATED", "dispatch.attempt.created"),
		TopicOutcomeNormalized:  getWithDefault("TOPIC_OUTCOME_NORMALIZED", "outcome.event.normalized"),
		TopicFinalityCert:       getWithDefault("TOPIC_FINALITY_CERT", "finality.certificate.issued"),
		TopicFinalContract:      getWithDefault("TOPIC_FINAL_CONTRACT", "final.contract.updated"),
		TopicEvidenceReady:      getWithDefault("TOPIC_EVIDENCE_CREATED", "evidence.pack.created"),
		TopicDLQ:                getWithDefault("TOPIC_DLQ", "dlq.event"),
		TopicStatementMatch:     getWithDefault("TOPIC_STATEMENT_MATCH", "statement.match.event"),
		TopicCorridorHealthTick: getWithDefault("TOPIC_CORRIDOR_HEALTH_TICK", "corridor.health.tick"),
		TopicSLATimerTick:       getWithDefault("TOPIC_SLA_TIMER_TICK", "sla.timer.tick"),

		// ── Grade A Input Topics ──────────────────────────────────
		TopicSettlementCreated:  getWithDefault("TOPIC_SETTLEMENT_CREATED", "canonical.settlement.created"),
		TopicAttachmentDecision: getWithDefault("TOPIC_ATTACHMENT_DECISION", "attachment.decision.created"),
		TopicVarianceRecord:     getWithDefault("TOPIC_VARIANCE_RECORD", "variance.record.created"),
		TopicBatchSummary:       getWithDefault("TOPIC_BATCH_SUMMARY", "batch.summary.updated"),
		TopicGovernanceDecision: getWithDefault("TOPIC_GOVERNANCE_DECISION", "governance.decision.created"),

		// ── Pattern Intelligence Input Topics ─────────────────────
		TopicDLQItem: getWithDefault("TOPIC_DLQ_ITEM", "payments.intent.dlq"),

		// ── Kafka Output Topics ──────────────────────────────────────
		TopicActuationRetry:      getWithDefault("TOPIC_ACTUATION_RETRY", "zpi.actuation.retry"),
		TopicActuationEvidence:   getWithDefault("TOPIC_ACTUATION_EVIDENCE", "zpi.actuation.evidence"),
		TopicActuationAlert:      getWithDefault("TOPIC_ACTUATION_ALERT", "zpi.actuation.alert"),
		TopicActuationBatchPatch: getWithDefault("TOPIC_ACTUATION_BATCH_PATCH", "zpi.actuation.batch_patch"),

		// ── ML Service Topics ────────────────────────────────────────
		TopicMLRequest:                  getWithDefault("TOPIC_ML_REQUEST", "ml.request.events"),
		TopicMLResult:                   getWithDefault("TOPIC_ML_RESULT", "ml.result.events"),
		// ── PHASE 6: Intelligence Mode ────────────────────────────
		IntelligenceMode: mode,
	}
}

// loadIntelligenceMode reads and validates INTELLIGENCE_MODE.
// Defaults to GRADE_A for safety. Logs the active mode at startup.
func loadIntelligenceMode() models.IntelligenceMode {
	raw := getWithDefault("INTELLIGENCE_MODE", string(models.IntelligenceModeGradeA))
	mode := models.IntelligenceMode(raw)

	if !mode.Valid() {
		log.Printf("WARN: INTELLIGENCE_MODE=%q is not recognised — defaulting to GRADE_A", raw)
		mode = models.IntelligenceModeGradeA
	}

	log.Printf("config: intelligence mode = %s", mode.String())
	return mode
}

// ── Helper functions ─────────────────────────────────────────────────────────

func getRequired(key string) string {
	value := os.Getenv(key)
	if value == "" {
		log.Fatalf("FATAL: required environment variable %q is not set", key)
	}
	return value
}

func getWithDefault(key, defaultVal string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultVal
	}
	return value
}

func getIntWithDefault(key string, defaultVal int) int {
	value := os.Getenv(key)
	if value == "" {
		return defaultVal
	}
	var parsed int
	if _, err := fmt.Sscanf(value, "%d", &parsed); err != nil || parsed <= 0 {
		return defaultVal
	}
	return parsed
}

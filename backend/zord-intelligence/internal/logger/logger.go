package logger

// ============================================================
// logger.go — Structured logging for zord-intelligence
// ============================================================
//
// WHY DOES THIS FILE EXIST?
// ─────────────────────────
// The old code used two different logging approaches mixed together:
//
//   fmt.Printf("action_service: created action %s\n", id)
//   log.Printf("outbox_worker: fetch error: %v", err)
//
// PROBLEM 1 — fmt.Printf has NO timestamp, NO log level.
// When this runs in production, you see:
//   action_service: created action act_abc123 policy=P_SLA decision=ESCALATE
// Datadog/Grafana see this as raw text. They cannot filter by level.
// They cannot alert on "ERROR" logs. Ops is flying blind.
//
// PROBLEM 2 — log.Printf writes plain text.
// Same issue — no structure, hard to search, hard to alert on.
//
// THE FIX — slog (structured logging):
// ──────────────────────────────────────
// slog is built into Go since version 1.21. No new dependency needed.
// It writes JSON like this:
//
//   {
//     "time": "2024-01-15T14:32:01.234Z",
//     "level": "INFO",
//     "msg": "action created",
//     "action_id": "act_abc123",
//     "policy_id": "P_SLA_BREACH",
//     "decision": "ESCALATE",
//     "tenant_id": "tnt_A"
//   }
//
// Now Datadog can:
//   - Filter: level = ERROR  → see only errors
//   - Alert:  count(level=ERROR) > 5 in 1 minute → page on-call
//   - Search: action_id = "act_abc123" → trace the entire lifecycle
//   - Dashboard: count by decision type over time
//
// THIS IS THE FINTECH GOLD STANDARD.
// Every payment company (Stripe, Razorpay, Cashfree) uses structured JSON logs.
//
// HOW TO USE THIS IN OTHER FILES:
// ────────────────────────────────
//   import "github.com/zord/zord-intelligence/internal/logger"
//
//   // INFO — normal operations
//   logger.Info("action created",
//       "action_id", "act_abc123",
//       "policy_id", "P_SLA_BREACH",
//       "tenant_id", "tnt_A",
//   )
//
//   // WARN — something unexpected but not fatal
//   logger.Warn("outbox insert failed, will retry",
//       "action_id", "act_abc123",
//       "error", err,
//   )
//
//   // ERROR — something went wrong, needs attention
//   logger.Error("failed to insert action contract",
//       "error", err,
//       "tenant_id", "tnt_A",
//   )
//
// KEY-VALUE PAIRS:
// The arguments after the message come in pairs: "key", value, "key", value
// The key is always a string. The value can be anything.
// This is what makes the log structured — each field is searchable.

import (
	"log/slog"
	"os"
)

// log is the single shared logger for the entire service.
// It is package-level so every file that imports this package
// shares the same logger instance.
var log *slog.Logger

// init() runs automatically when this package is first imported.
// It sets up the logger before any code in any other file runs.
//
// WHY JSON FORMAT?
// In development you can run: go run ./cmd/main.go | jq .
// to pretty-print the JSON logs. In production, log collectors
// (Datadog agent, Fluent Bit, CloudWatch agent) parse JSON automatically.
func init() {
	log = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		// AddSource: adds file name and line number to every log line.
		// Example: "source": {"function": "CreateAction", "file": "action_service.go", "line": 87}
		// Useful when debugging production issues — you know exactly where the log came from.
		AddSource: true,

		// Level: minimum severity to log.
		// DEBUG < INFO < WARN < ERROR
		// In production we use INFO so DEBUG logs are silent.
		// In development you could change this to slog.LevelDebug.
		Level: slog.LevelInfo,
	}))

	// Replace the default logger used by log.Printf, log.Println etc.
	// This means any old log.Printf calls that we haven't converted yet
	// will ALSO write structured JSON instead of plain text.
	// It is a safety net for the transition period.
	slog.SetDefault(log)
}

// Info logs a normal operational event.
// Use for: action created, event processed, worker started, etc.
// These appear in dashboards as normal traffic.
//
// Example:
//
//	logger.Info("action created",
//	    "action_id", "act_abc",
//	    "decision", "ESCALATE",
//	)
func Info(msg string, args ...any) {
	log.Info(msg, args...)
}

// Warn logs something unexpected that did not cause a failure.
// Use for: retries, fallbacks, degraded behaviour, non-critical failures.
// These should be investigated but are not emergencies.
//
// Example:
//
//	logger.Warn("sla seed failed, continuing",
//	    "intent_id", "int_abc",
//	    "error", err,
//	)
func Warn(msg string, args ...any) {
	log.Warn(msg, args...)
}

// Error logs a failure that needs investigation.
// Use for: DB errors, Kafka publish failures, unexpected panics.
// These should trigger alerts in your monitoring system.
//
// Example:
//
//	logger.Error("action contract insert failed",
//	    "error", err,
//	    "tenant_id", "tnt_A",
//	)
func Error(msg string, args ...any) {
	log.Error(msg, args...)
}

// Debug logs detailed diagnostic information.
// These are SILENT in production (level is INFO).
// Useful when running locally to trace exactly what is happening.
//
// Example:
//
//	logger.Debug("evaluating policy DSL",
//	    "policy_id", "P_SLA_BREACH",
//	    "metric_value", 0.82,
//	)
func Debug(msg string, args ...any) {
	log.Debug(msg, args...)
}

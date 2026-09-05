package models

import "time"

type TokenAudit struct {
	AuditID       string
	TokenID       string
	TenantID      string
	Actor         string    // service principal: "zord-intent-engine", "zord-service-6", etc.
	Action        string    // "TOKENIZE" | "DETOKENIZE" | "DETOKENIZE_DENIED"
	Purpose       string    // legacy field — keep for backward compat
	Decision      string    // "ALLOW" | "DENY"
	TraceID       string
	Caller        string    // X-Zord-Caller-ID header value
	ObjectRef     string    // transaction/intent reference for detokenize
	PurposeCode   string    // declared purpose: "INTENT_PROCESSING" | "AUDIT_EXPORT" | "DISPUTE"
	CorrelationID string    // correlation ID from caller
	CreatedAt     time.Time
}

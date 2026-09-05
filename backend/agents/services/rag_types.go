package services

import "regexp"

var uuidLeakRe = regexp.MustCompile(`(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b`)

var sensitiveExtractionRe = regexp.MustCompile(`(?i)\b(api[_\s-]?key|password|secret|access[_\s-]?token|private[_\s-]?key)\b`)

var rowCountEstimateRe = regexp.MustCompile(`(?i)\brow_count_estimate=(\d+)\b`)
var outboxStatusRe = regexp.MustCompile(`(?i)\bstatus=([A-Z_]+)\b`)

type vizKind string

const (
	vizCorridorHealth vizKind = "corridor_health"
	vizTopFailures    vizKind = "top_failures"
	vizSLABreach      vizKind = "sla_breach"
	vizApprovalMix    vizKind = "approval_mix"
)

type queryClass string

const (
	classOperational queryClass = "operational_data_query"
	classProduct     queryClass = "product_explanation"
	classNavigation  queryClass = "navigation_or_how_to"
	classEvidence    queryClass = "evidence_or_dispute_query"
	classOutOfScope  queryClass = "out_of_scope"
	classUnknown     queryClass = "unknown"
)

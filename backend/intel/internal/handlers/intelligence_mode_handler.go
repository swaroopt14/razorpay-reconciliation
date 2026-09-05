package handlers

// intelligence_mode_handler.go
//
// HTTP handlers for the dual-mode architecture (Phase 6).
//
// ENDPOINTS:
//
//   GET /v1/intelligence/mode
//       Returns the current operating mode (GRADE_A or GRADE_B),
//       the full capability catalogue with available/locked status per capability,
//       and upgrade path guidance when in Grade A.
//       No tenant_id required — mode is a service-level (deployment-level) setting.
//
//   GET /v1/intelligence/mode/status?tenant_id=X
//       Returns per-signal health for a specific tenant: which upstream Kafka topics
//       have been active in the last 24 hours based on projection_state recency.
//       Powers the "data health" panel in the ops dashboard.
//       Returns overall_healthy = true only if all required signals for the current
//       mode are active.
//
// WHY EXPOSE THIS?
//   1. Prevents confusion ("why is finality_rate missing?")
//   2. Creates a natural commercial upgrade conversation
//   3. Lets ops validate that the right signals are flowing before going live
//   4. Supports zero-downtime mode transitions — ops can verify, then flip env var
//
// COMMERCIAL PRINCIPLE (spec Section 5):
//   Locked capabilities return clear "requires_upgrade" messages, never empty data
//   or 404s. The customer sees what they're missing, not that the data doesn't exist.

import (
	"context"
	"net/http"
	"time"

	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
	"github.com/zord/zord-intelligence/internal/services"
)

// IntelligenceModeHandler handles mode and capability status requests.
type IntelligenceModeHandler struct {
	projectionService *services.ProjectionService
	projRepo          *persistence.ProjectionRepo
}

// NewIntelligenceModeHandler creates an IntelligenceModeHandler.
func NewIntelligenceModeHandler(
	projectionService *services.ProjectionService,
	projRepo *persistence.ProjectionRepo,
) *IntelligenceModeHandler {
	return &IntelligenceModeHandler{
		projectionService: projectionService,
		projRepo:          projRepo,
	}
}

// GetMode handles GET /v1/intelligence/mode
//
// Returns the current operating mode, full capability catalogue with
// available/locked status, and upgrade path when in Grade A.
// Does NOT require tenant_id — mode is deployment-level, not per-tenant.
//
// Example Grade A response:
//
//	{
//	  "mode": "GRADE_A",
//	  "mode_label": "Grade A — Attachment Intelligence Mode",
//	  "total_capabilities": 13,
//	  "available_capabilities": 6,
//	  "locked_capabilities": 7,
//	  "capabilities": [...],
//	  "upgrade_path": {
//	    "current_mode": "GRADE_A",
//	    "target_mode": "GRADE_B",
//	    "steps": ["1. Deploy ZPI's prepare-and-sign carrier...", ...],
//	    "unlocked_signals": ["finality_rate", "finality_latency", ...]
//	  }
//	}
func (h *IntelligenceModeHandler) GetMode(w http.ResponseWriter, r *http.Request) {
	mode := h.projectionService.Mode()
	writeJSON(w, http.StatusOK, buildModeResponse(mode, nil))
}

// GetModeStatus handles GET /v1/intelligence/mode/status?tenant_id=X
//
// Returns per-signal health for a specific tenant.
// Signal health is derived from projection_state recency — if a projection key
// associated with a signal family was computed in the last 24 hours, that signal
// is considered active. This avoids needing Kafka admin credentials.
//
// Grade A required signals:
//   - leakage.total            (feeds from attachment.decision.created + variance.record.created)
//   - ambiguity.summary        (feeds from attachment.decision.created)
//   - defensibility.summary    (feeds from evidence.pack.ready + governance.decision.created)
//   - batch.health.*           (feeds from batch.summary.updated)
//
// Grade B additional required signals:
//   - corridor.success_rate.*  (feeds from finality.certificate.issued)
//   - corridor.finality_latency.* (feeds from finality.certificate.issued)
//   - corridor.retry_recovery_rate.* (feeds from dispatch.attempt.created)
func (h *IntelligenceModeHandler) GetModeStatus(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	mode := h.projectionService.Mode()
	health := h.buildSignalHealth(r.Context(), tenantID, mode)
	writeJSON(w, http.StatusOK, buildModeResponse(mode, health))
}

// buildModeResponse constructs the IntelligenceModeStatus response.
// signalHealth is nil when called from GetMode (no tenant-specific health check).
func buildModeResponse(mode models.IntelligenceMode, signalHealth *models.ModeSignalHealth) models.IntelligenceModeStatus {
	capabilities := mode.ActiveCapabilities()

	available, locked := 0, 0
	for _, c := range capabilities {
		if c.Available {
			available++
		} else {
			locked++
		}
	}

	var upgradePath *models.UpgradePath
	if !mode.IsGradeB() {
		up := models.GradeBUpgradePath()
		upgradePath = &up
	}

	return models.IntelligenceModeStatus{
		Mode:                  mode,
		ModeLabel:             mode.String(),
		ModeSetAt:             time.Now().UTC(),
		Capabilities:          capabilities,
		TotalCapabilities:     len(capabilities),
		AvailableCapabilities: available,
		LockedCapabilities:    locked,
		UpgradePath:           upgradePath,
		SignalHealth:          signalHealth,
	}
}

// buildSignalHealth checks projection_state recency to determine signal health.
//
// DESIGN: We probe projection_state for rows computed in the last 24 hours.
// A projection updated recently → its upstream Kafka signal is flowing.
// This is accurate because every Grade A event handler writes a projection on arrival.
//
// Projection keys used as signal proxies:
//
//	"leakage.total"          → attachment.decision.created + variance.record.created
//	"ambiguity.summary"      → attachment.decision.created
//	"defensibility.summary"  → evidence.pack.ready + governance.decision.created
//	"corridor.success_rate.*" (any) → finality.certificate.issued
//	"corridor.retry_recovery_rate.*" (any) → dispatch.attempt.created
//	"corridor.statement_match_rate.*" (any) → statement.match.event
func (h *IntelligenceModeHandler) buildSignalHealth(
	ctx context.Context,
	tenantID string,
	mode models.IntelligenceMode,
) *models.ModeSignalHealth {

	health := &models.ModeSignalHealth{}
	cutoff := time.Now().UTC().Add(-24 * time.Hour)

	// ── Helper: check if a specific projection key has been updated in 24h ──
	checkKey := func(key string) (active bool, lastSeen *time.Time, count int) {
		p, err := h.projRepo.GetLatest(ctx, tenantID, key)
		if err != nil || p == nil {
			return false, nil, 0
		}
		if p.ComputedAt.After(cutoff) {
			t := p.ComputedAt
			return true, &t, 1 // count is a presence indicator, not event count
		}
		t := p.ComputedAt
		return false, &t, 0 // exists but stale
	}

	// ── Helper: check any projection whose key starts with prefix ────────────
	// Updated for Phase 7 Issue 3: Uses ListKeysByPrefix instead of loading ALL
	// tenant projections to perform Go-side string scanning which exhausts memory.
	checkPrefix := func(prefix string) (active bool, lastSeen *time.Time) {
		projections, err := h.projRepo.ListKeysByPrefix(ctx, tenantID, prefix)
		if err != nil || len(projections) == 0 {
			return false, nil
		}
		for _, p := range projections {
			if p.ComputedAt.After(cutoff) {
				t := p.ComputedAt
				return true, &t
			}
		}
		// none matched time cutoff, just return the first one's staleness
		t := projections[0].ComputedAt
		return false, &t
	}

	// ── Grade A signal checks ─────────────────────────────────────────────────

	// attachment.decision.created → leakage.total + ambiguity.summary
	leakageActive, leakageAt, _ := checkKey("leakage.total")
	health.AttachmentDecision = models.SignalStatus{
		Topic:    "attachment.decision.created",
		Required: true,
		Active:   leakageActive,
		LastSeen: leakageAt,
	}

	// Same signal also feeds ambiguity — cross-check for stronger confirmation
	ambiguityActive, ambiguityAt, _ := checkKey("ambiguity.summary")
	// Use whichever was more recently seen
	attachActive := leakageActive || ambiguityActive
	attachSeen := mostRecent(leakageAt, ambiguityAt)
	health.AttachmentDecision.Active = attachActive
	health.AttachmentDecision.LastSeen = attachSeen

	// variance.record.created — cross-checks against leakage under-settlement count
	// We use the same leakage.total projection as a proxy (variance feeds into it).
	health.VarianceRecord = models.SignalStatus{
		Topic:    "variance.record.created",
		Required: true,
		Active:   leakageActive, // variance feeds into leakage.total — same proxy
		LastSeen: leakageAt,
	}

	// canonical.settlement.created → leakage orphan count (subset of leakage.total)
	health.SettlementCreated = models.SignalStatus{
		Topic:    "canonical.settlement.created",
		Required: true,
		Active:   leakageActive,
		LastSeen: leakageAt,
	}

	// evidence.pack.ready + governance.decision.created → defensibility.summary
	defActive, defAt, _ := checkKey("defensibility.summary")
	health.EvidencePack = models.SignalStatus{
		Topic:    "evidence.pack.ready",
		Required: false, // defensibility degrades gracefully without it
		Active:   defActive,
		LastSeen: defAt,
	}
	health.GovernanceDecision = models.SignalStatus{
		Topic:    "governance.decision.created",
		Required: false,
		Active:   defActive,
		LastSeen: defAt,
	}

	// batch.summary.updated → batch.health.* (any key)
	batchActive, batchAt := checkPrefix("batch.health.")
	health.BatchSummary = models.SignalStatus{
		Topic:    "batch.summary.updated",
		Required: true,
		Active:   batchActive,
		LastSeen: batchAt,
	}

	// ── Grade B signal checks ─────────────────────────────────────────────────
	// These are only required in Grade B mode.

	// finality.certificate.issued → corridor.success_rate.* (any key)
	finalityActive, finalityAt := checkPrefix("corridor.success_rate.")
	health.FinalityCert = models.SignalStatus{
		Topic:    "finality.certificate.issued",
		Required: mode.IsGradeB(),
		Active:   finalityActive,
		LastSeen: finalityAt,
	}

	// dispatch.attempt.created → corridor.retry_recovery_rate.* (any key)
	dispatchActive, dispatchAt := checkPrefix("corridor.retry_recovery_rate.")
	health.DispatchAttempt = models.SignalStatus{
		Topic:    "dispatch.attempt.created",
		Required: mode.IsGradeB(),
		Active:   dispatchActive,
		LastSeen: dispatchAt,
	}

	// statement.match.event → corridor.statement_match_rate.* (any key)
	stmtActive, stmtAt := checkPrefix("corridor.statement_match_rate.")
	health.StatementMatch = models.SignalStatus{
		Topic:    "statement.match.event",
		Required: mode.IsGradeB(),
		Active:   stmtActive,
		LastSeen: stmtAt,
	}

	// ── Compute overall health ────────────────────────────────────────────────
	// overall_healthy = all REQUIRED signals are active.
	// Signals not required for the current mode do not affect the result.
	health.OverallHealthy = true
	for _, sig := range []models.SignalStatus{
		health.AttachmentDecision,
		health.VarianceRecord,
		health.SettlementCreated,
		health.BatchSummary,
		health.FinalityCert,
		health.DispatchAttempt,
		health.StatementMatch,
	} {
		if sig.Required && !sig.Active {
			health.OverallHealthy = false
			break
		}
	}

	return health
}

// mostRecent returns the more recent of two nullable timestamps.
// Used to pick the strongest signal proxy when multiple projections feed from the same topic.
func mostRecent(a, b *time.Time) *time.Time {
	if a == nil {
		return b
	}
	if b == nil {
		return a
	}
	if a.After(*b) {
		return a
	}
	return b
}

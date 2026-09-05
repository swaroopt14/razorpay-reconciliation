package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/zord/zord-intelligence/internal/persistence"
	"github.com/zord/zord-intelligence/internal/services"
)

// IntelligenceBase provides common snapshot formatting logic for the various layer handlers.
type IntelligenceBase struct {
	projectionService *services.ProjectionService
	snapshotRepo      *persistence.IntelligenceSnapshotRepo
}

func NewIntelligenceBase(
	projectionService *services.ProjectionService,
	snapshotRepo *persistence.IntelligenceSnapshotRepo,
) *IntelligenceBase {
	return &IntelligenceBase{
		projectionService: projectionService,
		snapshotRepo:      snapshotRepo,
	}
}

// intelligenceResponse is the standard wrapper for every intelligence endpoint.
type intelligenceResponse struct {
	TenantID         string          `json:"tenant_id"`
	IntelligenceMode string          `json:"intelligence_mode"`
	SnapshotType     string          `json:"snapshot_type"`
	SnapshotID       string          `json:"snapshot_id,omitempty"`
	ScopeType        string          `json:"scope_type,omitempty"`
	ScopeRef         *string         `json:"scope_ref,omitempty"`
	WindowStart      *time.Time      `json:"window_start,omitempty"`
	WindowEnd        *time.Time      `json:"window_end,omitempty"`
	ComputedAt       *time.Time      `json:"computed_at,omitempty"`
	ModelVersion     *string         `json:"model_version,omitempty"`
	Data             json.RawMessage `json:"data"` // the actual snapshot JSON
	DataAvailable    bool            `json:"data_available"`
	Reason           string          `json:"reason,omitempty"` // why data is unavailable
}

// buildSnapshotResponseAnyScope fetches the most recent snapshot of a given type
// ignoring scope_ref — used when no specific scope is requested (e.g. Pattern
// overview with no batch_id).
func (b *IntelligenceBase) buildSnapshotResponseAnyScope(
	r *http.Request,
	tenantID string,
	snapshotType string,
	scopeType string,
) intelligenceResponse {
	mode := b.projectionService.Mode()
	snap, err := b.snapshotRepo.GetLatestByTypeAnyScope(r.Context(), tenantID, snapshotType, scopeType)

	base := intelligenceResponse{
		TenantID:         tenantID,
		IntelligenceMode: string(mode),
		SnapshotType:     snapshotType,
	}
	if err != nil {
		base.DataAvailable = false
		base.Reason = "internal error reading snapshot"
		base.Data = json.RawMessage([]byte(`null`))
		return base
	}
	if snap == nil {
		base.DataAvailable = false
		base.Data = json.RawMessage([]byte(`null`))
		base.Reason = "no_data — no batch summary events received yet"
		return base
	}
	base.SnapshotID = snap.SnapshotID
	base.ScopeType = snap.ScopeType
	base.ScopeRef = snap.ScopeRef
	base.WindowStart = &snap.WindowStart
	base.WindowEnd = &snap.WindowEnd
	base.ComputedAt = &snap.CreatedAt
	base.ModelVersion = snap.ModelVersion
	base.Data = json.RawMessage(snap.SnapshotJSON)
	base.DataAvailable = true
	return base
}

// buildSnapshotResponse fetches the latest snapshot of a given type for a tenant
// and wraps it in the standard intelligence response envelope.
func (b *IntelligenceBase) buildSnapshotResponse(
	r *http.Request,
	tenantID string,
	snapshotType string,
	scopeType string,
	scopeRef *string,
) intelligenceResponse {
	mode := b.projectionService.Mode()

	snap, err := b.snapshotRepo.GetLatestByType(
		r.Context(),
		tenantID,
		snapshotType,
		scopeType,
		scopeRef,
	)

	base := intelligenceResponse{
		TenantID:         tenantID,
		IntelligenceMode: string(mode),
		SnapshotType:     snapshotType,
	}

	if err != nil {
		base.DataAvailable = false
		base.Reason = "internal error reading snapshot"
		base.Data = json.RawMessage([]byte(`null`))
		return base
	}

	if snap == nil {
		base.DataAvailable = false
		base.Data = json.RawMessage([]byte(`null`))
		switch snapshotType {
		case "LEAKAGE":
			base.Reason = "no_data — no attachment decisions or variance records received yet"
		case "AMBIGUITY":
			base.Reason = "no_data — no attachment decisions received yet"
		case "DEFENSIBILITY":
			base.Reason = "no_data — no evidence packs or governance decisions received yet"
		case "RCA":
			base.Reason = "no_data — no failure events or DLQ events processed yet"
		case "PATTERN":
			base.Reason = "no_data — no batch summary events received yet"
		case "RECOMMENDATION":
			base.Reason = "no_data — recommendation layer has no upstream snapshots to synthesise yet"
		default:
			base.Reason = "no_data — no events processed yet for this intelligence layer"
		}
		return base
	}

	base.SnapshotID = snap.SnapshotID
	base.ScopeType = snap.ScopeType
	base.ScopeRef = snap.ScopeRef
	base.WindowStart = &snap.WindowStart
	base.WindowEnd = &snap.WindowEnd
	base.ComputedAt = &snap.CreatedAt
	base.ModelVersion = snap.ModelVersion
	base.Data = json.RawMessage(snap.SnapshotJSON)
	base.DataAvailable = true
	return base
}

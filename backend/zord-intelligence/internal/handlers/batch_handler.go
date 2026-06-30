package handlers

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/persistence"
	"github.com/zord/zord-intelligence/internal/services"
)

// BatchHandler serves batch-level endpoints out of the intelligence layer.
type BatchHandler struct {
	batchRepo         *persistence.BatchContractRepo
	projRepo          *persistence.ProjectionRepo
	projectionService *services.ProjectionService
}

// NewBatchHandler creates a BatchHandler.
func NewBatchHandler(
	batchRepo *persistence.BatchContractRepo,
	projRepo *persistence.ProjectionRepo,
	projectionService *services.ProjectionService,
) *BatchHandler {
	return &BatchHandler{
		batchRepo:         batchRepo,
		projRepo:          projRepo,
		projectionService: projectionService,
	}
}

// batchContractResponse is the API-facing shape of a BatchContract.
// Identical to persistence.BatchContract except the 6 coverage/score float fields
// are scaled to 0–100 (percentage) instead of the raw 0–1 fractions stored in the DB.
type batchContractResponse struct {
	BatchID                    string          `json:"batch_id"`
	TenantID                   string          `json:"tenant_id"`
	SourceReference            *string         `json:"source_reference,omitempty"`
	TotalCount                 int             `json:"total_count"`
	SuccessCount               int             `json:"success_count"`
	FailedCount                int             `json:"failed_count"`
	PendingCount               int             `json:"pending_count"`
	ReversedCount              int             `json:"reversed_count"`
	PartialReconCount          int             `json:"partial_recon_count"`
	TotalIntendedAmountMinor   decimal.Decimal `json:"total_intended_amount_minor"`
	TotalConfirmedAmountMinor  decimal.Decimal `json:"total_confirmed_amount_minor"`
	OriginalSettledAmountMinor decimal.Decimal `json:"original_settled_amount_minor"`
	TotalVarianceMinor         decimal.Decimal `json:"total_variance_minor"`
	BatchFinalityStatus        string          `json:"batch_finality_status"`
	AmbiguityScore             *float64        `json:"ambiguity_score,omitempty"`
	MatchConfidence            *float64        `json:"match_confidence,omitempty"`
	DefensibilityTier          *string         `json:"defensibility_tier,omitempty"`
	LastUpdatedAt              time.Time       `json:"last_updated_at"`
	CreatedAt                  time.Time       `json:"created_at"`
	BatchCurrency              *string         `json:"currency,omitempty"`
	BatchSourceSystem          *string         `json:"source_system,omitempty"`
	BatchRail                  *string         `json:"rail,omitempty"`
	BatchIntentType            *string         `json:"intent_type,omitempty"`
	BatchProviderKey           *string         `json:"provider_key,omitempty"`
	FirstIntentCreatedAt       *time.Time      `json:"first_intent_created_at,omitempty"`
	UnderSettlementAmountMinor decimal.Decimal `json:"under_settlement_amount_minor"`
	PredictedLeakageRate       *decimal.Decimal `json:"predicted_leakage_rate,omitempty"`
	PredictedLeakageMinor      *decimal.Decimal `json:"predicted_leakage_minor,omitempty"`
	PredictedLeakageModelID    *string          `json:"predicted_leakage_model_id,omitempty"`
	PredictedAt                *time.Time       `json:"predicted_at,omitempty"`
	TotalIntentCount                int             `json:"total_intent_count"`
	MatchedIntentCount              int             `json:"matched_intent_count"`
	UnresolvedIntentCount           int             `json:"unresolved_intent_count"`
	OrphanObservationCount          int             `json:"orphan_observation_count"`
	OriginalIntendedAmountMinor     decimal.Decimal `json:"original_intended_amount_minor"`
	UnresolvedIntendedAmountMinor   decimal.Decimal `json:"unresolved_intended_amount_minor"`
	OrphanObservedAmountMinor       decimal.Decimal `json:"orphan_observed_amount_minor"`
	NetBatchDeltaMinor              decimal.Decimal `json:"net_batch_delta_minor"`
	IntentCountCoverage             float64         `json:"intent_count_coverage"`
	IntentValueCoverage             float64         `json:"intent_value_coverage"`
	ObservedCountAllocationCoverage float64         `json:"observed_count_allocation_coverage"`
	ObservedValueAllocationCoverage float64         `json:"observed_value_allocation_coverage"`
	UnmatchedAmountMinor       decimal.Decimal `json:"unmatched_amount_minor"`
	ReversalExposureMinor      decimal.Decimal `json:"reversal_exposure_minor"`
	OrphanAmountMinor          decimal.Decimal `json:"orphan_amount_minor"`
	DuplicateRiskExposureMinor decimal.Decimal `json:"duplicate_risk_exposure_minor"`
	MissingRefCount            int             `json:"missing_ref_count"`
	UnexplainedVarianceMinor   decimal.Decimal `json:"unexplained_variance_minor"`
	WhitelistedDeductionMinor  decimal.Decimal `json:"whitelisted_deduction_minor"`
	SettlementRefCount    int `json:"settlement_ref_count"`
	BankRefPresentCount   int `json:"bank_ref_present_count"`
	DecisionRefCount      int `json:"decision_ref_count"`
	ClientRefPresentCount int `json:"client_ref_present_count"`
}

func newBatchContractResponse(b persistence.BatchContract) batchContractResponse {
	pct := func(v float64) float64 { return math.Round(v*10000) / 100 }
	pctPtr := func(v *float64) *float64 {
		if v == nil {
			return nil
		}
		p := pct(*v)
		return &p
	}
	return batchContractResponse{
		BatchID:                    b.BatchID,
		TenantID:                   b.TenantID,
		SourceReference:            b.SourceReference,
		TotalCount:                 b.TotalCount,
		SuccessCount:               b.SuccessCount,
		FailedCount:                b.FailedCount,
		PendingCount:               b.PendingCount,
		ReversedCount:              b.ReversedCount,
		PartialReconCount:          b.PartialReconCount,
		TotalIntendedAmountMinor:   b.TotalIntendedAmountMinor,
		TotalConfirmedAmountMinor:  b.TotalConfirmedAmountMinor,
		OriginalSettledAmountMinor: b.OriginalSettledAmountMinor,
		TotalVarianceMinor:         b.TotalVarianceMinor,
		BatchFinalityStatus:        b.BatchFinalityStatus,
		AmbiguityScore:             pctPtr(b.AmbiguityScore),
		MatchConfidence:            pctPtr(b.MatchConfidence),
		DefensibilityTier:          b.DefensibilityTier,
		LastUpdatedAt:              b.LastUpdatedAt,
		CreatedAt:                  b.CreatedAt,
		BatchCurrency:              b.BatchCurrency,
		BatchSourceSystem:          b.BatchSourceSystem,
		BatchRail:                  b.BatchRail,
		BatchIntentType:            b.BatchIntentType,
		BatchProviderKey:           b.BatchProviderKey,
		FirstIntentCreatedAt:       b.FirstIntentCreatedAt,
		UnderSettlementAmountMinor: b.UnderSettlementAmountMinor,
		PredictedLeakageRate:       b.PredictedLeakageRate,
		PredictedLeakageMinor:      b.PredictedLeakageMinor,
		PredictedLeakageModelID:    b.PredictedLeakageModelID,
		PredictedAt:                b.PredictedAt,
		TotalIntentCount:                b.TotalIntentCount,
		MatchedIntentCount:              b.MatchedIntentCount,
		UnresolvedIntentCount:           b.UnresolvedIntentCount,
		OrphanObservationCount:          b.OrphanObservationCount,
		OriginalIntendedAmountMinor:     b.OriginalIntendedAmountMinor,
		UnresolvedIntendedAmountMinor:   b.UnresolvedIntendedAmountMinor,
		OrphanObservedAmountMinor:       b.OrphanObservedAmountMinor,
		NetBatchDeltaMinor:              b.NetBatchDeltaMinor,
		IntentCountCoverage:             pct(b.IntentCountCoverage),
		IntentValueCoverage:             pct(b.IntentValueCoverage),
		ObservedCountAllocationCoverage: pct(b.ObservedCountAllocationCoverage),
		ObservedValueAllocationCoverage: pct(b.ObservedValueAllocationCoverage),
		UnmatchedAmountMinor:       b.UnmatchedAmountMinor,
		ReversalExposureMinor:      b.ReversalExposureMinor,
		OrphanAmountMinor:          b.OrphanAmountMinor,
		DuplicateRiskExposureMinor: b.DuplicateRiskExposureMinor,
		MissingRefCount:            b.MissingRefCount,
		UnexplainedVarianceMinor:   b.UnexplainedVarianceMinor,
		WhitelistedDeductionMinor:  b.WhitelistedDeductionMinor,
		SettlementRefCount:    b.SettlementRefCount,
		BankRefPresentCount:   b.BankRefPresentCount,
		DecisionRefCount:      b.DecisionRefCount,
		ClientRefPresentCount: b.ClientRefPresentCount,
	}
}

// GetBatch handles GET /v1/intelligence/batches/{batch_id}?tenant_id=X
func (h *BatchHandler) GetBatch(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	batchID := chi.URLParam(r, "batch_id")

	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	if batchID == "" {
		writeError(w, http.StatusBadRequest, "batch_id is required")
		return
	}

	mode := h.projectionService.Mode()

	batch, err := h.batchRepo.GetByID(r.Context(), batchID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch batch")
		return
	}
	if batch == nil || batch.TenantID != tenantID {
		writeError(w, http.StatusNotFound, "batch not found")
		return
	}

	var batchHealth interface{} = nil
	healthProj, err := h.projRepo.GetLatest(r.Context(), tenantID, "batch.health."+batchID)
	if err == nil && healthProj != nil {
		var raw map[string]interface{}
		if jsonErr := json.Unmarshal([]byte(healthProj.ValueJSON), &raw); jsonErr == nil {
			pctKey := func(key string) {
				if v, ok := raw[key]; ok {
					if f, ok2 := v.(float64); ok2 {
						raw[key] = math.Round(f*10000) / 100
					}
				}
			}
			pctKey("aggregate_score")
			pctKey("ambiguity_score")
			batchHealth = raw
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id":         tenantID,
		"intelligence_mode": string(mode),
		"batch":             newBatchContractResponse(*batch),
		"batch_health":      batchHealth,
	})
}

// ListBatches handles GET /v1/intelligence/batches?tenant_id=X[&status=REQUIRES_REVIEW]
func (h *BatchHandler) ListBatches(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	mode := h.projectionService.Mode()
	statusFilter := r.URL.Query().Get("status")

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		var parsed int
		if _, err := fmt.Sscanf(l, "%d", &parsed); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	var raw []persistence.BatchContract
	var err error

	switch statusFilter {
	case "REQUIRES_REVIEW":
		raw, err = h.batchRepo.ListRequiringReview(r.Context(), tenantID, limit)
	case "SETTLED", "PARTIALLY_SETTLED", "PENDING", "FAILED", "CANCELLED":
		raw, err = h.batchRepo.ListByFinalityStatus(r.Context(), tenantID, statusFilter, limit)
	default:
		raw, err = h.batchRepo.ListByTenant(r.Context(), tenantID, limit)
	}

	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch batches")
		return
	}

	batches := make([]batchContractResponse, len(raw))
	for i, b := range raw {
		batches[i] = newBatchContractResponse(b)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id":         tenantID,
		"intelligence_mode": string(mode),
		"status_filter":     statusFilter,
		"batches":           batches,
	})
}

package handlers

// dashboard_batch_contract_handler.go
//
// GET /v1/intelligence/dashboard/batch_contract/{batch_id}?tenant_id=X
//
// Returns per-batch reference coverage and risk amounts straight from the
// batch_contracts table for a single batch.
//
//   - bank_reference_coverage — bank_ref_present_count / settlement_ref_count * 100,
//     formatted as a percentage string (e.g. "77.44%"). Percentage of
//     settlement observations for this batch that carried a bank-side
//     reference (BankRef, UTR, or RRN). null when no settlement
//     observations have been recorded yet.
//   - client_reference_coverage — client_ref_present_count / decision_ref_count * 100,
//     formatted as a percentage string (e.g. "77.44%"). Percentage of
//     attachment decisions for this batch that carried a client-side
//     reference (ClientReference). null when no attachment decisions
//     have been recorded yet.
//   - missing_reference_rate  — 100 - average(bank_reference_coverage,
//     client_reference_coverage), formatted as a percentage string (e.g.
//     "22.56%"). A null coverage component is treated as 0% (i.e. 100%
//     missing) for this average.
//   - match_confidence        — aggregate_match_confidence from the latest
//     BatchSummaryUpdatedEvent (Service 5C). 0.0-1.0, null until the first
//     batch.summary.updated event for this batch.
//   - variance_amount         — total_variance_minor
//   - orphan_amount           — orphan_amount_minor
//   - unmatch_amount          — unmatched_amount_minor
//   - total_confirmed_amount  — total_confirmed_amount_minor
//   - original_settled_amount — original_settled_amount_minor

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// DashboardBatchContractHandler serves GET /v1/intelligence/dashboard/batch_contract/{batch_id}.
type DashboardBatchContractHandler struct {
	batchRepo        *persistence.BatchContractRepo
	intelligenceMode string
}

// NewDashboardBatchContractHandler creates a DashboardBatchContractHandler.
func NewDashboardBatchContractHandler(batchRepo *persistence.BatchContractRepo, mode string) *DashboardBatchContractHandler {
	return &DashboardBatchContractHandler{batchRepo: batchRepo, intelligenceMode: mode}
}

// GetBatchContract handles GET /v1/intelligence/dashboard/batch_contract/{batch_id}?tenant_id=X
func (h *DashboardBatchContractHandler) GetBatchContract(w http.ResponseWriter, r *http.Request) {
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

	batch, err := h.batchRepo.GetByID(r.Context(), batchID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch batch")
		return
	}
	if batch == nil || batch.TenantID != tenantID {
		writeError(w, http.StatusNotFound, "batch not found")
		return
	}

	var bankPct, clientPct float64
	var bankReferenceCoverage interface{} = nil
	if batch.SettlementRefCount > 0 {
		bankPct = float64(batch.BankRefPresentCount) / float64(batch.SettlementRefCount) * 100
		bankReferenceCoverage = fmt.Sprintf("%.2f%%", bankPct)
	}

	var clientReferenceCoverage interface{} = nil
	if batch.DecisionRefCount > 0 {
		clientPct = float64(batch.ClientRefPresentCount) / float64(batch.DecisionRefCount) * 100
		clientReferenceCoverage = fmt.Sprintf("%.2f%%", clientPct)
	}

	missingReferenceRate := fmt.Sprintf("%.2f%%", 100-(bankPct+clientPct)/2)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id":                 tenantID,
		"intelligence_mode":         h.intelligenceMode,
		"batch_id":                  batch.BatchID,
		"bank_reference_coverage":   bankReferenceCoverage,
		"settlement_ref_count":      batch.SettlementRefCount,
		"bank_ref_present_count":    batch.BankRefPresentCount,
		"client_reference_coverage": clientReferenceCoverage,
		"decision_ref_count":        batch.DecisionRefCount,
		"client_ref_present_count":  batch.ClientRefPresentCount,
		"missing_reference_rate":    missingReferenceRate,
		"match_confidence":          batch.MatchConfidence,
		"variance_amount":           batch.TotalVarianceMinor,
		"orphan_amount":             batch.OrphanAmountMinor,
		"unmatch_amount":            batch.UnmatchedAmountMinor,
		"total_confirmed_amount":    batch.TotalConfirmedAmountMinor,
		"original_settled_amount":   batch.OriginalSettledAmountMinor,
	})
}

package handlers

// routes.go
//
// Wires every URL route to the right handler function.
// This is the ONLY file that knows the full URL map of ZPI.
//
// PHASE 6 ADDITIONS:
//
//   GET  /v1/intelligence/mode
//        → Current operating mode (GRADE_A/GRADE_B), full capability catalogue,
//          upgrade path guidance. No tenant_id required.
//
//   GET  /v1/intelligence/mode/status?tenant_id=X
//        → Per-signal health check: which upstream Kafka topics are active.
//          Powers the "data health" panel in the ops dashboard.
//
//   GET  /v1/intelligence/leakage?tenant_id=X
//        → Leakage & Value-at-Risk intelligence snapshot. Grade A + B.
//
//   GET  /v1/intelligence/ambiguity?tenant_id=X
//        → Ambiguity / Confidence intelligence snapshot. Grade A + B.
//
//   GET  /v1/intelligence/defensibility?tenant_id=X
//        → Evidence & Defensibility intelligence snapshot. Grade A + B.
//
//   GET  /v1/intelligence/rca/clusters?tenant_id=X[&batch_id=Y][&limit=10]
//        → HDBSCAN RCA cluster results. Grade A.
//
//   GET  /v1/intelligence/pattern?tenant_id=X
//        → Pattern & Pre-Dispatch Quality intelligence snapshot. Grade A + B.
//
//   GET  /v1/intelligence/recommendation?tenant_id=X
//        → Recommendation intelligence snapshot. Grade A + B.
//
//   GET  /v1/intelligence/batches/{batch_id}?tenant_id=X
//        → Full batch intelligence for one batch. Grade A + B.
//
//   GET  /v1/intelligence/batches?tenant_id=X[&status=REQUIRES_REVIEW]
//        → List of all batches for tenant. Grade A + B.
//
//   GET  /v1/intelligence/{type}/history?tenant_id=X&limit=N
//        → Snapshot history for a given intelligence type. Grade A + B.
//        Valid types: leakage, ambiguity, defensibility, rca, pattern, recommendation.
//
// ROUTE ORDER RULES:
//   1. Static paths before parameterised paths (chi requirement)
//   2. /mode/status before /mode (both static, but /mode/status is more specific)
//   3. /batches (list) before /batches/{batch_id} (parameterised)
//   4. /actions/pending-approval before /actions/{action_id}

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

// NewRouter creates and returns the fully wired HTTP router.
func NewRouter(
	healthH *HealthHandler,
	kpiH *KPIHandler,
	policyH *PolicyHandler,
	actionH *ActionHandler,
	modeH *IntelligenceModeHandler,
	leakageH *LeakageHandler,
	ambiguityH *AmbiguityHandler,
	defensibilityH *DefensibilityHandler,
	rcaH *RCAHandler,
	patternH *PatternHandler,
	recommendationH *RecommendationHandler,
	batchH *BatchHandler,
	leakageTimeseriesH *LeakageTimeseriesHandler,
	historyH *HistoryHandler,
	explanationH *ExplanationHandler,
	// Dashboard handlers — frontend-facing endpoints (always contain /dashboard/ in path)
	dashLeakageH *DashboardLeakageHandler,
	dashAmbiguityH *DashboardAmbiguityHandler,
	dashDefensibilityH *DashboardDefensibilityHandler,
	dashPatternH *DashboardPatternHandler,
	dashRecommendationH *DashboardRecommendationHandler,
	dashRCAH *DashboardRCAHandler,
	dashBubbleMapH *DashboardBubbleMapHandler,
	dashBatchContractH *DashboardBatchContractHandler,
) http.Handler {

	r := chi.NewRouter()

	// ── Middleware ─────────────────────────────────────────────────────────
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(middleware.Logger)

	// Phase 7 Issue 7 Fix: Attach global Tenant Validation Header injection guarding routes.
	r.Use(TenantIsolationMiddleware)

	// ── Health check endpoints ─────────────────────────────────────────────
	r.Get("/healthz", healthH.Liveness)
	r.Get("/readyz", healthH.Readiness)

	// ── API v1 routes ──────────────────────────────────────────────────────
	r.Route("/v1/intelligence", func(r chi.Router) {

		// ── KPI / Projection endpoints (Grade B gated in kpi_handler.go) ───

		r.Get("/kpis", kpiH.GetKPIs)
		r.Get("/corridors/health", kpiH.GetCorridorHealth)
		r.Get("/failures/top", kpiH.GetTopFailures)
		r.Get("/sla", kpiH.GetSLAStatus)
		r.Get("/sla-breach", kpiH.GetSLABreachRate)
		r.Get("/retry-recovery", kpiH.GetRetryRecoveryRate)
		r.Get("/statement-match", kpiH.GetStatementMatchRate)
		r.Get("/provider-ref-missing", kpiH.GetProviderRefMissingRate)
		r.Get("/fusion-conflicts", kpiH.GetConflictRateInFusion)

		r.Route("/ml", func(r chi.Router) {
			r.Get("/anomaly", kpiH.GetMLAnomaly)
			r.Get("/sla-risk", kpiH.GetMLSlaRisk)
			r.Get("/failure-shift", kpiH.GetMLFailureShift)
		})

		// ── PHASE 6: Intelligence Mode endpoints ──────────────────────────
		//
		// /mode/status must be registered BEFORE /mode in chi.
		// If /mode is registered first as r.Get("/mode", ...), chi will also
		// match GET /mode/status (chi does prefix matching for sub-routes).
		// Using r.Route keeps them explicit and order-safe.

		r.Route("/mode", func(r chi.Router) {
			// GET /v1/intelligence/mode/status?tenant_id=X
			// Per-signal health check for a specific tenant.
			r.Get("/status", modeH.GetModeStatus)

			// GET /v1/intelligence/mode
			// Service-level mode declaration + capability catalogue.
			r.Get("/", modeH.GetMode)
		})

		// ── PHASE 6: Intelligence Surface endpoints (Grade A + B) ─────────
		//
		// These are the six intelligence layer APIs that expose the commercial
		// intelligence surfaces computed by Phase 4 services.
		// All six are available in both Grade A and Grade B.
		// Grade B-only data is exposed only through KPI endpoints above.

		r.Get("/leakage", leakageH.GetLeakage)
		r.Get("/ambiguity", ambiguityH.GetAmbiguity)
		r.Get("/defensibility", defensibilityH.GetDefensibility)
		r.Get("/rca/clusters", rcaH.GetRCAClusters)
		r.Get("/pattern", patternH.GetPattern)
		r.Get("/recommendation", recommendationH.GetRecommendation)
		r.Get("/timeseries/leakage-exposure", leakageTimeseriesH.GetLeakageExposure)

		// ── PHASE 6: Batch intelligence endpoints ─────────────────────────
		//
		// Route order: list (/batches) before detail (/batches/{batch_id}).
		// chi matches routes in registration order for routes at the same depth.

		r.Route("/batches", func(r chi.Router) {
			// GET /v1/intelligence/batches?tenant_id=X[&status=REQUIRES_REVIEW]
			r.Get("/", batchH.ListBatches)

			// GET /v1/intelligence/batches/{batch_id}?tenant_id=X
			r.Get("/{batch_id}", batchH.GetBatch)
		})

		// ── PHASE 6: Snapshot history endpoint ───────────────────────────
		//
		// GET /v1/intelligence/{type}/history?tenant_id=X&limit=N
		// Valid types: leakage, ambiguity, defensibility, rca, pattern, recommendation
		// Uses {type} URL param to keep one handler serving all snapshot types.
		r.Get("/{type}/history", historyH.GetSnapshotHistory)

		// ── PHASE 7: Explanation endpoints ────────────────────────────────
		r.Get("/explanations/{snapshot_id}", explanationH.GetExplanation)
		r.Post("/explain-batch", explanationH.ExplainBatch)

		// ── Dashboard KPI endpoints (frontend-facing) ─────────────────────
		//
		// All paths contain /dashboard/ so they are identifiable as
		// frontend-consumed endpoints distinct from internal service APIs.
		//
		// Supported query params (all dashboard routes):
		//   tenant_id  required
		//   from_date  optional YYYY-MM-DD
		//   to_date    optional YYYY-MM-DD
		//   batch_id   optional (patterns only — scopes to a specific batch)
		//   provider   optional (accepted, ignored in Grade A)
		r.Route("/dashboard", func(r chi.Router) {
			r.Get("/leakage", dashLeakageH.GetLeakageKPIs)
			r.Route("/ambiguity", func(r chi.Router) {
				r.Get("/", dashAmbiguityH.GetAmbiguityKPIs)
				r.Get("/heatmap", dashAmbiguityH.GetBatchMatchHeatmap)
			})
			r.Get("/defensibility", dashDefensibilityH.GetDefensibilityKPIs)
			r.Get("/patterns", dashPatternH.GetPatternKPIs)
			r.Get("/recommendations", dashRecommendationH.GetRecommendationKPIs)
			r.Get("/rca", dashRCAH.GetRCAKPIs)
			r.Get("/bubble-map", dashBubbleMapH.GetBubbleMap)
			r.Get("/batch_contract/{batch_id}", dashBatchContractH.GetBatchContract)
		})

		// ── Policy endpoints ───────────────────────────────────────────────
		r.Route("/policies", func(r chi.Router) {
			r.Get("/", policyH.ListPolicies)
			r.Post("/", policyH.CreatePolicy)
			r.Route("/{id}", func(r chi.Router) {
				r.Get("/", policyH.GetPolicy)
				r.Post("/enable", policyH.EnablePolicy)
				r.Post("/disable", policyH.DisablePolicy)
			})
		})

		// ── Action Contract endpoints ──────────────────────────────────────
		//
		// ROUTE ORDER (critical for chi):
		//   1. /actions/pending-approval  (static — registered first)
		//   2. /actions                   (no path param)
		//   3. /actions/{action_id}       (parameterised — registered last)
		//   4. POST /actions/{action_id}/approve
		//   5. POST /actions/{action_id}/dismiss

		r.Route("/actions", func(r chi.Router) {
			// GET /v1/intelligence/actions/pending-approval?tenant_id=X
			r.Get("/pending-approval", actionH.ListPendingApproval)

			// GET /v1/intelligence/actions?tenant_id=X[&limit=50][&before=RFC3339]
			// GET /v1/intelligence/actions?tenant_id=X&decision=HOLD
			// GET /v1/intelligence/actions?tenant_id=X&policy_family=LEAKAGE
			r.Get("/", actionH.ListActions)

			r.Route("/{action_id}", func(r chi.Router) {
				r.Get("/", actionH.GetAction)
				r.Post("/approve", actionH.ApproveAction)
				r.Post("/dismiss", actionH.DismissAction)
			})
		})
	})

	return otelhttp.NewHandler(r, "zord-intelligence")
}

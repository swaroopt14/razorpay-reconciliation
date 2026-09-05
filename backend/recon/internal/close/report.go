package close

import "time"

type ExceptionItem struct {
	EntityID   string `json:"entity_id"`
	EntityType string `json:"entity_type"`
	Reason     string `json:"reason"`
	Result     string `json:"result"`
	Variance   int64  `json:"variance"`
	Certainty  string `json:"certainty,omitempty"`
}

type AccuracyReport struct {
	Precision              float64 `json:"precision"`
	Recall                 float64 `json:"recall"`
	F1                     float64 `json:"f1"`
	MatchRate              float64 `json:"match_rate"`
	FalseMatchRate         float64 `json:"false_match_rate"`
	ExceptionCaptureRate   float64 `json:"exception_capture_rate"`
	VarianceDetectionRate  float64 `json:"variance_detection_rate"`
	AmountWeightedAccuracy float64 `json:"amount_weighted_accuracy"`
	Scored                 int     `json:"scored"`
	Correct                int     `json:"correct"`
}

type Report struct {
	CloseRunID              string          `json:"close_run_id"`
	TenantID                string          `json:"tenant_id"`
	ConnectorID             string          `json:"connector_id"`
	BatchID                 string          `json:"batch_id"`
	ReconRunID              string          `json:"recon_run_id"`
	Records                 int             `json:"records"`
	Matched                 int             `json:"matched"`
	Exceptions              int             `json:"exceptions"`
	MatchRate               float64         `json:"match_rate"`
	Investigated            int             `json:"investigated"`
	ResolvedByInvestigation int             `json:"resolved_by_investigation"`
	StillUnresolved         int             `json:"still_unresolved"`
	UnresolvedExposureMinor int64           `json:"unresolved_exposure_minor"`
	FalseResolutions        int             `json:"false_resolutions"`
	ThroughputPerS          float64         `json:"throughput_per_s"`
	DurationMS              int64           `json:"duration_ms"`
	Currency                string          `json:"currency"`
	ExceptionList           []ExceptionItem `json:"exception_list"`
	Accuracy                AccuracyReport  `json:"accuracy"`
	CashPosition            map[string]any  `json:"cash_position,omitempty"`
	StartedAt               time.Time       `json:"started_at"`
	CompletedAt             time.Time       `json:"completed_at"`
}

type RunRequest struct {
	TenantID       string
	ConnectorID    string
	AccountID      string
	BatchID        string
	MaxInvestigate int
}

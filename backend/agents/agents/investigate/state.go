package investigate

const (
	StatusRunning      = "running"
	StatusCompleted    = "completed"
	StatusLimitReached = "limit_reached"
	StatusRefused      = "refused"

	CertaintyProven   = "PROVEN"
	CertaintyLikely   = "LIKELY"
	CertaintyPossible = "POSSIBLE"
	CertaintyUnknown  = "UNKNOWN"

	HypPossible     = "POSSIBLE"
	HypSupported    = "SUPPORTED"
	HypContradicted = "CONTRADICTED"
	HypProven       = "PROVEN"
	HypUnknown      = "UNKNOWN"

	ImpactUnresolved = "UNRESOLVED_EXPOSURE"

	ClassFailedMovement    = "FAILED_WITH_MONEY_MOVEMENT"
	ClassMissingSettlement = "MISSING_SETTLEMENT"
	ClassBankMismatch      = "BANK_MISMATCH"
	ClassAmountVariance    = "AMOUNT_VARIANCE"
	ClassAmbiguousBank     = "AMBIGUOUS_BANK"
	ClassPayoutMissingBank = "PAYOUT_MISSING_BANK"
	ClassPayoutFailedMove  = "PAYOUT_FAILED_WITH_MOVEMENT"
	ClassPayoutOpenSLA     = "PAYOUT_OPEN_SLA"
	ClassProviderConflict  = "PROVIDER_STATE_CONFLICT"
	ClassUnknown           = "UNKNOWN"
)

type Limits struct {
	MaxIterations int
	MaxToolCalls  int
	MaxSameTool   int
}

func DefaultLimits() Limits {
	return Limits{MaxIterations: 12, MaxToolCalls: 20, MaxSameTool: 2}
}

type Request struct {
	TenantID    string
	ConnectorID string
	ExceptionID string
	EntityType  string
	EntityID    string
	Limits      Limits
	Persist     bool
}

type Hypothesis struct {
	ID                    string   `json:"id"`
	Statement             string   `json:"statement"`
	Status                string   `json:"status"`
	Confidence            float64  `json:"confidence"`
	SupportingEvidence    []string `json:"supporting_evidence,omitempty"`
	ContradictingEvidence []string `json:"contradicting_evidence,omitempty"`
	RequiredEvidence      []string `json:"required_evidence,omitempty"`
}

type Finding struct {
	Finding  string   `json:"finding"`
	Value    any      `json:"value,omitempty"`
	Currency string   `json:"currency,omitempty"`
	Evidence []string `json:"evidence,omitempty"`
}

type ToolCall struct {
	Name    string         `json:"name"`
	Args    string         `json:"args"`
	OK      bool           `json:"ok"`
	Error   string         `json:"error,omitempty"`
	Summary string         `json:"summary,omitempty"`
	Result  map[string]any `json:"-"`
}

type RootCause struct {
	Category  string `json:"category"`
	Certainty string `json:"certainty"`
}

type Impact struct {
	Amount   int64  `json:"amount"`
	Currency string `json:"currency"`
	Type     string `json:"type"`
}

type Trace struct {
	Plan       []string     `json:"plan"`
	ToolCalls  []ToolCall   `json:"tool_calls"`
	Hypotheses []Hypothesis `json:"hypotheses"`
}

type InvestigationState struct {
	InvestigationID string
	TenantID        string
	ConnectorID     string
	EntityType      string
	EntityID        string
	ExceptionID     string
	ExceptionReason string
	Phase6Result    string
	ProviderStatus  string
	Plan            []string
	Sources         map[string]map[string]any
	Hypotheses      []Hypothesis
	Evidence        []string
	Findings        []Finding
	ImpactMinor     int64
	ExpectedAmount  int64
	ObservedAmount  int64
	Currency        string
	Missing         []string
	ToolCalls       []ToolCall
	Iteration       int
	Status          string
	RootCause       string
	Classification  string
	Certainty       string
	Recommendation  string
	Limitations     []string
	Summary         string
	OutcomeID       string
	Limits          Limits
	Refused         bool
}

type Report struct {
	InvestigationID        string       `json:"investigation_id"`
	TenantID               string       `json:"tenant_id,omitempty"`
	EntityType             string       `json:"entity_type"`
	EntityID               string       `json:"entity_id"`
	ExceptionID            string       `json:"exception_id,omitempty"`
	Status                 string       `json:"status"`
	Classification         string       `json:"classification"`
	RootCause              RootCause    `json:"root_cause"`
	FinancialImpact        Impact       `json:"financial_impact"`
	Findings               []Finding    `json:"findings"`
	Hypotheses             []Hypothesis `json:"hypotheses"`
	Evidence               []string     `json:"evidence"`
	MissingEvidence        []string     `json:"missing_evidence"`
	Recommendation         string       `json:"recommendation"`
	Limitations            []string     `json:"limitations"`
	Summary                string       `json:"summary"`
	Iterations             int          `json:"iterations"`
	ToolCallCount          int          `json:"tool_calls"`
	Phase6Result           string       `json:"phase6_result,omitempty"`
	ProviderStatus         string       `json:"provider_status,omitempty"`
	OutcomeInvestigationID string       `json:"outcome_investigation_id,omitempty"`
	Trace                  *Trace       `json:"trace,omitempty"`
}

func (r Report) Text() string {
	var b []byte
	b = append(b, r.Summary...)
	b = append(b, ' ')
	b = append(b, r.Recommendation...)
	for _, f := range r.Findings {
		b = append(b, ' ')
		b = append(b, f.Finding...)
	}
	for _, l := range r.Limitations {
		b = append(b, ' ')
		b = append(b, l...)
	}
	return string(b)
}

type BatchRequest struct {
	TenantID            string
	ConnectorID         string
	MaxCases            int
	MinFinancialImpact  int64
	ReconciliationRunID string
	Persist             bool
	Limits              Limits
}

type BatchSummary struct {
	ExceptionsIn      int      `json:"exceptions_in"`
	Completed         int      `json:"completed"`
	Unknown           int      `json:"unknown"`
	Refused           int      `json:"refused"`
	ExposureRemaining int64    `json:"exposure_remaining"`
	FalseResolutions  int      `json:"false_resolutions"`
	Currency          string   `json:"currency"`
	Investigations    []Report `json:"investigations"`
}

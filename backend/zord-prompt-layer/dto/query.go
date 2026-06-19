// Return extracted entities explicitly for frontend rendering/debug
package dto

type QueryRequest struct {
	TenantID  string `json:"tenant_id,omitempty"`
	UserID    string `json:"-"`
	SessionID string `json:"-"`
	Query     string `json:"query" binding:"required"`
	IntentID  string `json:"intent_id,omitempty"`
	TraceID   string `json:"trace_id,omitempty"`
	TopK      int    `json:"top_k,omitempty"`
}

type Citation struct {
	SourceType string  `json:"source_type"`
	RecordID   string  `json:"record_id"`
	ChunkID    string  `json:"chunk_id"`
	Snippet    string  `json:"snippet"`
	Score      float64 `json:"score"`
}

type EntitiesFound struct {
	IntentID string `json:"intent_id,omitempty"`
	TraceID  string `json:"trace_id,omitempty"`
}

type QueryResponse struct {
	Answer        string         `json:"answer"`
	Confidence    string         `json:"confidence"`
	EntitiesFound EntitiesFound  `json:"entities_found"`
	Citations     []Citation     `json:"citations"`
	NextActions   []string       `json:"next_actions"`
	Visualization *Visualization `json:"visualization,omitempty"`
}
type VisualizationPoint struct {
	Label string  `json:"label"`
	Value float64 `json:"value"`
}

type VisualizationMetric struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type VisualizationWindow struct {
	FromUTC string `json:"from_utc,omitempty"`
	ToUTC   string `json:"to_utc,omitempty"`
	Label   string `json:"label,omitempty"`
}
type VisualizationVariant struct {
	ChartType      string                `json:"chart_type"` // bar|pie|donut|line|stacked_bar|table|timeline
	Title          string                `json:"title"`
	Subtitle       string                `json:"subtitle,omitempty"`
	Description    string                `json:"description,omitempty"`
	XAxis          string                `json:"x_axis,omitempty"`
	YAxis          string                `json:"y_axis,omitempty"`
	Series         []VisualizationPoint  `json:"series,omitempty"`
	Legend         []string              `json:"legend,omitempty"`
	Insights       []string              `json:"insights,omitempty"`
	SummaryMetrics []VisualizationMetric `json:"summary_metrics,omitempty"`
}
type Visualization struct {
	VisualizationID   string                 `json:"visualization_id,omitempty"`
	ChartType         string                 `json:"chart_type,omitempty"` // bar|line|stacked_bar|donut|table
	Title             string                 `json:"title"`
	Subtitle          string                 `json:"subtitle,omitempty"`
	Description       string                 `json:"description,omitempty"`
	XAxis             string                 `json:"x_axis"`
	YAxis             string                 `json:"y_axis"`
	Series            []VisualizationPoint   `json:"series"`
	ChartVariants     []VisualizationVariant `json:"chart_variants,omitempty"`
	Legend            []string               `json:"legend,omitempty"`
	Insights          []string               `json:"insights,omitempty"`
	SummaryMetrics    []VisualizationMetric  `json:"summary_metrics,omitempty"`
	TimeWindow        *VisualizationWindow   `json:"time_window,omitempty"`
	Confidence        string                 `json:"confidence,omitempty"`
	EmptyStateMessage string                 `json:"empty_state_message,omitempty"`
}

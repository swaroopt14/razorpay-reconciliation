package model

type RawIntentMessage struct {
	TenantID             string `json:"tenant_id"`
	TraceID              string `json:"trace_id"`
	PayloadHash          []byte `json:"payload_hash"`
	IdempotencyKey       string `json:"idempotency_key"`
	PayloadSize          int    `json:"payload_size"`
	Payload              []byte `json:"raw_payload"`
	ContentType          string `json:"content_type"`
	SourceType           string `json:"source_type"`
	SourceClass          string `json:"source_class"`
	SourceSystem         string `json:"source_system"`
	TenantName           string
	RequestHeadersHash   []byte
	SchemaHint           *string
	MappingProfileHint   *string
	ObjectEncryptionAlg  string
	KMSKeyVersion        string
	ParserClassification *string
	TransportRequestID   *string
	ClientReferenceHint  *string
	SourceSystemHint     *string
	IngressAPIVersion    string
	RetentionPolicyClass string
	WebhookProviderID    *string
	ConnectorBindingID   *string
	EventType            string
	RequestFingerprint   string
	FileName             *string
	FileSizeBytes        *int64
	FileContentHash      *string
	RowCountEstimate     *int
	FileUploadChannel    *string
	SourceRowRef         *string
	BatchID              *string
}

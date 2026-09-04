package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Status string

const (
	StatusReceived      Status = "RECEIVED"
	StatusHandoff       Status = "HANDOFF_OK"
	StatusCanonicalized Status = "CANONICALIZED"
	StatusDLQ           Status = "DLQ"
)

//Signature Part need to update

type IngressEnvelope struct {
	TraceID                      uuid.UUID  `json:"trace_id" db:"trace_id"`
	EnvelopeID                   uuid.UUID  `json:"envelope_id" db:"envelope_id"`
	TenantID                     uuid.UUID  `json:"tenant_id" db:"tenant_id"`
	IngressChannel               string     `json:"ingress_channel" db:"ingress_channel"`
	ArtifactID                   uuid.UUID  `json:"artifact_id" db:"artifact_id"`
	ArtifactVersionID            string     `json:"artifact_version_id" db:"artifact_version_id"`
	SourceClass                  string     `json:"source_class" db:"source_class"`
	SourceSystem                 string     `json:"source_system" db:"source_system"`
	ContentType                  string     `json:"content_type" db:"content_type"`
	IdempotencyKey               string     `json:"idempotency_key" db:"idempotency_key"`
	PayloadSize                  int        `json:"payload_size" db:"payload_size"`
	PayloadHash                  string     `json:"payload_hash" db:"payload_hash"`
	RawRowHash                   string     `json:"raw_row_hash" db:"raw_row_hash"`
	EnvelopeHash                 string     `json:"envelope_hash" db:"envelope_hash"`
	EnvelopeSignature            string     `json:"envelope_signature" db:"envelope_signature"`
	RequestHeadersHash           string     `json:"request_headers_hash" db:"request_headers_hash"`
	SchemaHint                   *string    `json:"schema_hint" db:"schema_hint"`
	MappingProfileHint           *string    `json:"mapping_profile_hint" db:"mapping_profile_hint"`
	ObjectEncryptionAlg          string     `json:"object_encryption_alg" db:"object_encryption_alg"`
	KMSKeyVersion                string     `json:"kms_key_version" db:"kms_key_version"`
	ParserClassification         *string    `json:"parser_classification" db:"parser_classification"`
	TransportRequestID           *string    `json:"transport_request_id" db:"transport_request_id"`
	ClientReferenceHint          *string    `json:"client_reference_hint" db:"client_reference_hint"`
	SourceSystemHint             *string    `json:"source_system_hint" db:"source_system_hint"`
	IngressAPIVersion            string     `json:"ingress_api_version" db:"ingress_api_version"`
	RetentionPolicyClass         string     `json:"retention_policy_class" db:"retention_policy_class"`
	WebhookProviderID            *string    `json:"webhook_provider_id" db:"webhook_provider_id"`
	ConnectorBindingID           *string    `json:"connector_binding_id" db:"connector_binding_id"`
	LeaseID                      *string    `json:"lease_id" db:"lease_id"`
	EventType                    string     `json:"event_type" db:"event_type"`
	LeaseUntil                   *time.Time `json:"lease_until" db:"lease_until"`
	CreatedAt                    time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt                    *time.Time `json:"updated_at" db:"updated_at"`
	PublishedAt                  *time.Time `json:"published_at" db:"published_at"`
	FailureReasonCode            *string    `json:"failure_reason_code" db:"failure_reason_code"`
	EncryptionKeyID              string     `json:"encryption_key_id" db:"encryption_key_id"`
	ObjectStoreVersion           string     `json:"object_store_version" db:"object_store_version"`
	IdempotencyReservationStatus string     `json:"idempotency_reservation_status" db:"idempotency_reservation_status"`
	PrincipalID                  uuid.UUID  `json:"principal_id" db:"principal_id"`
	AuthMethod                   string     `json:"auth_method" db:"auth_method"`
	Status                       Status     `json:"status" db:"status"`
	ObjectRef                    string     `json:"object_ref" db:"object_ref"`
	ReceivedAt                   time.Time  `json:"received_at" db:"received_at"`
	Payload                      json.RawMessage
	FileName                     *string `json:"file_name" db:"file_name"`
	FileSizeBytes                *int64  `json:"file_size_bytes" db:"file_size_bytes"`
	FileContentHash              *string `json:"file_content_hash" db:"file_content_hash"`
	RowCountEstimate             *int    `json:"row_count_estimate" db:"row_count_estimate"`
	FileUploadChannel            *string `json:"file_upload_channel" db:"file_upload_channel"`
	SourceRowRef                 *string `json:"source_row_ref,omitempty" db:"source_row_ref"`
	BatchID                      *string `json:"batchid" db:"batchid"`
}

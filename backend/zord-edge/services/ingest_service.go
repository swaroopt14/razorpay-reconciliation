package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"

	"zord-edge/model"
)

// intent *model.Payment_Intent,
func SaveRawIntent(
	ctx context.Context,
	db *sql.DB,
	envelope *model.IngressEnvelope,

) error {
	//log.Printf("%+v\n", envelope)
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		log.Printf("SaveRawIntent Trasaction Error: %v", err)
		return err
	}

	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	query := `
		INSERT INTO ingress_envelopes
		(trace_id, envelope_id, tenant_id, artifact_id, artifact_version_id, ingress_channel, source_class, source_system, content_type, idempotency_key, payload_size, payload_hash, raw_row_hash, envelope_hash, envelope_signature, vault_object_ref, request_headers_hash, schema_hint, mapping_profile_hint, object_encryption_alg, kms_key_version, parser_classification, transport_request_id, client_reference_hint, source_system_hint, ingress_api_version, retention_policy_class, webhook_provider_id, connector_binding_id, encryption_key_id, object_store_version, idempotency_reservation_status, principal_id, auth_method, status, received_at, file_name, file_size_bytes, file_content_hash, row_count_estimate, file_upload_channel, source_row_ref, batchid)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43)
	`
	_, err = tx.ExecContext(ctx, query,
		envelope.TraceID,
		envelope.EnvelopeID,
		envelope.TenantID,
		envelope.ArtifactID,
		envelope.ArtifactVersionID,
		envelope.IngressChannel,
		envelope.SourceClass,
		envelope.SourceSystem,
		envelope.ContentType,
		envelope.IdempotencyKey,
		envelope.PayloadSize,
		envelope.PayloadHash,
		envelope.RawRowHash,
		envelope.EnvelopeHash,
		envelope.EnvelopeSignature,
		envelope.ObjectRef,
		envelope.RequestHeadersHash,
		envelope.SchemaHint,
		envelope.MappingProfileHint,
		envelope.ObjectEncryptionAlg,
		envelope.KMSKeyVersion,
		envelope.ParserClassification,
		envelope.TransportRequestID,
		envelope.ClientReferenceHint,
		envelope.SourceSystemHint,
		envelope.IngressAPIVersion,
		envelope.RetentionPolicyClass,
		envelope.WebhookProviderID,
		envelope.ConnectorBindingID,
		envelope.EncryptionKeyID,
		envelope.ObjectStoreVersion,
		envelope.IdempotencyReservationStatus,
		envelope.PrincipalID,
		envelope.AuthMethod,
		envelope.Status,
		envelope.ReceivedAt,
		envelope.FileName,
		envelope.FileSizeBytes,
		envelope.FileContentHash,
		envelope.RowCountEstimate,
		envelope.FileUploadChannel,
		envelope.SourceRowRef,
		envelope.BatchID)
	if err != nil {

		return err
	}

	query = `UPDATE idempotency_keys
		SET status=$1, first_envelope_id=$2, last_seen_at=now(), resolution_type='CREATED', principal_id_first_seen=$3, source_class_first_seen=$4
		WHERE tenant_id=$5 AND idempotency_key=$6`

	res, err := tx.ExecContext(ctx, query, "COMPLETED", envelope.EnvelopeID, envelope.PrincipalID, envelope.SourceClass, envelope.TenantID, envelope.IdempotencyKey)
	if err != nil {
		log.Printf("Error updating idempotency key: %v", err)
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows != 1 {
		return fmt.Errorf("idempotency update affected %d rows", rows)
	}

	// --- Insert into ingress_outbox ---
	outboxQuery := `
		INSERT INTO ingress_outbox
		(trace_id, envelope_id, tenant_id, artifact_id, artifact_version_id, object_ref, received_at, ingress_channel, source, idempotency_key, encrypted_payload, payload_hash, raw_row_hash, envelope_hash, envelope_signature, topic, status, lease_id, event_type, lease_until, created_at, updated_at, published_at, failure_reason_code, batchid, file_content_hash, source_row_ref, source_system)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
	`
	topic := "payments.ledger.events.v1"
	_, err = tx.ExecContext(ctx, outboxQuery,
		envelope.TraceID,           // $1
		envelope.EnvelopeID,        // $2
		envelope.TenantID,          // $3
		envelope.ArtifactID,        // $4
		envelope.ArtifactVersionID, // $5
		envelope.ObjectRef,         // $6
		envelope.ReceivedAt,        // $7
		envelope.IngressChannel,    // $8
		envelope.IngressChannel,    // $9 (source)
		envelope.IdempotencyKey,    // $10
		envelope.Payload,           // $11 (binary)
		envelope.PayloadHash,       // $12 (hex)
		envelope.RawRowHash,        // $13
		envelope.EnvelopeHash,      // $14 (hex)
		envelope.EnvelopeSignature, // $15 (string -> TEXT)
		topic,                      // $16
		"PENDING",                  // $17 (status)
		envelope.LeaseID,           // $18
		envelope.EventType,         // $19
		envelope.LeaseUntil,        // $20
		envelope.CreatedAt,         // $21
		envelope.UpdatedAt,         // $22
		envelope.PublishedAt,       // $23
		envelope.FailureReasonCode, // $24
		envelope.BatchID,           // $25
		envelope.FileContentHash,   // $26
		envelope.SourceRowRef,      // $27
		envelope.SourceSystem,      // $28
	)
	if err != nil {
		log.Printf("Failed to insert into ingress_outbox in transaction: %v", err)
		return err
	}

	err = tx.Commit()
	return err

}

package services

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// ----- RESPONSE STRUCTS -----
// These match the frontend's BackendEnvelope interface in envelopes.ts
// Note: payload_hash and object_ref are nullable in DB (TEXT without NOT NULL)
// but the frontend expects them as strings, so we default null → ""

type EnvelopeResponse struct {
	EnvelopeID      string  `json:"envelope_id"`
	TenantID        string  `json:"tenant_id"`
	Source          string  `json:"source"`
	SourceSystem    string  `json:"source_system,omitempty"`
	IdempotencyKey  string  `json:"idempotency_key,omitempty"`
	PayloadHash     string  `json:"payload_hash"`
	EnvelopeHash    string  `json:"envelope_hash"`
	ObjectRef       string  `json:"object_ref"`
	ParseStatus     string  `json:"parse_status"`
	SignatureStatus *string `json:"signature_status,omitempty"` // nullable in DB and optional in frontend
	ReceivedAt      string  `json:"received_at"`
}

type EnvelopeListResponse struct {
	Items      []EnvelopeResponse `json:"items"`
	Pagination PaginationInfo     `json:"pagination"`
}

type PaginationInfo struct {
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Total    int `json:"total"`
}

// ----- LIST ENVELOPES -----
// Called by handler for GET /v1/envelopes?page=1&page_size=50&tenant_id=xxx
//
// Why tenant_id filter: The console allows viewing envelopes per tenant.
// The frontend passes tenant_id as an optional query param.

func ListEnvelopes(ctx context.Context, db *sql.DB, page, pageSize int, tenantIDFilter string) (*EnvelopeListResponse, error) {
	var conditions []string
	var args []interface{}
	argPos := 1

	if tenantIDFilter != "" {
		conditions = append(conditions, fmt.Sprintf("tenant_id = $%d", argPos))
		args = append(args, tenantIDFilter)
		argPos++
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Step A: Get total count for pagination
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM ingress_envelopes %s", whereClause)
	var total int
	if err := db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("failed to count envelopes: %w", err)
	}

	// Step B: Fetch paginated data
	offset := (page - 1) * pageSize

	dataQuery := fmt.Sprintf(`
		SELECT envelope_id, tenant_id, source, source_system, idempotency_key,
		       payload_hash, envelope_hash, object_ref, parse_status, signature_status, received_at
		FROM ingress_envelopes
		%s
		ORDER BY received_at DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, argPos, argPos+1)

	args = append(args, pageSize, offset)

	rows, err := db.QueryContext(ctx, dataQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch envelopes: %w", err)
	}
	defer rows.Close()

	// Step C: Scan rows — handle nullable columns carefully
	var envelopes []EnvelopeResponse
	for rows.Next() {
		var envelopeID, tenantID, source, sourceSystem, idempotencyKey, parseStatus string
		var payloadHash sql.NullString  // TEXT in DB
		var envelopeHash sql.NullString // TEXT in DB
		var objectRef sql.NullString    // nullable TEXT in DB
		var signatureStatus sql.NullString // nullable TEXT in DB
		var receivedAt time.Time

		if err := rows.Scan(
			&envelopeID, &tenantID, &source, &sourceSystem, &idempotencyKey,
			&payloadHash, &envelopeHash, &objectRef, &parseStatus, &signatureStatus, &receivedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan envelope row: %w", err)
		}

		// Convert NullString → string (default empty if null)
		ph := ""
		if payloadHash.Valid {
			ph = payloadHash.String
		}
		eh := ""
		if envelopeHash.Valid {
			eh = envelopeHash.String
		}
		or := ""
		if objectRef.Valid {
			or = objectRef.String
		}

		// signature_status stays as *string (nil if null → omitted from JSON)
		var sigStatus *string
		if signatureStatus.Valid {
			sigStatus = &signatureStatus.String
		}

		envelopes = append(envelopes, EnvelopeResponse{
			EnvelopeID:      envelopeID,
			TenantID:        tenantID,
			Source:          source,
			SourceSystem:    sourceSystem,
			IdempotencyKey:  idempotencyKey,
			PayloadHash:     ph,
			EnvelopeHash:    eh,
			ObjectRef:       or,
			ParseStatus:     parseStatus,
			SignatureStatus: sigStatus,
			ReceivedAt:      receivedAt.Format(time.RFC3339),
		})
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating envelope rows: %w", err)
	}

	// Return empty array (not null) when no results — frontend expects []
	if envelopes == nil {
		envelopes = []EnvelopeResponse{}
	}

	return &EnvelopeListResponse{
		Items: envelopes,
		Pagination: PaginationInfo{
			Page:     page,
			PageSize: pageSize,
			Total:    total,
		},
	}, nil
}

// ----- GET ENVELOPE BY ID -----
// Called by handler for GET /v1/envelopes/:envelope_id
// Returns nil when not found — handler converts to 404

func GetEnvelopeByID(ctx context.Context, db *sql.DB, envelopeID string) (*EnvelopeResponse, error) {
	query := `
		SELECT envelope_id, tenant_id, source, source_system, idempotency_key,
		       payload_hash, envelope_hash, object_ref, parse_status, signature_status, received_at
		FROM ingress_envelopes
		WHERE envelope_id = $1
	`

	var eid, tid, source, sourceSystem, idempotencyKey, parseStatus string
	var payloadHash sql.NullString
	var envelopeHash sql.NullString
	var objectRef sql.NullString
	var signatureStatus sql.NullString
	var receivedAt time.Time

	err := db.QueryRowContext(ctx, query, envelopeID).Scan(
		&eid, &tid, &source, &sourceSystem, &idempotencyKey,
		&payloadHash, &envelopeHash, &objectRef, &parseStatus, &signatureStatus, &receivedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to fetch envelope: %w", err)
	}

	ph := ""
	if payloadHash.Valid {
		ph = payloadHash.String
	}
	eh := ""
	if envelopeHash.Valid {
		eh = envelopeHash.String
	}
	or := ""
	if objectRef.Valid {
		or = objectRef.String
	}
	var sigStatus *string
	if signatureStatus.Valid {
		sigStatus = &signatureStatus.String
	}

	return &EnvelopeResponse{
		EnvelopeID:      eid,
		TenantID:        tid,
		Source:          source,
		SourceSystem:    sourceSystem,
		IdempotencyKey:  idempotencyKey,
		PayloadHash:     ph,
		EnvelopeHash:    eh,
		ObjectRef:       or,
		ParseStatus:     parseStatus,
		SignatureStatus: sigStatus,
		ReceivedAt:      receivedAt.Format(time.RFC3339),
	}, nil
}
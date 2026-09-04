package validator

import (
	"context"
	"strconv"
	"strings"
	"time"

	"zord-intent-engine/internal/models"
	"zord-intent-engine/internal/persistence"
)

type Validator struct {
	dlqRepo persistence.DLQRepository
}

func NewValidator(dlqRepo persistence.DLQRepository) *Validator {
	return &Validator{dlqRepo: dlqRepo}
}

func (v *Validator) DLQRepo() persistence.DLQRepository {
	return v.dlqRepo
}

// ValidateParsed executes validation on already-parsed payload (STEP 5 → STEP 6)
func (v *Validator) ValidateParsed(
	ctx context.Context,
	tenantID string,
	envelopeID string,
	intent models.ParsedIncomingIntent,
	clientBatchRef string,
	traceID string, // ← NEW
	batchID string,
) (*models.ParsedIncomingIntent, *models.DLQEntry, error) {

	// STEP 2 — STRUCTURAL validation
	if err := StructuralValidate(intent); err != nil {
		dlq, _ := v.persistDLQ(
			ctx,
			tenantID,
			envelopeID,
			"STRUCTURAL_VALIDATION",
			err,
			false,
			clientBatchRef,
			intent,
			traceID,
			batchID,
		)
		return nil, dlq, nil
	}

	// STEP 3 — SEMANTIC validation
	if err := SemanticValidate(intent); err != nil {
		dlq, perr := v.persistDLQ(
			ctx,
			tenantID,
			envelopeID,
			"SEMANTIC_VALIDATION",
			err,
			false,
			clientBatchRef,
			intent,
			traceID,
			batchID,
		)
		if perr != nil {
			return nil, nil, perr
		}
		return nil, dlq, nil
	}

	return &intent, nil, nil
}

func (v *Validator) persistDLQ(
	ctx context.Context,
	tenantID string,
	envelopeID string,
	stage string,
	err error,
	replayable bool,
	clientBatchRef string,
	intent models.ParsedIncomingIntent, // ← NEW
	traceID string, // ← NEW
	batchID string,
) (*models.DLQEntry, error) {

	ve, ok := err.(ValidationError)
	if !ok {
		ve = ValidationError{
			Code: "VALIDATION_FAILED",
			Msg:  err.Error(),
		}
	}

	status := models.ClassifyDLQ(stage)

	entry := models.DLQEntry{
		TenantID:   tenantID,
		EnvelopeID: envelopeID,

		Stage:          stage,
		ReasonCode:     ve.Code,
		ErrorDetail:    ve.Msg,
		DLQStatus:      status,
		Replayable:     replayable,
		ClientBatchRef: clientBatchRef,
		BatchID:        batchID,
		SourceRowNum:   parseSourceRowNum(intent.SourceRowRef),
		IntentContext:  models.BuildIntentContext(status, intent),
		TraceID:        traceID,

		CreatedAt: time.Now().UTC(),
	}

	saved, err := v.dlqRepo.Save(ctx, entry)
	if err != nil {
		return nil, err
	}

	return &saved, nil
}

// parseSourceRowNum converts the source_row_ref string (plain integer relayed from
// zord-edge, e.g. "3") into *int. Returns nil only when the string is empty or
// not a valid integer — never independently computes a row number.
func parseSourceRowNum(ref string) *int {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return nil
	}
	idx, err := strconv.Atoi(ref)
	if err != nil {
		return nil
	}
	return &idx
}

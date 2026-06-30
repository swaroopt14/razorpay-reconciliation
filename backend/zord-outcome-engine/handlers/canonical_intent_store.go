package handlers

import (
	"context"
	"fmt"
	"strings"
	"time"

	"zord-outcome-engine/db"
	"zord-outcome-engine/models"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

func upsertCanonicalIntent(ctx context.Context, intent models.CanonicalIntent) error {
	if ctx == nil {
		ctx = context.Background()
	}
	_, err := db.DB.ExecContext(ctx, `
		INSERT INTO canonical_intents (
			intent_id, tenant_id, contract_id,
			client_payout_ref, client_batch_ref, business_idempotency_key,
			amount, currency_code,
			intended_execution_at, payout_type, provider_hint, corridor,
			proof_readiness_score, matchability_score,
			canonical_hash, governance_state,
			source_row_num,
			created_at
		) VALUES (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
		) ON CONFLICT (intent_id) DO UPDATE SET
			tenant_id               = EXCLUDED.tenant_id,
			contract_id             = EXCLUDED.contract_id,
			client_payout_ref       = EXCLUDED.client_payout_ref,
			client_batch_ref        = EXCLUDED.client_batch_ref,
			business_idempotency_key= EXCLUDED.business_idempotency_key,
			amount                  = EXCLUDED.amount,
			currency_code           = EXCLUDED.currency_code,
			intended_execution_at   = EXCLUDED.intended_execution_at,
			payout_type             = EXCLUDED.payout_type,
			provider_hint           = EXCLUDED.provider_hint,
			corridor                = EXCLUDED.corridor,
			proof_readiness_score   = EXCLUDED.proof_readiness_score,
			matchability_score      = EXCLUDED.matchability_score,
			canonical_hash          = EXCLUDED.canonical_hash,
			governance_state        = EXCLUDED.governance_state,
			source_row_num          = EXCLUDED.source_row_num`,
		intent.IntentID, intent.TenantID, intent.ContractID,
		intent.ClientPayoutRef, intent.ClientBatchRef, intent.BusinessIdempotencyKey,
		intent.Amount, intent.CurrencyCode,
		intent.IntendedExecutionAt, intent.PayoutType, intent.ProviderHint, intent.Corridor,
		intent.ProofReadinessScore, intent.MatchabilityScore,
		intent.CanonicalHash, intent.GovernanceState,
		intent.SourceRowNum,
		intent.CreatedAt,
	)
	return err
}

func validateAmount(amount string) (decimal.Decimal, error) {
	trimmed := strings.TrimSpace(amount)
	if trimmed == "" {
		return decimal.Zero, fmt.Errorf("amount is empty")
	}
	val, err := decimal.NewFromString(trimmed)
	if err != nil {
		return decimal.Zero, fmt.Errorf("invalid amount format: %w", err)
	}
	return val, nil
}

func canonicalIntentFromPayload(payload models.IntentPayload) (models.CanonicalIntent, error) {
	intentID, err := parseRequiredUUID(payload.IntentID, "intent_id")
	if err != nil {
		return models.CanonicalIntent{}, err
	}
	tenantID, err := parseRequiredUUID(payload.TenantID, "tenant_id")
	if err != nil {
		return models.CanonicalIntent{}, err
	}
	contractID, _ := uuid.Parse(payload.ContractID)

	amount, err := validateAmount(payload.Amount)
	if err != nil {
		return models.CanonicalIntent{}, err
	}
	if strings.TrimSpace(payload.Currency) == "" {
		return models.CanonicalIntent{}, fmt.Errorf("currency is required")
	}
	createdAt := payload.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
	}

	var payoutType *string
	if payload.IntentType != "" {
		payoutType = &payload.IntentType
	}
	intendedExecutionAt := payload.IntendedExecutionAt
	if intendedExecutionAt == nil {
		intendedExecutionAt = payload.DeadlineAt
	}

	var providerHint *string
	if payload.ProviderHint != "" {
		providerHint = &payload.ProviderHint
	} else if payload.SourceSystem != "" {
		providerHint = &payload.SourceSystem
	}
	// var signatureCarrier *string
	// if payload.CanonicalSnapshotRef != "" {
	// 	signatureCarrier = &payload.CanonicalSnapshotRef
	// }
	var clientPayoutRef *string
	if payload.ClientPayoutRef != "" {
		clientPayoutRef = &payload.ClientPayoutRef
	}
	var clientBatchRef *string
	if payload.ClientBatchRef != "" {
		clientBatchRef = &payload.ClientBatchRef
	}
	var bizIdemKey *string
	if payload.BusinessIdempotencyKey != "" {
		bizIdemKey = &payload.BusinessIdempotencyKey
	}

	return models.CanonicalIntent{
		IntentID:               intentID,
		TenantID:               tenantID,
		ContractID:             contractID,
		ClientPayoutRef:        clientPayoutRef,
		ClientBatchRef:         clientBatchRef,
		BusinessIdempotencyKey: bizIdemKey,
		Amount:                 amount,
		CurrencyCode:           payload.Currency,
		IntendedExecutionAt:    intendedExecutionAt,
		PayoutType:             payoutType,
		ProviderHint:           providerHint,
		ProofReadinessScore:    payload.ProofReadinessScore,
		MatchabilityScore:      payload.MatchabilityScore,
		CanonicalHash:          payload.CanonicalHash,
		GovernanceState:        payload.GovernanceState,
		// ZordSignatureCarrier:   signatureCarrier,
		SourceRowNum: payload.SourceRowNum,
		CreatedAt:    createdAt,
	}, nil
}

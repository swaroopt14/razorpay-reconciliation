package services

import (
	"log"
	"time"

	"zord-intent-engine/internal/models"

	"github.com/google/uuid"
)

func CanonicalIntentToOutboxEvent(
	intent models.CanonicalIntent,
	payload []byte,
	eventType string,
) (models.OutboxEvent, error) {

	intId, err := uuid.Parse(intent.IntentID)
	if err != nil {
		log.Printf("Invalid Intent ID: %s", intent.IntentID)
		return models.OutboxEvent{}, err
	}

	if !IsSupportedOutboxEventType(eventType) {
		log.Printf("SECURITY: refusing to publish unsupported outbox event type/version: %q", eventType)
		return models.OutboxEvent{}, &ErrUnsupportedEventType{EventType: eventType}
	}

	return models.OutboxEvent{
		TraceID:           intent.TraceID,
		EnvelopeID:        intent.EnvelopeID,
		TenantID:          intent.TenantID,
		ArtifactID:        intent.ArtifactID,
		ArtifactVersionID: intent.ArtifactVersionID,
		AggregateType:     "intent",
		AggregateID:       intId,
		IntentID:          intent.IntentID,
		EventType:         eventType,

		SchemaVersion: SchemaVersionV1,
		Amount:        intent.Amount,
		Currency:      intent.Currency,
		Payload:       payload,
		Status:        "PENDING",
		CreatedAt:     time.Now().UTC(),
		PayloadHash:   intent.PayloadHash,
		RawRowHash:    intent.RawRowHash,
		BatchID:       intent.BatchID,

		IdempotencyKey:      intent.IdempotencyKey,
		SalientHash:         intent.SalientHash,
		IntentType:          intent.IntentType,
		CanonicalVersion:    intent.CanonicalVersion,
		IntendedExecutionAt: intent.IntendedExecutionAt,
		Constraints:         intent.Constraints,
		BeneficiaryType:     intent.BeneficiaryType,
		PIITokens:           intent.PIITokens,
		Beneficiary:         intent.Beneficiary,
		IntentStatus:        intent.Status,
		ConfidenceScore:     intent.ConfidenceScore,

		CanonicalHash:                intent.CanonicalHash,
		SourceRowRef:                 intent.SourceRowRef,
		CanonicalRowHash:             intent.CanonicalRowHash,
		TokenizedDataHash:            intent.TokenizedDataHash,
		RawRowEvidenceLeafHash:       intent.RawRowEvidenceLeafHash,
		CanonicalRowEvidenceLeafHash: intent.CanonicalRowEvidenceLeafHash,
		CanonicalSnapshotRef:         intent.CanonicalSnapshotRef,
		NIRSnapshotRef:               intent.NIRSnapshotRef,
		GovernanceSnapshotRef:        intent.GovernanceSnapshotRef,
		GovernanceHash:               intent.GovernanceHash,
		GovernanceInputFactsHash:     intent.GovernanceInputFactsHash,

		ClientPayoutRef:       intent.ClientPayoutRef,
		ProviderHint:          intent.ProviderHint,
		RequestFingerprint:    intent.RequestFingerprint,
		RoutingHintsJSON:      intent.RoutingHintsJSON,
		GovernanceState:       intent.GovernanceState,
		BusinessState:         intent.BusinessState,
		IntentLifecycleState:  intent.IntentLifecycleState,
		DuplicateRiskFlag:     intent.DuplicateRiskFlag,
		MappingProfileID:      intent.MappingProfileID,
		MappingProfileVersion: intent.MappingProfileVersion,
		MappingProfileHash:    intent.MappingProfileHash,
		PolicySource:          intent.PolicySource,
		PolicyVersion:         intent.PolicyVersion,
		PolicyHash:            intent.PolicyHash,
		SourceSystem:          intent.SourceSystem,

		PaymentInstructionReceived: intent.PaymentInstructionReceived,
		CanonicalIntentCreated:     intent.CanonicalIntentCreated,

		BusinessIdempotencyKey:    intent.BusinessIdempotencyKey,
		BeneficiaryFingerprint:    intent.BeneficiaryFingerprint,
		ProofReadinessScore:       intent.ProofReadinessScore,
		MatchabilityScore:         intent.MatchabilityScore,
		IntentQualityScore:        intent.IntentQualityScore,
		MappingConfidenceScore:    intent.MappingConfidenceScore,
		SchemaCompletenessScore:   intent.SchemaCompletenessScore,
		GovernanceReasonCodesJSON: intent.GovernanceReasonCodesJSON,
		DuplicateReasonCode:       intent.DuplicateReasonCode,
		ClientBatchRef:            intent.ClientBatchRef,
		AggregateConfidenceScore:  intent.AggregateConfidenceScore, // NEW
		SourceRowNum:              intent.SourceRowNum,
		RequiredFieldsStatus:      intent.RequiredFieldsStatus,
		TokenizationStatus:        intent.TokenizationStatus,
		GovernanceDecision:        intent.GovernanceDecision,

		ReferenceQualityScore: intent.ReferenceQualityScore,
		DuplicateRiskScore:    intent.DuplicateRiskScore,
		ScoreVersion:          intent.ScoreVersion,
		ScoreValidityStatus:   intent.ScoreValidityStatus,
		ScoreBreakdownJSON:    intent.ScoreBreakdownJSON,
		ScoreReasonCodesJSON:  intent.ScoreReasonCodesJSON,
		ScoredAt:              intent.ScoredAt,
	}, nil
}

package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"zord-outcome-engine/db"
	"zord-outcome-engine/models"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// SettlementCanonicalizeService converts parsed results into normalized canonical observations.
type SettlementCanonicalizeService struct {
}

// RunForJob executes the canonicalization pipeline for a specific ingest job.
// profile is passed so the canonical observations record the correct mapping profile.
// 1. Load all raw parsed rows from the DB.
// 2. Transform each row into a normalized 'Canonical Observation'.
// 3. Compute quality and readiness scores for downstream matching.
// 4. Group observations into a single batch under the client_batch_id.
// 5. Persist everything and trigger the outbox event emission.
func (s *SettlementCanonicalizeService) RunForJob(ctx context.Context, jobID string, tenantID uuid.UUID, profile models.MappingProfile, clientBatchID string) error {
	log.Printf("settlement.canonicalize.start job_id=%s client_batch_id=%s", jobID, clientBatchID)

	// 1. Load all parsed rows for this job.
	rows, err := db.DB.QueryContext(ctx, `
		SELECT 
			parsed_row_id, settlement_envelope_id, source_file_ref, source_row_ref,
			ingest_run_id, settlement_batch_id, client_batch_id,
			parsed_candidates_json, parse_confidence
		FROM settlement_parsed_rows
		WHERE ingest_run_id = $1 AND tenant_id = $2
		ORDER BY source_row_ref::int`,
		jobID, tenantID,
	)
	if err != nil {
		return fmt.Errorf("canonicalize: query failed: %w", err)
	}
	defer rows.Close()

	var (
		observations            []models.CanonicalSettlementObservation
		canonicalized           int
		canonicalizeFailed      int
		ingestRunIDForJob       string
		settlementBatchIDForJob string
	)

	// Grouping for batch context.
	batchGroups := make(map[string][]models.CanonicalSettlementObservation)

	for rows.Next() {
		var (
			parsedRowID       uuid.UUID
			envelopeID        uuid.UUID
			sourceFileRef     string
			sourceRowRef      string
			ingestRunID       string
			settlementBatchID string
			clientBatchID     string
			shapeJSON         []byte
			parseConfidence   float64
		)

		if err := rows.Scan(&parsedRowID, &envelopeID, &sourceFileRef, &sourceRowRef, &ingestRunID, &settlementBatchID, &clientBatchID, &shapeJSON, &parseConfidence); err != nil {
			log.Printf("settlement.canonicalize.scan_error job_id=%s err=%v", jobID, err)
			continue
		}
		if ingestRunIDForJob == "" {
			ingestRunIDForJob = ingestRunID
		}
		if settlementBatchIDForJob == "" {
			settlementBatchIDForJob = settlementBatchID
		}

		// Unmarshal the shape into UniversalSettlementShape.
		var shape models.UniversalSettlementShape
		if err := json.Unmarshal(shapeJSON, &shape); err != nil {
			log.Printf("settlement.canonicalize.unmarshal_failed job_id=%s row=%s", jobID, sourceRowRef)
			svc := &SettlementIngestService{}
			_ = svc.PersistParseError(ctx, tenantID, jobID, envelopeID, sourceRowRef, "CANONICALIZATION", "SHAPE_UNMARSHAL_FAILED", profile, ingestRunID, settlementBatchID, clientBatchID)
			canonicalizeFailed++
			continue
		}

		// 2. Build canonical observation.
		obs := buildCanonicalObservation(tenantID, jobID, parsedRowID, envelopeID, shape, parseConfidence, profile, clientBatchID)
		obs.IngestRunID = ingestRunID
		obs.SettlementBatchID = settlementBatchID

		// 3. Insert into Postgres.
		_, err = db.DB.ExecContext(ctx, `
			INSERT INTO canonical_settlement_observations (
				settlement_observation_id, tenant_id, trace_id,
				settlement_envelope_id, ingest_run_id, settlement_batch_id,
				source_file_ref, source_row_ref, source_system,
				observation_kind, source_strength_class,
				client_reference_candidate, provider_reference, bank_id, bank_reference,
				external_reference, batch_reference,
				amount, settled_amount, fee_amount, deduction_amount,
				currency_code, settlement_status,
				retry_flag, reversal_flag, return_flag,
				observation_timestamp, value_date,
				provider_ref_status,
				mapping_profile_id, mapping_profile_version, parser_version,
				parse_confidence, mapping_confidence,
				carrier_richness_score, attachment_readiness_score, score_breakdown_json, score_reason_codes_json, score_version,
				canonical_hash, client_batch_id,
				source_strength, source_type, source_system_id,
				corridor_id, warnings_json,
				created_at, updated_at
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
				$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
				$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
				$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
				$41,$42,$43,$44,$45,$46,$47,$48
			) ON CONFLICT (settlement_observation_id) DO NOTHING`,
			obs.SettlementObservationID, obs.TenantID, obs.TraceID,
			obs.SettlementEnvelopeID, ingestRunID, settlementBatchID,
			obs.SourceFileRef, obs.SourceRowRef, obs.SourceSystem,
			obs.ObservationKind, obs.SourceStrengthClass,
			obs.ClientReferenceCandidate, obs.ProviderReference, obs.BankID, obs.BankReference,
			obs.ExternalReference, obs.BatchReference,
			obs.Amount, obs.SettledAmount, obs.FeeAmount,
			obs.DeductionAmount, obs.CurrencyCode, obs.SettlementStatus, obs.RetryFlag,
			obs.ReversalFlag, obs.ReturnFlag, obs.ObservationTimestamp, obs.ValueDate,
			obs.ProviderRefStatus, obs.MappingProfileID, obs.MappingProfileVersion, obs.MappingProfileVersion,
			obs.ParseConfidence, obs.MappingConfidence, obs.CarrierRichnessScore,
			obs.AttachmentReadinessScore, obs.ScoreBreakdownJSON, obs.ScoreReasonCodesJSON, obs.ScoreVersion, obs.CanonicalHash, obs.ClientBatchID,
			obs.SourceStrength, obs.SourceType, obs.SourceSystemID,
			obs.CorridorID, obs.WarningsJSON,
			obs.CreatedAt, obs.UpdatedAt,
		)

		if err != nil {
			log.Printf("settlement.canonicalize.insert_failed job_id=%s row=%s err=%v", jobID, sourceRowRef, err)
			svc := &SettlementIngestService{}
			_ = svc.PersistParseError(ctx, tenantID, jobID, envelopeID, sourceRowRef, "CANONICALIZATION", "CANONICAL_PERSIST_FAILED", profile, ingestRunID, settlementBatchID, clientBatchID)
			canonicalizeFailed++
			continue
		}

		canonicalized++
		observations = append(observations, obs)

		// Group valid observations for batch-level summary.
		// All rows in this run belong to the single client batch.
		batchGroups[clientBatchID] = append(batchGroups[clientBatchID], obs)
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("canonicalize: cursor iteration error: %w", err)
	}

	var parsedRowCount, parseErrorCount int
	if err := db.DB.QueryRowContext(ctx, `
		SELECT
			(SELECT COUNT(*)
			 FROM settlement_parsed_rows
			 WHERE ingest_run_id = $1 AND tenant_id = $2),
			(SELECT COUNT(*)
			 FROM settlement_parse_errors
			 WHERE ingest_run_id = $1 AND tenant_id = $2)`,
		jobID, tenantID,
	).Scan(&parsedRowCount, &parseErrorCount); err != nil {
		return fmt.Errorf("canonicalize: load batch counts: %w", err)
	}

	// ── STEP 4: BATCH AGGREGATION ──────────────────────────────────────────
	// We insert a single summary view for the entire client batch run in canonical_settlement_batches.
	for batchRefKey, group := range batchGroups {
		if len(group) == 0 {
			continue
		}

		var sourceBatchRef *string
		for _, o := range group {
			if o.BatchReference != nil && *o.BatchReference != "" && *o.BatchReference != "unknown" {
				sourceBatchRef = o.BatchReference
				break
			}
		}

		var (
			totalAmount        decimal.Decimal
			totalSettledAmount decimal.Decimal
			successCount       int
			reversalCount      int
			parseConfSum       float64
			attachScoreSum     float64
		)

		for _, o := range group {
			totalAmount = totalAmount.Add(o.Amount)
			if o.SettledAmount != nil {
				totalSettledAmount = totalSettledAmount.Add(*o.SettledAmount)
			}
			if o.ReversalFlag {
				reversalCount++
			} else {
				successCount++
			}
			parseConfSum += o.ParseConfidence
			attachScoreSum += o.AttachmentReadinessScore
		}

		batchID := uuid.New()
		firstObs := group[0]

		_, err = db.DB.ExecContext(ctx, `
			INSERT INTO canonical_settlement_batches (
				settlement_batch_id, tenant_id, ingest_run_id, settlement_batch_id_ref,
				source_file_ref, source_system,
				source_batch_ref, client_batch_id, artifact_family,
				row_count, success_count_estimate, failed_count_estimate,
				pending_count_estimate, reversal_count_estimate,
				total_amount, total_settled_amount,
				currency_code,
				parse_confidence_overall, attachment_readiness_overall,
				created_at, updated_at
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
			) ON CONFLICT (ingest_run_id, client_batch_id) DO UPDATE SET
				row_count = EXCLUDED.row_count,
				success_count_estimate = EXCLUDED.success_count_estimate,
				failed_count_estimate = EXCLUDED.failed_count_estimate,
				reversal_count_estimate = EXCLUDED.reversal_count_estimate,
				total_amount = EXCLUDED.total_amount,
				total_settled_amount = EXCLUDED.total_settled_amount,
				parse_confidence_overall = EXCLUDED.parse_confidence_overall,
				attachment_readiness_overall = EXCLUDED.attachment_readiness_overall,
				updated_at = EXCLUDED.updated_at`,
			batchID, tenantID, ingestRunIDForJob, settlementBatchIDForJob,
			firstObs.SourceFileRef, firstObs.SourceSystem,
			sourceBatchRef, clientBatchID, profile.ArtifactFamily,
			parsedRowCount, successCount, parseErrorCount,
			0, reversalCount,
			totalAmount, totalSettledAmount,
			firstObs.CurrencyCode,
			parseConfSum/float64(len(group)), attachScoreSum/float64(len(group)),
			time.Now().UTC(), time.Now().UTC(),
		)
		if err != nil {
			log.Printf("settlement.canonicalize.batch_upsert_failed job_id=%s batch=%s err=%v", jobID, batchRefKey, err)
		}
	}

	// 5. Update job with canonicalization counts.
	_, _ = db.DB.ExecContext(ctx, `
		UPDATE settlement_ingest_runs
		SET row_count_canonicalized = $1
		WHERE ingest_run_id = $2`,
		canonicalized, jobID,
	)

	log.Printf("settlement.canonicalize.done job_id=%s canonicalized=%d failed=%d", jobID, canonicalized, canonicalizeFailed)

	// 6. Trigger outbox events.
	outboxSvc := &SettlementOutboxService{}
	return outboxSvc.EmitForJob(ctx, jobID, tenantID, observations, clientBatchID)
}

// buildCanonicalObservation maps the raw UniversalSettlementShape to a CanonicalSettlementObservation.
// profile provides the mapping_profile_id and version stored on the observation,
// ensuring each canonical record is traceable to the exact parser version that produced it.
func buildCanonicalObservation(
	tenantID uuid.UUID,
	jobID string,
	parsedRowID uuid.UUID,
	envelopeID uuid.UUID,
	shape models.UniversalSettlementShape,
	parseConfidence float64,
	profile models.MappingProfile, // NEW
	clientBatchID string,
) models.CanonicalSettlementObservation {
	obs := models.CanonicalSettlementObservation{
		SettlementObservationID:  uuid.New(),
		TenantID:                 tenantID,
		SettlementEnvelopeID:     envelopeID,
		SourceFileRef:            shape.SourceFileRef,
		SourceRowRef:             shape.SourceRowRef,
		SourceSystem:             shape.SourceSystem,
		ObservationKind:          shape.ObservationKind,
		SourceStrengthClass:      shape.SourceStrengthClass,
		ClientReferenceCandidate: shape.ClientReferenceCandidate,
		ProviderReference:        shape.ProviderReference,
		BankID:                   shape.BankID,
		BankReference:            shape.BankReference,
		ExternalReference:        shape.ExternalReference,
		BatchReference:           shape.BatchReference,
		Amount:                   shape.Amount,
		SettledAmount:            shape.SettledAmount,
		FeeAmount:                shape.FeeAmount,
		DeductionAmount:          shape.DeductionAmount,
		CurrencyCode:             shape.CurrencyCode,
		SettlementStatus:         shape.StatusCandidate,
		RetryFlag:                shape.RetryFlag,
		ReversalFlag:             shape.ReversalFlag,
		ReturnFlag:               shape.ReturnFlag,
		ObservationTimestamp:     shape.ObservationTimestamp,
		ValueDate:                shape.ValueDate,
		ProviderRefStatus:        computeProviderRefStatus(shape),
		MappingProfileID:         profile.ProfileID,
		MappingProfileVersion:    profile.ProfileVersion,
		ClientBatchID:            clientBatchID,
		ParseConfidence:          parseConfidence,
		MappingConfidence:        computeMappingConfidence(shape),
		CarrierRichnessScore:     computeCarrierRichnessScore(shape),
		SourceType:               "API",
		SourceSystemID:           profile.SourceSystem,
		CorridorID:               shape.PaymentMethod,
		CreatedAt:                time.Now().UTC(),
		UpdatedAt:                time.Now().UTC(),
	}
	obs.AttachmentReadinessScore, obs.ScoreBreakdownJSON = ComputeAttachmentReadinessScore(shape, obs.ParseConfidence, obs.MappingConfidence)
	obs.SourceStrength = computeSourceStrength(obs.AttachmentReadinessScore)
	obs.CanonicalHash = computeCanonicalHash(tenantID, obs.SettlementObservationID, shape)
	obs.WarningsJSON = computeQualityWarnings(shape, obs.ParseConfidence, obs.MappingConfidence, obs.AttachmentReadinessScore)
	obs.ScoreReasonCodesJSON = computeScoreReasonCodes(shape, obs.ParseConfidence, obs.MappingConfidence, obs.AttachmentReadinessScore)
	obs.ScoreVersion = "service5b_score_v1.0"
	return obs
}

func computeSourceStrength(score float64) string {
	if score >= 0.75 {
		return "HIGH"
	}
	if score >= 0.5 {
		return "MEDIUM"
	}
	return "LOW"
}

// func computeBeneficiaryFingerprint(shape models.UniversalSettlementShape) string {
// 	parts := []string{
// 		shape.SourceSystem,
// 		safeDeref(shape.ProviderReference),
// 		safeDeref(shape.BatchReference),
// 	}
// 	combined := strings.Join(parts, "|")
// 	hash := sha256.Sum256([]byte(combined))
// 	return hex.EncodeToString(hash[:])
// }

func safeDeref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func computeProviderRefStatus(shape models.UniversalSettlementShape) string {
	if shape.BankReference != nil && *shape.BankReference != "" {
		return "OBSERVED"
	}
	return "MISSING"
}

func computeMappingConfidence(shape models.UniversalSettlementShape) float64 {
	return ComputeMappingConfidence(shape.MappingInputs)
}

func computeCarrierRichnessScore(shape models.UniversalSettlementShape) float64 {
	return ComputeCarrierRichnessScore(shape)
}

func computeCanonicalHash(tenantID uuid.UUID, obsID uuid.UUID, shape models.UniversalSettlementShape) string {
	parts := []string{
		tenantID.String(),
		obsID.String(),
		shape.Amount.StringFixed(2),
		shape.CurrencyCode,
		safeDeref(shape.BankReference),
		shape.ObservationTimestamp.UTC().Format(time.RFC3339),
	}
	combined := strings.Join(parts, "|")
	hash := sha256.Sum256([]byte(combined))
	return hex.EncodeToString(hash[:])
}

func computeQualityWarnings(shape models.UniversalSettlementShape, parseConf, mapConf, attachScore float64) []byte {
	var warnings []string
	if shape.BankReference == nil || *shape.BankReference == "" {
		warnings = append(warnings, "MISSING_UTR")
	}
	if shape.ExternalReference == nil || *shape.ExternalReference == "" {
		warnings = append(warnings, "MISSING_REFERENCE_ID")
	}
	if shape.ProviderReference == nil || *shape.ProviderReference == "" {
		warnings = append(warnings, "MISSING_PROVIDER_REF")
	}
	if shape.Amount.IsNegative() {
		warnings = append(warnings, "NEGATIVE_AMOUNT")
	} else if shape.Amount.IsZero() {
		warnings = append(warnings, "ZERO_AMOUNT")
	}
	if shape.CurrencyCode == "" || len(shape.CurrencyCode) != 3 {
		warnings = append(warnings, "INVALID_CURRENCY")
	}
	if shape.ObservationTimestamp.IsZero() {
		warnings = append(warnings, "INVALID_TIMESTAMP")
	}
	if shape.PaymentMethod == "" {
		warnings = append(warnings, "UNKNOWN_CORRIDOR")
	}
	if parseConf < 0.75 {
		warnings = append(warnings, "LOW_PARSE_CONFIDENCE")
	}
	if mapConf < 0.8 {
		warnings = append(warnings, "LOW_MAPPING_CONFIDENCE")
	}
	if attachScore < 0.75 { // Below HIGH
		warnings = append(warnings, "LOW_ATTACHMENT_READINESS")
	}

	if len(warnings) == 0 {
		return nil
	}
	b, _ := json.Marshal(warnings)
	return b
}

func computeScoreReasonCodes(shape models.UniversalSettlementShape, parseConf, mapConf, attachScore float64) []byte {
	var reasons []string
	if len(shape.ScoreReasonCodes) > 0 {
		reasons = append(reasons, shape.ScoreReasonCodes...)
	}

	// Reference signals
	if shape.BankReference == nil || *shape.BankReference == "" {
		reasons = append(reasons, "BANK_REFERENCE_MISSING")
	} else {
		reasons = append(reasons, "BANK_REFERENCE_PRESENT")
	}

	if shape.ClientReferenceCandidate != nil && *shape.ClientReferenceCandidate != "" {
		reasons = append(reasons, "CLIENT_REFERENCE_PRESENT")
	} else {
		reasons = append(reasons, "CLIENT_REFERENCE_MISSING")
	}

	if shape.ProviderReference == nil || *shape.ProviderReference == "" {
		reasons = append(reasons, "PROVIDER_REFERENCE_MISSING")
	} else {
		reasons = append(reasons, "PROVIDER_REFERENCE_PRESENT")
	}

	if shape.ExternalReference == nil || *shape.ExternalReference == "" {
		reasons = append(reasons, "EXTERNAL_REFERENCE_MISSING")
	} else {
		reasons = append(reasons, "EXTERNAL_REFERENCE_PRESENT")
	}

	// Amount signals
	if shape.Amount.IsNegative() {
		reasons = append(reasons, "NEGATIVE_AMOUNT")
	} else if shape.Amount.IsZero() {
		reasons = append(reasons, "ZERO_AMOUNT")
	}

	if shape.CurrencyCode == "" || len(shape.CurrencyCode) != 3 {
		reasons = append(reasons, "INVALID_CURRENCY_CODE")
	}

	if shape.ObservationTimestamp.IsZero() {
		reasons = append(reasons, "INVALID_TIMESTAMP")
	}

	// Confidence degradation hints
	if parseConf < 0.75 {
		reasons = append(reasons, "LOW_PARSE_CONFIDENCE")
	}
	if mapConf < 0.8 {
		reasons = append(reasons, "LOW_MAPPING_CONFIDENCE")
	}
	if attachScore < 0.75 {
		reasons = append(reasons, "LOW_ATTACHMENT_READINESS")
	}

	if len(reasons) == 0 {
		return nil
	}
	b, _ := json.Marshal(reasons)
	return b
}

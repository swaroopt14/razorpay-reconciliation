package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

/*
Old idempotency used a single settlement_ingest_jobs table plus CheckByFingerprint,
JobIDExists, and a single-table ingest_fingerprint uniqueness check to suppress
duplicate uploads and guard force-reprocess batch reuse.

That is being replaced with a two-table model: settlement_batches stores the
client-visible batch identity, while settlement_ingest_runs stores each versioned
processing attempt for that batch.

What is not changing: parsing, canonicalization, outbox emission, and attachment
engine business behavior all remain the same; this change only swaps the ingest
idempotency and run-tracking model underneath them.
*/
var DB *sql.DB

func SeedDefaultAttachmentRuleProfile(ctx context.Context, tenantID interface{}) error {
	defaultRulesetJSON := []byte(`{
  "profile_id": "default_profile",
  "tenant_id": "YOUR_TENANT_UUID",
  "version": "v1",

  "exact_ref_priority_json": {
    "priority_order": [
      "zord_signature",
      "client_payout_ref",
      "provider_reference",
      "bank_reference"
    ]
  },

  "carrier_priority_json": {
    "exact_ref": 120,
    "client_ref": 100,
    "provider_ref": 85,
    "bank_ref": 85,
    "zord_signature": 120,
    "beneficiary_match": 35,
    "amount_match": 30,
    "currency_match": 10,
    "batch_match": 90,
    "time_window": 20,
    "source_system": 10,
    "parse_confidence_modifier": -20,
    "source_strength_modifier": -15,
    "conflict_penalty": -70
  },

  "time_window_policy_json": {
    "max_hours_difference": 72,
    "strict_same_day": false,
    "allow_cross_period": true
  },

  "amount_tolerance_policy_json": {
    "exact_match_required": true,
    "tolerance_minor": 0,
    "allow_percentage_tolerance": false,
    "percentage_tolerance": 0
  },

  "batch_boundary_policy_json": {
    "strict_batch_matching": false,
    "allow_cross_batch_if_strong_match": true
  },

  "manual_review_thresholds_json": {
    "high_confidence_score": 135,
    "exact_match_score": 200,
    "ambiguity_margin_threshold": 15,
    "min_score_for_auto_attach": 80,
    "max_candidates_for_auto_attach": 1
  },

  "ambiguity_margin_threshold": 0.15,
  "requires_bank_ref_for_exact_flag": false,
  "status": "ACTIVE"
}`)

	var ruleset struct {
		ProfileID                   string          `json:"profile_id"`
		Version                     string          `json:"version"`
		ExactRefPriorityJSON        json.RawMessage `json:"exact_ref_priority_json"`
		CarrierPriorityJSON         json.RawMessage `json:"carrier_priority_json"`
		TimeWindowPolicyJSON        json.RawMessage `json:"time_window_policy_json"`
		AmountTolerancePolicyJSON   json.RawMessage `json:"amount_tolerance_policy_json"`
		BatchBoundaryPolicyJSON     json.RawMessage `json:"batch_boundary_policy_json"`
		ManualReviewThresholdsJSON  json.RawMessage `json:"manual_review_thresholds_json"`
		AmbiguityMarginThreshold    float64         `json:"ambiguity_margin_threshold"`
		RequiresBankRefForExactFlag bool            `json:"requires_bank_ref_for_exact_flag"`
		Status                      string          `json:"status"`
	}

	if err := json.Unmarshal(defaultRulesetJSON, &ruleset); err != nil {
		return fmt.Errorf("failed to unmarshal default ruleset JSON: %w", err)
	}

	stmt := `
		INSERT INTO attachment_rule_profiles (
			profile_id, tenant_id, version,
			exact_ref_priority_json, carrier_priority_json,
			time_window_policy_json, amount_tolerance_policy_json,
			batch_boundary_policy_json, manual_review_thresholds_json,
			ambiguity_margin_threshold, requires_bank_ref_for_exact_flag,
			status
		) VALUES (
			$1, $2, $3,
			$4, $5,
			$6, $7,
			$8, $9,
			$10, $11,
			$12
		) ON CONFLICT (profile_id, tenant_id, version) DO UPDATE SET
			exact_ref_priority_json = EXCLUDED.exact_ref_priority_json,
			carrier_priority_json = EXCLUDED.carrier_priority_json,
			time_window_policy_json = EXCLUDED.time_window_policy_json,
			amount_tolerance_policy_json = EXCLUDED.amount_tolerance_policy_json,
			batch_boundary_policy_json = EXCLUDED.batch_boundary_policy_json,
			manual_review_thresholds_json = EXCLUDED.manual_review_thresholds_json,
			ambiguity_margin_threshold = EXCLUDED.ambiguity_margin_threshold,
			requires_bank_ref_for_exact_flag = EXCLUDED.requires_bank_ref_for_exact_flag,
			status = EXCLUDED.status;
	`
	_, err := DB.ExecContext(ctx, stmt,
		ruleset.ProfileID, tenantID, ruleset.Version,
		string(ruleset.ExactRefPriorityJSON), string(ruleset.CarrierPriorityJSON),
		string(ruleset.TimeWindowPolicyJSON), string(ruleset.AmountTolerancePolicyJSON),
		string(ruleset.BatchBoundaryPolicyJSON), string(ruleset.ManualReviewThresholdsJSON),
		ruleset.AmbiguityMarginThreshold, ruleset.RequiresBankRefForExactFlag,
		ruleset.Status,
	)
	return err
}

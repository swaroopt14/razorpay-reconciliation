"""
RCA HDBSCAN model for Zord payment intelligence.

Lifecycle:
  1. Bootstrap: scripts/train_rca_model.py produces a .pkl bundle from labeled CSV.
  2. Startup:   RCAModel loads the .pkl; if absent, predict() returns [] gracefully.
  3. Inference: predict(candidates) uses approximate_predict() on the loaded bundle.
  4. Retrain:   maybe_retrain_async() fires a background thread when enough new labeled
                batches have accumulated.  The in-memory bundle is swapped atomically
                under RLock so inference is never blocked.

Bundle layout (joblib-serialized RCABundle):
  pipeline         — fitted sklearn ColumnTransformer
  hdbscan_model    — fitted HDBSCAN (prediction_data=True)
  cluster_label_map — dict[int, str]  e.g. {3: "MCR", 7: "USL"}
  feature_contract_version — "rca_v1"
"""

from __future__ import annotations

import logging
import os
import threading
from collections import Counter
from dataclasses import dataclass, field
from typing import Optional

import joblib
import numpy as np
import pandas as pd
import hdbscan
from scipy.sparse import hstack, csr_matrix
from sklearn.compose import ColumnTransformer
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

logger = logging.getLogger(__name__)
from app.model_contracts import file_sha256


FEATURE_CONTRACT_VERSION = "rca_v1"
NOISE_SOFT_PROB_THRESHOLD = 0.15

# ── Taxonomy ──────────────────────────────────────────────────────────────────
# Authoritative 32-cluster Zord RCA library v1.
# Each entry is the single source of truth for all enrichment fields.

TAXONOMY: dict[str, dict] = {
    # ── 1. Reference / Traceability ───────────────────────────────────────────
    "MCR": {
        "cluster_name": "MISSING_CLIENT_REFERENCE",
        "category": "REFERENCE_TRACEABILITY",
        "severity": "HIGH",
        "business_impact": (
            "Without client reference, finance/ops cannot easily prove which original "
            "payout the settlement row belongs to. Increases manual review, ambiguity, "
            "and weak auditability."
        ),
        "user_facing_explanation": (
            "This settlement record is missing your internal payout reference. Zord "
            "cannot confidently link it back to the original payout intent using your "
            "own business ID."
        ),
        "recommended_action": (
            "Ensure client_payout_ref is passed into PSP requests and preserved in "
            "settlement exports. For high-value or recurring batches, move this flow "
            "to Zord Prepare-and-Sign so Zord-generated carriers survive downstream."
        ),
        "default_action_contract": "REQUEST_SOURCE_PATCH",
        "trigger_condition": (
            "client_reference_candidate IS NULL AND attachment_readiness_score < 0.50 "
            "AND carrier_richness_score < 0.40"
        ),
        "intelligence_layer": "AMBIGUITY + EVIDENCE",
        "internal_only": False,
    },
    "MPR": {
        "cluster_name": "MISSING_PROVIDER_REFERENCE",
        "category": "REFERENCE_TRACEABILITY",
        "severity": "HIGH",
        "business_impact": (
            "Provider-side investigation becomes harder because the record cannot be "
            "traced cleanly inside the PSP/export system."
        ),
        "user_facing_explanation": (
            "This settlement record does not contain the PSP reference. If a dispute "
            "or support escalation happens, your team may not have a clean PSP-side "
            "handle to investigate it."
        ),
        "recommended_action": (
            "Ask PSP/export system to include payout/transfer/reference ID. "
            "Add provider reference as a required field in the settlement mapping profile."
        ),
        "default_action_contract": "REQUEST_SOURCE_PATCH",
        "trigger_condition": (
            "provider_reference IS NULL AND source_strength_class IN "
            "('PSP_REPORT', 'INTERNAL_EXPORT')"
        ),
        "intelligence_layer": "AMBIGUITY + RCA",
        "internal_only": False,
    },
    "MBR": {
        "cluster_name": "MISSING_BANK_REFERENCE",
        "category": "REFERENCE_TRACEABILITY",
        "severity": "HIGH",
        "business_impact": (
            "Audit and final settlement defensibility weaken because bank-side proof "
            "is usually stronger than PSP-only status."
        ),
        "user_facing_explanation": (
            "This record does not contain a bank-side reference such as UTR/RRN. "
            "It may be harder to prove settlement using bank evidence."
        ),
        "recommended_action": (
            "Require bank reference in settlement/statement ingestion. If bank "
            "reference is delayed, mark the payment as evidence-pending rather than "
            "fully defended."
        ),
        "default_action_contract": "GENERATE_EVIDENCE",
        "trigger_condition": (
            "bank_reference IS NULL AND observation_kind IN "
            "('SETTLEMENT', 'STATEMENT_ENTRY')"
        ),
        "intelligence_layer": "EVIDENCE + AUDIT",
        "internal_only": False,
    },
    "WBR": {
        "cluster_name": "WEAK_BATCH_REFERENCE",
        "category": "REFERENCE_TRACEABILITY",
        "severity": "HIGH",
        "business_impact": (
            "The whole batch becomes costly to investigate. Enterprises think in "
            "batches, and batch-level status matters for ERP/finance workflows."
        ),
        "user_facing_explanation": (
            "This batch has weak reference quality. Many settlement records do not "
            "carry enough identifiers to confidently connect them to original payout "
            "intents."
        ),
        "recommended_action": (
            "Patch source system batch template. Require client ref / provider ref "
            "fields. Use Zord Prepare-and-Sign for this batch family."
        ),
        "default_action_contract": "REVIEW_BATCH",
        "trigger_condition": (
            "missing_client_ref_rate > 0.30 OR carrier_completeness_rate < 0.70 "
            "OR avg_attachment_readiness_score < 0.60"
        ),
        "intelligence_layer": "PATTERN",
        "internal_only": False,
    },
    "RFC": {
        "cluster_name": "REFERENCE_CONFLICT",
        "category": "REFERENCE_TRACEABILITY",
        "severity": "CRITICAL",
        "business_impact": (
            "Can create false confirmation, duplicate settlement interpretation, or "
            "wrong payout evidence."
        ),
        "user_facing_explanation": (
            "Zord found the same reference being claimed by more than one payment "
            "record. This creates a conflict and cannot be treated as cleanly matched."
        ),
        "recommended_action": (
            "Hold affected records for review. Check duplicate source rows or PSP "
            "export duplication. Strengthen idempotency/reference generation."
        ),
        "default_action_contract": "REVIEW_AMBIGUOUS_BATCH",
        "trigger_condition": (
            "reference_collision_count > 1 OR decision_type = 'MATCH_CONFLICTED'"
        ),
        "intelligence_layer": "AMBIGUITY + LEAKAGE",
        "internal_only": False,
    },
    # ── 2. Settlement / Variance ───────────────────────────────────────────────
    "UIN": {
        "cluster_name": "UNMATCHED_INTENT",
        "category": "SETTLEMENT_VARIANCE",
        "severity": "HIGH",
        "business_impact": (
            "This becomes value-at-risk. The business intended to pay, but Zord "
            "cannot observe enough settlement evidence."
        ),
        "user_facing_explanation": (
            "This payout intent exists, but Zord has not found a matching settlement "
            "record within the expected window."
        ),
        "recommended_action": (
            "Trigger settlement backfill. Ask PSP/bank for updated report. If in "
            "dispatch mode, trigger poll/status recovery, not blind replay."
        ),
        "default_action_contract": "PREPARE_BACKFILL",
        "trigger_condition": (
            "decision_type IN ('MATCH_UNRESOLVED') OR no settlement_observation_id "
            "after settlement_window"
        ),
        "intelligence_layer": "LEAKAGE",
        "internal_only": False,
    },
    "ORS": {
        "cluster_name": "ORPHAN_SETTLEMENT",
        "category": "SETTLEMENT_VARIANCE",
        "severity": "HIGH",
        "business_impact": (
            "Money appears in settlement data but cannot be explained against known "
            "intents. Dangerous for audit and finance close."
        ),
        "user_facing_explanation": (
            "Zord found a settlement record that does not link to any known payout "
            "intent."
        ),
        "recommended_action": (
            "Check if payout was generated outside Zord. Check whether the intent "
            "file was incomplete. Review PSP/source-system export."
        ),
        "default_action_contract": "ESCALATE_TO_FINANCE",
        "trigger_condition": (
            "settlement_observation_id EXISTS AND attachment_decision.intent_id IS NULL "
            "AND decision_type = 'MATCH_UNRESOLVED'"
        ),
        "intelligence_layer": "LEAKAGE + EVIDENCE",
        "internal_only": False,
    },
    "USL": {
        "cluster_name": "UNDER_SETTLEMENT",
        "category": "SETTLEMENT_VARIANCE",
        "severity": "HIGH",
        "business_impact": "Potential money leakage or unaccounted deduction.",
        "user_facing_explanation": (
            "The amount settled is lower than the intended payout amount beyond the "
            "allowed tolerance."
        ),
        "recommended_action": (
            "Check PSP fee/deduction policy. Verify whether deduction is expected. "
            "Escalate unexplained variance."
        ),
        "default_action_contract": "ESCALATE_TO_FINANCE",
        "trigger_condition": (
            "amount_variance_minor < 0 AND ABS(amount_variance_minor) > "
            "allowed_tolerance AND variance_reason NOT IN allowed_deduction_policy"
        ),
        "intelligence_layer": "LEAKAGE",
        "internal_only": False,
    },
    "OSL": {
        "cluster_name": "OVER_SETTLEMENT",
        "category": "SETTLEMENT_VARIANCE",
        "severity": "MEDIUM",
        "business_impact": (
            "Potential overpayment, duplicate correction, or settlement aggregation "
            "issue."
        ),
        "user_facing_explanation": (
            "The settled amount is higher than the intended payout amount. This may "
            "indicate overpayment or file aggregation mismatch."
        ),
        "recommended_action": (
            "Review settlement row grouping. Check if the settlement row aggregates "
            "multiple payouts. Confirm no duplicate payout occurred."
        ),
        "default_action_contract": "REVIEW_BATCH",
        "trigger_condition": "amount_variance_minor > allowed_tolerance_minor",
        "intelligence_layer": "LEAKAGE",
        "internal_only": False,
    },
    "FDV": {
        "cluster_name": "FEE_DEDUCTION_VARIANCE",
        "category": "SETTLEMENT_VARIANCE",
        "severity": "MEDIUM",
        "business_impact": (
            "Not always leakage. Valuable because Zord separates legitimate "
            "deductions from unexplained leakage."
        ),
        "user_facing_explanation": (
            "The difference appears to match a fee or deduction pattern. Zord has "
            "separated this from unexplained leakage."
        ),
        "recommended_action": (
            "Confirm deduction policy. Add expected fee rule if this is recurring and "
            "legitimate. Flag if fee exceeds expected range."
        ),
        "default_action_contract": "UPDATE_POLICY_RULE",
        "trigger_condition": (
            "ABS(amount_variance_minor) <= expected_fee_range OR "
            "deduction_amount_minor IS NOT NULL OR fee_amount_minor IS NOT NULL"
        ),
        "intelligence_layer": "LEAKAGE + RCA",
        "internal_only": False,
    },
    "VDM": {
        "cluster_name": "VALUE_DATE_MISMATCH",
        "category": "SETTLEMENT_VARIANCE",
        "severity": "MEDIUM",
        "business_impact": (
            "Creates finance close and ERP clearing problems. Month-end SAP/ERP "
            "cases where instruction date and bank settlement date differ."
        ),
        "user_facing_explanation": (
            "This payout was instructed in one date period but settled on another "
            "date. Finance may need to adjust posting or clearing records."
        ),
        "recommended_action": (
            "Surface in finance close report. Adjust posting period if required. "
            "Track route/cutoff patterns causing mismatch."
        ),
        "default_action_contract": "ESCALATE_TO_FINANCE",
        "trigger_condition": "value_date_mismatch_flag = true",
        "intelligence_layer": "AMBIGUITY + PATTERN",
        "internal_only": False,
    },
    "CPS": {
        "cluster_name": "CROSS_PERIOD_SETTLEMENT",
        "category": "SETTLEMENT_VARIANCE",
        "severity": "LOW",
        "business_impact": (
            "Creates accounting close, SAP/ERP clearing, and month-end "
            "reconciliation burden."
        ),
        "user_facing_explanation": (
            "This payout settled in a different accounting period from when it was "
            "instructed."
        ),
        "recommended_action": (
            "Include in month-end close exception report. Adjust finance posting "
            "period."
        ),
        "default_action_contract": "ESCALATE_TO_FINANCE",
        "trigger_condition": "cross_period_flag = true",
        "intelligence_layer": "PATTERN + RCA",
        "internal_only": False,
    },
    # ── 3. Data Quality ────────────────────────────────────────────────────────
    "LPC": {
        "cluster_name": "LOW_PARSE_CONFIDENCE",
        "category": "DATA_QUALITY",
        "severity": "MEDIUM",
        "business_impact": (
            "Parser failures should not be misread as missing bank confirmation. "
            "Some records may be unreliable."
        ),
        "user_facing_explanation": (
            "Zord could not confidently parse parts of this file. Some records may "
            "need reprocessing or mapping correction before they can be trusted."
        ),
        "recommended_action": (
            "Reprocess with corrected parser/mapping profile. Ask client to confirm "
            "latest file format. Open schema review."
        ),
        "default_action_contract": "REPROCESS_WITH_NEW_PROFILE",
        "trigger_condition": (
            "parse_confidence < 0.70 OR parse_success_rate < configured_threshold"
        ),
        "intelligence_layer": "AMBIGUITY + RCA",
        "internal_only": False,
    },
    "LMC": {
        "cluster_name": "LOW_MAPPING_CONFIDENCE",
        "category": "DATA_QUALITY",
        "severity": "MEDIUM",
        "business_impact": (
            "Data may be parsed but semantically unreliable. Can create poor "
            "attachment, wrong RCA, and weak intelligence."
        ),
        "user_facing_explanation": (
            "Zord could read the file, but some columns could not be confidently "
            "mapped to payment fields."
        ),
        "recommended_action": (
            "Update mapping profile. Ask client/source system to stabilize headers. "
            "Mark affected rows as low-confidence."
        ),
        "default_action_contract": "FIX_MAPPING_PROFILE",
        "trigger_condition": (
            "mapping_confidence < 0.70 OR required_field_gap_count > 0"
        ),
        "intelligence_layer": "AMBIGUITY + RCA",
        "internal_only": False,
    },
    "MRF": {
        "cluster_name": "MISSING_REQUIRED_FIELD",
        "category": "DATA_QUALITY",
        "severity": "HIGH",
        "business_impact": (
            "Missing amount, currency, status, timestamp, or reference basis can "
            "prevent clean attachment and evidence."
        ),
        "user_facing_explanation": (
            "This file is missing fields required to create a reliable payment "
            "record."
        ),
        "recommended_action": (
            "Reject affected rows to review/DLQ. Patch source file template. Define "
            "tenant-specific mapping rule if field exists under another name."
        ),
        "default_action_contract": "REQUEST_SOURCE_PATCH",
        "trigger_condition": (
            "required_field_gap_count > 0 OR any required canonical field is NULL"
        ),
        "intelligence_layer": "AMBIGUITY",
        "internal_only": False,
    },
    "DRF": {
        "cluster_name": "DUPLICATE_ROW_IN_FILE",
        "category": "DATA_QUALITY",
        "severity": "CRITICAL",
        "business_impact": (
            "Can create double counting in leakage, settlement totals, or attachment "
            "decisions if not isolated."
        ),
        "user_facing_explanation": (
            "This file appears to contain duplicate rows. Zord has isolated them to "
            "prevent double counting."
        ),
        "recommended_action": (
            "Review duplicate rows. Confirm whether the source export duplicated "
            "transactions. Keep only one active canonical observation per duplicate "
            "group unless policy says otherwise."
        ),
        "default_action_contract": "REVIEW_BATCH",
        "trigger_condition": (
            "duplicate_row_detected = true OR raw_line_hash duplicates within "
            "same ingest_run_id"
        ),
        "intelligence_layer": "LEAKAGE + PATTERN",
        "internal_only": False,
    },
    "SDD": {
        "cluster_name": "SCHEMA_DRIFT_DETECTED",
        "category": "DATA_QUALITY",
        "severity": "HIGH",
        "business_impact": (
            "Schema drift can silently break parsing and matching. Tells the client "
            "their export format changed."
        ),
        "user_facing_explanation": (
            "The file format has changed compared to the expected schema. This may "
            "affect parsing, matching, and evidence quality."
        ),
        "recommended_action": (
            "Review new file format. Create or update mapping profile. Reprocess "
            "after mapping fix."
        ),
        "default_action_contract": "FIX_MAPPING_PROFILE",
        "trigger_condition": (
            "unexpected_column_count > threshold OR required_headers_missing OR "
            "mapping_profile_version mismatch"
        ),
        "intelligence_layer": "PATTERN + RCA",
        "internal_only": False,
    },
    # ── 4. Payment Lifecycle ───────────────────────────────────────────────────
    "FPO": {
        "cluster_name": "FAILED_PAYOUT",
        "category": "PAYMENT_LIFECYCLE",
        "severity": "HIGH",
        "business_impact": (
            "Failure requires ops action and may affect seller/vendor/customer trust."
        ),
        "user_facing_explanation": (
            "This payout is marked as failed by the provider or settlement file."
        ),
        "recommended_action": (
            "Show normalized failure reason. Recommend correction based on RCA "
            "taxonomy. If dispatch mode: evaluate replay eligibility, not blind retry."
        ),
        "default_action_contract": "ESCALATE_TO_OPS",
        "trigger_condition": (
            "settlement_status = 'FAILED' OR provider_status_code IN failure_code_map"
        ),
        "intelligence_layer": "RCA",
        "internal_only": False,
    },
    "RAS": {
        "cluster_name": "REVERSED_AFTER_SUCCESS",
        "category": "PAYMENT_LIFECYCLE",
        "severity": "CRITICAL",
        "business_impact": (
            "Payment previously observed as successful is later reversed. Finance "
            "must treat this as a post-settlement exception."
        ),
        "user_facing_explanation": (
            "This payout was initially successful but later reversed. Finance should "
            "treat this as a post-settlement exception."
        ),
        "recommended_action": (
            "Generate updated evidence pack. Notify finance. Mark batch status as "
            "reversed partial if applicable."
        ),
        "default_action_contract": "GENERATE_EVIDENCE",
        "trigger_condition": (
            "reversal_flag = true OR final_state transitions SUCCESS → "
            "REVERSED_AFTER_SUCCESS"
        ),
        "intelligence_layer": "LEAKAGE + EVIDENCE",
        "internal_only": False,
    },
    "RPO": {
        "cluster_name": "RETURNED_PAYOUT",
        "category": "PAYMENT_LIFECYCLE",
        "severity": "HIGH",
        "business_impact": (
            "Often requires beneficiary detail correction and safe "
            "replay/re-initiation logic."
        ),
        "user_facing_explanation": (
            "This payout was returned by the bank or downstream payment system."
        ),
        "recommended_action": (
            "Review beneficiary details. Do not replay until return reason is "
            "understood. If dispatch mode: evaluate replay eligibility."
        ),
        "default_action_contract": "ESCALATE_TO_OPS",
        "trigger_condition": "return_flag = true OR return_code IS NOT NULL",
        "intelligence_layer": "RCA + LEAKAGE",
        "internal_only": False,
    },
    "PBS": {
        "cluster_name": "PENDING_BEYOND_SLA",
        "category": "PAYMENT_LIFECYCLE",
        "severity": "HIGH",
        "business_impact": (
            "Payment has not reached expected settlement within configured "
            "SLA/window. Becomes value-at-risk the longer it stays unresolved."
        ),
        "user_facing_explanation": (
            "This payout has remained unresolved beyond the expected settlement "
            "window."
        ),
        "recommended_action": (
            "Trigger statement/PSP backfill. Escalate if high-value. If dispatch "
            "mode: poll provider before replay."
        ),
        "default_action_contract": "PREPARE_BACKFILL",
        "trigger_condition": (
            "current_time - intended_execution_at > expected_settlement_window AND "
            "decision_type IN ('MATCH_UNRESOLVED', NULL)"
        ),
        "intelligence_layer": "AMBIGUITY + PATTERN",
        "internal_only": False,
    },
    "DUC": {
        "cluster_name": "DISPATCH_UNCERTAIN",
        "category": "PAYMENT_LIFECYCLE",
        "severity": "CRITICAL",
        "business_impact": (
            "Blind replay may cause duplicate payout. Zord cannot prove whether "
            "the provider accepted the dispatch attempt."
        ),
        "user_facing_explanation": (
            "Zord cannot yet prove whether the provider accepted this dispatch "
            "attempt. The payout must not be blindly replayed until acceptance "
            "status is recovered."
        ),
        "recommended_action": (
            "Query provider by idempotency key/reference. Run status recovery. "
            "Hold replay until eligibility is known."
        ),
        "default_action_contract": "HOLD",
        "trigger_condition": (
            "dispatch_state = 'ATTEMPT_UNCERTAIN' OR dispatch_status = 'UNCERTAIN'"
        ),
        "intelligence_layer": "AMBIGUITY + RCA",
        "internal_only": False,
    },
    # ── 5. Batch / System Quality ──────────────────────────────────────────────
    "HDR": {
        "cluster_name": "HIGH_DUPLICATE_RISK",
        "category": "BATCH_QUALITY",
        "severity": "CRITICAL",
        "business_impact": (
            "Duplicate payouts are one of the clearest money-risk categories."
        ),
        "user_facing_explanation": (
            "This batch contains payout instructions that look semantically "
            "duplicated."
        ),
        "recommended_action": (
            "Review duplicate clusters. Enforce stronger business idempotency. Hold "
            "high-risk rows if policy enabled."
        ),
        "default_action_contract": "REVIEW_BATCH",
        "trigger_condition": (
            "duplicate_risk_rate > 0.02 for normal batches OR > 0.005 for "
            "high-value payout batches"
        ),
        "intelligence_layer": "LEAKAGE + PATTERN",
        "internal_only": False,
    },
    "LMB": {
        "cluster_name": "LOW_MATCHABILITY_BATCH",
        "category": "BATCH_QUALITY",
        "severity": "HIGH",
        "business_impact": (
            "Even if payouts succeed, future settlement proof will be expensive "
            "and ambiguous."
        ),
        "user_facing_explanation": (
            "This batch may be difficult to verify later because its payout records "
            "do not contain enough strong matching identifiers."
        ),
        "recommended_action": (
            "Add stronger references before sending. Use Zord Prepare-and-Sign mode."
        ),
        "default_action_contract": "PREPARE_AND_SIGN_RECOMMENDED",
        "trigger_condition": (
            "AVG(matchability_score) < 0.50 OR carrier_completeness_rate < 0.70"
        ),
        "intelligence_layer": "PATTERN",
        "internal_only": False,
    },
    "LPRB": {
        "cluster_name": "LOW_PROOF_READINESS_BATCH",
        "category": "BATCH_QUALITY",
        "severity": "HIGH",
        "business_impact": (
            "If dispute/audit happens, the batch will be harder to defend."
        ),
        "user_facing_explanation": (
            "This batch has weak proof readiness. If a dispute or audit occurs, the "
            "evidence trail may be incomplete."
        ),
        "recommended_action": (
            "Generate missing evidence packs. Patch missing governance/reference "
            "fields. Use Prepare-and-Sign for future batches."
        ),
        "default_action_contract": "GENERATE_EVIDENCE",
        "trigger_condition": (
            "AVG(proof_readiness_score) < 0.50 OR pack_completeness_score < 0.70"
        ),
        "intelligence_layer": "EVIDENCE + AUDIT",
        "internal_only": False,
    },
    "HAB": {
        "cluster_name": "HIGH_AMBIGUITY_BATCH",
        "category": "BATCH_QUALITY",
        "severity": "HIGH",
        "business_impact": (
            "Tells the enterprise where money exists in uncertain operational state. "
            "Several payouts cannot be confidently connected to settlement evidence."
        ),
        "user_facing_explanation": (
            "This batch has a high ambiguity rate. Several payouts cannot be "
            "confidently connected to settlement evidence."
        ),
        "recommended_action": (
            "Review affected records. Trigger source patch. Consider Prepare-and-Sign "
            "for this payout flow."
        ),
        "default_action_contract": "REVIEW_AMBIGUOUS_BATCH",
        "trigger_condition": (
            "ambiguity_rate > configured_threshold OR ambiguous_value_at_risk > "
            "configured_amount_threshold"
        ),
        "intelligence_layer": "AMBIGUITY",
        "internal_only": False,
    },
    "SSWT": {
        "cluster_name": "SOURCE_SYSTEM_WEAK_TRACEABILITY",
        "category": "BATCH_QUALITY",
        "severity": "MEDIUM",
        "business_impact": (
            "Tells management which internal system or PSP export is causing "
            "operational cost."
        ),
        "user_facing_explanation": (
            "Most traceability problems are concentrated in one source system. Fixing "
            "this source will reduce ambiguity across future batches."
        ),
        "recommended_action": (
            "Patch source system export. Add mandatory reference fields. Apply "
            "tenant-specific mapping profile update."
        ),
        "default_action_contract": "REQUEST_SOURCE_PATCH",
        "trigger_condition": (
            "AVG(matchability_score by source_system) < threshold OR "
            "missing_reference_rate by source_system > threshold"
        ),
        "intelligence_layer": "PATTERN + RECOMMENDATION",
        "internal_only": False,
    },
    # ── 6. Evidence / Internal Integrity ──────────────────────────────────────
    "MEP": {
        "cluster_name": "MISSING_EVIDENCE_PACK",
        "category": "EVIDENCE_INTEGRITY",
        "severity": "HIGH",
        "business_impact": (
            "Direct product-quality and audit-readiness issue. Evidence packs are "
            "slightly fewer than exact matches."
        ),
        "user_facing_explanation": (
            "This payout is matched, but its evidence pack is not yet generated."
        ),
        "recommended_action": (
            "Trigger evidence regeneration. Check missing leaf dependencies."
        ),
        "default_action_contract": "GENERATE_EVIDENCE",
        "trigger_condition": (
            "evidence_pack_id IS NULL AND decision_type IN "
            "('MATCH_EXACT', 'MATCH_HIGH_CONFIDENCE')"
        ),
        "intelligence_layer": "EVIDENCE + AUDIT",
        "internal_only": False,
    },
    "MLE": {
        "cluster_name": "MISSING_LEAF_EVIDENCE",
        "category": "EVIDENCE_INTEGRITY",
        "severity": "HIGH",
        "business_impact": (
            "Evidence pack exists but one or more required leaf types are missing. "
            "Required proof leaves must be deliberate and complete."
        ),
        "user_facing_explanation": (
            "An evidence pack exists, but some proof components are missing."
        ),
        "recommended_action": (
            "Regenerate pack after dependencies arrive. Investigate which service "
            "failed to emit the required artifact."
        ),
        "default_action_contract": "GENERATE_EVIDENCE",
        "trigger_condition": (
            "missing_leaf_types_json IS NOT EMPTY OR pack_completeness_score < 1.0"
        ),
        "intelligence_layer": "EVIDENCE + AUDIT",
        "internal_only": False,
    },
    "OGM": {
        "cluster_name": "ORPHAN_GOVERNANCE_MISSING",
        "category": "EVIDENCE_INTEGRITY",
        "severity": "HIGH",
        "business_impact": (
            "Zord proves what happened but not why it was authorized. Governance "
            "decisions must exist in the Evidence Pack."
        ),
        "user_facing_explanation": (
            "Zord has payment evidence, but the policy decision explaining why this "
            "payout was allowed is missing."
        ),
        "recommended_action": (
            "Ensure Service 2 emits governance decision artifact. Regenerate evidence "
            "pack with governance leaf."
        ),
        "default_action_contract": "GENERATE_EVIDENCE",
        "trigger_condition": (
            "governance_state IS NULL OR governance_decision_leaf_present_flag = false"
        ),
        "intelligence_layer": "EVIDENCE + AUDIT",
        "internal_only": False,
    },
    "IPM": {
        "cluster_name": "IDEMPOTENCY_PROTECTION_WEAK",
        "category": "EVIDENCE_INTEGRITY",
        "severity": "HIGH",
        "business_impact": (
            "Weak idempotency increases duplicate payout risk and replay risk."
        ),
        "user_facing_explanation": (
            "This payout does not have strong duplicate-protection identity. If "
            "retried or reprocessed, it may create duplicate-risk."
        ),
        "recommended_action": (
            "Enforce business idempotency key. Use semantic duplicate detection. "
            "Review duplicate-risk records."
        ),
        "default_action_contract": "REVIEW_BATCH",
        "trigger_condition": (
            "business_idempotency_key IS NULL OR duplicate_risk_flag = true"
        ),
        "intelligence_layer": "LEAKAGE + PATTERN",
        "internal_only": False,
    },
    "ARP": {
        "cluster_name": "ACTIVE_RUN_REPROCESS_CONFLICT",
        "category": "EVIDENCE_INTEGRITY",
        "severity": "CRITICAL",
        "business_impact": (
            "Can double-count settlements or show stale intelligence. Multiple "
            "processing runs exist for same settlement batch."
        ),
        "user_facing_explanation": (
            "Multiple processing runs exist for this batch. Zord has isolated them "
            "to prevent double counting."
        ),
        "recommended_action": (
            "Set latest valid run as active. Exclude superseded runs from "
            "projections. Compare old vs new run if needed."
        ),
        "default_action_contract": "REVIEW_BATCH",
        "trigger_condition": (
            "count(active_runs for settlement_batch_id) != 1 OR old_run included "
            "in Service 7 projections"
        ),
        "intelligence_layer": "PATTERN + EVIDENCE",
        "internal_only": True,  # internal-only per spec section 8
    },
}

# Ordered list of all valid cluster codes (used in tests and training)
ALL_CLUSTER_CODES: list[str] = list(TAXONOMY.keys())

# ── Feature column definitions ────────────────────────────────────────────────

TEXT_COL = "reason_text"

CAT_COLS = [
    "source_strength_class",
    "observation_kind",
    "decision_type",
    "governance_state",
]

NUM_COLS = [
    "parse_confidence",
    "mapping_confidence",
    "carrier_richness_score",
    "attachment_readiness_score",
    "ambiguity_score",
    "confidence_score",
    "amount_variance_pct",
    "settlement_delay_days",
    "proof_readiness_score",
    "matchability_score",
    "pack_completeness_score",
    "candidate_count",
    "missing_leaf_count",
]

BIN_COLS = [
    "missing_client_ref",
    "missing_provider_ref",
    "missing_bank_ref",
    "reversal_flag",
    "return_flag",
    "duplicate_row_detected",
    "value_date_mismatch_flag",
    "cross_period_flag",
    "duplicate_risk_flag",
    "missing_evidence_pack",
    "governance_leaf_missing",
    "idempotency_key_missing",
    "weak_batch_ref_flag",
]

_NUM_DEFAULTS = {col: 0.0 for col in NUM_COLS}
_CAT_DEFAULTS = {col: "UNKNOWN" for col in CAT_COLS}
_BIN_DEFAULTS = {col: 0 for col in BIN_COLS}


# ── Bundle ────────────────────────────────────────────────────────────────────

@dataclass
class RCABundle:
    pipeline: ColumnTransformer
    hdbscan_model: hdbscan.HDBSCAN
    cluster_label_map: dict[int, str]
    feature_contract_version: str = FEATURE_CONTRACT_VERSION


# ── Feature matrix ────────────────────────────────────────────────────────────

def build_pipeline() -> Pipeline:
    """Construct the sklearn preprocessing pipeline. Identical structure used
    during training and inference so transforms are always consistent."""
    text_pipe = Pipeline([
        ("tfidf", TfidfVectorizer(max_features=500, ngram_range=(1, 2))),
        # n_components=10 is deliberately small: real pipeline reason_text is
        # often just 1-3 tokens (e.g. "SETTLED", "MATCH_AMBIGUOUS"), so TF-IDF
        # may produce as few as ~15 features.  n_components must be < n_features.
        ("svd", TruncatedSVD(n_components=10, random_state=42)),
    ])

    ct = ColumnTransformer(
        transformers=[
            ("text", text_pipe, TEXT_COL),
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=True), CAT_COLS),
            ("num", StandardScaler(with_mean=False), NUM_COLS),
            ("bin", "passthrough", BIN_COLS),
        ],
        remainder="drop",
    )
    return ct


def _candidates_to_df(candidates: list[dict]) -> pd.DataFrame:
    """Convert list of candidate dicts to a DataFrame with filled defaults."""
    df = pd.DataFrame(candidates)
    for col, default in {**_NUM_DEFAULTS, **_CAT_DEFAULTS, **_BIN_DEFAULTS}.items():
        if col not in df.columns:
            df[col] = default
        else:
            df[col] = df[col].fillna(default)
    if TEXT_COL not in df.columns:
        df[TEXT_COL] = ""
    else:
        df[TEXT_COL] = df[TEXT_COL].fillna("").astype(str)
    return df


# ── Model ─────────────────────────────────────────────────────────────────────

class RCAModel:
    """
    Thread-safe HDBSCAN RCA model.

    Inference uses the last stable bundle under RLock.
    Retraining happens in a background thread and swaps the bundle atomically.
    """

    def __init__(self, model_path: str) -> None:
        self._path = model_path
        self._lock = threading.RLock()
        self._bundle: Optional[RCABundle] = None
        self._retrain_buffer: list[dict] = []
        self._model_digest = ""
        self._retrain_labels: list[str] = []
        self._retraining = False
        self._load()

    # ── Public API ────────────────────────────────────────────────────────────

    @property
    def is_ready(self) -> bool:
        """Whether an RCA bundle was successfully loaded and can serve inference."""
        with self._lock:
            return self._bundle is not None

    @property
    def model_digest(self) -> str:
        """SHA-256 of the exact loaded RCA artifact."""
        with self._lock:
            return self._model_digest

    def predict(self, candidates: list[dict]) -> list[dict]:
        """
        Classify candidates into RCA cluster codes.

        Returns a list of assignment dicts, one per candidate:
          {
            "intent_id": str,
            "cluster_code": str,
            "cluster_id": int,       # raw HDBSCAN integer
            "membership_confidence": float,
            "is_noise": bool,
          }
        Returns [] if model is not loaded or candidates is empty.
        """
        if not candidates:
            return []

        with self._lock:
            bundle = self._bundle

        if bundle is None:
            logger.warning("rca_model: bundle not loaded — returning empty predictions")
            return []

        try:
            df = _candidates_to_df(candidates)
            X = bundle.pipeline.transform(df)
            # approximate_predict requires dense array for HDBSCAN
            if hasattr(X, "toarray"):
                X_dense = X.toarray()
            else:
                X_dense = np.asarray(X)

            labels, strengths = hdbscan.approximate_predict(bundle.hdbscan_model, X_dense)

            assignments = []
            for i, (label, strength) in enumerate(zip(labels, strengths)):
                is_noise = bool(label == -1)
                if is_noise:
                    # approximate_predict labeled this point as noise.
                    # Fall back to nearest-neighbour cluster assignment.
                    # Always assign when a nearest non-noise training point exists —
                    # the distance-based confidence (1/(1+d)) in high-dimensional space
                    # can be small even for genuinely close points, so a fixed threshold
                    # incorrectly keeps everything as noise when distributions differ
                    # (e.g. bootstrap model trained on synthetic data, real data at
                    # predict time).  Only remain as noise if the model is empty (-1).
                    nearest, knn_score = _nearest_cluster_knn(
                        bundle.hdbscan_model, X_dense[i:i+1]
                    )
                    effective_label = nearest
                    effective_strength = knn_score
                    if nearest != -1:
                        is_noise = False
                else:
                    effective_label = int(label)
                    effective_strength = float(strength)

                cluster_code = bundle.cluster_label_map.get(
                    effective_label, "UNCLASSIFIED"
                )
                intent_id = candidates[i].get("intent_id", f"idx_{i}")
                assignments.append({
                    "intent_id": intent_id,
                    "cluster_code": cluster_code,
                    "cluster_id": effective_label,
                    "membership_confidence": effective_strength,
                    "is_noise": is_noise,
                    "intended_amount_minor": candidates[i].get("intended_amount_minor", 0),
                    "reason_text": candidates[i].get("reason_text", ""),
                })

            return assignments

        except Exception:
            logger.exception("rca_model: predict failed for %d candidates", len(candidates))
            return []

    def maybe_retrain_async(
        self,
        candidates: list[dict],
        true_labels: list[str],
        threshold: int,
    ) -> None:
        """
        Buffer new labeled examples. If buffer reaches threshold and no retrain
        is in progress, launch a background retrain thread.
        """
        with self._lock:
            self._retrain_buffer.extend(candidates)
            self._retrain_labels.extend(true_labels)
            buffered = len(self._retrain_buffer)
            already_retraining = self._retraining

        if buffered >= threshold and not already_retraining:
            with self._lock:
                self._retraining = True
                buf_copy = list(self._retrain_buffer)
                lbl_copy = list(self._retrain_labels)
                self._retrain_buffer.clear()
                self._retrain_labels.clear()

            t = threading.Thread(
                target=self._retrain,
                args=(buf_copy, lbl_copy),
                daemon=True,
                name="rca-retrain",
            )
            t.start()
            logger.info("rca_model: retrain thread started on %d examples", len(buf_copy))

    # ── Internal ──────────────────────────────────────────────────────────────

    def _load(self) -> None:
        try:
            bundle: RCABundle = joblib.load(self._path)
            model_digest = file_sha256(self._path)
            with self._lock:
                self._bundle = bundle
                self._model_digest = model_digest
            logger.info(
                "rca_model: loaded bundle version=%s cluster_map_size=%d path=%s",
                bundle.feature_contract_version,
                len(bundle.cluster_label_map),
                self._path,
            )
        except FileNotFoundError:
            logger.info(
                "rca_model: no bundle at %s — running without model (fallback active)",
                self._path,
            )
        except Exception:
            logger.exception("rca_model: load failed path=%s — running without model", self._path)

    def _retrain(self, candidates: list[dict], true_labels: list[str]) -> None:
        try:
            logger.info("rca_model: retrain starting on %d examples", len(candidates))
            df = _candidates_to_df(candidates)

            # Fit pipeline fresh on new data
            pipeline = build_pipeline()
            X = pipeline.fit_transform(df)
            if hasattr(X, "toarray"):
                X_dense = X.toarray()
            else:
                X_dense = np.asarray(X)

            # Fit HDBSCAN
            clusterer = hdbscan.HDBSCAN(
                min_cluster_size=5,
                min_samples=3,
                prediction_data=True,
                metric="euclidean",
            )
            clusterer.fit(X_dense)

            # Derive cluster_label_map via majority vote
            cluster_label_map = _derive_cluster_label_map(
                clusterer.labels_, true_labels
            )

            new_bundle = RCABundle(
                pipeline=pipeline,
                hdbscan_model=clusterer,
                cluster_label_map=cluster_label_map,
                feature_contract_version=FEATURE_CONTRACT_VERSION,
            )

            # Atomic disk write then in-memory swap
            tmp_path = self._path + ".tmp"
            joblib.dump(new_bundle, tmp_path)
            os.replace(tmp_path, self._path)
            model_digest = file_sha256(self._path)

            with self._lock:
                self._bundle = new_bundle

                self._model_digest = model_digest
            logger.info(
                "rca_model: retrain complete clusters=%d noise_pct=%.1f%%",
                len(cluster_label_map),
                100.0 * np.sum(clusterer.labels_ == -1) / max(len(clusterer.labels_), 1),
            )
        except Exception:
            logger.exception("rca_model: retrain failed — keeping existing bundle")
        finally:
            with self._lock:
                self._retraining = False


# ── Summarize clusters ────────────────────────────────────────────────────────

def summarize_clusters(
    assignments: list[dict],
    batch_id: str,
    tenant_id: str,
    top_n: int = 10,
) -> dict:
    """
    Group assignments by cluster_code and produce the full model_outputs dict
    that Go will deserialise into RCAClusterResult.

    Returns:
      {
        "top_clusters": [...],
        "cluster_count": int,
        "clustered_points": int,
        "noise_points": int,
        "total_points": int,
        "total_affected_amount_minor": int,
        "feature_contract_version": str,
      }
    """
    if not assignments:
        return _empty_result()

    total = len(assignments)
    noise_count = sum(1 for a in assignments if a["is_noise"] and a["membership_confidence"] < NOISE_SOFT_PROB_THRESHOLD)
    clustered = total - noise_count

    # Group by cluster_code
    groups: dict[str, list[dict]] = {}
    for a in assignments:
        code = a["cluster_code"]
        groups.setdefault(code, []).append(a)

    summaries = []
    for code, members in groups.items():
        tax = TAXONOMY.get(code)
        if tax is None:
            # Unknown code — still emit a minimal entry so nothing is silently dropped
            tax = {
                "cluster_name": code,
                "category": "UNKNOWN",
                "severity": "MEDIUM",
                "business_impact": "",
                "user_facing_explanation": "",
                "recommended_action": "",
                "default_action_contract": "",
                "trigger_condition": "",
                "intelligence_layer": "",
                "internal_only": False,
            }

        size = len(members)
        share_pct = round(size / total * 100, 2) if total > 0 else 0.0
        avg_confidence = round(
            sum(m["membership_confidence"] for m in members) / size, 4
        )
        affected_amount = sum(
            int(m.get("intended_amount_minor", 0)) for m in members
        )

        # Top 3 representative reason_text samples (non-empty, deduplicated)
        seen: set[str] = set()
        rep_reasons: list[str] = []
        for m in sorted(members, key=lambda x: x["membership_confidence"], reverse=True):
            rt = m.get("reason_text", "").strip()
            if rt and rt not in seen:
                seen.add(rt)
                rep_reasons.append(rt)
            if len(rep_reasons) == 3:
                break

        summaries.append({
            "cluster_code": code,
            "cluster_label": tax["cluster_name"],
            "category": tax["category"],
            "recommendation_nature": "ADVISORY_PREDICTION",
            "decision_authority": "ADVISORY_ONLY",
            "may_actuate": False,
            "deterministic_rule_required": True,
            "severity": tax["severity"],
            "recommended_action": tax["recommended_action"],
            "user_explanation": tax["user_facing_explanation"],
            "business_impact": tax["business_impact"],
            "trigger_condition": tax["trigger_condition"],
            "default_action_contract": tax["default_action_contract"],
            "intelligence_layer": tax["intelligence_layer"],
            "internal_only": tax["internal_only"],
            "size": size,
            "affected_amount_minor": affected_amount,
            "share_pct": share_pct,
            "membership_confidence": avg_confidence,
            "representative_reasons": rep_reasons,
            "top_scope": f"batch:{batch_id}",
        })

    # Sort by size descending, cap at top_n
    summaries.sort(key=lambda x: x["size"], reverse=True)
    summaries = summaries[:top_n]

    total_amount = sum(
        int(a.get("intended_amount_minor", 0)) for a in assignments
    )

    return {
        "top_clusters": summaries,
        "cluster_count": len(groups),
        "clustered_points": clustered,
        "noise_points": noise_count,
        "total_points": total,
        "total_affected_amount_minor": total_amount,
        "feature_contract_version": FEATURE_CONTRACT_VERSION,
    }


def _empty_result() -> dict:
    return {
        "top_clusters": [],
        "cluster_count": 0,
        "clustered_points": 0,
        "noise_points": 0,
        "total_points": 0,
        "total_affected_amount_minor": 0,
        "feature_contract_version": FEATURE_CONTRACT_VERSION,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _nearest_cluster_knn(
    clusterer: hdbscan.HDBSCAN,
    point: np.ndarray,
) -> tuple[int, float]:
    """
    For a noise point, find the nearest HDBSCAN cluster via its exemplar points.

    Uses PredictionData.exemplars — a list indexed by compact cluster ID (0, 1, ...)
    where each entry is an array of the most representative training points for that
    cluster.  These IDs map directly to cluster_label_map keys.

    Confidence = 1 / (1 + min_distance), bounded to (0, 1].
    """
    try:
        exemplars: list = clusterer._prediction_data.exemplars
        if not exemplars:
            return -1, 0.0

        pt = point.flatten()
        best_cluster = -1
        best_dist = float("inf")

        for cluster_id, ex_pts in enumerate(exemplars):
            if ex_pts is None or len(ex_pts) == 0:
                continue
            dists = np.linalg.norm(np.asarray(ex_pts) - pt, axis=1)
            min_dist = float(np.min(dists))
            if min_dist < best_dist:
                best_dist = min_dist
                best_cluster = cluster_id

        if best_cluster == -1:
            return -1, 0.0

        return best_cluster, float(1.0 / (1.0 + best_dist))
    except Exception:
        logger.exception("_nearest_cluster_knn: failed")
        return -1, 0.0


def _derive_cluster_label_map(
    hdbscan_labels: np.ndarray,
    true_labels: list[str],
) -> dict[int, str]:
    """
    Map each HDBSCAN integer cluster id to the majority true_cluster_code
    among training points assigned to it.  Noise points (-1) are skipped.
    """
    cluster_votes: dict[int, list[str]] = {}
    for hdb_id, true_code in zip(hdbscan_labels, true_labels):
        if hdb_id == -1:
            continue
        cluster_votes.setdefault(int(hdb_id), []).append(true_code)

    return {
        cluster_id: Counter(votes).most_common(1)[0][0]
        for cluster_id, votes in cluster_votes.items()
        if votes
    }

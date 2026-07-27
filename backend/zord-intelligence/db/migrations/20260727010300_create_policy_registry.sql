-- +goose Up
CREATE TABLE policy_registry (
	policy_id                TEXT        PRIMARY KEY,
	version                  INT         NOT NULL DEFAULT 1,
	scope_type               TEXT        NOT NULL,
	CHECK (scope_type IN ('tenant', 'corridor', 'contract')),
	trigger_type             TEXT        NOT NULL,
	CHECK (trigger_type IN ('event', 'cron')),
	trigger_value            TEXT        NOT NULL,
	dsl                      TEXT        NOT NULL,
	enabled                  BOOLEAN     NOT NULL DEFAULT false,
	tenant_id                TEXT,
	created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
	policy_family            TEXT,
	severity                 TEXT        DEFAULT 'MEDIUM',
	requires_manual_approval BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX idx_policy_enabled_trigger
	ON policy_registry (trigger_type, trigger_value)
	WHERE enabled = true;

CREATE INDEX idx_policy_family
	ON policy_registry (policy_family, enabled)
	WHERE policy_family IS NOT NULL;

INSERT INTO policy_registry
	(policy_id, version, scope_type, trigger_type, trigger_value, dsl, enabled)
VALUES
('P_SLA_BREACH_RISK', 1, 'corridor', 'cron', '*/5 * * * *',
'WHEN corridor.finality_p95_seconds > 6h AND corridor.total_pending > 500
THEN ACTION ESCALATE severity=HIGH',
false),
('P_FAILURE_BURST', 1, 'corridor', 'event', 'outcome.event.normalized',
'WHEN corridor.success_rate < 0.70
THEN ACTION ESCALATE severity=HIGH',
false),
('P_PENDING_BACKLOG_AGING', 1, 'corridor', 'cron', '*/5 * * * *',
'WHEN corridor.pending_6h_plus > 50
THEN ACTION OPEN_OPS_INCIDENT severity=MEDIUM',
false),
('P_CONFLICT_SPIKE', 1, 'corridor', 'event', 'finality.certificate.issued',
'WHEN corridor.success_rate < 0.85
THEN ACTION NOTIFY severity=MEDIUM',
false),
('P_EVIDENCE_MISSING', 1, 'tenant', 'cron', '*/5 * * * *',
'WHEN tenant.evidence_readiness_rate < 0.80
THEN ACTION GENERATE_EVIDENCE severity=LOW',
false),
('P_STATEMENT_MISMATCH_SPIKE', 1, 'corridor', 'event', 'statement.match.event',
'WHEN corridor.statement_match_rate < 0.90
THEN ACTION OPEN_OPS_INCIDENT severity=MEDIUM',
false),
('P_CORRIDOR_DEGRADATION', 1, 'corridor', 'event', 'finality.certificate.issued',
'WHEN corridor.success_rate < 0.90
THEN ACTION ADVISORY_RECOMMENDATION severity=LOW',
false),
('P_SLA_BREACH_RATE_HIGH', 1, 'tenant', 'cron', '*/5 * * * *',
'WHEN tenant.sla_breach_rate > 0.05
THEN ACTION ESCALATE severity=HIGH',
false),
('P_ANOMALY_DETECTED', 1, 'corridor', 'cron', '*/5 * * * *',
'WHEN corridor.anomaly_score > 0.70
THEN ACTION ESCALATE severity=HIGH',
false),
('P_SLA_BREACH_RISK_HIGH', 1, 'corridor', 'cron', '*/5 * * * *',
'WHEN corridor.sla_breach_risk > 0.70
THEN ACTION NOTIFY severity=HIGH',
false),
('P_FAILURE_PATTERN_SHIFT', 1, 'corridor', 'event', 'outcome.event.normalized',
'WHEN corridor.failure_cluster_shift_score > 0.60
THEN ACTION ESCALATE severity=MEDIUM',
false),
('P_SLA_BREACH', 1, 'tenant', 'cron', '*/5 * * * *',
'WHEN tenant.sla_breach_rate > 0.00
THEN ACTION ESCALATE severity=HIGH',
false)
ON CONFLICT (policy_id) DO NOTHING;

INSERT INTO policy_registry
	(policy_id, version, scope_type, trigger_type, trigger_value, dsl,
	 policy_family, severity, requires_manual_approval, enabled)
VALUES
('P_LEAKAGE_ALERT', 1, 'tenant', 'cron', '*/15 * * * *',
'WHEN leakage.total_amount_minor > 500000 AND leakage.percentage > 0.025
THEN ACTION ESCALATE severity=HIGH',
'LEAKAGE', 'HIGH', false, false),
('P_LEAKAGE_UNMATCHED', 1, 'tenant', 'event', 'attachment.decision.created',
'WHEN leakage.unmatched_intent_count > 20
THEN ACTION NOTIFY severity=MEDIUM',
'LEAKAGE', 'MEDIUM', false, false),
('P_LEAKAGE_UNDER_SETTLEMENT', 1, 'tenant', 'cron', '*/15 * * * *',
'WHEN leakage.under_settlement_amount_minor > 50000
THEN ACTION OPEN_OPS_INCIDENT severity=MEDIUM',
'LEAKAGE', 'MEDIUM', false, false),
('P_LEAKAGE_PREPARE_AND_SIGN', 1, 'tenant', 'cron', '0 * * * *',
'WHEN leakage.percentage > 0.05
THEN ACTION PREPARE_AND_SIGN_RECOMMENDED severity=HIGH',
'LEAKAGE', 'HIGH', false, false),
('P_AMBIGUITY_VALUE_AT_RISK', 1, 'tenant', 'cron', '*/15 * * * *',
'WHEN ambiguity.value_at_risk_minor > 1000000
THEN ACTION ESCALATE severity=HIGH',
'AMBIGUITY', 'HIGH', false, false),
('P_AMBIGUITY_RATE_HIGH', 1, 'tenant', 'event', 'attachment.decision.created',
'WHEN ambiguity.rate > 0.05
THEN ACTION REQUEST_SOURCE_PATCH severity=MEDIUM',
'AMBIGUITY', 'MEDIUM', false, false),
('P_AMBIGUITY_BATCH_REVIEW', 1, 'corridor', 'event', 'batch.summary.updated',
'WHEN batch.ambiguity_score > 0.70
THEN ACTION REVIEW_AMBIGUOUS_BATCH severity=HIGH',
'AMBIGUITY', 'HIGH', true, false),
('P_DEFENSIBILITY_EVIDENCE_WEAK', 1, 'tenant', 'cron', '*/30 * * * *',
'WHEN defensibility.governance_coverage_pct < 0.70
THEN ACTION REGENERATE_EVIDENCE severity=MEDIUM',
'DEFENSIBILITY', 'MEDIUM', false, false),
('P_DEFENSIBILITY_AUDIT_RISK', 1, 'tenant', 'cron', '*/30 * * * *',
'WHEN defensibility.audit_ready_pct < 0.80
THEN ACTION ESCALATE severity=HIGH',
'DEFENSIBILITY', 'HIGH', false, false),
('P_PATTERN_BATCH_RISK', 1, 'corridor', 'event', 'batch.summary.updated',
'WHEN batch.risk_score > 0.65
THEN ACTION NOTIFY severity=MEDIUM',
'PATTERN', 'MEDIUM', false, false),
('P_PATTERN_DUPLICATE_RISK', 1, 'tenant', 'event', 'canonical.intent.created',
'WHEN pattern.duplicate_cluster_count > 5
THEN ACTION HOLD severity=HIGH',
'PATTERN', 'HIGH', true, false),
('P_PATTERN_CARRIER_WEAKNESS', 1, 'tenant', 'cron', '0 */6 * * *',
'WHEN pattern.proof_readiness_score < 0.75
THEN ACTION REQUEST_STRONGER_CARRIER_CONTRACT severity=MEDIUM',
'PATTERN', 'MEDIUM', false, false),
('P_DUPLICATE_CLUSTER_HOLD', 1, 'tenant', 'event', 'canonical.intent.created',
'WHEN pattern.duplicate_cluster_count > 10
THEN ACTION HOLD severity=HIGH',
'PATTERN', 'HIGH', true, false),
('P_REVERSAL_FINANCE_REVIEW', 1, 'tenant', 'cron', '*/15 * * * *',
'WHEN leakage.reversal_exposure_minor > 500000
THEN ACTION ESCALATE severity=HIGH',
'LEAKAGE', 'HIGH', true, false),
('P_AMBIGUITY_BATCH_HOLD', 1, 'corridor', 'event', 'batch.summary.updated',
'WHEN batch.ambiguity_score > 0.85
THEN ACTION REVIEW_AMBIGUOUS_BATCH severity=HIGH',
'AMBIGUITY', 'HIGH', true, false),
('P_GOVERNANCE_REJECTION', 1, 'tenant', 'event', 'governance.decision.created',
'WHEN defensibility.governance_rejected_count > 0
THEN ACTION ESCALATE severity=HIGH',
'DEFENSIBILITY', 'HIGH', false, false),
('P_LEAKAGE_AND_AMBIGUITY_UPGRADE', 1, 'tenant', 'cron', '0 */6 * * *',
'WHEN leakage.percentage > 0.03 OR ambiguity.rate > 0.08
THEN ACTION PREPARE_AND_SIGN_RECOMMENDED severity=HIGH',
'RECOMMENDATION', 'HIGH', false, false),
('P_DEFENSIBILITY_CRITICAL', 1, 'tenant', 'cron', '*/30 * * * *',
'WHEN defensibility.audit_ready_pct < 0.60
THEN ACTION ESCALATE severity=HIGH',
'DEFENSIBILITY', 'HIGH', false, false),
('P_CARRIER_WEAKNESS_UPGRADE', 1, 'tenant', 'cron', '0 */12 * * *',
'WHEN ambiguity.provider_ref_missing_rate > 0.15
THEN ACTION REQUEST_STRONGER_CARRIER_CONTRACT severity=MEDIUM',
'AMBIGUITY', 'MEDIUM', false, false),
('P_UNRESOLVED_SPIKE', 1, 'tenant', 'event', 'attachment.decision.created',
'WHEN ambiguity.unresolved_count > 50
THEN ACTION OPEN_OPS_INCIDENT severity=HIGH',
'AMBIGUITY', 'HIGH', false, false)
ON CONFLICT (policy_id) DO NOTHING;

-- +goose Down
DROP INDEX idx_policy_family;
DROP INDEX idx_policy_enabled_trigger;
DROP TABLE policy_registry;

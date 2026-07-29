package services

// ============================================================
// action_service.go
// ============================================================
//
// Creates ActionContracts and their matching outbox entries.
// Called by policy_service when a rule fires.
//
// PHASE 5 ADDITIONS:
//
// 1. REQUIRES_MANUAL_APPROVAL SUPPORT
//    When a policy has requires_manual_approval=true, OR the decision itself
//    requires approval (HOLD, RETRY, REVIEW_AMBIGUOUS_BATCH), the ActionContract
//    is created with contract_status = PENDING_APPROVAL and NO outbox entry.
//    The outbox entry is only inserted when ops approves the action via the API.
//
// 2. EXPIRY WINDOWS
//    PENDING_APPROVAL contracts are given an expires_at deadline.
//    Default: 24h. The outbox_worker sweeps and marks expired contracts.
//    This prevents stale approval requests from lingering indefinitely.
//
// 3. POLICY METADATA PROPAGATION
//    policy_family and severity are now carried from the policy into
//    the ActionContract at creation time. This enables family-scoped
//    and severity-scoped dashboard queries without parsing DSL text.
//
// 4. ACTUATION GATING
//    needsActuation() is extended to cover all new Phase 5 decision types
//    that should produce Kafka messages (not just advisory records).

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zord/zord-intelligence/internal/logger"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// ActionService creates and stores ActionContracts.
type ActionService struct {
	actionRepo *persistence.ActionContractRepo
	outboxRepo *persistence.OutboxRepo
	pool       *pgxpool.Pool // needed to open transactions
	signer     Signer        // PHASE 5 (refactor): real signature abstraction
}

// NewActionService creates an ActionService.
//
// PHASE 5 (refactor): signer is now required — pass services.NewDevSigner()
// (or whatever services.NewSignerForEnvironment(cfg.Environment) returns)
// from cmd/main.go.
func NewActionService(
	actionRepo *persistence.ActionContractRepo,
	outboxRepo *persistence.OutboxRepo,
	pool *pgxpool.Pool,
	signer Signer,
) *ActionService {
	return &ActionService{
		actionRepo: actionRepo,
		outboxRepo: outboxRepo,
		pool:       pool,
		signer:     signer,
	}
}

// CreateActionRequest holds everything needed to create an ActionContract.
//
// PHASE 5: RequiresManualApproval, PolicyFamily, Severity are new.
// They come from the Policy row that triggered this action.
type CreateActionRequest struct {
	TenantID       string
	PolicyID       string
	PolicyVersion  int
	ScopeRefs      models.ScopeRefs
	InputRefsJSON  string
	Decision       models.Decision
	Confidence     float64
	PayloadJSON    string
	TriggerEventID string

	// PHASE 5 — sourced from policy_registry
	RequiresManualApproval bool                // policy.RequiresManualApproval
	PolicyFamily           models.PolicyFamily // policy.PolicyFamily
	Severity               string              // parsed from DSL or policy.Severity column

	// PHASE 5 (refactor) — sourced from policy_registry via the
	// policy_definitions correlated subquery (policy_repo.go). Empty string
	// if the policy's dual-written definition hasn't landed (should not
	// happen post-Phase-5, handled gracefully — see deriveScope/idempotency
	// key builder below, which simply hash an empty string in that case).
	PolicyRegistryID string // policy.PolicyRegistryID
	PolicyDigest     string // policy.PolicyDigest
	PolicySource     string // policy.PolicySource
}

// CreateAction creates an ActionContract and its outbox entry atomically.
//
// PHASE 5 APPROVAL LOGIC:
//
// A decision enters PENDING_APPROVAL when:
//   a) The Policy has requires_manual_approval = true (DB column), OR
//   b) The Decision itself always requires approval (HOLD, RETRY, REVIEW_AMBIGUOUS_BATCH)
//
// When PENDING_APPROVAL:
//   - ActionContract is inserted with contract_status = PENDING_APPROVAL
//   - No outbox entry is created (outbox_worker would skip it anyway, but
//     we save a row to make the approval dashboard query simpler)
//   - expires_at is set to now + ApprovalDefaultExpiryHours
//
// When ACTIVE (normal path):
//   - ActionContract is inserted with contract_status = ACTIVE
//   - Outbox entry is created in the SAME transaction (atomic)
//   - Outbox worker delivers to Kafka on next poll
func (s *ActionService) CreateAction(
	ctx context.Context,
	req CreateActionRequest,
) error {

	// SHA-256(policy_id + scope_refs + trigger_event_id) input, still needed
	// for the ScopeRefs field itself further down.
	_, err := json.Marshal(req.ScopeRefs)
	if err != nil {
		return fmt.Errorf("action_service.CreateAction marshal scope_refs: %w", err)
	}

	// ── PHASE 5 (refactor): scope classifier + envelope lineage + integrity
	// hashes — computed before the idempotency key and signature so both can
	// depend on them.
	scopeType, scopeRef := deriveScope(req.ScopeRefs, req.TenantID)
	envMeta := models.EnvelopeMetaFromContext(ctx)
	inputFactsHash := fmt.Sprintf("%x", sha256.Sum256([]byte(req.InputRefsJSON)))
	payloadHash := fmt.Sprintf("%x", sha256.Sum256([]byte(req.PayloadJSON)))

	// ── Build idempotency key ─────────────────────────────────────────────
	// Same inputs → same key → DB UNIQUE constraint silently ignores duplicate.
	idempotencyKey := buildIdempotencyKey(
		req.TenantID, req.PolicyID, req.PolicyVersion, req.PolicySource, req.PolicyDigest,
		scopeType, scopeRef, req.TriggerEventID, envMeta.EventVersion, payloadHash,
	)

	// ── Determine contract status ─────────────────────────────────────────
	// PHASE 5: the approval gate. Two conditions force PENDING_APPROVAL:
	//   1. The policy explicitly declares it needs human approval
	//   2. The decision type always requires human approval by design
	needsApproval := req.RequiresManualApproval || req.Decision.RequiresApproval()

	contractStatus := models.ContractStatusActive
	var expiresAt *time.Time
	if needsApproval {
		contractStatus = models.ContractStatusPendingApproval
		// Set a 24-hour window for approval. After this, outbox_worker auto-expires.
		exp := time.Now().UTC().Add(models.ApprovalDefaultExpiryHours * time.Hour)
		expiresAt = &exp
	}

	// ── Build the ActionContract ──────────────────────────────────────────
	actionID := "act_" + uuid.New().String()
	now := time.Now().UTC()

	contract := models.ActionContract{
		ActionID:       actionID,
		TenantID:       req.TenantID,
		PolicyID:       req.PolicyID,
		PolicyVersion:  req.PolicyVersion,
		ScopeRefs:      req.ScopeRefs,
		InputRefsJSON:  req.InputRefsJSON,
		Decision:       req.Decision,
		Confidence:     req.Confidence,
		PayloadJSON:    req.PayloadJSON,
		IdempotencyKey: idempotencyKey,
		ContractStatus: contractStatus,   // PHASE 5
		ExpiresAt:      expiresAt,        // PHASE 5
		PolicyFamily:   req.PolicyFamily, // PHASE 5
		Severity:       req.Severity,     // PHASE 5
		CreatedAt:      now,

		// ── PHASE 5 (refactor) ────────────────────────────────────────────
		PolicyRegistryID:     req.PolicyRegistryID,
		PolicySource:         req.PolicySource,
		PolicyDigest:         req.PolicyDigest,
		ScopeType:            scopeType,
		ScopeRef:             scopeRef,
		TriggerEventID:       req.TriggerEventID,
		TriggerEventSource:   envMeta.EventSource,
		TriggerEventType:     envMeta.EventType,
		TriggerEventVersion:  envMeta.EventVersion,
		InputFactsHash:       inputFactsHash,
		PayloadHash:          payloadHash,
		PayloadSchemaVersion: "legacy",
	}

	// PHASE 5 (refactor): sign the canonical hash of the immutable fields via
	// the Signer abstraction (clarification §5) — never sign raw mutable JSON.
	sigPayloadHash := buildSignaturePayloadHash(contract)
	sigResult, err := s.signer.Sign(ctx, sigPayloadHash)
	if err != nil {
		return fmt.Errorf("action_service.CreateAction sign: %w", err)
	}
	contract.IntegrityDigest = sigResult.Signature
	contract.SignatureAlgorithm = sigResult.Algorithm
	contract.SignatureKeyID = sigResult.KeyID
	contract.SignaturePayloadHash = sigPayloadHash
	contract.CanonicalizationVersion = sigResult.CanonicalizationVersion
	signedAt := sigResult.SignedAt
	contract.SignedAt = &signedAt
	// No external verification endpoint exists yet (clarification §5 "Phase
	// 2" — key registry, auditor bundle, rotation — is out of scope here).
	contract.SignatureVerificationStatus = "UNVERIFIED"

	// ── Decide if an outbox entry is needed ───────────────────────────────
	// No outbox for PENDING_APPROVAL — we wait for human sign-off.
	// No outbox for advisory/audit-only decisions — they produce no Kafka message.
	needsOutbox := contractStatus == models.ContractStatusActive && needsActuation(req.Decision)

	// ── Open a database transaction ───────────────────────────────────────
	// Either BOTH the contract and outbox entry land in the DB, or neither does.
	// This eliminates the "contract inserted but Kafka never fires" failure mode.
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("action_service.CreateAction begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// ── Write 1: Insert ActionContract ───────────────────────────────────
	inserted, err := s.actionRepo.InsertIfNewTx(ctx, tx, contract)
	if err != nil {
		return fmt.Errorf("action_service.CreateAction insert contract: %w", err)
	}
	if !inserted {
		// Idempotent — already processed this exact (policy, scope, trigger) triple.
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("action_service.CreateAction commit duplicate: %w", err)
		}
		logger.Info("action deduplicated by idempotency key",
			"policy_id", req.PolicyID,
			"tenant_id", req.TenantID,
			"idempotency_key", idempotencyKey,
		)
		return nil
	}

	// ── Write 2: Insert outbox entry (only when actuation is needed) ──────
	if needsOutbox {
		outboxPayload := buildOutboxPayload(req, actionID)
		outboxEntry := models.ActuationOutbox{
			EventID:     "evt_" + uuid.New().String(),
			ActionID:    actionID,
			EventType:   string(req.Decision),
			Payload:     outboxPayload,
			Status:      models.OutboxStatusPending,
			Attempts:    0,
			NextRetryAt: now,
			CreatedAt:   now,
			// PHASE 5 (refactor): denormalized from the parent contract so
			// tenant/scope-filtered outbox queries don't need a join.
			TenantID:             contract.TenantID,
			ScopeType:            contract.ScopeType,
			ScopeRef:             contract.ScopeRef,
			PayloadHash:          fmt.Sprintf("%x", sha256.Sum256([]byte(outboxPayload))),
			PayloadSchemaVersion: "legacy",
		}
		if err := s.outboxRepo.InsertTx(ctx, tx, outboxEntry); err != nil {
			return fmt.Errorf("action_service.CreateAction insert outbox: %w", err)
		}
	}

	// ── Commit ────────────────────────────────────────────────────────────
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("action_service.CreateAction commit: %w", err)
	}

	// ── Structured log ────────────────────────────────────────────────────
	logger.Info("action created",
		"action_id", actionID,
		"policy_id", req.PolicyID,
		"decision", string(req.Decision),
		"confidence", req.Confidence,
		"tenant_id", req.TenantID,
		"contract_status", string(contractStatus),
		"policy_family", string(req.PolicyFamily),
		"severity", req.Severity,
		"needs_approval", needsApproval,
		"needs_outbox", needsOutbox,
	)

	return nil
}

// ApproveAction transitions a PENDING_APPROVAL contract to APPROVED and
// inserts its outbox entry so the outbox_worker can deliver it to Kafka.
//
// PHASE 5: This is the "human approved it" path.
//
// Returns (true, nil)  → approved successfully, outbox entry created
// Returns (false, nil) → action not found or not in PENDING_APPROVAL state
// Returns (false, err) → database error
func (s *ActionService) ApproveAction(
	ctx context.Context,
	tenantID, actionID string,
) (approved bool, err error) {
	// Fetch the current contract to get the decision type and payload
	contract, err := s.actionRepo.GetByID(ctx, actionID)
	if err != nil {
		return false, fmt.Errorf("action_service.ApproveAction GetByID action=%s: %w", actionID, err)
	}
	if contract == nil {
		return false, nil // not found
	}
	if contract.TenantID != tenantID {
		return false, nil // wrong tenant — treat as not found (security)
	}
	if contract.ContractStatus != models.ContractStatusPendingApproval {
		return false, nil // already resolved or active
	}

	// Open a transaction: status update + outbox insert must be atomic.
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, fmt.Errorf("action_service.ApproveAction begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Transition to APPROVED
	updated, err := s.actionRepo.UpdateStatus(ctx, actionID, models.ContractStatusApproved)
	if err != nil {
		return false, fmt.Errorf("action_service.ApproveAction UpdateStatus action=%s: %w", actionID, err)
	}
	if !updated {
		// Race condition: another goroutine already processed this approval
		return false, nil
	}

	// Insert outbox entry now that approval is confirmed.
	// Build a synthetic CreateActionRequest just for buildOutboxPayload.
	req := CreateActionRequest{
		TenantID:      contract.TenantID,
		PolicyID:      contract.PolicyID,
		PolicyVersion: contract.PolicyVersion,
		ScopeRefs:     contract.ScopeRefs,
		Decision:      contract.Decision,
		PayloadJSON:   contract.PayloadJSON,
	}
	now := time.Now().UTC()
	outboxPayload := buildOutboxPayload(req, actionID)
	outboxEntry := models.ActuationOutbox{
		EventID:     "evt_" + uuid.New().String(),
		ActionID:    actionID,
		EventType:   string(contract.Decision),
		Payload:     outboxPayload,
		Status:      models.OutboxStatusPending,
		Attempts:    0,
		NextRetryAt: now,
		CreatedAt:   now,
		// PHASE 5 (refactor): denormalized from the parent contract, same as
		// the CreateAction outbox insert above.
		TenantID:             contract.TenantID,
		ScopeType:            contract.ScopeType,
		ScopeRef:             contract.ScopeRef,
		PayloadHash:          fmt.Sprintf("%x", sha256.Sum256([]byte(outboxPayload))),
		PayloadSchemaVersion: "legacy",
	}
	if err := s.outboxRepo.InsertTx(ctx, tx, outboxEntry); err != nil {
		return false, fmt.Errorf("action_service.ApproveAction insert outbox: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("action_service.ApproveAction commit: %w", err)
	}

	logger.Info("action approved",
		"action_id", actionID,
		"tenant_id", tenantID,
		"decision", string(contract.Decision),
	)
	return true, nil
}

// DismissAction transitions a PENDING_APPROVAL contract to DISMISSED.
// No outbox entry is created — the decision is permanently abandoned.
//
// Returns (true, nil)  → dismissed successfully
// Returns (false, nil) → action not found or not in PENDING_APPROVAL state
func (s *ActionService) DismissAction(
	ctx context.Context,
	tenantID, actionID string,
) (dismissed bool, err error) {
	contract, err := s.actionRepo.GetByID(ctx, actionID)
	if err != nil {
		return false, fmt.Errorf("action_service.DismissAction GetByID action=%s: %w", actionID, err)
	}
	if contract == nil || contract.TenantID != tenantID {
		return false, nil
	}
	if contract.ContractStatus != models.ContractStatusPendingApproval {
		return false, nil
	}

	updated, err := s.actionRepo.UpdateStatus(ctx, actionID, models.ContractStatusDismissed)
	if err != nil {
		return false, fmt.Errorf("action_service.DismissAction UpdateStatus action=%s: %w", actionID, err)
	}

	if updated {
		logger.Info("action dismissed",
			"action_id", actionID,
			"tenant_id", tenantID,
			"decision", string(contract.Decision),
		)
	}
	return updated, nil
}

// ── Private helpers ────────────────────────────────────────────────────────────

// buildIdempotencyKey creates a stable SHA-256 key identifying "the same
// decision, for the same reason, on the same data" — adapted from blueprint
// §6's 12-input formula (tenant_id, policy_key, policy_version,
// policy_source, policy_digest, scope_type, scope_ref, trigger_event_id,
// trigger_event_version, projection_source, projection_version,
// payload_hash). projection_source/projection_version are DROPPED here:
// this codebase's DSL can read several projection metrics in one WHEN
// clause (buildEvalContext in policy_service.go), so there is no single
// projection row whose source/version could stand in for "the" projection
// that fed the decision — hashing an arbitrary pick would misrepresent the
// data more than honestly omitting it. Every other field is genuinely
// available and hashed. Same inputs always produce the same key — duplicate
// events are silently skipped via the idempotency_key UNIQUE constraint.
func buildIdempotencyKey(
	tenantID, policyID string, policyVersion int, policySource, policyDigest,
	scopeType, scopeRef, triggerEventID, triggerEventVersion, payloadHash string,
) string {
	raw := fmt.Sprintf("%s|%s|%d|%s|%s|%s|%s|%s|%s|%s",
		tenantID, policyID, policyVersion, policySource, policyDigest,
		scopeType, scopeRef, triggerEventID, triggerEventVersion, payloadHash,
	)
	hash := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", hash)
}

// deriveScope classifies an ActionContract's primary scope from its
// ScopeRefs, precedence BATCH > INTENT > CONTRACT > CORRIDOR > TENANT — same
// "honest fallback" idiom as Phase 3's keyToProjectionMeta. Mirrored exactly
// by migration 012's SQL backfill for pre-Phase-5 rows.
//
// Ordering rationale: BATCH ranks highest per this refactor's own precedent
// of first-class batch treatment (Phase 2/3). INTENT and CONTRACT rank above
// CORRIDOR because policy_registry.scope_type's own vocabulary already
// treats 'contract' as the narrowest granularity ("contract → evaluates
// once per individual contract") with 'corridor' broader — a single intent
// or contract is a more specific reference than "some corridor", so when
// e.g. sla_worker.go's breach action sets both IntentID and CorridorID, the
// action classifies as INTENT-scoped (corridor stays available via
// ScopeRefs for correlation, it just isn't the *primary* classifier).
// CONTRACT is a ZPI addition (this codebase's own scope_refs.contract_id
// concept), same as Phase 3 added ScopeBank for pattern.bank.* rows that fit
// none of the blueprint's six.
func deriveScope(refs models.ScopeRefs, tenantID string) (scopeType, scopeRef string) {
	switch {
	case refs.BatchID != "":
		return "BATCH", refs.BatchID
	case refs.IntentID != "":
		return "INTENT", refs.IntentID
	case refs.ContractID != "":
		return "CONTRACT", refs.ContractID
	case refs.CorridorID != "":
		return "CORRIDOR", refs.CorridorID
	default:
		return "TENANT", tenantID
	}
}

// buildSignaturePayloadHash returns the canonical hash to sign — clarification
// §5's exact field list: tenant_id, action_id, policy_key, policy_version,
// policy_source, policy_digest, scope_type, scope_ref, input_facts_hash,
// payload_hash, decision, confidence, created_at. Never sign raw mutable
// JSON — this replaces the old signContract() placeholder, which signed an
// ad hoc field subset with plain sha256 and no algorithm/key metadata.
func buildSignaturePayloadHash(ac models.ActionContract) string {
	raw := fmt.Sprintf("%s|%s|%s|%d|%s|%s|%s|%s|%s|%s|%s|%.3f|%s",
		ac.TenantID, ac.ActionID, ac.PolicyID, ac.PolicyVersion,
		ac.PolicySource, ac.PolicyDigest, ac.ScopeType, ac.ScopeRef,
		ac.InputFactsHash, ac.PayloadHash, string(ac.Decision), ac.Confidence,
		ac.CreatedAt.Format(time.RFC3339Nano),
	)
	sum := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", sum)
}

// needsActuation returns true when the decision should produce a Kafka message.
//
// PHASE 5: Extended to include all new decision types that need delivery.
//
// DESIGN:
//   - Safe advisory decisions (ADVISORY_RECOMMENDATION, ALLOW) → no Kafka message
//   - PENDING_APPROVAL decisions → no outbox at create time (added on approval)
//   - Everything else that ops needs to act on → outbox entry needed
func needsActuation(d models.Decision) bool {
	switch d {
	// ── Original decisions that produce Kafka messages ────────────────────
	case models.DecisionEscalate,
		models.DecisionNotify,
		models.DecisionOpenOpsIncident,
		models.DecisionGenerateEvidence,
		models.DecisionHold,
		models.DecisionRetry:
		return true

	// ── PHASE 5: New decisions that produce Kafka messages ─────────────────
	// These all route to specific Kafka topics in outbox_worker.topicForEventType.

	// REVIEW_AMBIGUOUS_BATCH: ops must review the batch before it proceeds.
	// Goes to alert topic — a structured review request.
	case models.DecisionReviewAmbiguousBatch:
		return true

	// REQUEST_SOURCE_PATCH: structured patch request to source system ops team.
	// Goes to batch_patch topic.
	case models.DecisionRequestSourcePatch:
		return true

	// REGENERATE_EVIDENCE: ask Service 6 to rebuild a weak evidence pack.
	// Goes to evidence topic.
	case models.DecisionRegenerateEvidence:
		return true

	// PREPARE_AND_SIGN_RECOMMENDED: commercial upsell signal to ops dashboard.
	// Goes to alert topic — advisory card in the dashboard.
	case models.DecisionPrepareAndSignRecommended:
		return true

	// DISPATCH_MODE_RECOMMENDED: another commercial upsell signal.
	case models.DecisionDispatchModeRecommended:
		return true

	// REQUEST_STRONGER_CARRIER_CONTRACT: ops advisory to renegotiate PSP contract.
	case models.DecisionRequestStrongerCarrierContract:
		return true

	// ── Decisions that do NOT produce Kafka messages ───────────────────────
	// ALLOW: recorded for audit trail only. No downstream effect.
	// ADVISORY_RECOMMENDATION: pure advisory — shown in dashboard only.
	// default: any unknown future decision type defaults to no actuation (safe).
	default:
		return false
	}
}

// buildOutboxPayload constructs the JSON payload written to actuation_outbox.payload.
// This payload is published verbatim to the Kafka topic.
// MUST NOT contain PII — only IDs, references, and operational data.
func buildOutboxPayload(req CreateActionRequest, actionID string) string {
	payload := map[string]any{
		"action_id":      actionID,
		"tenant_id":      req.TenantID,
		"policy_id":      req.PolicyID,
		"policy_version": req.PolicyVersion,
		"decision":       string(req.Decision),
		"scope_refs":     req.ScopeRefs,
		"payload":        req.PayloadJSON,
		"created_at":     time.Now().UTC(),
	}
	b, _ := json.Marshal(payload)
	return string(b)
}

/**
 * Intent Journal — stable type contract.
 *
 * These are the shapes the UI depends on. When the real backend ships,
 * the swap is one mapping function per type. Do not break these without
 * a coordinated migration.
 *
 * Vocabulary (from Zord product definition):
 *   - intent: a requested payout — the atomic unit
 *   - batch: a group of intents processed together
 *   - signal: a webhook / poll / settlement-file event from PSP or bank
 *   - evidence: per-intent trace + cryptographic proof
 *   - ambiguity: conflicting / missing / late signals
 *   - defensibility: per-intent / per-batch score for audit trust
 */

export type IntentLifecycleStatus =
  | 'created'
  | 'dispatched'
  | 'processing'
  | 'confirmed'
  | 'pending'
  | 'ambiguous'
  | 'failed'

export type LineageSystem =
  | 'lms'           // Loan Management System (e.g. SAP)
  | 'erp'           // ERP (NetSuite, Tally, etc.)
  | 'ap'            // Accounts Payable system
  | 'zord'          // Zord ingest / canonicalization
  | 'governance'    // Pre-dispatch policy / KYC / mandate checks
  | 'connector'    // PSP or bank dispatch
  | 'bank'          // Sponsor bank
  | 'settlement'    // Settlement file ingestion

export type LineageStepStatus = 'done' | 'in_progress' | 'warn' | 'error' | 'skipped'

export type LineageStep = {
  /** Stable id so React keys are deterministic. */
  id: string
  system: LineageSystem
  /** Short verb-phrase label, e.g. "Intent created" / "Governance check passed". */
  action: string
  /** ISO timestamp of when this step completed (or started, for in_progress). */
  at: string
  status: LineageStepStatus
  /** Optional one-line explanatory detail. */
  detail?: string
}

export type SignalSource = 'razorpay' | 'cashfree' | 'payu' | 'stripe' | 'hdfc_bank' | 'icici_bank' | 'sbi'
export type SignalKind = 'webhook' | 'poll' | 'settlement_file' | 'reconcile'
export type SignalEventStatus = 'received' | 'late' | 'duplicate' | 'mismatch' | 'rejected'

export type SignalEvent = {
  id: string
  source: SignalSource
  kind: SignalKind
  /** Truncated payload preview shown in the table. */
  payloadPreview: string
  /** ISO timestamp of arrival at Zord. */
  arrivedAt: string
  /** Latency from dispatch to this signal, in milliseconds. */
  latencyMs: number
  status: SignalEventStatus
}

/**
 * Why a particular connector + rail was chosen for this intent.
 * Mirrors the smart-routing reason code system from the dispatch modal.
 */
export type AttachmentDecision = {
  chosenConnector: string  // e.g. 'Cashfree' / 'HDFC Bank'
  chosenConnectorType: 'psp' | 'bank'
  chosenRail: string       // e.g. 'IMPS' / 'NEFT' / 'NACH'
  /** Routing score at decision time, 0-100. */
  score: number
  /** Reason codes (see REASON_CODE_DESCRIPTIONS in the dispatch modal). */
  reasonCodes: string[]
  /** 2 alternatives that were considered + why declined. */
  alternatives: Array<{
    connector: string
    connectorType: 'psp' | 'bank'
    score: number
    declineCode: string  // e.g. 'RAIL_NOT_SUPPORTED' / 'LATENCY_OVER_THRESHOLD' / 'COST_TIER_HIGH'
  }>
}

export type VarianceKind = 'amount' | 'reference' | 'beneficiary' | 'none'

export type Variance = {
  kind: VarianceKind
  /** Plain-language summary; empty when kind === 'none'. */
  summary: string
  /** Expected and observed values for the diff display. Empty when kind === 'none'. */
  expected?: string
  observed?: string
  /** For amount kind, the percent delta (positive = observed higher). */
  deltaPct?: number
}

export type EvidenceArtifactKind =
  | 'intent_json'
  | 'signals_bundle'
  | 'governance_trace'
  | 'dispatch_receipt'
  | 'settlement_extract'

export type EvidenceArtifact = {
  kind: EvidenceArtifactKind
  label: string
  present: boolean
  /** Size in bytes for present artifacts; null if absent. */
  sizeBytes: number | null
}

export type EvidencePackStatus = {
  state: 'complete' | 'partial' | 'pending' | 'none'
  artifactCount: number
  totalArtifacts: number
  /** Hex Merkle root, present only when state === 'complete'. */
  merkleRoot?: string
  /** ISO timestamp of last evidence update. */
  lastUpdatedAt: string
  artifacts: EvidenceArtifact[]
}

// ─── Service 2 truth-build fields (ZORD SERVICE 2 §6, §9.3, §12) ──────────────

/** Service 2 / Service 6 mode — what kind of lifecycle this intent runs. */
export type EvidenceMode = 'INTELLIGENCE_ATTACH' | 'SECONDARY_DISPATCH' | 'FULL_CONTROL'

/** What the enterprise meant by this intent (Service 2 §9.3 `intent_kind`). */
export type IntentKind = 'PAYOUT' | 'VENDOR_DISBURSAL' | 'SELLER_SETTLEMENT' | 'REFUND_PAYOUT'

/**
 * Truth-build governance result inside Service 2 (§6.14).
 * Missing this field hides why an intent was allowed/blocked downstream.
 */
export type GovernanceState =
  | 'VALID'
  | 'REQUIRES_REVIEW'
  | 'HOLD'
  | 'DLQ_TERMINAL'
  | 'READY_FOR_INTELLIGENCE'
  | 'READY_FOR_RELAY'
  | 'READY_FOR_DISPATCH'

/** NIR field-confidence summary (§8.4). Numbers are deterministic, not ML. */
export type FieldConfidenceSummary = {
  averageConfidence: number // 0-1
  minimumConfidence: number // 0-1
  lowConfidenceFieldCount: number
  requiredFieldUncertaintyCount: number
  unmappedExtrasCount: number
}

/** NIR / mapping provenance — §6.1, §6.11, §9.2. */
export type MappingProvenance = {
  nirId: string
  mappingProfileId: string
  mappingProfileVersion: string
  mappingConfidenceScore: number // 0-100, deterministic (§12.1)
  mappingUncertainFlag: boolean
  fieldConfidence: FieldConfidenceSummary
}

/** Business idempotency outputs — §6.7, §11.3. */
export type BusinessIdempotency = {
  businessIdempotencyKey: string
  duplicateRiskFlag: boolean
  duplicateReasonCode: string | null
  strictDuplicateFlag: boolean
  possibleDuplicateClusterId: string | null
}

/** Deterministic structural scores Service 2 computes — §12, §15. */
export type CanonicalScores = {
  proofReadinessScore: number // 0-100 (§12.2)
  matchabilityScore: number // 0-100 (§12.3) — likelihood of later settlement attachment
  intentQualityScore: number // 0-100 (§12.4)
}

/** Governance outcome with reason codes — §9.3. */
export type GovernanceOutcome = {
  state: GovernanceState
  reasonCodes: string[]
}

/**
 * The deep per-intent detail. Returned by `getIntentDetail(intentId)` when
 * the user expands a row. The lightweight row shape (existing
 * `IntentJournalIntentRow`) doesn't carry these — they're fetched lazily.
 */
export type IntentDetail = {
  intentId: string
  batchId: string
  /** Tokenized beneficiary for the drawer header (full form). */
  beneficiaryFull: string
  beneficiaryToken: string
  amount: number
  currency: string
  rail: string
  connector: string
  status: IntentLifecycleStatus
  /** Per-intent defensibility, 0-100. */
  defensibilityScore: number
  /** ISO timestamp of dispatch (or creation if not dispatched). */
  dispatchedAt: string
  /** ISO timestamp of the most recent signal. */
  lastSignalAt: string | null
  lineage: LineageStep[]
  signals: SignalEvent[]
  attachment: AttachmentDecision
  variance: Variance
  evidence: EvidencePackStatus

  // ─── Service 2 truth-build additions ──
  /** Lifecycle mode (Service 6 §3.2). */
  mode: EvidenceMode
  /** What the enterprise meant by this intent. */
  intentKind: IntentKind
  /** Client-provided business identifiers (§6.8). Strong attachment carriers. */
  clientPayoutRef: string | null
  clientBatchRef: string | null
  /** Privacy-safe deterministic fingerprint of beneficiary identity (§6.9). */
  beneficiaryFingerprint: string
  /** Deterministic hash of the canonical entity (§6.10). */
  canonicalHash: string
  /** ISO timestamp Service 2 ingested (vs `dispatchedAt`). */
  ingestedAt: string
  /** Optional intended execution time from the source artifact. */
  intendedExecutionAt: string | null
  /** Mapping / NIR provenance. */
  mapping: MappingProvenance
  /** Business duplicate detection outputs. */
  idempotency: BusinessIdempotency
  /** Deterministic structural scores. */
  scores: CanonicalScores
  /** Governance-at-truth-build result. */
  governance: GovernanceOutcome
}

/**
 * Sandbox-seeded batch wrapper — what `seeded-batches-store` persists.
 * The `batch` field matches the existing `IntentJournalBatchRecord` shape
 * so the Intent Journal sidebar can render it without a different code path.
 */
export type SeededBatch = {
  batchId: string
  scenarioId: string
  scenarioName: string
  seededAt: string
  /**
   * The basic batch shape used by the Intent Journal sidebar. We keep this
   * decoupled from `IntentJournalBatchRecord` so changes to the canned mocks
   * don't accidentally break sandbox seeding (and vice versa).
   */
  batch: {
    batchId: string
    type: 'Disbursement' | 'Settlement'
    source: string
    totalValue: number
    transactions: number
    confirmedCount: number
    highConfidenceCount: number
    mismatchCount: number
    unresolvedCount: number
  }
  /** All intent details for this batch — populated up-front so the journal can render rows immediately. */
  intents: IntentDetail[]
}

/**
 * Maps live `/api/prod/intents/:id` payloads + table row context into the
 * `IntentDetail` contract for the Intent Journal drawer — without using canned
 * mock generators.
 */

import type {
  AttachmentDecision,
  BusinessIdempotency,
  CanonicalScores,
  EvidenceMode,
  EvidencePackStatus,
  GovernanceOutcome,
  GovernanceState,
  IntentDetail,
  IntentKind,
  IntentLifecycleStatus,
  MappingProvenance,
  Variance,
} from '@/services/payout-command/intent-journal-types'
import type { ApiProdIntentDetailPayload } from '@/services/payout-command/prod-api/prodApiTypes'
import { generateBenToken, tokenizeBeneficiaryFull } from '@/services/payout-command/tokenize'

export type LiveJournalDrawerRowInput = {
  requestId: string
  batchId: string
  clientBatchRef?: string
  clientPayoutRef?: string
  sourceRowNum?: number | null
  amount: number
  method: 'Bank Transfer' | 'LSM' | 'NACH' | '—'
  rail?: string
  beneficiaryName?: string | null
  paymentPartner: string
  bank: string
  /** Table row status label */
  uiStatus: 'Ready to Process' | 'Confirmed' | 'Pending' | 'Needs Review' | 'In Progress'
}

function hashToLast4(seed: string): string {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return String((Math.abs(h) % 9000) + 1000)
}

function uiStatusToLifecycle(ui: LiveJournalDrawerRowInput['uiStatus']): IntentLifecycleStatus {
  if (ui === 'Confirmed') return 'confirmed'
  if (ui === 'Needs Review') return 'ambiguous'
  if (ui === 'In Progress') return 'processing'
  if (ui === 'Ready to Process') return 'created'
  return 'pending'
}

function engineStatusToLifecycle(st: string | undefined): IntentLifecycleStatus | null {
  if (!st) return null
  const u = st.toUpperCase()
  if (u.includes('CONFIRM') || u.includes('SUCCESS') || u === 'COMPLETED' || u === 'SETTLED') return 'confirmed'
  if (u.includes('FAIL') || u.includes('REJECT') || u.includes('ERROR')) return 'failed'
  if (u.includes('AMB')) return 'ambiguous'
  if (u.includes('PROCESS') || u.includes('DISPAT') || u === 'IN_FLIGHT') return 'processing'
  if (u.includes('PEND')) return 'pending'
  if (u.includes('CREAT')) return 'created'
  return null
}

function beneficiaryNameFromApi(b: unknown): { first: string; last: string } | null {
  if (!b || typeof b !== 'object') return null
  const raw = (b as { name?: unknown }).name
  if (typeof raw !== 'string' || !raw.trim()) return null
  const parts = raw.trim().split(/\s+/)
  if (parts.length === 1) return { first: parts[0]!, last: '—' }
  return { first: parts[0]!, last: parts.slice(1).join(' ') }
}

function beneficiaryNameFromHint(name: string | null | undefined): { first: string; last: string } | null {
  if (typeof name !== 'string' || !name.trim()) return null
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return { first: parts[0]!, last: '—' }
  return { first: parts[0]!, last: parts.slice(1).join(' ') }
}

function railFromRow(method: LiveJournalDrawerRowInput['method'], railHint?: string): string {
  const hint = String(railHint ?? '').trim().toUpperCase()
  if (hint.includes('RTGS')) return 'RTGS'
  if (hint.includes('NEFT')) return 'NEFT'
  if (hint.includes('NACH')) return 'NACH'
  if (hint.includes('IMPS')) return 'IMPS'
  if (hint.includes('UPI')) return 'UPI'
  if (hint.includes('LSM') || hint.includes('INSTA')) return 'LSM'
  if (method === 'LSM') return 'IMPS'
  if (method === 'NACH') return 'NACH'
  return '—'
}

function connectorFromRow(partner: string, bank: string): string {
  if (partner === 'Razorpay' || partner === 'Cashfree' || partner === 'PayU') return partner
  return bank
}

function connectorType(partner: string): 'psp' | 'bank' {
  return partner === 'Razorpay' || partner === 'Cashfree' || partner === 'PayU' ? 'psp' : 'bank'
}

function defaultAttachment(row: LiveJournalDrawerRowInput): AttachmentDecision {
  const chosenConnector = connectorFromRow(row.paymentPartner, row.bank)
  return {
    chosenConnector,
    chosenConnectorType: connectorType(row.paymentPartner),
    chosenRail: railFromRow(row.method, row.rail),
    score: 0,
    reasonCodes: [],
    alternatives: [],
  }
}

const defaultVariance: Variance = { kind: 'none', summary: '' }

function defaultEvidence(ingestedAt: string): EvidencePackStatus {
  return {
    state: 'none',
    artifactCount: 0,
    totalArtifacts: 0,
    lastUpdatedAt: ingestedAt,
    artifacts: [],
  }
}

function defaultMapping(): MappingProvenance {
  return {
    nirId: 'n/a',
    mappingProfileId: 'live',
    mappingProfileVersion: '0',
    mappingConfidenceScore: 0,
    mappingUncertainFlag: true,
    fieldConfidence: {
      averageConfidence: 0,
      minimumConfidence: 0,
      lowConfidenceFieldCount: 0,
      requiredFieldUncertaintyCount: 0,
      unmappedExtrasCount: 0,
    },
  }
}

function defaultIdempotency(): BusinessIdempotency {
  return {
    businessIdempotencyKey: 'n/a',
    duplicateRiskFlag: false,
    duplicateReasonCode: null,
    strictDuplicateFlag: false,
    possibleDuplicateClusterId: null,
  }
}

function defaultScores(): CanonicalScores {
  return { proofReadinessScore: 0, matchabilityScore: 0, intentQualityScore: 0 }
}

function defaultGovernance(): GovernanceOutcome {
  return { state: 'READY_FOR_INTELLIGENCE' as GovernanceState, reasonCodes: [] }
}

/**
 * Build a full `IntentDetail` for the banking drawer using list-row context
 * plus optional GET `/api/prod/intents/:id` payload (never canned mocks).
 */
export function buildLiveIntentDetailFromRowAndApi(
  row: LiveJournalDrawerRowInput,
  api: ApiProdIntentDetailPayload | null,
): IntentDetail {
  const rawAmt = api?.canonical?.amount?.value
  const parsed =
    typeof rawAmt === 'string' ? parseFloat(rawAmt) : typeof rawAmt === 'number' ? rawAmt : Number.NaN
  const amount = Number.isFinite(parsed) ? parsed : row.amount
  const currency = (api?.canonical?.amount?.currency as string | undefined)?.trim() || 'INR'

  const ingestedAt = api?.created_at?.trim() || new Date().toISOString()
  const dispatchedAt = ingestedAt

  const fromName = beneficiaryNameFromApi(api?.beneficiary)
  const fallbackName = beneficiaryNameFromHint(row.beneficiaryName)
  const last4 = hashToLast4(row.requestId)
  const bankLabel = row.bank
  const chosenName = fromName ?? fallbackName
  const beneficiaryFull = chosenName
    ? tokenizeBeneficiaryFull(chosenName.first, chosenName.last, last4, bankLabel)
    : tokenizeBeneficiaryFull('Masked', 'Beneficiary', last4, bankLabel)

  const beneficiaryToken = generateBenToken(row.requestId)

  const lifecycle = engineStatusToLifecycle(api?.status) ?? uiStatusToLifecycle(row.uiStatus)

  const defensibility =
    typeof api?.confidence_score === 'number' && Number.isFinite(api.confidence_score)
      ? Math.max(0, Math.min(100, Math.round(api.confidence_score * (api.confidence_score <= 1 ? 100 : 1))))
      : 0

  const ALLOWED_KINDS: IntentKind[] = ['PAYOUT', 'VENDOR_DISBURSAL', 'SELLER_SETTLEMENT', 'REFUND_PAYOUT']
  const rawKind = api?.canonical?.intent_type
  const intentKind: IntentKind =
    typeof rawKind === 'string' && ALLOWED_KINDS.includes(rawKind as IntentKind) ? (rawKind as IntentKind) : 'PAYOUT'
  const mode: EvidenceMode = 'INTELLIGENCE_ATTACH'

  return {
    intentId: row.requestId,
    batchId: (api?.batch_id && String(api.batch_id).trim()) || row.batchId,
    beneficiaryFull,
    beneficiaryToken,
    amount,
    currency,
    rail: railFromRow(row.method, row.rail),
    connector: connectorFromRow(row.paymentPartner, row.bank),
    status: lifecycle,
    defensibilityScore: defensibility,
    dispatchedAt,
    lastSignalAt: null,
    lineage: [],
    signals: [],
    attachment: defaultAttachment(row),
    variance: defaultVariance,
    evidence: defaultEvidence(ingestedAt),
    mode,
    intentKind,
    clientPayoutRef: row.clientPayoutRef ?? null,
    clientBatchRef: row.clientBatchRef ?? row.batchId,
    beneficiaryFingerprint: `fp_${row.requestId.slice(-12)}`,
    canonicalHash: `ch_${row.requestId.slice(-16)}`,
    ingestedAt,
    intendedExecutionAt: api?.deadline_at ?? null,
    mapping: defaultMapping(),
    idempotency: defaultIdempotency(),
    scores: defaultScores(),
    governance: defaultGovernance(),
  }
}

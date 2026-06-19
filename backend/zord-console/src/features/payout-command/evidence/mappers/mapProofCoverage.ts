import { evidenceCopy } from '../copy/evidenceCopy'
import type { ProofCoverageTile } from '../types/evidenceViewModels'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'
import type { DefensibilityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { resolveExplicitSignal } from '../utils/proofSignals'

const ITEM_TYPES = {
  intent: ['CANONICAL_INTENT', 'CANONICAL_INTENT_HASH', 'RAW_INGRESS_ENVELOPE', 'ENVELOPE_HASH'],
  settlement: [
    'CANONICAL_SETTLEMENT_OBSERVATION',
    'RAW_SETTLEMENT_ENVELOPE',
    'RAW_SETTLEMENT_FILE',
    'RAW_SETTLEMENT_LINE',
  ],
  match: ['ATTACHMENT_DECISION'],
  governance: ['GOVERNANCE_DECISION_AT_CANONICAL', 'GOVERNANCE_DECISION'],
} as const

function hasItemType(items: EvidencePackFull['items'], types: readonly string[]): boolean {
  return (items ?? []).some((it) => types.includes((it.type || '').toUpperCase()))
}

function itemHasHash(items: EvidencePackFull['items'], types: readonly string[]): boolean {
  return (items ?? []).some((it) => {
    if (!types.includes((it.type || '').toUpperCase())) return false
    return Boolean(it.hash || it.leaf_hash)
  })
}

export type ProofSignalMismatch = {
  id: 'instruction' | 'settlement' | 'match' | 'governance'
  explicit: boolean
  inferred: boolean
}

function resolveCoverageSignal(
  pack: EvidencePackFull,
  opts: {
    id: ProofSignalMismatch['id']
    types: readonly string[]
    component?:
      | 'payment_instruction_available'
      | 'settlement_record_available'
      | 'match_decision_available'
      | 'governance_decision_available'
    flag?: 'settlement_leaf_present_flag' | 'attachment_decision_leaf_present_flag'
    needsHash?: boolean
  },
): { available: boolean; mismatch?: ProofSignalMismatch } {
  const explicit = resolveExplicitSignal(pack, {
    component: opts.component,
    flag: opts.flag,
  })
  const inferred = opts.needsHash
    ? itemHasHash(pack.items ?? [], opts.types)
    : hasItemType(pack.items ?? [], opts.types)

  if (typeof explicit === 'boolean') {
    const mismatch = explicit !== inferred ? { id: opts.id, explicit, inferred } : undefined
    return { available: explicit, mismatch }
  }
  return { available: inferred }
}

/** Internal hook for future warning badges when explicit API signals disagree with inferred items. */
export function collectProofSignalMismatches(pack: EvidencePackFull | null): ProofSignalMismatch[] {
  if (!pack) return []
  const checks = [
    resolveCoverageSignal(pack, {
      id: 'instruction',
      types: ITEM_TYPES.intent,
      component: 'payment_instruction_available',
      needsHash: true,
    }),
    resolveCoverageSignal(pack, {
      id: 'settlement',
      types: ITEM_TYPES.settlement,
      component: 'settlement_record_available',
      flag: 'settlement_leaf_present_flag',
      needsHash: true,
    }),
    resolveCoverageSignal(pack, {
      id: 'match',
      types: ITEM_TYPES.match,
      component: 'match_decision_available',
      flag: 'attachment_decision_leaf_present_flag',
    }),
    resolveCoverageSignal(pack, {
      id: 'governance',
      types: ITEM_TYPES.governance,
      component: 'governance_decision_available',
    }),
  ]
  return checks.map((c) => c.mismatch).filter((m): m is ProofSignalMismatch => Boolean(m))
}

export function mapProofCoverageFromPack(pack: EvidencePackFull | null): ProofCoverageTile[] {
  const hasPack = Boolean(pack?.merkle_root && pack.evidence_pack_id)
  const hasEvidencePackFlag = typeof pack?.proof_status === 'string' || typeof pack?.proof_score === 'number'
  const effectivePack = pack ?? null

  const instruction =
    effectivePack == null
      ? false
      : resolveCoverageSignal(effectivePack, {
          id: 'instruction',
          types: ITEM_TYPES.intent,
          component: 'payment_instruction_available',
          needsHash: true,
        }).available
  const settlement =
    effectivePack == null
      ? false
      : resolveCoverageSignal(effectivePack, {
          id: 'settlement',
          types: ITEM_TYPES.settlement,
          component: 'settlement_record_available',
          flag: 'settlement_leaf_present_flag',
          needsHash: true,
        }).available
  const match =
    effectivePack == null
      ? false
      : resolveCoverageSignal(effectivePack, {
          id: 'match',
          types: ITEM_TYPES.match,
          component: 'match_decision_available',
          flag: 'attachment_decision_leaf_present_flag',
        }).available
  const governance =
    effectivePack == null
      ? false
      : resolveCoverageSignal(effectivePack, {
          id: 'governance',
          types: ITEM_TYPES.governance,
          component: 'governance_decision_available',
        }).available

  return [
    {
      id: 'instruction',
      label: evidenceCopy.coverage.paymentInstruction,
      status: instruction ? 'available' : 'missing',
    },
    {
      id: 'settlement',
      label: evidenceCopy.coverage.settlementRecord,
      status: settlement ? 'available' : 'missing',
    },
    {
      id: 'match',
      label: evidenceCopy.coverage.matchDecision,
      status: match ? 'available' : 'missing',
    },
    {
      id: 'governance',
      label: evidenceCopy.coverage.governanceCheck,
      status: governance ? 'available' : 'missing',
    },
    {
      id: 'pack',
      label: evidenceCopy.coverage.evidencePack,
      status: hasPack || hasEvidencePackFlag ? 'generated' : 'not_generated',
    },
  ]
}

export function mapProofCoverageFromDefensibility(def: DefensibilityKpiResolved | null): ProofCoverageTile[] {
  if (!def) {
    return [
      { id: 'instruction', label: evidenceCopy.coverage.paymentInstruction, status: 'unknown' },
      { id: 'settlement', label: evidenceCopy.coverage.settlementRecord, status: 'unknown' },
      { id: 'match', label: evidenceCopy.coverage.matchDecision, status: 'unknown' },
      { id: 'governance', label: evidenceCopy.coverage.governanceCheck, status: 'unknown' },
      { id: 'pack', label: evidenceCopy.coverage.evidencePack, status: 'unknown' },
    ]
  }

  const packRate = def.evidence_pack_rate
  const govRate = def.governance_coverage_pct
  const replayRate = def.replayability_pct

  const tile = (id: string, label: string, rate: number): ProofCoverageTile => ({
    id,
    label,
    status: rate >= 0.99 ? 'available' : rate > 0 ? 'available' : 'missing',
    isBatchEstimate: true,
  })

  return [
    tile('instruction', evidenceCopy.coverage.paymentInstruction, packRate),
    tile('settlement', evidenceCopy.coverage.settlementRecord, packRate),
    tile('match', evidenceCopy.coverage.matchDecision, packRate * 0.9),
    tile('governance', evidenceCopy.coverage.governanceCheck, govRate),
    {
      id: 'pack',
      label: evidenceCopy.coverage.evidencePack,
      status: packRate >= 0.99 ? 'generated' : packRate > 0 ? 'generated' : 'not_generated',
      isBatchEstimate: true,
    },
  ]
}

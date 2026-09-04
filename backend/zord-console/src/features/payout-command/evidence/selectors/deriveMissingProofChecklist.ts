import { evidenceCopy } from '../copy/evidenceCopy'
import type { MissingProofItem } from '../types/evidenceViewModels'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'
import { resolveExplicitSignal } from '../utils/proofSignals'

const CHECKS: { types: string[]; label: string }[] = [
  {
    types: ['RAW_SETTLEMENT_ENVELOPE', 'RAW_SETTLEMENT_FILE', 'RAW_SETTLEMENT_LINE', 'CANONICAL_SETTLEMENT_OBSERVATION'],
    label: 'Upload bank/settlement confirmation file',
  },
  { types: ['ATTACHMENT_DECISION'], label: 'Confirm match decision' },
  { types: ['GOVERNANCE_DECISION_AT_CANONICAL'], label: 'Complete governance check' },
  { types: ['FINAL_EVIDENCE_VIEW', 'FINAL_CONTRACT'], label: 'Re-run evidence generation' },
]

export function deriveMissingProofChecklist(pack: EvidencePackFull | null): MissingProofItem[] {
  if (!pack) return []

  const items = pack.items ?? []
  const hasTypeWithHash = (types: string[]) =>
    items.some((it) => types.includes((it.type || '').toUpperCase()) && (it.hash || it.leaf_hash))
  const hasType = (types: string[]) =>
    items.some((it) => types.includes((it.type || '').toUpperCase()))

  const resolveDone = (opts: {
    types: string[]
    component?:
      | 'payment_instruction_available'
      | 'settlement_record_available'
      | 'match_decision_available'
      | 'governance_decision_available'
      | 'replay_check_passed'
    flag?: 'settlement_leaf_present_flag' | 'attachment_decision_leaf_present_flag'
    needsHash?: boolean
  }): boolean => {
    const explicit = resolveExplicitSignal(pack, {
      component: opts.component,
      flag: opts.flag,
    })
    if (typeof explicit === 'boolean') return explicit
    return opts.needsHash ? hasTypeWithHash(opts.types) : hasType(opts.types)
  }

  const list: MissingProofItem[] = [
    {
      id: 'settlement',
      label: 'Upload bank/settlement confirmation file',
      done: resolveDone({
        types: ['RAW_SETTLEMENT_ENVELOPE', 'RAW_SETTLEMENT_FILE', 'RAW_SETTLEMENT_LINE', 'CANONICAL_SETTLEMENT_OBSERVATION'],
        component: 'settlement_record_available',
        flag: 'settlement_leaf_present_flag',
        needsHash: true,
      }),
    },
    {
      id: 'bank-ref',
      label: 'Resolve missing bank reference',
      done: resolveDone({
        types: ['ATTACHMENT_DECISION'],
        component: 'match_decision_available',
        flag: 'attachment_decision_leaf_present_flag',
        needsHash: true,
      }),
    },
    {
      id: 'match',
      label: 'Confirm match decision',
      done: resolveDone({
        types: ['ATTACHMENT_DECISION'],
        component: 'match_decision_available',
        flag: 'attachment_decision_leaf_present_flag',
        needsHash: true,
      }),
    },
    {
      id: 'governance',
      label: 'Complete governance check',
      done: resolveDone({
        types: ['GOVERNANCE_DECISION_AT_CANONICAL', 'GOVERNANCE_DECISION'],
        component: 'governance_decision_available',
        needsHash: true,
      }),
    },
    {
      id: 'regen',
      label: 'Re-run evidence generation',
      done:
        (typeof pack.proof_score === 'number' && pack.proof_score > 0) ||
        Boolean(pack.proof_status) ||
        (Boolean(pack.merkle_root) && items.length >= 5),
    },
  ]

  return list.filter((c) => !c.done)
}

export function checklistSectionTitle(): string {
  return evidenceCopy.packDetail.checklistTitle
}

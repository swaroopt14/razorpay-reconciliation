import type {
  EvidencePackFull,
  EvidencePackSummaryRow,
} from '@/services/payout-command/prod-api/evidenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'

type ProofComponentKey =
  | 'payment_instruction_available'
  | 'settlement_record_available'
  | 'match_decision_available'
  | 'governance_decision_available'
  | 'replay_check_passed'

type FlagKey =
  | 'settlement_leaf_present_flag'
  | 'attachment_decision_leaf_present_flag'

type EvidenceSignals = Partial<
  Pick<
    EvidencePackFull & EvidencePackSummaryRow,
    FlagKey | 'verification_status'
  >
> & {
  proof_components?: Partial<Record<ProofComponentKey, boolean>>
}

export type NormalizedVerificationState = 'verified' | 'failed' | 'unknown'

export function normalizeVerificationState(value: unknown): NormalizedVerificationState {
  if (typeof value === 'boolean') return value ? 'verified' : 'unknown'
  const text = apiTrimmedString(value).toUpperCase()
  if (!text) return 'unknown'
  if (text === 'VERIFIED' || text === 'PASS' || text === 'PASSED' || text === 'TRUE') return 'verified'
  if (text === 'FAILED' || text === 'CORRUPTED' || text === 'INVALID') return 'failed'
  return 'unknown'
}

/**
 * Explicit proof signals are authoritative when present.
 * Returns `undefined` when no explicit signal exists so callers can fallback to item inference.
 */
export function resolveExplicitSignal(
  source: EvidenceSignals | null | undefined,
  opts: { component?: ProofComponentKey; flag?: FlagKey },
): boolean | undefined {
  if (!source) return undefined
  if (opts.component) {
    const fromComponent = source.proof_components?.[opts.component]
    if (typeof fromComponent === 'boolean') return fromComponent
  }
  if (opts.flag) {
    const fromFlag = source[opts.flag]
    if (typeof fromFlag === 'boolean') return fromFlag
  }
  return undefined
}


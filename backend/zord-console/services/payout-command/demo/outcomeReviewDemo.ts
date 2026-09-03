import { DEMO_BATCH_LABEL, DEMO_SMOKE_BATCH_ID } from './ycDemoConstants'
import { formatDemoInr } from './demoPayoutAmounts'
import { DEMO_DISPATCH_ROWS } from './dispatchRelayDemo'
import { DEMO_SETTLEMENT_ROWS } from './settlementJournalDemo'

/** Spec 7.12 - Outcome Review demo fixtures. */

export const OUTCOME_REVIEW_HEADER = {
  title: 'Outcome Review',
  subtitle: 'Resolve where actual outcomes differ from authorised expectations.',
} as const

export type OutcomeClass =
  | 'Exact'
  | 'Within tolerance'
  | 'Short-settled'
  | 'Over-settled'
  | 'Returned'
  | 'Reversed'
  | 'Unresolved'

export type RootCauseCandidate = {
  id: string
  label:
    | 'Missing reference'
    | 'Fee deduction'
    | 'Beneficiary change'
    | 'Duplicate'
    | 'Return'
    | 'Timing mismatch'
    | 'Source mapping'
  rank: number
  likelihood: 'High' | 'Medium' | 'Low'
  evidenceNote: string
}

export type ComparisonField = {
  field: string
  label: string
  expected: string
  observed: string
  mismatch: boolean
}

export type EvidenceItem = {
  name: string
  available: boolean
  note: string
}

export type ReviewResolution =
  | 'exact_confirmed'
  | 'tolerance_approved'
  | 'signal_linked'
  | 'evidence_requested'
  | 'dispute_pack_created'
  | 'mapping_reprocessed'

export type OutcomeException = {
  id: string
  paymentRef: string
  contractId: string
  payeeLabel: string
  batchId: string
  batchLabel: string
  outcomeClass: OutcomeClass
  matchConfidence: number
  expectedAmountLabel: string
  observedAmountLabel: string
  expectedRupees: number
  observedRupees: number | null
  deltaLabel: string
  plainLanguage: string
  comparison: ComparisonField[]
  rootCauses: RootCauseCandidate[]
  evidence: EvidenceItem[]
  recommendedAction: string
  aiExplain: string
  aiRankNote: string
  aiDraftAction: string
  integrityStatus: 'Verified' | 'Partial' | 'Unverified'
  governanceStatus: 'Passed' | 'Failed' | 'Not applicable'
  valueDateStatus: 'Matched' | 'Failed' | 'Pending'
  auditTrail: { at: string; actor: string; action: string }[]
  resolved: ReviewResolution | null
  contractHref: string
  traceHref: string
  journalHref: string
}

export function formatOutcomeInr(n: number): string {
  return formatDemoInr(n)
}

function base(i: number) {
  const d = DEMO_DISPATCH_ROWS[i]!
  const s = DEMO_SETTLEMENT_ROWS[i]!
  return { d, s, expected: d.amountRupees, observed: s.observedRupees }
}

function shortException(i: number): OutcomeException {
  const { d, s, expected, observed } = base(i)
  const obs = observed ?? 0
  const delta = Math.round((expected - obs) * 100) / 100
  return {
    id: `or-${d.humanRef.toLowerCase()}`,
    paymentRef: d.humanRef,
    contractId: d.contractId,
    payeeLabel: d.payeeLabel,
    batchId: DEMO_SMOKE_BATCH_ID,
    batchLabel: DEMO_BATCH_LABEL,
    outcomeClass: 'Short-settled',
    matchConfidence: 72,
    expectedAmountLabel: formatDemoInr(expected),
    observedAmountLabel: formatDemoInr(obs),
    expectedRupees: expected,
    observedRupees: obs,
    deltaLabel: `−${formatDemoInr(delta)}`,
    plainLanguage:
      'Observed credit is short of the sealed Payment Action Contract amount. Deterministic match rules flag Short-settled — AI may explain, not decide.',
    comparison: [
      { field: 'amount', label: 'Amount', expected: formatDemoInr(expected), observed: formatDemoInr(obs), mismatch: true },
      { field: 'beneficiary', label: 'Beneficiary', expected: d.payeeLabel, observed: d.payeeLabel, mismatch: false },
      { field: 'currency', label: 'Currency', expected: 'INR', observed: 'INR', mismatch: false },
      { field: 'date', label: 'Value date', expected: '12 Jun 2026', observed: s.valueDate ?? '12 Jun 2026', mismatch: false },
      { field: 'fees', label: 'Fees', expected: 'Bearer · ₹0 on contract', observed: `${formatDemoInr(delta)} deducted (provider)`, mismatch: true },
      { field: 'provider_ref', label: 'Provider reference', expected: 'UTR expected on credit', observed: s.providerRef ?? '—', mismatch: false },
      { field: 'route', label: 'Route', expected: `${d.route.rail} · ${d.route.provider}`, observed: `${d.route.rail} · ${d.route.provider}`, mismatch: false },
    ],
    rootCauses: [
      { id: 'rc1', label: 'Fee deduction', rank: 1, likelihood: 'High', evidenceNote: `Provider fee line matches unexplained delta of ${formatDemoInr(delta)}.` },
      { id: 'rc2', label: 'Timing mismatch', rank: 2, likelihood: 'Low', evidenceNote: 'Value date matches contract; unlikely partial day cut-off.' },
      { id: 'rc3', label: 'Source mapping', rank: 3, likelihood: 'Low', evidenceNote: 'Amount field mapping confirmed against settlement file schema.' },
    ],
    evidence: [
      { name: 'Sealed Payment Action Contract', available: true, note: `${d.contractId} v1` },
      { name: 'Dispatch acknowledgement', available: true, note: 'Provider ack on sealed request hash' },
      { name: 'Settlement credit signal', available: true, note: s.providerRef ?? 'Bank file row' },
      { name: 'Fee schedule artefact', available: false, note: 'Request from provider' },
    ],
    recommendedAction: 'Approve within tolerance only if fee policy allows; otherwise create dispute pack.',
    aiExplain: `Contract expected ${formatDemoInr(expected)}. Settlement observed ${formatDemoInr(obs)}. Unexplained delta ${formatDemoInr(delta)} aligns with a provider fee line.`,
    aiRankNote: 'Ranked fee deduction highest. Ranking is assistive — match class remains Short-settled until you act.',
    aiDraftAction: `Draft: Request provider fee schedule for ${s.providerRef ?? d.humanRef} and open dispute pack if the fee was not authorised on ${d.contractId}.`,
    integrityStatus: 'Verified',
    governanceStatus: 'Passed',
    valueDateStatus: 'Matched',
    auditTrail: [
      { at: '12 Jun 2026 · 16:12', actor: 'System', action: 'MatchDecision · Short-settled (deterministic)' },
      { at: '12 Jun 2026 · 16:13', actor: 'Ask Zord', action: 'Root-cause candidates ranked (non-binding)' },
    ],
    resolved: null,
    contractHref: `${d.contractHref}?demo=sandbox`,
    traceHref: `${d.traceHref}?demo=sandbox`,
    journalHref: '/settlement/journal?demo=sandbox',
  }
}

function returnedException(i: number): OutcomeException {
  const { d, s, expected } = base(i)
  return {
    id: `or-${d.humanRef.toLowerCase()}`,
    paymentRef: d.humanRef,
    contractId: d.contractId,
    payeeLabel: d.payeeLabel,
    batchId: DEMO_SMOKE_BATCH_ID,
    batchLabel: DEMO_BATCH_LABEL,
    outcomeClass: 'Returned',
    matchConfidence: 88,
    expectedAmountLabel: formatDemoInr(expected),
    observedAmountLabel: formatDemoInr(expected),
    expectedRupees: expected,
    observedRupees: expected,
    deltaLabel: 'Return · full amount',
    plainLanguage:
      'Return received after credit attempt. Distinct from short settlement — funds did not remain with the beneficiary.',
    comparison: [
      { field: 'amount', label: 'Amount', expected: formatDemoInr(expected), observed: formatDemoInr(expected), mismatch: false },
      { field: 'beneficiary', label: 'Beneficiary', expected: d.payeeLabel, observed: 'Account closed / reject', mismatch: true },
      { field: 'currency', label: 'Currency', expected: 'INR', observed: 'INR', mismatch: false },
      { field: 'date', label: 'Value date', expected: '12 Jun 2026', observed: s.valueDate ?? '13 Jun 2026 (return)', mismatch: true },
      { field: 'provider_ref', label: 'Provider reference', expected: 'Credit UTR', observed: s.providerRef ?? '—', mismatch: false },
      { field: 'route', label: 'Route', expected: `${d.route.rail} · ${d.route.provider}`, observed: `${d.route.rail} return`, mismatch: false },
    ],
    rootCauses: [
      { id: 'rc1', label: 'Return', rank: 1, likelihood: 'High', evidenceNote: 'Provider return code R03 — account closed / unable to locate.' },
      { id: 'rc2', label: 'Beneficiary change', rank: 2, likelihood: 'Medium', evidenceNote: 'Beneficiary account may have changed after seal; verify master data.' },
    ],
    evidence: [
      { name: 'Sealed Payment Action Contract', available: true, note: `${d.contractId} v1` },
      { name: 'Return advice', available: true, note: s.providerRef ?? 'Return' },
      { name: 'Updated beneficiary confirmation', available: false, note: 'Request from source ERP' },
    ],
    recommendedAction: 'Request provider evidence, then create dispute pack or reprocess with a new sealed contract.',
    aiExplain: 'Amount matches the contract, but the rail returned the payment. Treat as Returned — not Short-settled.',
    aiRankNote: 'Return is primary. Do not amend the sealed contract in place.',
    aiDraftAction: `Draft: Ask ERP to confirm beneficiary account for ${d.payeeLabel}; do not amend ${d.contractId} in place.`,
    integrityStatus: 'Verified',
    governanceStatus: 'Passed',
    valueDateStatus: 'Failed',
    auditTrail: [{ at: '13 Jun 2026 · 09:04', actor: 'System', action: 'MatchDecision · Returned (deterministic)' }],
    resolved: null,
    contractHref: `${d.contractHref}?demo=sandbox`,
    traceHref: `${d.traceHref}?demo=sandbox`,
    journalHref: '/settlement/journal?demo=sandbox',
  }
}

function reversalException(i: number): OutcomeException {
  const { d, s, expected } = base(i)
  return {
    id: `or-${d.humanRef.toLowerCase()}`,
    paymentRef: d.humanRef,
    contractId: d.contractId,
    payeeLabel: d.payeeLabel,
    batchId: DEMO_SMOKE_BATCH_ID,
    batchLabel: DEMO_BATCH_LABEL,
    outcomeClass: 'Reversed',
    matchConfidence: 90,
    expectedAmountLabel: formatDemoInr(expected),
    observedAmountLabel: formatDemoInr(expected),
    expectedRupees: expected,
    observedRupees: expected,
    deltaLabel: 'Reversal · full amount',
    plainLanguage:
      'Reversal exposure recorded against the sealed contract after an earlier credit. Distinct from return-at-rail and short settlement.',
    comparison: [
      { field: 'amount', label: 'Amount', expected: formatDemoInr(expected), observed: formatDemoInr(expected), mismatch: false },
      { field: 'beneficiary', label: 'Beneficiary', expected: d.payeeLabel, observed: d.payeeLabel, mismatch: false },
      { field: 'date', label: 'Value date', expected: '12 Jun 2026', observed: s.valueDate ?? '14 Jun 2026 (reversal)', mismatch: true },
      { field: 'provider_ref', label: 'Provider reference', expected: 'Credit UTR', observed: s.providerRef ?? '—', mismatch: false },
    ],
    rootCauses: [
      { id: 'rc1', label: 'Return', rank: 1, likelihood: 'Medium', evidenceNote: 'Reversal after credit — investigate provider dispute reason.' },
      { id: 'rc2', label: 'Duplicate', rank: 2, likelihood: 'Low', evidenceNote: 'No second credit observed for this contract.' },
    ],
    evidence: [
      { name: 'Sealed Payment Action Contract', available: true, note: `${d.contractId} v1` },
      { name: 'Reversal advice', available: true, note: s.providerRef ?? 'Reversal' },
    ],
    recommendedAction: 'Create dispute pack; keep reversal exposure visible until closed.',
    aiExplain: 'A reversal after credit is not an exact outcome. Match class: Reversed.',
    aiRankNote: 'Treat as reversal exposure — do not collapse into Exact even if integrity hashes verify.',
    aiDraftAction: `Draft dispute pack citing ${d.contractId} and ${s.providerRef ?? 'the reversal advice'}.`,
    integrityStatus: 'Verified',
    governanceStatus: 'Passed',
    valueDateStatus: 'Failed',
    auditTrail: [{ at: '14 Jun 2026 · 11:20', actor: 'System', action: 'MatchDecision · Reversed' }],
    resolved: null,
    contractHref: `${d.contractHref}?demo=sandbox`,
    traceHref: `${d.traceHref}?demo=sandbox`,
    journalHref: '/settlement/journal?demo=sandbox',
  }
}

function missingRefException(i: number): OutcomeException {
  const { d, s, expected } = base(i)
  return {
    id: `or-${d.humanRef.toLowerCase()}`,
    paymentRef: d.humanRef,
    contractId: d.contractId,
    payeeLabel: d.payeeLabel,
    batchId: DEMO_SMOKE_BATCH_ID,
    batchLabel: DEMO_BATCH_LABEL,
    outcomeClass: 'Unresolved',
    matchConfidence: 41,
    expectedAmountLabel: formatDemoInr(expected),
    observedAmountLabel: formatDemoInr(expected),
    expectedRupees: expected,
    observedRupees: expected,
    deltaLabel: 'Missing provider reference',
    plainLanguage:
      'Settlement amount present but provider / payment reference could not be mapped to the sealed contract.',
    comparison: [
      { field: 'amount', label: 'Amount', expected: formatDemoInr(expected), observed: formatDemoInr(expected), mismatch: false },
      { field: 'beneficiary', label: 'Beneficiary', expected: d.payeeLabel, observed: d.payeeLabel, mismatch: false },
      { field: 'provider_ref', label: 'Provider reference', expected: 'Linked to contract', observed: 'Missing', mismatch: true },
    ],
    rootCauses: [
      { id: 'rc1', label: 'Missing reference', rank: 1, likelihood: 'High', evidenceNote: 'File column for provider ref empty or unmapped.' },
      { id: 'rc2', label: 'Source mapping', rank: 2, likelihood: 'Medium', evidenceNote: 'Settlement file may have dropped the UTR column.' },
    ],
    evidence: [
      { name: 'Sealed Payment Action Contract', available: true, note: `${d.contractId} v1` },
      { name: 'Settlement observation', available: true, note: 'Amount only' },
      { name: 'Provider reference', available: false, note: 'Missing' },
    ],
    recommendedAction: 'Request provider evidence or reprocess with corrected mapping.',
    aiExplain: 'Amount and beneficiary align, but without a provider reference the match stays Unresolved.',
    aiRankNote: 'Missing reference dominates. Do not Confirm exact match until linked.',
    aiDraftAction: `Draft: Request UTR for ${d.contractId} from bank collect job.`,
    integrityStatus: 'Partial',
    governanceStatus: 'Passed',
    valueDateStatus: 'Matched',
    auditTrail: [{ at: '12 Jun 2026 · 16:40', actor: 'System', action: 'MatchDecision · Unresolved (missing reference)' }],
    resolved: null,
    contractHref: `${d.contractHref}?demo=sandbox`,
    traceHref: `${d.traceHref}?demo=sandbox`,
    journalHref: '/settlement/journal?demo=sandbox',
  }
}

/** Same exception set as Settlement Journal / Payment Gaps (not waiting, not blocked). */
export const DEMO_OUTCOME_EXCEPTIONS: OutcomeException[] = DEMO_SETTLEMENT_ROWS.flatMap((s, i) => {
  if (!DEMO_DISPATCH_ROWS[i]?.sealed) return []
  if (s.outcome === 'Short') return [shortException(i)]
  if (s.outcome === 'Returned') return [returnedException(i)]
  if (s.outcome === 'Reversal') return [reversalException(i)]
  if (s.outcome === 'Missing reference') return [missingRefException(i)]
  return []
})

export function outcomeReviewStats(items: OutcomeException[]) {
  const open = items.filter((i) => !i.resolved)
  const byClass = (c: OutcomeClass) => open.filter((row) => row.outcomeClass === c).length
  const reviewValue = Math.round(
    open.reduce((s, row) => {
      if (row.outcomeClass === 'Short-settled' && row.observedRupees != null) {
        return s + (row.expectedRupees - row.observedRupees)
      }
      return s + row.expectedRupees
    }, 0) * 100,
  ) / 100
  return {
    openCount: open.length,
    shortCount: byClass('Short-settled'),
    returnedCount: byClass('Returned'),
    unresolvedCount: byClass('Unresolved'),
    reversedCount: byClass('Reversed'),
    reviewValue,
  }
}

import { DEMO_BATCH_LABEL, DEMO_SMOKE_BATCH_ID } from './ycDemoConstants'
import { DEMO_PAYEE_LABELS, DEMO_PAYOUT_AMOUNTS } from './demoPayoutAmounts'

/** Spec 7.12 - Outcome Review demo fixtures. */

export const OUTCOME_REVIEW_HEADER = {
  title: 'Outcome Review',
  subtitle: 'Resolve where actual outcomes differ from authorised expectations.',
} as const

/** Outcome classes - exact Spec 7.12 labels. */
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
  /** Deterministic 0-100 match confidence - never a “settlement certainty” score. */
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
  /** Separate trust dimensions - never collapse into one Verified. */
  integrityStatus: 'Verified' | 'Partial' | 'Unverified'
  governanceStatus: 'Passed' | 'Failed' | 'Not applicable'
  valueDateStatus: 'Matched' | 'Failed' | 'Pending'
  auditTrail: { at: string; actor: string; action: string }[]
  resolved: ReviewResolution | null
  contractHref: string
  traceHref: string
  journalHref: string
}

function formatInr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n)
}

export function formatOutcomeInr(n: number): string {
  return formatInr(n)
}

export const DEMO_OUTCOME_EXCEPTIONS: OutcomeException[] = [
  {
    id: 'or-pay-0019',
    paymentRef: 'PAY-0019',
    contractId: 'PAC-0019',
    payeeLabel: DEMO_PAYEE_LABELS[18],
    batchId: DEMO_SMOKE_BATCH_ID,
    batchLabel: DEMO_BATCH_LABEL,
    outcomeClass: 'Short-settled',
    matchConfidence: 72,
    expectedAmountLabel: formatInr(DEMO_PAYOUT_AMOUNTS[18]),
    observedAmountLabel: formatInr(Math.round(DEMO_PAYOUT_AMOUNTS[18] * 0.97)),
    expectedRupees: DEMO_PAYOUT_AMOUNTS[18],
    observedRupees: Math.round(DEMO_PAYOUT_AMOUNTS[18] * 0.97),
    deltaLabel: `−${formatInr(DEMO_PAYOUT_AMOUNTS[18] - Math.round(DEMO_PAYOUT_AMOUNTS[18] * 0.97))}`,
    plainLanguage:
      'Observed credit is short of the sealed Payment Action Contract amount. Deterministic match rules flag Short-settled - AI may explain, not decide.',
    comparison: [
      {
        field: 'amount',
        label: 'Amount',
        expected: formatInr(DEMO_PAYOUT_AMOUNTS[18]),
        observed: formatInr(Math.round(DEMO_PAYOUT_AMOUNTS[18] * 0.97)),
        mismatch: true,
      },
      {
        field: 'beneficiary',
        label: 'Beneficiary',
        expected: `${DEMO_PAYEE_LABELS[18]} · ****4521`,
        observed: `${DEMO_PAYEE_LABELS[18]} · ****4521`,
        mismatch: false,
      },
      { field: 'currency', label: 'Currency', expected: 'INR', observed: 'INR', mismatch: false },
      { field: 'date', label: 'Value date', expected: '12 Jun 2026', observed: '12 Jun 2026', mismatch: false },
      {
        field: 'fees',
        label: 'Fees',
        expected: 'Bearer · ₹0 on contract',
        observed: `${formatInr(DEMO_PAYOUT_AMOUNTS[18] - Math.round(DEMO_PAYOUT_AMOUNTS[18] * 0.97))} deducted (provider)`,
        mismatch: true,
      },
      {
        field: 'provider_ref',
        label: 'Provider reference',
        expected: 'UTR expected on credit',
        observed: 'UTR-8819000018',
        mismatch: false,
      },
      { field: 'route', label: 'Route', expected: 'NEFT · HDFC', observed: 'NEFT · HDFC', mismatch: false },
    ],
    rootCauses: [
      {
        id: 'rc1',
        label: 'Fee deduction',
        rank: 1,
        likelihood: 'High',
        evidenceNote: `Provider fee line matches unexplained delta of ${formatInr(DEMO_PAYOUT_AMOUNTS[18] - Math.round(DEMO_PAYOUT_AMOUNTS[18] * 0.97))}.`,
      },
      {
        id: 'rc2',
        label: 'Timing mismatch',
        rank: 2,
        likelihood: 'Low',
        evidenceNote: 'Value date matches contract; unlikely partial day cut-off.',
      },
      {
        id: 'rc3',
        label: 'Source mapping',
        rank: 3,
        likelihood: 'Low',
        evidenceNote: 'Amount field mapping confirmed against settlement file schema.',
      },
    ],
    evidence: [
      { name: 'Sealed Payment Action Contract', available: true, note: 'PAC-0019 v1' },
      { name: 'Dispatch acknowledgement', available: true, note: 'Provider ack 12 Jun 15:42' },
      { name: 'Settlement credit signal', available: true, note: 'Bank file row · UTR-8819000018' },
      { name: 'Fee schedule artefact', available: false, note: 'Request from provider' },
    ],
    recommendedAction: 'Approve within tolerance only if fee policy allows; otherwise create dispute pack.',
    aiExplain:
      'Contract expected ₹3,500. Settlement observed ₹3,395. Unexplained delta ₹105 aligns with a provider fee line on the credit advice.',
    aiRankNote:
      'Ranked fee deduction highest; timing and mapping lower. Ranking is assistive - match class remains Short-settled until you act.',
    aiDraftAction:
      'Draft: Request provider fee schedule for UTR-8819000018 and open dispute pack if fee was not authorised on PAC-0019.',
    integrityStatus: 'Verified',
    governanceStatus: 'Passed',
    valueDateStatus: 'Matched',
    auditTrail: [
      { at: '12 Jun 2026 · 16:12', actor: 'System', action: 'MatchDecision · Short-settled (deterministic)' },
      { at: '12 Jun 2026 · 16:13', actor: 'Ask Zord', action: 'Root-cause candidates ranked (non-binding)' },
    ],
    resolved: null,
    contractHref: '/contracts/PAC-0019?demo=sandbox',
    traceHref: '/payments/PAY-0019/trace?demo=sandbox',
    journalHref: '/settlement/journal?demo=sandbox',
  },
  {
    id: 'or-pay-0015',
    paymentRef: 'PAY-0015',
    contractId: 'PAC-0015',
    payeeLabel: DEMO_PAYEE_LABELS[14],
    batchId: DEMO_SMOKE_BATCH_ID,
    batchLabel: DEMO_BATCH_LABEL,
    outcomeClass: 'Returned',
    matchConfidence: 88,
    expectedAmountLabel: formatInr(DEMO_PAYOUT_AMOUNTS[14]),
    observedAmountLabel: formatInr(DEMO_PAYOUT_AMOUNTS[14]),
    expectedRupees: DEMO_PAYOUT_AMOUNTS[14],
    observedRupees: DEMO_PAYOUT_AMOUNTS[14],
    deltaLabel: 'Return · full amount',
    plainLanguage:
      'Return received after credit attempt. Distinct from short settlement - funds did not remain with the beneficiary.',
    comparison: [
      { field: 'amount', label: 'Amount', expected: formatInr(DEMO_PAYOUT_AMOUNTS[14]), observed: formatInr(DEMO_PAYOUT_AMOUNTS[14]), mismatch: false },
      {
        field: 'beneficiary',
        label: 'Beneficiary',
        expected: `${DEMO_PAYEE_LABELS[14]} · ****8890`,
        observed: 'Account closed / reject · ****8890',
        mismatch: true,
      },
      { field: 'currency', label: 'Currency', expected: 'INR', observed: 'INR', mismatch: false },
      { field: 'date', label: 'Value date', expected: '12 Jun 2026', observed: '13 Jun 2026 (return)', mismatch: true },
      { field: 'fees', label: 'Fees', expected: 'Bearer · ₹0', observed: 'Return fee ₹25', mismatch: true },
      {
        field: 'provider_ref',
        label: 'Provider reference',
        expected: 'Credit UTR',
        observed: 'RET-770014',
        mismatch: false,
      },
      { field: 'route', label: 'Route', expected: 'IMPS · ICICI', observed: 'IMPS return · ICICI', mismatch: false },
    ],
    rootCauses: [
      {
        id: 'rc1',
        label: 'Return',
        rank: 1,
        likelihood: 'High',
        evidenceNote: 'Provider return code R03 - account closed / unable to locate.',
      },
      {
        id: 'rc2',
        label: 'Beneficiary change',
        rank: 2,
        likelihood: 'Medium',
        evidenceNote: 'Beneficiary account may have changed after seal; verify master data.',
      },
      {
        id: 'rc3',
        label: 'Timing mismatch',
        rank: 3,
        likelihood: 'Low',
        evidenceNote: 'Return dated next day - normal for IMPS reject cycle.',
      },
    ],
    evidence: [
      { name: 'Sealed Payment Action Contract', available: true, note: 'PAC-0015 v1' },
      { name: 'Return advice', available: true, note: 'RET-770014' },
      { name: 'Beneficiary master snapshot', available: true, note: 'As-of seal' },
      { name: 'Updated beneficiary confirmation', available: false, note: 'Request from source ERP' },
    ],
    recommendedAction: 'Request provider evidence, then create dispute pack or reprocess with corrected beneficiary after new seal.',
    aiExplain:
      'Amount matches the contract, but the rail returned the payment. Treat as Returned - not Short-settled.',
    aiRankNote: 'Return is primary. Beneficiary change is a candidate for the next obligation, not a silent rewrite.',
    aiDraftAction:
      'Draft: Ask ERP to confirm beneficiary account for Meridian Supplies; do not amend PAC-0015 in place.',
    integrityStatus: 'Verified',
    governanceStatus: 'Passed',
    valueDateStatus: 'Failed',
    auditTrail: [
      { at: '13 Jun 2026 · 09:04', actor: 'System', action: 'MatchDecision · Returned (deterministic)' },
      { at: '13 Jun 2026 · 09:05', actor: 'System', action: 'Value-date failure recorded (visible alongside integrity)' },
    ],
    resolved: null,
    contractHref: '/contracts/PAC-0015?demo=sandbox',
    traceHref: '/payments/PAY-0015/trace?demo=sandbox',
    journalHref: '/settlement/journal?demo=sandbox',
  },
  {
    id: 'or-pay-0008',
    paymentRef: 'PAY-0008',
    contractId: 'PAC-0008',
    payeeLabel: DEMO_PAYEE_LABELS[7],
    batchId: DEMO_SMOKE_BATCH_ID,
    batchLabel: DEMO_BATCH_LABEL,
    outcomeClass: 'Unresolved',
    matchConfidence: 41,
    expectedAmountLabel: formatInr(DEMO_PAYOUT_AMOUNTS[7]),
    observedAmountLabel: formatInr(DEMO_PAYOUT_AMOUNTS[7]),
    expectedRupees: DEMO_PAYOUT_AMOUNTS[7],
    observedRupees: DEMO_PAYOUT_AMOUNTS[7],
    deltaLabel: 'Amount match · beneficiary mismatch',
    plainLanguage:
      'Settlement amount present, but beneficiary account differs from the sealed contract. Classified Unresolved until linked or remapped with audit.',
    comparison: [
      {
        field: 'amount',
        label: 'Amount',
        expected: formatInr(DEMO_PAYOUT_AMOUNTS[7]),
        observed: formatInr(DEMO_PAYOUT_AMOUNTS[7]),
        mismatch: false,
      },
      {
        field: 'beneficiary',
        label: 'Beneficiary',
        expected: `${DEMO_PAYEE_LABELS[7]} · ****2201`,
        observed: `${DEMO_PAYEE_LABELS[7]} Ops · ****7744`,
        mismatch: true,
      },
      { field: 'currency', label: 'Currency', expected: 'INR', observed: 'INR', mismatch: false },
      { field: 'date', label: 'Value date', expected: '12 Jun 2026', observed: '12 Jun 2026', mismatch: false },
      { field: 'fees', label: 'Fees', expected: '₹0', observed: '₹0', mismatch: false },
      {
        field: 'provider_ref',
        label: 'Provider reference',
        expected: 'Linked to PAC-0008',
        observed: 'UTR-8820000007 (unlinked)',
        mismatch: true,
      },
      { field: 'route', label: 'Route', expected: 'NEFT · Axis', observed: 'NEFT · Axis', mismatch: false },
    ],
    rootCauses: [
      {
        id: 'rc1',
        label: 'Beneficiary change',
        rank: 1,
        likelihood: 'High',
        evidenceNote: 'Account number differs from sealed beneficiary instrument.',
      },
      {
        id: 'rc2',
        label: 'Source mapping',
        rank: 2,
        likelihood: 'Medium',
        evidenceNote: 'Settlement file may have mapped wrong payee row.',
      },
      {
        id: 'rc3',
        label: 'Missing reference',
        rank: 3,
        likelihood: 'Medium',
        evidenceNote: 'Provider ref not yet linked to contract correlation id.',
      },
    ],
    evidence: [
      { name: 'Sealed Payment Action Contract', available: true, note: 'PAC-0008 v1' },
      { name: 'Settlement file row', available: true, note: 'Partial match on amount only' },
      { name: 'Manual link reason', available: false, note: 'Required before Confirm match' },
    ],
    recommendedAction: 'Link signal manually with actor + reason, or reprocess with corrected mapping.',
    aiExplain:
      'Amount alone is not enough. Beneficiary instrument diverged from the sealed contract - keep Unresolved.',
    aiRankNote: 'Beneficiary change ranked first. Manual link requires audit - AI cannot confirm match.',
    aiDraftAction: 'Draft link reason: “Confirm whether ****7744 is an authorised instrument update.”',
    integrityStatus: 'Partial',
    governanceStatus: 'Failed',
    valueDateStatus: 'Matched',
    auditTrail: [
      { at: '12 Jun 2026 · 17:01', actor: 'System', action: 'MatchDecision · Unresolved (beneficiary mismatch)' },
      { at: '12 Jun 2026 · 17:01', actor: 'System', action: 'Governance failure kept visible (integrity partial)' },
    ],
    resolved: null,
    contractHref: '/contracts/PAC-0008?demo=sandbox',
    traceHref: '/payments/PAY-0008/trace?demo=sandbox',
    journalHref: '/settlement/journal?demo=sandbox',
  },
  {
    id: 'or-pay-0013',
    paymentRef: 'PAY-0013',
    contractId: 'PAC-0013',
    payeeLabel: DEMO_PAYEE_LABELS[12],
    batchId: DEMO_SMOKE_BATCH_ID,
    batchLabel: DEMO_BATCH_LABEL,
    outcomeClass: 'Unresolved',
    matchConfidence: 41,
    expectedAmountLabel: formatInr(DEMO_PAYOUT_AMOUNTS[12]),
    observedAmountLabel: formatInr(DEMO_PAYOUT_AMOUNTS[12]),
    expectedRupees: DEMO_PAYOUT_AMOUNTS[12],
    observedRupees: DEMO_PAYOUT_AMOUNTS[12],
    deltaLabel: 'Missing provider reference',
    plainLanguage:
      'Settlement amount present but provider / payment reference could not be mapped to the sealed contract.',
    comparison: [
      {
        field: 'amount',
        label: 'Amount',
        expected: formatInr(DEMO_PAYOUT_AMOUNTS[12]),
        observed: formatInr(DEMO_PAYOUT_AMOUNTS[12]),
        mismatch: false,
      },
      {
        field: 'beneficiary',
        label: 'Beneficiary',
        expected: `${DEMO_PAYEE_LABELS[12]} · ****3310`,
        observed: `${DEMO_PAYEE_LABELS[12]} · ****3310`,
        mismatch: false,
      },
      { field: 'currency', label: 'Currency', expected: 'INR', observed: 'INR', mismatch: false },
      { field: 'date', label: 'Value date', expected: '12 Jun 2026', observed: '12 Jun 2026', mismatch: false },
      { field: 'fees', label: 'Fees', expected: '₹0', observed: '₹0', mismatch: false },
      {
        field: 'provider_ref',
        label: 'Provider reference',
        expected: 'Required',
        observed: '-',
        mismatch: true,
      },
      { field: 'route', label: 'Route', expected: 'RTGS · SBI', observed: 'RTGS · SBI', mismatch: false },
    ],
    rootCauses: [
      {
        id: 'rc1',
        label: 'Missing reference',
        rank: 1,
        likelihood: 'High',
        evidenceNote: 'No UTR / provider id on settlement row.',
      },
      {
        id: 'rc2',
        label: 'Source mapping',
        rank: 2,
        likelihood: 'Medium',
        evidenceNote: 'File column for provider ref empty or unmapped.',
      },
    ],
    evidence: [
      { name: 'Sealed Payment Action Contract', available: true, note: 'PAC-0013 v1' },
      { name: 'Settlement observation', available: true, note: 'Amount only' },
      { name: 'Provider reference', available: false, note: 'Missing' },
    ],
    recommendedAction: 'Request provider evidence or reprocess with corrected mapping.',
    aiExplain: 'Amount and beneficiary align, but without a provider reference the match stays Unresolved.',
    aiRankNote: 'Missing reference dominates. Do not Confirm exact match until linked.',
    aiDraftAction: 'Draft: Request UTR for PAC-0013 from bank collect job.',
    integrityStatus: 'Partial',
    governanceStatus: 'Passed',
    valueDateStatus: 'Matched',
    auditTrail: [
      { at: '12 Jun 2026 · 16:40', actor: 'System', action: 'MatchDecision · Unresolved (missing reference)' },
    ],
    resolved: null,
    contractHref: '/contracts/PAC-0013?demo=sandbox',
    traceHref: '/payments/PAY-0013/trace?demo=sandbox',
    journalHref: '/settlement/journal?demo=sandbox',
  },
  {
    id: 'or-pay-0017',
    paymentRef: 'PAY-0017',
    contractId: 'PAC-0017',
    payeeLabel: DEMO_PAYEE_LABELS[16],
    batchId: DEMO_SMOKE_BATCH_ID,
    batchLabel: DEMO_BATCH_LABEL,
    outcomeClass: 'Reversed',
    matchConfidence: 90,
    expectedAmountLabel: formatInr(DEMO_PAYOUT_AMOUNTS[16]),
    observedAmountLabel: formatInr(DEMO_PAYOUT_AMOUNTS[16]),
    expectedRupees: DEMO_PAYOUT_AMOUNTS[16],
    observedRupees: DEMO_PAYOUT_AMOUNTS[16],
    deltaLabel: 'Reversal · full amount',
    plainLanguage:
      'Reversal exposure recorded against the sealed contract after an earlier credit. Distinct from return-at-rail and short settlement.',
    comparison: [
      { field: 'amount', label: 'Amount', expected: formatInr(DEMO_PAYOUT_AMOUNTS[16]), observed: formatInr(DEMO_PAYOUT_AMOUNTS[16]), mismatch: false },
      {
        field: 'beneficiary',
        label: 'Beneficiary',
        expected: 'Helios Components · ****1188',
        observed: 'Helios Components · ****1188',
        mismatch: false,
      },
      { field: 'currency', label: 'Currency', expected: 'INR', observed: 'INR', mismatch: false },
      { field: 'date', label: 'Value date', expected: '11 Jun 2026', observed: '14 Jun 2026 (reversal)', mismatch: true },
      { field: 'fees', label: 'Fees', expected: '₹0', observed: '₹0', mismatch: false },
      {
        field: 'provider_ref',
        label: 'Provider reference',
        expected: 'Credit UTR',
        observed: 'REV-660016',
        mismatch: false,
      },
      { field: 'route', label: 'Route', expected: 'NEFT · HDFC', observed: 'NEFT reversal · HDFC', mismatch: false },
    ],
    rootCauses: [
      {
        id: 'rc1',
        label: 'Return',
        rank: 1,
        likelihood: 'Medium',
        evidenceNote: 'Reversal after credit - investigate provider dispute reason.',
      },
      {
        id: 'rc2',
        label: 'Duplicate',
        rank: 2,
        likelihood: 'Low',
        evidenceNote: 'No second credit observed for this contract.',
      },
    ],
    evidence: [
      { name: 'Sealed Payment Action Contract', available: true, note: 'PAC-0017 v1' },
      { name: 'Reversal advice', available: true, note: 'REV-660016' },
      { name: 'Original credit signal', available: true, note: 'Present in journal' },
    ],
    recommendedAction: 'Create dispute pack; keep reversal exposure visible until closed.',
    aiExplain: 'A reversal after credit is not an exact outcome. Match class: Reversed.',
    aiRankNote: 'Treat as reversal exposure - do not collapse into Exact even if integrity hashes verify.',
    aiDraftAction: 'Draft dispute pack citing PAC-0017, credit UTR, and REV-660016.',
    integrityStatus: 'Verified',
    governanceStatus: 'Passed',
    valueDateStatus: 'Failed',
    auditTrail: [
      { at: '14 Jun 2026 · 11:20', actor: 'System', action: 'MatchDecision · Reversed' },
      { at: '14 Jun 2026 · 11:20', actor: 'System', action: 'Value-date failure visible with verified integrity' },
    ],
    resolved: null,
    contractHref: '/contracts/PAC-0017?demo=sandbox',
    traceHref: '/payments/PAY-0017/trace?demo=sandbox',
    journalHref: '/settlement/journal?demo=sandbox',
  },
]

export function outcomeReviewStats(items: OutcomeException[]) {
  const open = items.filter((i) => !i.resolved)
  const byClass = (c: OutcomeClass) => open.filter((i) => i.outcomeClass === c).length
  const reviewValue = open.reduce((s, i) => {
    if (i.outcomeClass === 'Short-settled' && i.observedRupees != null) {
      return s + (i.expectedRupees - i.observedRupees)
    }
    return s + i.expectedRupees
  }, 0)
  return {
    openCount: open.length,
    shortCount: byClass('Short-settled'),
    returnedCount: byClass('Returned'),
    unresolvedCount: byClass('Unresolved'),
    reversedCount: byClass('Reversed'),
    reviewValue,
  }
}

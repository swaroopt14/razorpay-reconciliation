import { DEMO_SMOKE_BATCH_ID, demoBatchHref } from './ycDemoConstants'
import { DEMO_PAYEE_LABELS, DEMO_PAYOUT_AMOUNTS } from './demoPayoutAmounts'

/** Spec 7.7 - Control Review Queue demo fixtures. */

export const CONTROL_REVIEW_HEADER = {
  title: 'Control Review',
  subtitle: 'Resolve issues before a payout is allowed to move.',
} as const

export type ReviewIssueType =
  | 'beneficiary_changed'
  | 'duplicate_replay'
  | 'missing_approval'
  | 'quote_expired'
  | 'amount_outside_tolerance'
  | 'unsupported_source'

export type ReviewSeverity = 'blocked' | 'warned' | 'incomplete'

export type FieldDiff = {
  field: string
  label: string
  authorised: string
  current: string
  material: boolean
}

export type AmendmentLineageEntry = {
  version: string
  at: string
  note: string
  actor: string
}

export type ReviewItem = {
  id: string
  humanRef: string
  type: ReviewIssueType
  typeLabel: string
  severity: ReviewSeverity
  instructionRef: string
  batchId: string
  amountRupees: number
  currency: string
  payeeLabel: string
  policyVersion: string
  policyRuleId: string
  policyRuleName: string
  actor: string
  authority: string
  evidenceAvailable: string[]
  plainLanguageReason: string
  fieldDiffs: FieldDiff[]
  amendmentLineage: AmendmentLineageEntry[]
  aiHelp: {
    explain: string
    investigate: string
    draftCorrection: string
  }
  sourceArtifactHref: string
  policyRuleHref: string
  /** Demo resolution state after user action (local only). */
  resolved?: 'correction_requested' | 'amendment_created' | 'exception_approved' | 'rejected'
}

export const REVIEW_ISSUE_TYPE_LABELS: Record<ReviewIssueType, string> = {
  beneficiary_changed: 'Beneficiary changed',
  duplicate_replay: 'Duplicate / replay',
  missing_approval: 'Missing approval',
  quote_expired: 'Quote expired',
  amount_outside_tolerance: 'Amount outside tolerance',
  unsupported_source: 'Unsupported source',
}

export function formatReviewInr(rupees: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(rupees)
}

/** Demo queue - amounts on the ₹55k batch spine (not lakhs). Beneficiary-change first. */
export const DEMO_CONTROL_REVIEW_ITEMS: ReviewItem[] = [
  {
    id: 'ri-ben-change-01',
    humanRef: 'PAY-0020',
    type: 'beneficiary_changed',
    typeLabel: REVIEW_ISSUE_TYPE_LABELS.beneficiary_changed,
    severity: 'blocked',
    instructionRef: 'INT-0020',
    batchId: DEMO_SMOKE_BATCH_ID,
    amountRupees: DEMO_PAYOUT_AMOUNTS[19]!,
    currency: 'INR',
    payeeLabel: `Vendor · ${DEMO_PAYEE_LABELS[19]}`,
    policyVersion: 'Enterprise default · v3 (active)',
    policyRuleId: 'rule-ben-freeze',
    policyRuleName: 'Beneficiary change freeze',
    actor: 'erp.sync@acme.example',
    authority: 'Treasury maker · dual-control required for exceptions',
    evidenceAvailable: [
      'Authorised ERP extract (row hash)',
      'Current instruction payload',
      'Policy decision record',
      'Actor audit trail',
    ],
    plainLanguageReason:
      'The authorised source lists account …4821. The current instruction proposes …7790 for the same payee and amount. Policy blocked seal until review - money must not move on a changed beneficiary.',
    fieldDiffs: [
      {
        field: 'beneficiary.account',
        label: 'Account number',
        authorised: '•••• 4821',
        current: '•••• 7790',
        material: true,
      },
      {
        field: 'beneficiary.ifsc',
        label: 'IFSC',
        authorised: 'HDFC0001234',
        current: 'ICIC0004455',
        material: true,
      },
      {
        field: 'beneficiary.name',
        label: 'Beneficiary name',
        authorised: DEMO_PAYEE_LABELS[19]!,
        current: DEMO_PAYEE_LABELS[19]!,
        material: false,
      },
      {
        field: 'amount',
        label: 'Amount',
        authorised: formatReviewInr(DEMO_PAYOUT_AMOUNTS[19]!),
        current: formatReviewInr(DEMO_PAYOUT_AMOUNTS[19]!),
        material: false,
      },
    ],
    amendmentLineage: [
      {
        version: 'Obligation v1',
        at: '12 Jun 2026 · 09:14 IST',
        note: 'Authorised from SAP vendor master',
        actor: 'erp.sync@acme.example',
      },
      {
        version: 'Instruction draft v2',
        at: '12 Jun 2026 · 10:02 IST',
        note: 'Beneficiary account/IFSC changed in file re-upload - blocked',
        actor: 'ops.upload@acme.example',
      },
    ],
    aiHelp: {
      explain:
        'Authorised source vs current instruction disagree on account and IFSC. Policy treats this as a material beneficiary change - not a soft warning.',
      investigate:
        'Confirm whether the ERP extract was superseded, or whether the file row was edited after approval. Open the source artifact and compare row hashes.',
      draftCorrection: `Please restore beneficiary account …4821 / IFSC HDFC0001234 for PAY-0020 (${formatReviewInr(DEMO_PAYOUT_AMOUNTS[19]!)}), or submit a new authorised obligation if the payee bank details truly changed.`,
    },
    sourceArtifactHref: `${demoBatchHref('grid', { extra: 'filter=blocked' })}`,
    policyRuleHref: '/controls/policies',
  },
  {
    id: 'ri-dup-01',
    humanRef: 'PAY-0018',
    type: 'duplicate_replay',
    typeLabel: REVIEW_ISSUE_TYPE_LABELS.duplicate_replay,
    severity: 'blocked',
    instructionRef: 'INT-0018',
    batchId: DEMO_SMOKE_BATCH_ID,
    amountRupees: DEMO_PAYOUT_AMOUNTS[17]!,
    currency: 'INR',
    payeeLabel: `Vendor · ${DEMO_PAYEE_LABELS[17]}`,
    policyVersion: 'Enterprise default · v3 (active)',
    policyRuleId: 'rule-idempotency',
    policyRuleName: 'Duplicate / replay guard',
    actor: 'api.ingest@acme.example',
    authority: 'API key · payout.write',
    evidenceAvailable: ['Prior sealed contract PAC-0018-v1', 'Idempotency key match', 'Policy decision'],
    plainLanguageReason:
      'Same external reference and amount already sealed earlier today. Policy blocks a second dispatch until an operator confirms this is not a replay.',
    fieldDiffs: [
      {
        field: 'external_ref',
        label: 'External reference',
        authorised: 'INV-88421',
        current: 'INV-88421',
        material: true,
      },
      {
        field: 'amount',
        label: 'Amount',
        authorised: formatReviewInr(DEMO_PAYOUT_AMOUNTS[17]!),
        current: formatReviewInr(DEMO_PAYOUT_AMOUNTS[17]!),
        material: false,
      },
    ],
    amendmentLineage: [
      {
        version: 'PAC-0018-v1',
        at: '12 Jun 2026 · 08:40 IST',
        note: 'Sealed and queued for dispatch',
        actor: 'treasury@acme.example',
      },
    ],
    aiHelp: {
      explain: 'Replay risk: identical external reference already has a sealed Payment Action Contract.',
      investigate: 'Check whether the upstream system retried after a timeout.',
      draftCorrection: 'Cancel this draft if INV-88421 already paid; otherwise attach a new unique external reference.',
    },
    sourceArtifactHref: demoBatchHref('grid'),
    policyRuleHref: '/controls/policies',
  },
  {
    id: 'ri-approval-01',
    humanRef: 'PAY-0003',
    type: 'missing_approval',
    typeLabel: REVIEW_ISSUE_TYPE_LABELS.missing_approval,
    severity: 'incomplete',
    instructionRef: 'INT-0003',
    batchId: DEMO_SMOKE_BATCH_ID,
    amountRupees: DEMO_PAYOUT_AMOUNTS[2]!,
    currency: 'INR',
    payeeLabel: `Vendor · ${DEMO_PAYEE_LABELS[2]}`,
    policyVersion: 'Enterprise default · v3 (active)',
    policyRuleId: 'rule-dual-control',
    policyRuleName: 'Dual-control above ₹5,000',
    actor: 'maker@acme.example',
    authority: 'Treasury maker - checker approval required',
    evidenceAvailable: ['Maker submission', 'Pending approval slot'],
    plainLanguageReason:
      'Amount is above the dual-control threshold. A second authorised approver has not signed yet - seal is held.',
    fieldDiffs: [
      {
        field: 'approvals.checker',
        label: 'Checker approval',
        authorised: 'Required',
        current: 'Missing',
        material: true,
      },
      {
        field: 'amount',
        label: 'Amount',
        authorised: formatReviewInr(DEMO_PAYOUT_AMOUNTS[2]!),
        current: formatReviewInr(DEMO_PAYOUT_AMOUNTS[2]!),
        material: false,
      },
    ],
    amendmentLineage: [
      {
        version: 'Obligation v1',
        at: '12 Jun 2026 · 11:05 IST',
        note: 'Submitted by maker',
        actor: 'maker@acme.example',
      },
    ],
    aiHelp: {
      explain: 'Policy requires checker approval before seal for amounts above ₹5,000.',
      investigate: 'Confirm the assigned checker and whether an approval request was delivered.',
      draftCorrection: `Please approve PAY-0003 (${formatReviewInr(DEMO_PAYOUT_AMOUNTS[2]!)}) as checker, or return to maker with a reason.`,
    },
    sourceArtifactHref: demoBatchHref('grid'),
    policyRuleHref: '/controls/policies',
  },
  {
    id: 'ri-quote-01',
    humanRef: 'PAY-FX-03',
    type: 'quote_expired',
    typeLabel: REVIEW_ISSUE_TYPE_LABELS.quote_expired,
    severity: 'warned',
    instructionRef: 'INT-FX-03',
    batchId: DEMO_SMOKE_BATCH_ID,
    amountRupees: 12_400,
    currency: 'INR',
    payeeLabel: 'Cross-border · Meridian GmbH',
    policyVersion: 'Cross-border pack · v2 (active)',
    policyRuleId: 'rule-quote-ttl',
    policyRuleName: 'FX quote TTL',
    actor: 'fx.desk@acme.example',
    authority: 'FX desk · quote must be current at seal',
    evidenceAvailable: ['External FX quote (expired)', 'Contract draft terms'],
    plainLanguageReason:
      'The sealed quote window ended at 10:30 IST. Seal/dispatch is held until a fresh quote is attached - Zord does not provide FX.',
    fieldDiffs: [
      {
        field: 'fx.quote_id',
        label: 'Quote ID',
        authorised: 'Q-8891 (valid to 10:30)',
        current: 'Q-8891 (expired)',
        material: true,
      },
      {
        field: 'fx.rate',
        label: 'Rate',
        authorised: '1 EUR = 89.42 INR',
        current: '1 EUR = 89.42 INR (stale)',
        material: true,
      },
    ],
    amendmentLineage: [
      {
        version: 'Draft + quote Q-8891',
        at: '12 Jun 2026 · 09:55 IST',
        note: 'Quote attached from bank portal',
        actor: 'fx.desk@acme.example',
      },
    ],
    aiHelp: {
      explain: 'Quote TTL elapsed. A material FX term change requires a new draft and fresh policy decision.',
      investigate: 'Pull a current bank quote and re-attach before seal.',
      draftCorrection: 'Attach a live quote for PAY-FX-03 and re-run policy before sealing.',
    },
    sourceArtifactHref: demoBatchHref('grid'),
    policyRuleHref: '/controls/policies',
  },
  {
    id: 'ri-amt-01',
    humanRef: 'PAY-0010',
    type: 'amount_outside_tolerance',
    typeLabel: REVIEW_ISSUE_TYPE_LABELS.amount_outside_tolerance,
    severity: 'warned',
    instructionRef: 'INT-0010',
    batchId: DEMO_SMOKE_BATCH_ID,
    amountRupees: 5_250,
    currency: 'INR',
    payeeLabel: `Vendor · ${DEMO_PAYEE_LABELS[9]}`,
    policyVersion: 'Enterprise default · v3 (active)',
    policyRuleId: 'rule-amount-tol',
    policyRuleName: 'Amount tolerance (±0.5%)',
    actor: 'erp.sync@acme.example',
    authority: 'Finance controller for tolerance exceptions',
    evidenceAvailable: ['Authorised invoice total', 'Current instruction amount'],
    plainLanguageReason:
      'Current instruction is ₹5,250 vs authorised ₹5,000 - outside the ±0.5% tolerance. Needs an amendment or rejection.',
    fieldDiffs: [
      {
        field: 'amount',
        label: 'Amount',
        authorised: '₹5,000',
        current: '₹5,250',
        material: true,
      },
    ],
    amendmentLineage: [
      {
        version: 'Obligation v1',
        at: '12 Jun 2026 · 07:50 IST',
        note: 'Invoice INV-2290 authorised at ₹5,000',
        actor: 'erp.sync@acme.example',
      },
    ],
    aiHelp: {
      explain: 'Amount delta is material versus the authorised obligation.',
      investigate: 'Check for a revised invoice or an upload mapping error.',
      draftCorrection: 'Either amend the obligation to ₹5,250 with fresh approval, or restore ₹5,000.',
    },
    sourceArtifactHref: demoBatchHref('grid'),
    policyRuleHref: '/controls/policies',
  },
  {
    id: 'ri-src-01',
    humanRef: 'PAY-0006',
    type: 'unsupported_source',
    typeLabel: REVIEW_ISSUE_TYPE_LABELS.unsupported_source,
    severity: 'incomplete',
    instructionRef: 'INT-0006',
    batchId: DEMO_SMOKE_BATCH_ID,
    amountRupees: DEMO_PAYOUT_AMOUNTS[5]!,
    currency: 'INR',
    payeeLabel: `Vendor · ${DEMO_PAYEE_LABELS[5]}`,
    policyVersion: 'Enterprise default · v3 (active)',
    policyRuleId: 'rule-source-allowlist',
    policyRuleName: 'Approved source systems',
    actor: 'csv.upload@acme.example',
    authority: 'Source must be an approved connection',
    evidenceAvailable: ['Upload metadata', 'Connection registry'],
    plainLanguageReason:
      'File was uploaded outside an approved connection profile. Map the source or reject until Connections lists this feeder as Connected.',
    fieldDiffs: [
      {
        field: 'source.system',
        label: 'Source system',
        authorised: 'SAP S/4HANA (connected)',
        current: 'Ad-hoc CSV (unregistered)',
        material: true,
      },
    ],
    amendmentLineage: [
      {
        version: 'Upload draft',
        at: '12 Jun 2026 · 12:18 IST',
        note: 'Manual CSV without connection binding',
        actor: 'csv.upload@acme.example',
      },
    ],
    aiHelp: {
      explain: 'Policy only accepts obligations from allow-listed connections.',
      investigate: 'Open Connections and bind this feeder, or re-ingest from SAP.',
      draftCorrection: 'Re-upload PAY-0006 via the SAP connection, or register this CSV feeder first.',
    },
    sourceArtifactHref: '/connections',
    policyRuleHref: '/controls/policies',
  },
]

export function controlReviewQueueStats(items: ReviewItem[]) {
  const open = items.filter((i) => !i.resolved)
  const blockedValue = open
    .filter((i) => i.severity === 'blocked')
    .reduce((s, i) => s + i.amountRupees, 0)
  return {
    openCount: open.length,
    blockedCount: open.filter((i) => i.severity === 'blocked').length,
    warnedCount: open.filter((i) => i.severity === 'warned').length,
    incompleteCount: open.filter((i) => i.severity === 'incomplete').length,
    blockedValue,
  }
}

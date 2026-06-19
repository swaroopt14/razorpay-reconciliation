/** Customer-facing copy for Evidence & Dispute Resolution. */

export const PROOF_STATUS = {
  proofReady: 'Proof Ready',
  partialProof: 'Partial Proof',
  missingIntent: 'Missing Intent',
  missingSettlement: 'Missing Settlement',
  missingMatchDecision: 'Missing Match Decision',
  missingGovernanceCheck: 'Missing Governance Check',
  missingReplayCheck: 'Missing Replay Check',
  needsReview: 'Needs Review',
  verified: 'Verified',
  exported: 'Exported',
  revoked: 'Revoked / Superseded',
} as const

export type ProofStatusKey = keyof typeof PROOF_STATUS

export const PROOF_NODE_BUSINESS_LABELS: Record<string, string> = {
  RAW_INGRESS_ENVELOPE: 'Original Payment File',
  CANONICAL_INTENT: 'Structured Payment Intent',
  GOVERNANCE_DECISION_AT_CANONICAL: 'Governance / Policy Check',
  RAW_SETTLEMENT_ENVELOPE: 'Original Settlement File',
  CANONICAL_SETTLEMENT_OBSERVATION: 'Structured Settlement Record',
  ATTACHMENT_DECISION: 'Match Decision',
  FINAL_CONTRACT: 'Final Payment Outcome',
  FINAL_EVIDENCE_VIEW: 'Evidence Summary',
  VARIANCE_DECISION: 'Variance Decision',
  DISPATCH_ATTEMPT: 'Dispatch Attempt',
  PROVIDER_ACK: 'Provider Acknowledgement',
  OUTCOME_SIGNAL: 'Outcome Signal',
  FUSED_OUTCOME: 'Fused Outcome',
  FINALITY_CERT: 'Finality Certificate',
  PREPARED_PAYOUT_CONTRACT: 'Prepared Payout Contract',
  ZORD_SIGNATURE_CARRIER: 'Signature Carrier',
}

export const PROOF_SCORE_TOOLTIP =
  'A higher score means this payment has more complete evidence for review, audit, or dispute resolution.'

export const evidenceCopy = {
  pageTitle: 'Evidence & Dispute Resolution',
  pageSubtitle:
    'Build, verify, and export proof for payments, settlements, disputes, and audit review — one structured Evidence Pack instead of screenshots and PSP log chases.',
  mainDescription:
    'Zord links the original payment instruction, settlement record, match decision, and final outcome into one Evidence Pack. Use this page to see what is proof-ready, what is incomplete, and what can be exported.',
  salesLine:
    'Zord replaces screenshots, manual follow-ups, and scattered logs with one structured Evidence Pack.',
  trustNote:
    'Sensitive payment data is masked or tokenized in evidence views. Full raw records are controlled by access permissions and audit logs.',
  dataUsed: 'Payment instructions, settlement records, match decisions, and evidence packs',
  proofTierLabel: 'Proof tier',
  proofReadinessHelper:
    'Overall proof strength based on evidence coverage, governance checks, replay readiness, and missing proof items.',
  defensibilityScaleNote:
    'Defensibility score is calibrated on a 65-point model in this mode (amount processing excluded).',
  scoreLowExplanation:
    'Score is low because evidence packs exist, but governance and replay checks are not complete.',
  valueReviewHelper:
    'Payment value affected by unmatched records, missing references, ambiguity, or settlement gaps.',
  kpi: {
    proofReadinessScore: 'Evidence Completeness Index',
    evidencePacksGenerated: 'Evidence Packs Generated',
    valueNeedingReview: 'Value Needing Evidence Review',
    missingProofItems: 'Missing Proof Items',
    governanceChecks: 'Governance Checks',
    disputePacksReady: 'Dispute Packs Ready',
    exportReadiness: 'Evidence Export Readiness',
  },
  breakdown: {
    title: 'Proof Breakdown',
    subtitle:
      'This shows which parts of the payment proof are complete and which parts still need data or review.',
    compositionTitle: 'Proof Composition',
    inScope: 'Payment records in scope',
    packsGenerated: 'Evidence packs generated',
    governanceCompleted: 'Governance checks completed',
    replayPassed: 'Replay checks passed',
    missingItems: 'Missing proof items',
    replayNotEnabled: 'Replay checks not enabled for this batch.',
  },
  coverage: {
    title: 'Proof Coverage',
    paymentInstruction: 'Original payment instruction',
    settlementRecord: 'Bank or settlement signal',
    matchDecision: 'Matching decision',
    governanceCheck: 'Governance decision',
    evidencePack: 'Evidence pack',
    available: 'Available',
    missing: 'Missing',
    generated: 'Generated',
    notGenerated: 'Not generated',
    batchEstimate: 'Batch estimate',
  },
  browser: {
    title: 'Evidence Pack Browser',
    subtitle:
      'Batch proof root for the selected payout batch. Open the batch hub to browse payment proofs and graphs.',
    searchPlaceholder: 'Filter batch proof by pack id or proof root…',
    batchLabel: 'Batch',
    batchProofCount: 'batch proof',
    intentProofCount: 'payment proofs',
    viewBatchProof: 'View batch proof',
  },
  hub: {
    batchSubtitle:
      'See how this batch proof root commits evidence for all payments in the batch.',
    intentSidebarTitle: 'Payment proofs',
    intentSidebarSearch: 'Search payment ref or intent…',
    intentSidebarEmpty: 'No payment proofs in this batch',
    intentHeroTitle: 'Proof lineage graph',
    intentSelectPayment: 'Select a payment proof from the list',
    batchGraph: 'Batch graph',
    intentProofs: 'Intent proofs',
  },
  graph: {
    title: 'Evidence Pack Lineage',
    subtitle:
      'See how this payment proof was built from the original instruction, settlement signal, matching decision, and final evidence root.',
    batchSubtitle:
      'See how this batch proof root was built from aggregated payment evidence across the batch.',
    timelineTitle: 'Operational proof timeline',
    timelineEmpty: 'No timeline events returned for this pack.',
    verifyTitle: 'Cryptographic verification',
    verifyBusy: 'Verifying Merkle root…',
    verified: 'Verified',
    corrupted: 'Corrupted',
    loadingGraph: 'Loading proof graph…',
    packNotFound: 'This proof graph is not available yet. Try again or open another payment from the list.',
    batchEmpty: 'No evidence packs for this batch yet. Select a batch with ingested payments.',
  },
  dispute: {
    title: 'Create Dispute / Evidence Case',
    apiBanner: 'Dispute case tracking API not connected — exports use loaded evidence pack data.',
    paymentRef: 'Payment reference / invoice / UTR',
    reason: 'Dispute reason',
    selectPack: 'Select evidence pack',
    generate: 'Generate Dispute Evidence',
    reasons: [
      'Beneficiary says not received',
      'Amount mismatch',
      'Duplicate payment',
      'Settlement not found',
      'Bank reference missing',
      'Reversal / refund issue',
      'Audit request',
    ] as const,
  },
  export: {
    centerTitle: 'Export Center',
    centerSubtitle: 'Generate evidence exports for finance, audit, bank, and dispute review.',
    apiPending: 'Export request failed — verify dispute export service and payload mapping.',
    financePdf: 'Finance Summary (.pdf)',
    auditPdf: 'Audit Evidence Pack (.pdf)',
    bankPack: 'Bank / PSP Dispute Pack (.xlsx)',
    disputePack: 'Customer Dispute Pack (.pdf)',
    rawJson: 'Technical Payload (.json)',
  },
  verify: {
    button: 'Verify Proof Integrity',
    verified:
      'Proof verified. No evidence item has changed since this pack was generated.',
    failed:
      'Proof verification failed. One or more evidence items do not match the original proof root.',
    partial: 'Proof root present; full cryptographic verification requires Service 6 verify API.',
  },
  empty: {
    noPack: 'No evidence pack available yet.',
    noPackHint: 'Generate evidence after payment instructions and settlement records are linked.',
    incomplete: 'This evidence pack is incomplete.',
    incompleteHint: 'Complete the missing items below to make it proof-ready.',
  },
  packDetail: {
    tabs: {
      summary: 'Summary',
      timeline: 'Timeline',
      items: 'Evidence Items',
      graph: 'Graph',
      export: 'Export',
    },
    checklistTitle: 'To complete this proof:',
  },
  nodeDrawer: {
    proofItem: 'Proof item',
    status: 'Status',
    source: 'Source',
    hash: 'Hash',
    createdAt: 'Created at',
    usedInPack: 'Used in evidence pack',
    risk: 'Risk',
    missingHint:
      'This proof item is missing. Upload settlement file or complete governance check to finish the evidence pack.',
    technicalName: 'Technical name',
  },
} as const

export type DisputeReason = (typeof evidenceCopy.dispute.reasons)[number]

export function mapProofTierLabel(tier: string | undefined): string {
  const t = (tier || '').toUpperCase()
  if (t === 'STRONG') return 'Certified'
  if (t === 'FRAGILE') return 'Needs Review'
  if (t === 'EXCELLENT' || t === 'SEALED') return 'Certified'
  if (t === 'GOOD') return 'Proof Ready'
  if (t === 'FAIR') return 'Partial'
  if (t === 'POOR') return 'Needs Review'
  if (t === 'DRAFT') return 'Draft'
  return 'Partial'
}

export function humanizePackMode(mode: string): string {
  const m = (mode || '').toUpperCase()
  if (m.includes('INTELLIGENCE')) return 'Evidence Generated'
  if (m.includes('ATTACH')) return 'Evidence Generated'
  if (m.includes('DISPATCH')) return 'Dispatch Evidence'
  if (m.includes('FULL')) return 'Full Control'
  return mode || 'Evidence Generated'
}

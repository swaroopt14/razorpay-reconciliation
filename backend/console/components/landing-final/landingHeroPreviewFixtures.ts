/** Mock fixtures for landing hero payout-command preview - illustrative only. */

import type { PortfolioLeakageViewModel } from '@/features/payout-command/leakage-portfolio/normalizeLeakagePayload'
import type { EvidenceKpiCard } from '@/features/payout-command/evidence/types/evidenceViewModels'
import type { NextActionItem } from '@/features/payout-command/command-center/NextActionsPanel'
import type { PaymentHealthCardsProps } from '@/features/payout-command/command-center/PaymentHealthCards'
import type {
  AmbiguityKpiResolved,
  IntelligenceBatchRow,
  LeakageKpiResolved,
} from '@/services/payout-command/prod-api/intelligenceTypes'

export const PREVIEW_BATCHES: IntelligenceBatchRow[] = [
  {
    batch_id: 'BATCH-1042',
    tenant_id: 'preview',
    source_reference: 'Loan System',
    finality_status: 'REQUIRES_REVIEW',
    total_count: 420,
    success_count: 368,
    failed_count: 12,
    pending_count: 40,
    match_confidence: 91.4,
    unresolved_intended_amount_minor: 18_200_000,
    unmatched_amount_minor: 12_400_000,
    total_intended_amount_minor: 34_200_000,
    predicted_leakage_rate: 6.8,
  },
  {
    batch_id: 'BATCH-1048',
    tenant_id: 'preview',
    source_reference: 'Partner feed',
    finality_status: 'PARTIALLY_SETTLED',
    total_count: 280,
    success_count: 241,
    failed_count: 8,
    pending_count: 31,
    match_confidence: 87.2,
    unresolved_intended_amount_minor: 9_800_000,
    unmatched_amount_minor: 7_100_000,
    total_intended_amount_minor: 18_100_000,
    predicted_leakage_rate: 9.1,
  },
  {
    batch_id: 'BATCH-1051',
    tenant_id: 'preview',
    source_reference: 'NACH',
    finality_status: 'PENDING',
    total_count: 160,
    success_count: 98,
    failed_count: 6,
    pending_count: 56,
    match_confidence: 78.6,
    unresolved_intended_amount_minor: 6_400_000,
    unmatched_amount_minor: 4_800_000,
    total_intended_amount_minor: 9_800_000,
    predicted_leakage_rate: 11.4,
  },
]

export const PREVIEW_LEAKAGE_VM: PortfolioLeakageViewModel = {
  totalSettledMinor: 241_000_000,
  intendedMinor: 345_000_000,
  underSettlementMinor: 42_000_000,
  unmatchedMinor: 182_000_000,
  orphanMinor: 18_000_000,
  reversalMinor: 9_500_000,
  ambiguousRiskMinor: 28_000_000,
  riskAdjustedMinor: 214_000_000,
  openFinancialExceptionValueMinor: 214_000_000,
  exposureAmountMinor: 182_000_000,
  valueNeedingReviewMinor: 182_000_000,
  paymentGapRate: 12.4,
  leakageFraction: 12.4,
  riskTier: 'MEDIUM',
  tenantId: 'preview',
  snapshotId: 'snap-preview',
  computedAt: '2026-07-13T10:00:00Z',
  windowStart: '2026-07-01',
  windowEnd: '2026-07-13',
}

export const PREVIEW_LEAKAGE_KPI: LeakageKpiResolved = {
  data_available: true,
  tenant_id: 'preview',
  snapshot_id: 'snap-preview',
  computed_at: '2026-07-13T10:00:00Z',
  total_intended_amount_minor: 345_000_000,
  unmatched_amount_minor: 182_000_000,
  under_settlement_amount_minor: 42_000_000,
  orphan_amount_minor: 18_000_000,
  reversal_exposure_minor: 9_500_000,
  risk_adjusted_leakage_minor: 214_000_000,
  total_observed_settled_amount_minor: 241_000_000,
  leakage_percentage: 12.4,
  risk_tier: 'MEDIUM',
  ambiguous_value_at_risk_minor: 28_000_000,
  exposure_bands: [
    { band: 'Settled', amount_minor: 241_000_000, share_pct: 70 },
    { band: 'Ambiguous', amount_minor: 28_000_000, share_pct: 8 },
    { band: 'Variance', amount_minor: 42_000_000, share_pct: 12 },
    { band: 'Missing ref', amount_minor: 18_000_000, share_pct: 5 },
    { band: 'Unresolved', amount_minor: 16_000_000, share_pct: 5 },
  ],
}

export const PREVIEW_AMBIGUITY_KPI: AmbiguityKpiResolved = {
  data_available: true,
  tenant_id: 'preview',
  snapshot_id: 'snap-preview',
  computed_at: '2026-07-13T10:00:00Z',
  ambiguous_intent_count: 86,
  ambiguity_rate: 6.9,
  avg_attachment_confidence: 0.942,
  avg_score_margin: 0.18,
  provider_ref_missing_rate: 4.2,
  value_at_risk_minor: '28000000',
  risk_tier: 'MEDIUM',
  ambiguous_intent_count_delta_pct: 4.1,
  ambiguity_rate_delta_pct: -1.2,
  provider_ref_missing_rate_delta_pct: 0.8,
  value_at_risk_delta_pct: 3.4,
  signal_clarity_bands: [
    { band: 'Settled', amount_minor: 241_000_000, tone: 'green', share_pct: 70 },
    { band: 'Ambiguous', amount_minor: 28_000_000, tone: 'lime', share_pct: 8 },
    { band: 'Variance', amount_minor: 42_000_000, tone: 'amber', share_pct: 12 },
    { band: 'Missing ref', amount_minor: 18_000_000, tone: 'orange', share_pct: 5 },
    { band: 'Unresolved', amount_minor: 16_000_000, tone: 'red', share_pct: 5 },
  ],
  signal_clarity_subtitle: 'Payment signal clarity across intended vs settlement outcomes.',
}

export const PREVIEW_HEALTH_CARDS: PaymentHealthCardsProps = {
  fullyMatchedValue: '₹2.41 Cr',
  fullyMatchedSub: 'Settlement value confirmed by bank or provider',
  fullyMatchedFooter:
    'Includes partial matches and linked outcomes. This is not the same as total intended payment value for the batch.',
  awaitingConfirmation: false,
  reviewValue: '₹18.2 L',
  reviewSub: 'Payments without a confirmed settlement outcome',
  reviewFooter:
    'Covers payments with no confirmed settlement link. Short-settled, over-settled, unlinked, and reversal amounts are broken out below.',
  shortSettledDisplay: '₹4.2 L',
  overSettledDisplay: '₹1.1 L',
  unlinkedDisplay: '₹1.8 L',
  reversalDisplay: '₹0.95 L',
  reviewHref: '#',
  matchConfidencePct: '94.2%',
  matchConfidenceSub: 'Average match confidence',
  paymentsNeedingReview: '86',
  missingRefRate: '4.2%',
  refCompleteness: '95.8%',
  multiMatchRate: '1.4%',
  proofCoverageDisplay: '87.5%',
  proofSub: 'Evidence coverage for audit or export',
  proofFooter: 'Proof-ready payments have enough linked evidence to support audit or dispute export.',
  proofReadyRow: '1,092 ready',
  incompleteProofRow: '156 incomplete',
  proofHref: '#',
}

export const PREVIEW_NEXT_ACTIONS: NextActionItem[] = [
  {
    title: 'Review unmatched Cashfree value',
    description: '₹12.4 L needs settlement confirmation before close.',
    href: '#',
    emphasis: true,
  },
  {
    title: 'Close BATCH-1042 proof pack',
    description: 'Proof readiness is 91% - 3 intents still incomplete.',
    href: '#',
  },
  {
    title: 'Resolve missing bank references',
    description: '18 payment instructions missing UTR or provider refs.',
    href: '#',
  },
]

export const PREVIEW_EVIDENCE_KPI_CARDS: EvidenceKpiCard[] = [
  {
    id: 'readiness',
    label: 'Proof readiness',
    value: '87.5%',
    sub: 'Evidence coverage for audit or export',
    explanation: 'Based on linked settlement proofs and intent completeness.',
  },
  {
    id: 'packs',
    label: 'Packs ready',
    value: '24',
    sub: 'Exportable proof packs',
  },
  {
    id: 'gaps',
    label: 'Proof gaps',
    value: '156',
    sub: 'Intents missing required evidence',
  },
  {
    id: 'disputes',
    label: 'Open disputes',
    value: '7',
    sub: 'Awaiting resolver action',
  },
  {
    id: 'completeness',
    label: 'Completeness',
    value: '91%',
    sub: 'Average pack completeness score',
  },
]

export const PREVIEW_LEAKAGE_PCT_CACHE: Record<string, number> = {
  'BATCH-1042': 6.8,
  'BATCH-1048': 9.1,
  'BATCH-1051': 11.4,
}

export const PREVIEW_JOURNAL_ROWS = [
  { id: 'BATCH-1042', partner: 'Loan System', status: 'Ready', amount: '₹34.2 L' },
  { id: 'BATCH-1048', partner: 'Partner feed', status: 'Review', amount: '₹18.1 L' },
  { id: 'BATCH-1051', partner: 'NACH', status: 'Pending', amount: '₹9.8 L' },
] as const

export const PREVIEW_SETTLEMENT_ROWS = [
  { id: 'UTR-3921', partner: 'Cashfree', status: 'Matched', amount: '₹22.4 L' },
  { id: 'UTR-3928', partner: 'Razorpay', status: 'Unlinked', amount: '₹4.8 L' },
  { id: 'UTR-3934', partner: 'PayU', status: 'Review', amount: '₹7.2 L' },
] as const

export const PREVIEW_SUPPORT_TICKETS = [
  { id: 'TKT-1042', subject: 'Settlement delay', priority: 'High', status: 'Open' },
  { id: 'TKT-1048', subject: 'Evidence gap', priority: 'Med', status: 'Waiting' },
  { id: 'TKT-1051', subject: 'Batch mismatch', priority: 'High', status: 'Open' },
] as const

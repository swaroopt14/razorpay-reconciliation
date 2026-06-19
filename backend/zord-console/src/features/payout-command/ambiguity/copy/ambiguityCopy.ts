/** Customer-facing copy for Match Review (ambiguity). */

import type { RiskTier } from '@/services/payout-command/prod-api/intelligenceTypes'
import { mapReviewPriorityLabel, mapReviewPriorityShort } from '../../leakage/copy/leakageCopy'

export { mapReviewPriorityLabel, mapReviewPriorityShort }

export const ambiguityCopy = {
  pageTitle: 'Match Review',
  pageSubtitle:
    'See where Zord cannot confidently connect payment instructions to bank, PSP, or settlement outcomes.',
  linkPaymentGaps: 'See payment gaps in rupees',
  kpi: {
    paymentsNeedingReview: 'Payments Needing Match Review',
    paymentsNeedingReviewHelper: 'Payment decisions where match attachment is not fully resolved.',
    reviewRate: 'Review Rate',
    reviewRateHelper: 'Share of payment decisions with unresolved match uncertainty.',
    reviewRateThresholds: 'Green below 3% · Amber 3–8% · Red above 8%',
    unclearValue: 'Unclear Payment Value',
    unclearValueHelper: 'Payment value sitting on unresolved match uncertainty in this window.',
    avgConfidence: 'Average Match Confidence',
    avgConfidenceHelper: 'How certain Zord is that settlement signals align with the original payment intent.',
    missingRefRate: 'Missing Bank / PSP Reference Rate',
    missingRefRateHelper:
      'Share of decisions with no carrier reference (UTR / RRN). Without a reference, matching and evidence are harder to confirm.',
    reviewPriority: 'Review Priority',
  },
  chart: {
    title: 'Why Payments Need Review',
    subtitle: 'Four rates that slow clean matching — lower is better.',
    reviewRate: 'Review Rate',
    lowConfidence: 'Low Confidence Matches',
    missingRefs: 'Missing References',
    multipleMatches: 'Multiple Match Possibility',
    collisionPending: 'Per-batch collision metrics pending from intelligence.',
  },
  topReasons: {
    title: 'Top Reasons for Review',
    empty: 'No major match-review drivers in this window — rates are within expected bounds.',
    missingRef: 'Missing bank or PSP reference on a meaningful share of payments.',
    lowConfidence: 'Low average match confidence — signals conflict or are incomplete.',
    highReviewRate: 'Review rate is elevated — many payments need match confirmation.',
    multipleMatches: 'Multiple possible matches detected for some payments.',
  },
  confidence: {
    title: 'Average Match Confidence',
    low: 'Low confidence — signals are conflicting or missing.',
    moderate: 'Moderate confidence — some signals resolved, some uncertain.',
    high: 'High confidence — multi-signal attachment largely confirmed.',
    summaryPrefix: 'On average Zord has',
    summarySuffix: 'certainty that settlement signals align with the original payment intent in this window.',
  },
  missingRef: {
    title: 'Missing Reference Rate',
    benchmarkTitle: 'Reference benchmark',
    benchmarkBody:
      'Many teams target missing reference rates below 2%. Rates above that threshold often correlate with slower reconciliation and incomplete proof.',
    opsNote:
      'Pair missing references with the Intent Journal for the same batch to see whether UTR gaps cluster on a corridor or partner.',
  },
  batches: {
    title: 'Batches Needing Review',
    subtitle:
      'From intelligence batches. Review Rate is estimated from batch status until per-batch ambiguity ships.',
    filterLabel: 'Filter batch status',
    columns: {
      batch: 'Batch',
      payments: 'Payments',
      needsReview: 'Needs Review',
      reviewRate: 'Review Rate',
      avgConfidence: 'Avg Match Confidence',
      status: 'Batch Status',
      action: 'Action',
    },
    reviewBatch: 'Review Batch',
    perBatchConfidencePending: 'Per-batch confidence when batch-scoped patterns are available.',
    loading: 'Loading batches…',
    empty: 'No batches for this filter, or intelligence returned an empty list.',
  },
  actions: {
    reviewUnclear: 'Review Unclear Payments',
    openMissingRefs: 'Open Missing References',
    exportList: 'Export Review List',
    exportPending: 'Export API pending — open Intent Journal or export from Evidence when available.',
  },
} as const

export function reviewRateColor(rate: number): { bar: string; text: string } {
  if (rate < 0.03) return { bar: 'bg-black', text: 'text-white' }
  if (rate <= 0.08) return { bar: 'bg-amber-500', text: 'text-amber-950' }
  return { bar: 'bg-red-600', text: 'text-red-950' }
}

export function confidenceZoneLabel(conf: number): string {
  if (conf < 0.5) return ambiguityCopy.confidence.low
  if (conf < 0.8) return ambiguityCopy.confidence.moderate
  return ambiguityCopy.confidence.high
}

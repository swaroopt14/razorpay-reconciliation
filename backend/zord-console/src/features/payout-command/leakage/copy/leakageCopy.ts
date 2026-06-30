/** Customer-facing copy for Payment Gaps. */

import type { RiskTier } from '@/services/payout-command/prod-api/intelligenceTypes'

export const leakageCopy = {
  pageTitle: 'Payment Gaps',
  pageSubtitle:
    'Compare intended payments with bank or settlement outcomes. Identify unmatched, short-settled, reversed, or unlinked value.',
  sectionTitle: 'Payment Gap Analysis',
  kpi: {
    intendedValue: 'Intended Payment Value',
    intendedHelper: 'Total value your business intended to pay in this period.',
    bankObserved: 'Bank / Settlement Value Observed',
    bankObservedHelper: 'Total value found in bank, PSP, or settlement records.',
    openFinancialExceptionValue: 'Value needing review',
    openFinancialExceptionHelper: 'Total open financial exception value from leakage `total_amount_minor`.',
    exposureAmount: 'Exposure amount',
    exposureAmountHelper: 'Unmatched payment value from the leakage dashboard.',
    paymentGapRate: 'Payment Gap Rate',
    paymentGapRateHelper: 'Share of intended value that is not fully matched or confirmed.',
    reviewPriority: 'Review Priority',
    unmatched: 'Unmatched Payment Value',
    unmatchedTooltip: 'Intended payments that do not yet have a linked bank/settlement outcome.',
    shortSettled: 'Short-Settled Value',
    shortSettledTooltip: 'Settlement value is lower than intended payment value.',
    unlinked: 'Unlinked Settlement Value',
    unlinkedTooltip: 'Settlement records received, but Zord cannot link them to an original payment intent.',
    reversal: 'Reversal Exposure',
  },
  chart: {
    title: 'Estimated Value Needing Attention',
    riskAdjustedTitle: 'Risk-Adjusted Payment Exposure',
    currentLeakage: 'Current leakage',
    predictedLeakage: 'Predicted leakage',
    projectStart: 'PROJECT START',
    helper:
      'This value is based on unmatched, ambiguous, short-settled, orphaned, or reversed payment records.',
    trendPending: 'Trend data pending — chart uses illustrative history until leakage time-series API is available.',
    criticalReview: 'Immediate review required',
  },
  exposure: {
    title: 'Exposure Breakdown',
    unmatched: 'Unmatched Payment Value',
    ambiguous: 'Ambiguous value',
    shortSettled: 'Short-Settled Value',
    reversal: 'Reversal Exposure',
    unlinked: 'Unlinked Settlement Value',
  },
  severity: {
    title: 'Payment Gap Severity',
    helper: 'Higher score means payment gaps are more severe and need faster review.',
  },
  insight: {
    title: 'What Zord Found',
    openReview: 'Open Review Items',
  },
  watchlist: {
    title: 'Batch watchlist',
    providerPending:
      'Source-level provider health will appear after bank/PSP signal integration.',
  },
  actions: {
    openReview: 'Open Review Items',
    exportGap: 'Export Gap Report',
    uploadSettlement: 'Upload Missing Confirmation File',
    exportPending: 'Export API pending — use Intent Journal to review unmatched payments.',
    uploadPending: 'Upload settlement confirmation via your ingest flow when available.',
  },
  linkMatching: 'Why payments need review',
} as const

export function mapReviewPriorityLabel(tier: string | RiskTier | undefined): string {
  const t = (tier || '').toUpperCase()
  if (t === 'CLEAN') return 'No major issue'
  if (t === 'LOW' || t === 'MEDIUM') return 'Needs monitoring'
  if (t === 'HIGH') return 'Review recommended'
  if (t === 'CRITICAL') return 'Immediate review required'
  return 'Needs monitoring'
}

export function mapReviewPriorityShort(tier: string | RiskTier | undefined): string {
  const t = (tier || '').toUpperCase()
  if (t === 'CLEAN') return 'CLEAN'
  if (t === 'LOW' || t === 'MEDIUM') return 'WATCH'
  if (t === 'HIGH') return 'RISK'
  if (t === 'CRITICAL') return 'CRITICAL'
  return 'WATCH'
}

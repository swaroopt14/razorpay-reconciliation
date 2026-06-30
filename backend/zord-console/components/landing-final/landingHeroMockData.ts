/** Illustrative data for landing hero dashboard preview only — not live payout APIs. */

import type { PaymentTrendChartPoint } from '@/features/payout-command/command-center/PaymentValueTrendChart'

function buildMockTrendSeries(): PaymentTrendChartPoint[] {
  return Array.from({ length: 30 }, (_, index) => {
    const wave = Math.sin(index * 0.42) * 0.32 + Math.cos(index * 0.17) * 0.14
    const intendedMinor = Math.round((28_000_000 + index * 1_050_000) * (1 + wave))
    const confirmedMinor = Math.round(intendedMinor * (0.7 + Math.sin(index * 0.28) * 0.07))
    return {
      label: String(index + 1),
      intendedMinor,
      confirmedMinor,
      reviewMinor: Math.max(0, intendedMinor - confirmedMinor),
    }
  })
}

export const landingHeroMockData = {
  activeDock: 'home' as const,
  timeframeLabel: 'Month · January 2026',
  years: ['2026', '2027', '2028'] as const,
  selectedYear: '2026',
  chartPeriod: 'month' as const,
  chartSeries: buildMockTrendSeries(),
  heroMetric: {
    value: '₹3.45 Cr',
    label: 'Intended Payment Value',
    sub: '1,248 payment instructions in this period.',
  },
  commandCenter: {
    sectionTitle: "Today's payment health",
    sectionSubtitle:
      'Current status of payment value, confirmation, and review items across connected systems.',
  },
  kpiCards: [
    { title: 'Settlement Value Observed', value: '₹2.41 Cr', sub: 'Settlement value confirmed by bank or PSP' },
    { title: 'Unmatched Intent Value', value: '₹18.2 L', sub: 'Payments without a confirmed settlement outcome' },
    { title: 'Match Confidence', value: '94.2%', sub: 'Average match confidence' },
    { title: 'Proof Readiness', value: '87.5%', sub: 'Evidence coverage for audit or export' },
  ],
} as const

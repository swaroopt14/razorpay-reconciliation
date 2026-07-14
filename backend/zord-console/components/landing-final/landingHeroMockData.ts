/** Illustrative data for landing hero dashboard preview only — not live payout APIs. */

import type { PaymentTrendChartPoint } from '@/features/payout-command/command-center/PaymentValueTrendChart'

type PreviewMetricCopy = {
  label: string
  values: Record<'2026' | '2027' | '2028', { value: string; sub: string }>
}

export type LandingHeroPreviewPageMock = {
  chartSeed: number
  metrics: Record<'intended' | 'confirmed', PreviewMetricCopy>
  panels: Record<'ask' | 'batches' | 'export' | 'alerts' | 'search', { title: string; body: string }>
}

export function buildMockTrendSeries(seed = 0, buckets = 30): PaymentTrendChartPoint[] {
  return Array.from({ length: buckets }, (_, index) => {
    const wave = Math.sin(index * 0.42) * 0.32 + Math.cos(index * 0.17) * 0.14
    const yearLift = 1 + seed * 0.11
    const intendedMinor = Math.round((28_000_000 + index * 1_050_000) * yearLift * (1 + wave))
    const confirmedMinor = Math.round(intendedMinor * (0.7 + Math.sin((index + seed) * 0.28) * 0.07))
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
  selectedYear: '2026',
  chartPeriod: 'month' as const,
  metricsByYear: {
    '2026': {},
    '2027': {},
    '2028': {},
  },
  pageProfiles: {
    home: {
      chartSeed: 0,
      metrics: {
        intended: {
          label: 'Intended Payment Value',
          values: {
            '2026': { value: '₹3.45 Cr', sub: '1,248 payment instructions in this period.' },
            '2027': { value: '₹4.18 Cr', sub: '1,512 payment instructions in this period.' },
            '2028': { value: '₹5.02 Cr', sub: '1,790 payment instructions in this period.' },
          },
        },
        confirmed: {
          label: 'Bank-Confirmed Value',
          values: {
            '2026': { value: '₹2.41 Cr', sub: '1,102 bank-confirmed settlement records.' },
            '2027': { value: '₹3.06 Cr', sub: '1,348 bank-confirmed settlement records.' },
            '2028': { value: '₹3.82 Cr', sub: '1,621 bank-confirmed settlement records.' },
          },
        },
      },
      panels: {
        ask: { title: 'Ask Zord preview', body: 'Mock answer: Cashfree and PayU have the largest confirmation drift this month.' },
        batches: { title: 'Batch queue preview', body: '3 batches need review · 42 open items · 11 high-value payment instructions.' },
        export: { title: 'Export preview', body: 'Payment health snapshot, batch CSV, and Evidence Pack summary are ready.' },
        alerts: { title: 'Alert preview', body: '2 review alerts · confirmation drift and evidence coverage below threshold.' },
        search: { title: 'Search preview', body: 'Search batches, PSP references, payment intents, or Evidence Pack IDs.' },
      },
    },
    workspace: {
      chartSeed: 1,
      metrics: {
        intended: {
          label: 'Questions Answered',
          values: {
            '2026': { value: '186', sub: 'ops questions answered from shared payment data.' },
            '2027': { value: '244', sub: 'ops questions answered from shared payment data.' },
            '2028': { value: '312', sub: 'ops questions answered from shared payment data.' },
          },
        },
        confirmed: {
          label: 'Actionable Answers',
          values: {
            '2026': { value: '91.8%', sub: 'answers resolved without spreadsheet follow-up.' },
            '2027': { value: '93.4%', sub: 'answers resolved without spreadsheet follow-up.' },
            '2028': { value: '94.1%', sub: 'answers resolved without spreadsheet follow-up.' },
          },
        },
      },
      panels: {
        ask: { title: 'Ask preview', body: '“Which PSP caused the highest unmatched value?” Cashfree, followed by PayU.' },
        batches: { title: 'Referenced batches', body: 'BATCH-1042, BATCH-1048, and BATCH-1051 are linked to this answer.' },
        export: { title: 'Conversation export', body: 'Mock answer thread and source links are ready for ops review.' },
        alerts: { title: 'Ask alerts', body: '1 answer needs source refresh because settlement data changed.' },
        search: { title: 'Ask search', body: 'Search questions, cited batches, payment references, and evidence links.' },
      },
    },
    leakage: {
      chartSeed: 2,
      metrics: {
        intended: {
          label: 'Exposure at Risk',
          values: {
            '2026': { value: '₹18.2 L', sub: 'value currently sitting in payment gaps.' },
            '2027': { value: '₹22.6 L', sub: 'value currently sitting in payment gaps.' },
            '2028': { value: '₹29.4 L', sub: 'value currently sitting in payment gaps.' },
          },
        },
        confirmed: {
          label: 'Predicted Leakage',
          values: {
            '2026': { value: '₹12.8 L', sub: 'predicted unresolved value after review.' },
            '2027': { value: '₹16.5 L', sub: 'predicted unresolved value after review.' },
            '2028': { value: '₹20.1 L', sub: 'predicted unresolved value after review.' },
          },
        },
      },
      panels: {
        ask: { title: 'Leakage answer', body: 'Top driver is unmatched payment value on Cashfree settlement rails.' },
        batches: { title: 'Leakage batches', body: '4 batches contain aging exposure older than 7 days.' },
        export: { title: 'Gap export', body: 'Mock leakage report with buckets and aging bands is ready.' },
        alerts: { title: 'Leakage alert', body: 'One exposure bucket crossed the high-risk threshold.' },
        search: { title: 'Leakage search', body: 'Search unmatched intents, short-settled records, and reversal exposure.' },
      },
    },
    ambiguity: {
      chartSeed: 3,
      metrics: {
        intended: {
          label: 'Payments Needing Review',
          values: {
            '2026': { value: '42', sub: 'payment instructions need match review.' },
            '2027': { value: '58', sub: 'payment instructions need match review.' },
            '2028': { value: '63', sub: 'payment instructions need match review.' },
          },
        },
        confirmed: {
          label: 'Average Match Confidence',
          values: {
            '2026': { value: '94.2%', sub: 'average match confidence across reviewed batches.' },
            '2027': { value: '92.8%', sub: 'average match confidence across reviewed batches.' },
            '2028': { value: '91.6%', sub: 'average match confidence across reviewed batches.' },
          },
        },
      },
      panels: {
        ask: { title: 'Match answer', body: 'Missing PSP references are the biggest review driver this week.' },
        batches: { title: 'Review batches', body: 'BATCH-1048 has the largest low-confidence cluster.' },
        export: { title: 'Review export', body: 'Mock ambiguity queue and match-signal matrix are ready.' },
        alerts: { title: 'Match alert', body: 'Provider reference quality dropped below target on one rail.' },
        search: { title: 'Match search', body: 'Search review items, missing refs, PSP signals, and batch IDs.' },
      },
    },
    verification: {
      chartSeed: 4,
      metrics: {
        intended: {
          label: 'Borrowers Verified',
          values: {
            '2026': { value: '1,086', sub: 'borrower checks completed in this period.' },
            '2027': { value: '1,294', sub: 'borrower checks completed in this period.' },
            '2028': { value: '1,518', sub: 'borrower checks completed in this period.' },
          },
        },
        confirmed: {
          label: 'Clear-to-Disburse',
          values: {
            '2026': { value: '88.6%', sub: 'borrowers cleared for disbursal.' },
            '2027': { value: '90.2%', sub: 'borrowers cleared for disbursal.' },
            '2028': { value: '91.7%', sub: 'borrowers cleared for disbursal.' },
          },
        },
      },
      panels: {
        ask: { title: 'Verification answer', body: 'Most holds are due to bank-name mismatch and stale KYC evidence.' },
        batches: { title: 'Borrower batches', body: '2 cohorts need bank verification review before disbursal.' },
        export: { title: 'Verification export', body: 'Mock borrower verification report is ready.' },
        alerts: { title: 'Verification alert', body: 'Bank validation drift increased on one partner feed.' },
        search: { title: 'Verification search', body: 'Search borrowers, KYC refs, bank checks, and risk holds.' },
      },
    },
    monitoring: {
      chartSeed: 5,
      metrics: {
        intended: {
          label: 'Accounts Monitored',
          values: {
            '2026': { value: '3,812', sub: 'accounts monitored after disbursal.' },
            '2027': { value: '4,280', sub: 'accounts monitored after disbursal.' },
            '2028': { value: '4,934', sub: 'accounts monitored after disbursal.' },
          },
        },
        confirmed: {
          label: 'Healthy Repayment',
          values: {
            '2026': { value: '91.9%', sub: 'accounts currently healthy.' },
            '2027': { value: '92.6%', sub: 'accounts currently healthy.' },
            '2028': { value: '93.1%', sub: 'accounts currently healthy.' },
          },
        },
      },
      panels: {
        ask: { title: 'Monitoring answer', body: 'The repayment watchlist is concentrated in two late-settlement cohorts.' },
        batches: { title: 'Monitoring cohorts', body: '4 cohorts have active post-disbursal review items.' },
        export: { title: 'Monitoring export', body: 'Mock repayment and risk-monitoring report is ready.' },
        alerts: { title: 'Monitoring alert', body: 'Suspicious behavior score increased on one cohort.' },
        search: { title: 'Monitoring search', body: 'Search accounts, cohorts, repayment signals, and evidence gaps.' },
      },
    },
    grid: {
      chartSeed: 6,
      metrics: {
        intended: {
          label: 'Intent Records',
          values: {
            '2026': { value: '1,248', sub: 'intent records submitted this period.' },
            '2027': { value: '1,512', sub: 'intent records submitted this period.' },
            '2028': { value: '1,790', sub: 'intent records submitted this period.' },
          },
        },
        confirmed: {
          label: 'Ready to Match',
          values: {
            '2026': { value: '96.4%', sub: 'intent records ready for matching.' },
            '2027': { value: '97.1%', sub: 'intent records ready for matching.' },
            '2028': { value: '97.8%', sub: 'intent records ready for matching.' },
          },
        },
      },
      panels: {
        ask: { title: 'Intent answer', body: 'Most review items are missing provider reference and bank confirmation.' },
        batches: { title: 'Intent batches', body: '18 batches · 3 need review · 1 has high-value exposure.' },
        export: { title: 'Intent export', body: 'Mock Intent Journal CSV and review list are ready.' },
        alerts: { title: 'Intent alert', body: 'One batch contains duplicate idempotency keys.' },
        search: { title: 'Intent search', body: 'Search intent IDs, batch refs, payer refs, and review reasons.' },
      },
    },
    settlement: {
      chartSeed: 7,
      metrics: {
        intended: {
          label: 'Settlement Records',
          values: {
            '2026': { value: '1,102', sub: 'settlement records observed this period.' },
            '2027': { value: '1,348', sub: 'settlement records observed this period.' },
            '2028': { value: '1,621', sub: 'settlement records observed this period.' },
          },
        },
        confirmed: {
          label: 'Matched Settlements',
          values: {
            '2026': { value: '89.1%', sub: 'settlement records matched to intents.' },
            '2027': { value: '90.8%', sub: 'settlement records matched to intents.' },
            '2028': { value: '92.2%', sub: 'settlement records matched to intents.' },
          },
        },
      },
      panels: {
        ask: { title: 'Settlement answer', body: 'Late bank files are the top cause of unresolved settlement state.' },
        batches: { title: 'Settlement batches', body: '5 settlement files map to open review batches.' },
        export: { title: 'Settlement export', body: 'Mock settlement journal and unmatched record list are ready.' },
        alerts: { title: 'Settlement alert', body: 'One bank file arrived outside SLA.' },
        search: { title: 'Settlement search', body: 'Search UTRs, bank refs, settlement files, and unlinked records.' },
      },
    },
    proof: {
      chartSeed: 8,
      metrics: {
        intended: {
          label: 'Evidence Packs',
          values: {
            '2026': { value: '326', sub: 'Evidence Packs generated this period.' },
            '2027': { value: '418', sub: 'Evidence Packs generated this period.' },
            '2028': { value: '506', sub: 'Evidence Packs generated this period.' },
          },
        },
        confirmed: {
          label: 'Proof Readiness',
          values: {
            '2026': { value: '87.5%', sub: 'records ready for finance or audit export.' },
            '2027': { value: '89.6%', sub: 'records ready for finance or audit export.' },
            '2028': { value: '91.2%', sub: 'records ready for finance or audit export.' },
          },
        },
      },
      panels: {
        ask: { title: 'Evidence answer', body: 'Most proof gaps come from missing settlement attachments.' },
        batches: { title: 'Evidence batches', body: '7 batches have complete Evidence Packs ready for export.' },
        export: { title: 'Evidence export', body: 'Mock Evidence Pack archive is ready for finance close.' },
        alerts: { title: 'Evidence alert', body: 'Proof readiness dropped below target for one batch.' },
        search: { title: 'Evidence search', body: 'Search Evidence Packs, audit events, exports, and attachment gaps.' },
      },
    },
    support: {
      chartSeed: 9,
      metrics: {
        intended: {
          label: 'Support Requests',
          values: {
            '2026': { value: '14', sub: 'support requests opened this period.' },
            '2027': { value: '18', sub: 'support requests opened this period.' },
            '2028': { value: '21', sub: 'support requests opened this period.' },
          },
        },
        confirmed: {
          label: 'Resolved Within SLA',
          values: {
            '2026': { value: '92%', sub: 'requests resolved within SLA.' },
            '2027': { value: '94%', sub: 'requests resolved within SLA.' },
            '2028': { value: '95%', sub: 'requests resolved within SLA.' },
          },
        },
      },
      panels: {
        ask: { title: 'Support answer', body: 'Most tickets are linked to settlement delay and missing evidence context.' },
        batches: { title: 'Support batches', body: '11 support tickets include linked batch context.' },
        export: { title: 'Support export', body: 'Mock support ticket report and linked evidence are ready.' },
        alerts: { title: 'Support alert', body: '3 tickets are approaching SLA breach.' },
        search: { title: 'Support search', body: 'Search tickets, batch links, evidence refs, and operator notes.' },
      },
    },
  } satisfies Record<string, LandingHeroPreviewPageMock>,
} as const

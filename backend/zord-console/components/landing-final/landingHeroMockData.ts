/** Illustrative data for landing hero dashboard preview only — not live payout APIs. */

import type { PaymentTrendChartPoint } from '@/features/payout-command/command-center/PaymentValueTrendChart'

type PreviewMetricCopy = {
  label: string
  helper: string
  values: Record<'2026' | '2027' | '2028', { value: string; sub: string }>
}

export type LandingHeroPreviewPageMock = {
  chartSeed: number
  metrics: Record<'intended' | 'confirmed', PreviewMetricCopy>
  sectionTitle: string
  sectionSubtitle: string
  kpiCards: readonly { title: string; value: string; sub: string }[]
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
  timeframeLabel: 'Month · January 2026',
  years: ['2026', '2027', '2028'] as const,
  selectedYear: '2026',
  chartPeriod: 'month' as const,
  chartSeries: buildMockTrendSeries(),
  metricsByYear: {
    '2026': {
      intended: { value: '₹3.45 Cr', sub: '1,248 payment instructions in this period.' },
      confirmed: { value: '₹2.41 Cr', sub: '1,102 bank-confirmed settlement records in this period.' },
    },
    '2027': {
      intended: { value: '₹4.18 Cr', sub: '1,512 payment instructions in this period.' },
      confirmed: { value: '₹3.06 Cr', sub: '1,348 bank-confirmed settlement records in this period.' },
    },
    '2028': {
      intended: { value: '₹5.02 Cr', sub: '1,790 payment instructions in this period.' },
      confirmed: { value: '₹3.82 Cr', sub: '1,621 bank-confirmed settlement records in this period.' },
    },
  },
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
  pageProfiles: {
    home: {
      chartSeed: 0,
      metrics: {
        intended: {
          label: 'Intended Payment Value',
          helper: 'This is the value your system intended to pay. Confirmation depends on bank/settlement data.',
          values: {
            '2026': { value: '₹3.45 Cr', sub: '1,248 payment instructions in this period.' },
            '2027': { value: '₹4.18 Cr', sub: '1,512 payment instructions in this period.' },
            '2028': { value: '₹5.02 Cr', sub: '1,790 payment instructions in this period.' },
          },
        },
        confirmed: {
          label: 'Bank-Confirmed Value',
          helper: 'Bank confirmation data is observed from settlement files and partner records.',
          values: {
            '2026': { value: '₹2.41 Cr', sub: '1,102 bank-confirmed settlement records.' },
            '2027': { value: '₹3.06 Cr', sub: '1,348 bank-confirmed settlement records.' },
            '2028': { value: '₹3.82 Cr', sub: '1,621 bank-confirmed settlement records.' },
          },
        },
      },
      sectionTitle: "Today's payment health",
      sectionSubtitle: 'Current status of payment value, confirmation, and review items across connected systems.',
      kpiCards: [
        { title: 'Settlement Value Observed', value: '₹2.41 Cr', sub: 'Settlement value confirmed by bank or PSP' },
        { title: 'Unmatched Intent Value', value: '₹18.2 L', sub: 'Payments without a confirmed settlement outcome' },
        { title: 'Match Confidence', value: '94.2%', sub: 'Average match confidence' },
        { title: 'Proof Readiness', value: '87.5%', sub: 'Evidence coverage for audit or export' },
      ],
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
          helper: 'Mock Ask Zord responses are grounded in payment, settlement, and evidence records.',
          values: {
            '2026': { value: '186', sub: 'ops questions answered from shared payment data.' },
            '2027': { value: '244', sub: 'ops questions answered from shared payment data.' },
            '2028': { value: '312', sub: 'ops questions answered from shared payment data.' },
          },
        },
        confirmed: {
          label: 'Actionable Answers',
          helper: 'Answers include linked batches, affected rails, and suggested review actions.',
          values: {
            '2026': { value: '91.8%', sub: 'answers resolved without spreadsheet follow-up.' },
            '2027': { value: '93.4%', sub: 'answers resolved without spreadsheet follow-up.' },
            '2028': { value: '94.1%', sub: 'answers resolved without spreadsheet follow-up.' },
          },
        },
      },
      sectionTitle: 'Ask workspace health',
      sectionSubtitle: 'Mock operational questions, batch context, and source-linked answers.',
      kpiCards: [
        { title: 'Open Questions', value: '17', sub: 'Awaiting operator follow-up' },
        { title: 'Linked Batches', value: '42', sub: 'Referenced in answers' },
        { title: 'Answer Confidence', value: '93.4%', sub: 'Mock grounded response rate' },
        { title: 'Escalations Avoided', value: '28', sub: 'Resolved inside the workspace' },
      ],
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
          helper: 'Mock leakage exposure includes unmatched, short-settled, reversed, and unlinked value.',
          values: {
            '2026': { value: '₹18.2 L', sub: 'value currently sitting in payment gaps.' },
            '2027': { value: '₹22.6 L', sub: 'value currently sitting in payment gaps.' },
            '2028': { value: '₹29.4 L', sub: 'value currently sitting in payment gaps.' },
          },
        },
        confirmed: {
          label: 'Predicted Leakage',
          helper: 'Projected leakage uses the mock aging trend for the selected period.',
          values: {
            '2026': { value: '₹12.8 L', sub: 'predicted unresolved value after review.' },
            '2027': { value: '₹16.5 L', sub: 'predicted unresolved value after review.' },
            '2028': { value: '₹20.1 L', sub: 'predicted unresolved value after review.' },
          },
        },
      },
      sectionTitle: 'Payment gap posture',
      sectionSubtitle: 'Mock exposure buckets and review priority for leakage operations.',
      kpiCards: [
        { title: 'Unmatched Value', value: '₹7.9 L', sub: 'Payments without matching settlement' },
        { title: 'Short-Settled', value: '₹1.98 L', sub: 'Settlements below instruction value' },
        { title: 'Open Exposure', value: '61.8%', sub: 'Share in unmatched bucket' },
        { title: 'Duplicate Risk', value: '7', sub: 'Intents at double-dispatch risk' },
      ],
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
          helper: 'Mock ambiguity data counts low-confidence, missing-reference, and review records.',
          values: {
            '2026': { value: '42', sub: 'payment instructions need match review.' },
            '2027': { value: '58', sub: 'payment instructions need match review.' },
            '2028': { value: '63', sub: 'payment instructions need match review.' },
          },
        },
        confirmed: {
          label: 'Average Match Confidence',
          helper: 'Match confidence reflects how clearly payment and settlement signals connect.',
          values: {
            '2026': { value: '94.2%', sub: 'average match confidence across reviewed batches.' },
            '2027': { value: '92.8%', sub: 'average match confidence across reviewed batches.' },
            '2028': { value: '91.6%', sub: 'average match confidence across reviewed batches.' },
          },
        },
      },
      sectionTitle: 'Match review flow',
      sectionSubtitle: 'Mock review, low-confidence, and missing-reference movement.',
      kpiCards: [
        { title: 'Low Confidence', value: '14', sub: 'Records with weak match signals' },
        { title: 'Missing References', value: '11', sub: 'UTR or PSP reference gaps' },
        { title: 'Review Rate', value: '3.4%', sub: 'Share needing manual attention' },
        { title: 'Open Queue', value: '42', sub: 'Items awaiting operator review' },
      ],
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
          helper: 'Mock borrower verification combines KYC, bank checks, and risk signals.',
          values: {
            '2026': { value: '1,086', sub: 'borrower checks completed in this period.' },
            '2027': { value: '1,294', sub: 'borrower checks completed in this period.' },
            '2028': { value: '1,518', sub: 'borrower checks completed in this period.' },
          },
        },
        confirmed: {
          label: 'Clear-to-Disburse',
          helper: 'Clear-to-disburse means verification signals meet the mock policy threshold.',
          values: {
            '2026': { value: '88.6%', sub: 'borrowers cleared for disbursal.' },
            '2027': { value: '90.2%', sub: 'borrowers cleared for disbursal.' },
            '2028': { value: '91.7%', sub: 'borrowers cleared for disbursal.' },
          },
        },
      },
      sectionTitle: 'Borrower verification',
      sectionSubtitle: 'Mock KYC, bank validation, and risk-readiness state before disbursal.',
      kpiCards: [
        { title: 'KYC Complete', value: '96.1%', sub: 'Identity checks passed' },
        { title: 'Bank Verified', value: '91.4%', sub: 'Account validation complete' },
        { title: 'Risk Holds', value: '23', sub: 'Borrowers requiring review' },
        { title: 'Proof Ready', value: '88.7%', sub: 'Evidence available for audit' },
      ],
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
          helper: 'Mock monitoring follows post-disbursal signals and repayment posture.',
          values: {
            '2026': { value: '3,812', sub: 'accounts monitored after disbursal.' },
            '2027': { value: '4,280', sub: 'accounts monitored after disbursal.' },
            '2028': { value: '4,934', sub: 'accounts monitored after disbursal.' },
          },
        },
        confirmed: {
          label: 'Healthy Repayment',
          helper: 'Healthy repayment reflects mock accounts without overdue or risk signals.',
          values: {
            '2026': { value: '91.9%', sub: 'accounts currently healthy.' },
            '2027': { value: '92.6%', sub: 'accounts currently healthy.' },
            '2028': { value: '93.1%', sub: 'accounts currently healthy.' },
          },
        },
      },
      sectionTitle: 'Post-disbursal monitoring',
      sectionSubtitle: 'Mock repayment, suspicious behavior, and evidence readiness after payout.',
      kpiCards: [
        { title: 'Watchlist', value: '38', sub: 'Accounts with rising risk' },
        { title: 'On-Time Signals', value: '92.6%', sub: 'Repayment behavior healthy' },
        { title: 'Evidence Gaps', value: '12', sub: 'Records missing proof' },
        { title: 'Alerts Closed', value: '76%', sub: 'Resolved this period' },
      ],
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
          helper: 'Mock Intent Journal shows submitted payment instructions and their readiness.',
          values: {
            '2026': { value: '1,248', sub: 'intent records submitted this period.' },
            '2027': { value: '1,512', sub: 'intent records submitted this period.' },
            '2028': { value: '1,790', sub: 'intent records submitted this period.' },
          },
        },
        confirmed: {
          label: 'Ready to Match',
          helper: 'Ready-to-match intents have enough source data for settlement comparison.',
          values: {
            '2026': { value: '96.4%', sub: 'intent records ready for matching.' },
            '2027': { value: '97.1%', sub: 'intent records ready for matching.' },
            '2028': { value: '97.8%', sub: 'intent records ready for matching.' },
          },
        },
      },
      sectionTitle: 'Intent Journal',
      sectionSubtitle: 'Mock payment instruction readiness, review state, and batch health.',
      kpiCards: [
        { title: 'Created Intents', value: '1,248', sub: 'Instructions submitted' },
        { title: 'Needs Review', value: '42', sub: 'Records missing signals' },
        { title: 'Ready Rate', value: '96.4%', sub: 'Complete source records' },
        { title: 'Batch Count', value: '18', sub: 'Instruction batches' },
      ],
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
          helper: 'Mock Settlement Journal shows bank and payment partner records received.',
          values: {
            '2026': { value: '1,102', sub: 'settlement records observed this period.' },
            '2027': { value: '1,348', sub: 'settlement records observed this period.' },
            '2028': { value: '1,621', sub: 'settlement records observed this period.' },
          },
        },
        confirmed: {
          label: 'Matched Settlements',
          helper: 'Matched settlements connect cleanly to submitted payment instructions.',
          values: {
            '2026': { value: '89.1%', sub: 'settlement records matched to intents.' },
            '2027': { value: '90.8%', sub: 'settlement records matched to intents.' },
            '2028': { value: '92.2%', sub: 'settlement records matched to intents.' },
          },
        },
      },
      sectionTitle: 'Settlement Journal',
      sectionSubtitle: 'Mock bank-side outcomes, match states, and observed settlement value.',
      kpiCards: [
        { title: 'Observed Value', value: '₹2.41 Cr', sub: 'Reported by bank or PSP' },
        { title: 'Unlinked Records', value: '9', sub: 'Need intent association' },
        { title: 'Matched Rate', value: '89.1%', sub: 'Clean settlement matches' },
        { title: 'Late Files', value: '3', sub: 'Feeds outside SLA' },
      ],
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
          helper: 'Mock Evidence Packs package intents, settlements, and audit proof.',
          values: {
            '2026': { value: '326', sub: 'Evidence Packs generated this period.' },
            '2027': { value: '418', sub: 'Evidence Packs generated this period.' },
            '2028': { value: '506', sub: 'Evidence Packs generated this period.' },
          },
        },
        confirmed: {
          label: 'Proof Readiness',
          helper: 'Proof readiness measures whether source records are export-ready.',
          values: {
            '2026': { value: '87.5%', sub: 'records ready for finance or audit export.' },
            '2027': { value: '89.6%', sub: 'records ready for finance or audit export.' },
            '2028': { value: '91.2%', sub: 'records ready for finance or audit export.' },
          },
        },
      },
      sectionTitle: 'Evidence workspace',
      sectionSubtitle: 'Mock proof coverage, export readiness, and audit trail state.',
      kpiCards: [
        { title: 'Packs Ready', value: '326', sub: 'Exportable evidence bundles' },
        { title: 'Coverage', value: '87.5%', sub: 'Records with proof attached' },
        { title: 'Audit Events', value: '1,248', sub: 'Chain-verified actions' },
        { title: 'Missing Proof', value: '19', sub: 'Records requiring attachment' },
      ],
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
          helper: 'Mock support requests keep production issues tied to batch and payment context.',
          values: {
            '2026': { value: '14', sub: 'support requests opened this period.' },
            '2027': { value: '18', sub: 'support requests opened this period.' },
            '2028': { value: '21', sub: 'support requests opened this period.' },
          },
        },
        confirmed: {
          label: 'Resolved Within SLA',
          helper: 'SLA resolution is based on mock ticket state and support priority.',
          values: {
            '2026': { value: '92%', sub: 'requests resolved within SLA.' },
            '2027': { value: '94%', sub: 'requests resolved within SLA.' },
            '2028': { value: '95%', sub: 'requests resolved within SLA.' },
          },
        },
      },
      sectionTitle: 'Support queue',
      sectionSubtitle: 'Mock support tickets connected to batches, evidence, and operator notes.',
      kpiCards: [
        { title: 'Open Tickets', value: '14', sub: 'Production support items' },
        { title: 'High Priority', value: '3', sub: 'Needs immediate attention' },
        { title: 'SLA Health', value: '92%', sub: 'Resolved within SLA' },
        { title: 'Linked Batches', value: '11', sub: 'Tickets with batch context' },
      ],
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

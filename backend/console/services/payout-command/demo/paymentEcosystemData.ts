export type EcosystemStatus = 'up' | 'down'

export type EcosystemInstrument = {
  id: string
  name: string
  /** Short mark fallback when logo missing. */
  mark: string
  /** File under /ecosystem/logos (png or svg, no extension). */
  logo?: string
  status: EcosystemStatus
  note?: string
}

export type EcosystemGroup = {
  id: string
  title: string
  items: EcosystemInstrument[]
}

export type EcosystemColumn = {
  id: string
  title: string
  accent: string
  summary: {
    severity: 'ok' | 'high'
    title: string
    detail: string
    extras?: string
  }
  groups: EcosystemGroup[]
}

function item(
  id: string,
  name: string,
  mark: string,
  logo: string | undefined,
  status: EcosystemStatus = 'up',
  note?: string,
): EcosystemInstrument {
  return { id, name, mark, logo, status, note }
}

/** Domestic + international rail health - lean startup-stage fixture (2 per section). */
export const ECOSYSTEM_BANNER =
  'Early integrations only - Cards issuer and Net Banking show a live drop.'

export const ECOSYSTEM_COLUMNS: EcosystemColumn[] = [
  {
    id: 'upi',
    title: 'UPI',
    accent: '#0D9488',
    summary: {
      severity: 'ok',
      title: 'Connected rails healthy',
      detail: 'No ongoing downtimes',
    },
    groups: [
      {
        id: 'vpa',
        title: 'VPA handle',
        items: [
          item('okicici', 'okicici', 'i', 'icici'),
          item('oksbi', 'oksbi', 'S', 'sbi'),
        ],
      },
      {
        id: 'psp',
        title: 'PSP apps',
        items: [
          item('razorpay', 'Razorpay', 'R', 'razorpay'),
          item('phonepe', 'PhonePe', 'P', 'phonepe'),
        ],
      },
    ],
  },
  {
    id: 'cards',
    title: 'Cards',
    accent: '#2563EB',
    summary: {
      severity: 'high',
      title: 'Issuer downtime',
      detail: 'Bank Of India (started at 03/07, 14:06)',
    },
    groups: [
      {
        id: 'network',
        title: 'Network',
        items: [
          item('visa', 'VISA', 'V', 'visa'),
          item('rupay', 'RuPay', 'R', 'rupay'),
        ],
      },
      {
        id: 'issuer',
        title: 'Issuer',
        items: [
          item('boi', 'Bank Of India', 'B', 'boi', 'down', 'Issuer downtime'),
          item('hdfc', 'HDFC Bank', 'H', 'hdfc'),
        ],
      },
    ],
  },
  {
    id: 'netbanking',
    title: 'Net Banking',
    accent: '#7C3AED',
    summary: {
      severity: 'high',
      title: 'Bank downtime',
      detail: 'State Bank Of India',
    },
    groups: [
      {
        id: 'bank',
        title: 'Bank',
        items: [
          item('sbi', 'State Bank Of India', 'S', 'sbi', 'down'),
          item('icici', 'ICICI Bank', 'I', 'icici'),
        ],
      },
    ],
  },
  {
    id: 'emandate',
    title: 'E-mandate',
    accent: '#0891B2',
    summary: {
      severity: 'ok',
      title: 'Connected banks healthy',
      detail: 'No ongoing downtimes',
    },
    groups: [
      {
        id: 'bank',
        title: 'Bank',
        items: [
          item('hdfc-em', 'HDFC Bank', 'H', 'hdfc'),
          item('icici-em', 'ICICI Bank', 'I', 'icici'),
        ],
      },
    ],
  },
  {
    id: 'enterprise',
    title: 'Enterprise',
    accent: '#0F766E',
    summary: {
      severity: 'ok',
      title: 'Source systems connected',
      detail: 'SAP + Razorpay rails healthy for demo batch',
    },
    groups: [
      {
        id: 'erp',
        title: 'ERP / source',
        items: [
          item('sap', 'SAP S/4HANA payouts', 'S', 'sap', 'up', 'Obligation source'),
          item('sap-bapi', 'SAP FI payment run', 'S', 'sap', 'up'),
        ],
      },
      {
        id: 'psp-rails',
        title: 'Payout platforms',
        items: [
          item('rzp-payout', 'RazorpayX Payouts', 'R', 'razorpay', 'up'),
          item('cf-payout', 'Cashfree Payouts', 'C', 'cashfree', 'up'),
        ],
      },
    ],
  },
  {
    id: 'international',
    title: 'International',
    accent: '#C2410C',
    summary: {
      severity: 'high',
      title: 'Correspondent rail latency',
      detail: 'JPMorgan Chase wire window delayed',
    },
    groups: [
      {
        id: 'foreign-banks',
        title: 'Foreign banks',
        items: [
          item('jpm', 'JPMorgan Chase', 'J', 'jpmorgan', 'down', 'USD wire latency'),
          item('citi', 'Citibank', 'C', 'citi'),
        ],
      },
      {
        id: 'corridors',
        title: 'Corridors & rails',
        items: [
          item('swift', 'SWIFT network', 'S', 'swift', 'up'),
          item('wise', 'Wise cross-border', 'W', 'wise', 'up'),
        ],
      },
    ],
  },
]

export type EcosystemPastIncident = {
  id: string
  rangeLabel: string
  severity: 'High Severity' | 'Medium Severity'
}

export type EcosystemDowntimeDetail = {
  instrumentId: string
  category: string
  role: string
  downtimesToday: number
  downtimeDuration: string
  metricsFrom: string
  infoBanner: string
  ongoing: {
    title: string
    startedAt: string
  } | null
  pastIncidents: EcosystemPastIncident[]
}

/** Drill-down payloads for red / down instruments. */
export const ECOSYSTEM_DOWNTIME_DETAILS: Record<string, EcosystemDowntimeDetail> = {
  boi: {
    instrumentId: 'boi',
    category: 'Cards',
    role: 'Issuer',
    downtimesToday: 1,
    downtimeDuration: '547hrs 11mins',
    metricsFrom: '26 Jul, 00:00',
    infoBanner: 'No payments were attempted via Bank of India (Cards) in the past one week.',
    ongoing: {
      title: 'Ongoing High Severity Downtime',
      startedAt: '03 Jul, 14:06',
    },
    pastIncidents: [
      {
        id: 'boi-1',
        rangeLabel: '04 Jun 15:21 to 02 Jul 17:43 (674hrs 22mins)',
        severity: 'High Severity',
      },
    ],
  },
  sbi: {
    instrumentId: 'sbi',
    category: 'Net Banking',
    role: 'Bank',
    downtimesToday: 1,
    downtimeDuration: '6hrs 05mins',
    metricsFrom: '26 Jul, 00:00',
    infoBanner: 'Settlement confirmations from SBI net banking are delayed for demo batch rows.',
    ongoing: {
      title: 'Ongoing High Severity Downtime',
      startedAt: '26 Jul, 03:55',
    },
    pastIncidents: [
      {
        id: 'sbi-1',
        rangeLabel: '01 Jul 08:00 to 01 Jul 14:20 (6hrs 20mins)',
        severity: 'High Severity',
      },
    ],
  },
  jpm: {
    instrumentId: 'jpm',
    category: 'International',
    role: 'Correspondent',
    downtimesToday: 1,
    downtimeDuration: '4hrs 12mins',
    metricsFrom: '26 Jul, 00:00',
    infoBanner: 'USD wire window latency elevated - no ACH fallback attempted this week.',
    ongoing: {
      title: 'Ongoing High Severity Downtime',
      startedAt: '26 Jul, 05:48',
    },
    pastIncidents: [
      {
        id: 'jpm-1',
        rangeLabel: '18 Jul 22:00 to 19 Jul 02:15 (4hrs 15mins)',
        severity: 'High Severity',
      },
    ],
  },
}

export function getEcosystemDowntimeDetail(
  item: EcosystemInstrument,
  columnTitle: string,
  groupTitle: string,
): EcosystemDowntimeDetail {
  const known = ECOSYSTEM_DOWNTIME_DETAILS[item.id]
  if (known) return known
  return {
    instrumentId: item.id,
    category: columnTitle,
    role: groupTitle,
    downtimesToday: 1,
    downtimeDuration: '-',
    metricsFrom: '26 Jul, 00:00',
    infoBanner: `No payments were attempted via ${item.name} (${columnTitle}) in the past one week.`,
    ongoing: {
      title: 'Ongoing High Severity Downtime',
      startedAt: item.note ?? 'Recently',
    },
    pastIncidents: [],
  }
}

/** Resolve local logo path; tries png then svg. */
export function ecosystemLogoSrc(logo?: string): string | undefined {
  if (!logo) return undefined
  return `/ecosystem/logos/${logo}.png`
}

export function ecosystemLogoFallbackSrc(logo?: string): string | undefined {
  if (!logo) return undefined
  return `/ecosystem/logos/${logo}.svg`
}

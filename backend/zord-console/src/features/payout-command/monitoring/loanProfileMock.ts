import {
  POST_DISBURSAL_MONITORING_MOCK,
  type LoanMonitoringRow,
} from './postDisbursalMonitoringMock'

export type EmiHistoryEntry = {
  month: string
  status: 'Paid' | 'Bounced' | 'Due' | 'Upcoming'
}

export type RiskEvent = {
  time: string
  label: string
  severity: 'high' | 'medium' | 'low'
}

export type LinkedAccount = {
  label: string
  note: string
  risky: boolean
}

export type LoanProfile = {
  loanId: string
  borrowerName: string
  initials: string
  amountInr: number
  dpd: number
  rail: LoanMonitoringRow['rail']
  region: string
  status: LoanMonitoringRow['status']
  riskSignal: LoanMonitoringRow['riskSignal']
  nextAction: LoanMonitoringRow['nextAction']
  disbursal: {
    utr: string
    rail: string
    sentAt: string
    confirmedAt: string | null
    bankLine: string
  }
  emiInr: number
  emiDay: number
  emiHistory: EmiHistoryEntry[]
  riskEvents: RiskEvent[]
  linkedAccounts: LinkedAccount[]
}

const EMI_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] as const

const BANK_LINES = [
  'HDFC Bank ···· 4521 · IFSC HDFC0001234',
  'ICICI Bank ···· 9871 · IFSC ICIC0000871',
  'State Bank of India ···· 1234 · IFSC SBIN0004521',
  'Axis Bank ···· 7891 · IFSC UTIB0000789',
  'Kotak Mahindra Bank ···· 3318 · IFSC KKBK0000661',
  'Punjab National Bank ···· 2210 · IFSC PUNB0244200',
] as const

function hashId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 1_000_003
  }
  return hash
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function buildEmiHistory(row: LoanMonitoringRow): EmiHistoryEntry[] {
  // Months of history scale with how deep into delinquency the loan is.
  return EMI_MONTHS.map((month, idx) => {
    if (row.confirmed === 'Pending') return { month, status: idx === 0 ? 'Upcoming' : 'Upcoming' }
    if (row.dpd === 0) return { month, status: idx === EMI_MONTHS.length - 1 ? 'Due' : 'Paid' }
    const bouncedMonths = Math.min(Math.ceil(row.dpd / 30), 3)
    const firstBounced = EMI_MONTHS.length - bouncedMonths
    if (idx >= firstBounced) return { month, status: 'Bounced' }
    return { month, status: 'Paid' }
  })
}

function buildRiskEvents(row: LoanMonitoringRow): RiskEvent[] {
  const events: RiskEvent[] = [
    { time: 'Day 0', label: `Disbursed ${formatLakh(row.amountInr)} via ${row.rail === 'NEFT' ? 'NEFT' : 'IMPS'}`, severity: 'low' },
  ]
  if (row.confirmed === 'Pending') {
    events.push({ time: 'Day 0', label: 'Awaiting bank credit confirmation (UTR issued)', severity: 'medium' })
    return events
  }
  events.push({ time: 'Day 0', label: 'Bank credit confirmed by beneficiary bank', severity: 'low' })
  if (row.riskSignal === 'Instant withdrawal') {
    events.push({ time: 'Day 0', label: 'Full disbursal withdrawn within 2 hours of credit', severity: 'high' })
  }
  if (row.riskSignal === 'Dormant') {
    events.push({ time: `Day ${Math.max(7, row.dpd - 7)}`, label: 'Account dormant — no inbound credits since disbursal', severity: 'medium' })
  }
  if (row.riskSignal === 'Linked + Circular') {
    events.push({ time: 'Day 3', label: 'Shared device detected across linked accounts', severity: 'high' })
    events.push({ time: 'Day 5', label: 'Circular transfer pattern flagged by graph engine', severity: 'high' })
  }
  if (row.riskSignal === 'Device risk') {
    events.push({ time: 'Day 12', label: 'Login from device seen on 1 other active loan', severity: 'low' })
  }
  if (row.emiStatus === 'Bounced') {
    events.push({ time: `Day ${30 - (row.dpd % 30 || 30) + row.dpd}`, label: 'eNACH presentation bounced — insufficient funds', severity: 'medium' })
  }
  if (row.dpd > 90) {
    events.push({ time: `Day ${row.dpd}`, label: 'Crossed 90 DPD — classified NPA per RBI norms', severity: 'high' })
  } else if (row.dpd > 60) {
    events.push({ time: `Day ${row.dpd}`, label: 'Rolled into SMA-2 (61–90 DPD)', severity: 'high' })
  } else if (row.dpd > 30) {
    events.push({ time: `Day ${row.dpd}`, label: 'Rolled into SMA-1 (31–60 DPD)', severity: 'medium' })
  }
  return events
}

function buildLinkedAccounts(row: LoanMonitoringRow, seed: number): LinkedAccount[] {
  const primary: LinkedAccount = {
    label: BANK_LINES[seed % BANK_LINES.length],
    note: 'Disbursal account (penny-drop verified)',
    risky: false,
  }
  if (row.riskSignal === 'Linked + Circular') {
    return [
      primary,
      { label: BANK_LINES[(seed + 1) % BANK_LINES.length], note: 'Shared device fingerprint', risky: true },
      { label: BANK_LINES[(seed + 2) % BANK_LINES.length], note: 'Receives circular transfers', risky: true },
    ]
  }
  if (row.riskSignal === 'Device risk') {
    return [primary, { label: BANK_LINES[(seed + 3) % BANK_LINES.length], note: 'Device overlap with another loan', risky: true }]
  }
  return [primary]
}

function formatLakh(amountInr: number): string {
  const lakh = amountInr / 100_000
  return `₹${Number.isInteger(lakh) ? lakh.toFixed(0) : lakh.toFixed(1)}L`
}

export function getLoanProfile(loanId: string): LoanProfile | null {
  const row = POST_DISBURSAL_MONITORING_MOCK.queueRows.find((r) => r.loanId === loanId)
  if (!row) return null

  const seed = hashId(row.loanId)
  const emi = Math.round(row.amountInr / 22 / 100) * 100

  return {
    loanId: row.loanId,
    borrowerName: row.borrowerName,
    initials: initialsOf(row.borrowerName),
    amountInr: row.amountInr,
    dpd: row.dpd,
    rail: row.rail,
    region: row.region,
    status: row.status,
    riskSignal: row.riskSignal,
    nextAction: row.nextAction,
    disbursal: {
      utr: `UTR${String(202612000000 + seed).slice(0, 12)}`,
      rail: row.amountInr >= 200000 ? 'NEFT' : 'IMPS',
      sentAt: '02 Jun 2026, 11:42 IST',
      confirmedAt: row.confirmed === 'Yes' ? '02 Jun 2026, 11:47 IST' : null,
      bankLine: BANK_LINES[seed % BANK_LINES.length],
    },
    emiInr: emi,
    emiDay: 5,
    emiHistory: buildEmiHistory(row),
    riskEvents: buildRiskEvents(row),
    linkedAccounts: buildLinkedAccounts(row, seed),
  }
}

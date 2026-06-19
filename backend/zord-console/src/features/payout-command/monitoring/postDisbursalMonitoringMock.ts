export type MonitoringQueueStatus = 'Confirmed' | 'Pending' | 'At risk'
export type EmiStatus = 'Paid' | 'Due' | 'Bounced' | 'N/A'
export type RepaymentRail = 'eNACH' | 'UPI Autopay' | 'NEFT'
export type RiskSignalKind =
  | 'None'
  | 'Dormant'
  | 'Linked + Circular'
  | 'Device risk'
  | 'Instant withdrawal'
export type NextAction =
  | '—'
  | 'Auto-debit retry'
  | 'Tele-calling'
  | 'Field visit'
  | 'Legal notice'
  | 'Awaiting confirmation'
  | 'Watchlist'

export type LoanMonitoringRow = {
  loanId: string
  borrowerName: string
  amountInr: number
  /** Days past due. 0 = current. */
  dpd: number
  rail: RepaymentRail
  emiStatus: EmiStatus
  riskSignal: RiskSignalKind
  region: string
  nextAction: NextAction
  lastEventAt: string
  confirmed: 'Yes' | 'Pending'
  evidence: 'Complete' | 'Partial'
  status: MonitoringQueueStatus
}

export type DpdBucket = {
  /** RBI classification label. */
  label: 'Current' | 'SMA-0' | 'SMA-1' | 'SMA-2' | 'NPA'
  range: string
  amountCr: number
  loans: number
  tone: 'green' | 'lime' | 'amber' | 'orange' | 'red'
}

export type RollRate = {
  from: DpdBucket['label']
  to: DpdBucket['label']
  pct: number
}

export type MonitoringAlert = {
  time: string
  loanId: string
  label: string
  severity: 'high' | 'medium' | 'low'
}

export type ConnectionNode = {
  id: string
  label: string
  type: 'borrower' | 'account' | 'counterparty'
  risk?: string
}

export type ConnectionEdge = {
  from: string
  to: string
  label?: string
}

export type ConnectionCluster = {
  id: string
  title: string
  riskLabel: string
  nodes: ConnectionNode[]
  edges: ConnectionEdge[]
}

type BreakdownMetric = {
  label: string
  value: string
  tone?: 'good' | 'warn' | 'bad' | 'neutral'
}

type BreakdownCard = {
  title: string
  metrics: BreakdownMetric[]
}

type RiskRow = {
  label: string
  value: number
  tone: 'red' | 'amber'
}

const queueRows: LoanMonitoringRow[] = [
  { loanId: 'L-1001', borrowerName: 'Ananya Sharma', amountInr: 250000, dpd: 0, rail: 'eNACH', emiStatus: 'Paid', riskSignal: 'None', region: 'Mumbai', nextAction: '—', lastEventAt: '2h ago', confirmed: 'Yes', evidence: 'Complete', status: 'Confirmed' },
  { loanId: 'L-1004', borrowerName: 'Nita Rao', amountInr: 120000, dpd: 0, rail: 'UPI Autopay', emiStatus: 'Paid', riskSignal: 'None', region: 'Bengaluru', nextAction: '—', lastEventAt: '4h ago', confirmed: 'Yes', evidence: 'Complete', status: 'Confirmed' },
  { loanId: 'L-1009', borrowerName: 'Amit Bansal', amountInr: 600000, dpd: 12, rail: 'eNACH', emiStatus: 'Bounced', riskSignal: 'Instant withdrawal', region: 'Delhi', nextAction: 'Auto-debit retry', lastEventAt: '1d ago', confirmed: 'Yes', evidence: 'Complete', status: 'At risk' },
  { loanId: 'L-1012', borrowerName: 'Kavita Joshi', amountInr: 60000, dpd: 0, rail: 'UPI Autopay', emiStatus: 'Paid', riskSignal: 'None', region: 'Nagpur', nextAction: '—', lastEventAt: '6h ago', confirmed: 'Yes', evidence: 'Complete', status: 'Confirmed' },
  { loanId: 'L-1017', borrowerName: 'Rohan Mehta', amountInr: 4500000, dpd: 0, rail: 'eNACH', emiStatus: 'Paid', riskSignal: 'None', region: 'Mumbai', nextAction: '—', lastEventAt: '1d ago', confirmed: 'Yes', evidence: 'Complete', status: 'Confirmed' },
  { loanId: 'L-1020', borrowerName: 'Sneha Kulkarni', amountInr: 320000, dpd: 6, rail: 'eNACH', emiStatus: 'Due', riskSignal: 'None', region: 'Pune', nextAction: 'Auto-debit retry', lastEventAt: '5h ago', confirmed: 'Yes', evidence: 'Complete', status: 'At risk' },
  { loanId: 'L-1023', borrowerName: 'Ravi Kumar', amountInr: 200000, dpd: 34, rail: 'eNACH', emiStatus: 'Bounced', riskSignal: 'Dormant', region: 'Pune', nextAction: 'Tele-calling', lastEventAt: '3d ago', confirmed: 'Yes', evidence: 'Partial', status: 'At risk' },
  { loanId: 'L-1027', borrowerName: 'Vikram Singh', amountInr: 1200000, dpd: 0, rail: 'eNACH', emiStatus: 'Paid', riskSignal: 'None', region: 'Chandigarh', nextAction: '—', lastEventAt: '8h ago', confirmed: 'Yes', evidence: 'Complete', status: 'Confirmed' },
  { loanId: 'L-1031', borrowerName: 'Divya Nair', amountInr: 180000, dpd: 0, rail: 'UPI Autopay', emiStatus: 'Paid', riskSignal: 'None', region: 'Kochi', nextAction: '—', lastEventAt: '12h ago', confirmed: 'Yes', evidence: 'Complete', status: 'Confirmed' },
  { loanId: 'L-1036', borrowerName: 'Arjun Reddy', amountInr: 85000, dpd: 28, rail: 'UPI Autopay', emiStatus: 'Bounced', riskSignal: 'Dormant', region: 'Hyderabad', nextAction: 'Tele-calling', lastEventAt: '2d ago', confirmed: 'Yes', evidence: 'Partial', status: 'At risk' },
  { loanId: 'L-1042', borrowerName: 'Farhan Khan', amountInr: 220000, dpd: 0, rail: 'eNACH', emiStatus: 'Paid', riskSignal: 'None', region: 'Lucknow', nextAction: '—', lastEventAt: '9h ago', confirmed: 'Yes', evidence: 'Complete', status: 'Confirmed' },
  { loanId: 'L-1045', borrowerName: 'Manish Gupta', amountInr: 7500000, dpd: 0, rail: 'NEFT', emiStatus: 'N/A', riskSignal: 'None', region: 'Delhi', nextAction: 'Awaiting confirmation', lastEventAt: '30m ago', confirmed: 'Pending', evidence: 'Partial', status: 'Pending' },
  { loanId: 'L-1051', borrowerName: 'Ritu Agarwal', amountInr: 280000, dpd: 67, rail: 'eNACH', emiStatus: 'Bounced', riskSignal: 'Instant withdrawal', region: 'Kolkata', nextAction: 'Legal notice', lastEventAt: '4d ago', confirmed: 'Yes', evidence: 'Partial', status: 'At risk' },
  { loanId: 'L-1058', borrowerName: 'Sanjay Patil', amountInr: 70000, dpd: 9, rail: 'eNACH', emiStatus: 'Due', riskSignal: 'None', region: 'Nashik', nextAction: 'Auto-debit retry', lastEventAt: '1d ago', confirmed: 'Yes', evidence: 'Complete', status: 'At risk' },
  { loanId: 'L-1064', borrowerName: 'Neha Verma', amountInr: 350000, dpd: 0, rail: 'eNACH', emiStatus: 'Paid', riskSignal: 'None', region: 'Indore', nextAction: '—', lastEventAt: '11h ago', confirmed: 'Yes', evidence: 'Complete', status: 'Confirmed' },
  { loanId: 'L-1072', borrowerName: 'Imran Sheikh', amountInr: 850000, dpd: 96, rail: 'eNACH', emiStatus: 'Bounced', riskSignal: 'Linked + Circular', region: 'Bhopal', nextAction: 'Legal notice', lastEventAt: '6d ago', confirmed: 'Yes', evidence: 'Partial', status: 'At risk' },
  { loanId: 'L-1079', borrowerName: 'Lakshmi Iyer', amountInr: 150000, dpd: 0, rail: 'UPI Autopay', emiStatus: 'Paid', riskSignal: 'None', region: 'Chennai', nextAction: '—', lastEventAt: '7h ago', confirmed: 'Yes', evidence: 'Complete', status: 'Confirmed' },
  { loanId: 'L-1091', borrowerName: 'Meena Pillai', amountInr: 500000, dpd: 0, rail: 'NEFT', emiStatus: 'N/A', riskSignal: 'None', region: 'Kochi', nextAction: 'Awaiting confirmation', lastEventAt: '1h ago', confirmed: 'Pending', evidence: 'Partial', status: 'Pending' },
  { loanId: 'L-1102', borrowerName: 'Suresh Mishra', amountInr: 400000, dpd: 41, rail: 'eNACH', emiStatus: 'Bounced', riskSignal: 'Linked + Circular', region: 'Jaipur', nextAction: 'Field visit', lastEventAt: '40m ago', confirmed: 'Yes', evidence: 'Partial', status: 'At risk' },
  { loanId: 'L-1138', borrowerName: 'Pooja Desai', amountInr: 180000, dpd: 0, rail: 'UPI Autopay', emiStatus: 'Paid', riskSignal: 'Device risk', region: 'Ahmedabad', nextAction: 'Watchlist', lastEventAt: '3h ago', confirmed: 'Yes', evidence: 'Complete', status: 'Confirmed' },
]

const queueCounts = {
  All: 780,
  Confirmed: 693,
  Pending: 40,
  'At risk': 47,
} as const

/** RBI delinquency classification — how a big NBFC risk team reads the book. */
const dpdBuckets: DpdBucket[] = [
  { label: 'Current', range: '0 DPD', amountCr: 34.2, loans: 645, tone: 'green' },
  { label: 'SMA-0', range: '1–30 DPD', amountCr: 4.1, loans: 67, tone: 'lime' },
  { label: 'SMA-1', range: '31–60 DPD', amountCr: 2.2, loans: 38, tone: 'amber' },
  { label: 'SMA-2', range: '61–90 DPD', amountCr: 1.1, loans: 18, tone: 'orange' },
  { label: 'NPA', range: '90+ DPD', amountCr: 0.4, loans: 12, tone: 'red' },
]

const rollRates: RollRate[] = [
  { from: 'Current', to: 'SMA-0', pct: 9 },
  { from: 'SMA-0', to: 'SMA-1', pct: 18 },
  { from: 'SMA-1', to: 'SMA-2', pct: 31 },
  { from: 'SMA-2', to: 'NPA', pct: 22 },
]

const enach = {
  presentations: 612,
  bounced: 72,
  bounceRatePct: 11.8,
  retrySuccessPct: 64,
  nextPresentationCycle: '5 Jul',
  bounceReasons: [
    { label: 'Insufficient funds', value: 46, tone: 'amber' as const },
    { label: 'Mandate cancelled', value: 12, tone: 'red' as const },
    { label: 'Technical decline', value: 9, tone: 'amber' as const },
    { label: 'Account frozen', value: 5, tone: 'red' as const },
  ],
}

const alerts: MonitoringAlert[] = [
  { time: '10:42', loanId: 'L-1102', label: 'Circular transfer detected — ₹4.1L moved across 3 linked accounts in 40 min', severity: 'high' },
  { time: '10:18', loanId: 'L-1072', label: 'Crossed 90 DPD — auto-classified NPA, legal notice queued', severity: 'high' },
  { time: '09:51', loanId: 'L-1051', label: 'Full disbursal withdrawn within 2 hours of credit', severity: 'high' },
  { time: '09:15', loanId: 'L-1009', label: 'eNACH bounce — insufficient funds, retry scheduled for tomorrow 6am', severity: 'medium' },
  { time: '08:47', loanId: 'L-1036', label: 'Account dormant 28 days — no inbound credits since disbursal', severity: 'medium' },
  { time: '08:02', loanId: 'L-1138', label: 'Login from new device — matches device seen on 1 other active loan', severity: 'low' },
]

const summaryCards = [
  { label: 'Total disbursed', value: '₹42Cr', sub: '780 loans sent', tone: 'neutral' as const, spark: [36.5, 37.8, 38.6, 39.9, 40.8, 41.4, 42] as const, sparkTone: 'neutral' as const },
  { label: 'Confirmed received', value: '₹38Cr', sub: '92% confirmed', tone: 'good' as const, spark: [33, 34.2, 35, 36.1, 36.9, 37.6, 38] as const, sparkTone: 'good' as const },
  { label: 'At risk', value: '₹3.8Cr', sub: '67 accounts', tone: 'bad' as const, spark: [2.6, 2.8, 3.0, 3.1, 3.4, 3.6, 3.8] as const, sparkTone: 'bad' as const },
  { label: 'Recovered', value: '₹1.2Cr', sub: 'from at-risk pool', tone: 'good' as const, spark: [0.5, 0.6, 0.7, 0.85, 0.95, 1.1, 1.2] as const, sparkTone: 'good' as const },
  { label: 'On-time repayment', value: '68%', sub: 'this presentation cycle', tone: 'warn' as const, spark: [80, 78, 77, 75, 72, 70, 68] as const, sparkTone: 'warn' as const },
] as const

const checkBreakdownCards: BreakdownCard[] = [
  {
    title: 'Loan disbursal status',
    metrics: [
      { label: 'Total sent', value: '₹42Cr' },
      { label: 'Confirmed', value: '₹38Cr', tone: 'good' },
      { label: 'Pending confirm', value: '₹3.2Cr', tone: 'warn' },
      { label: 'Confirmation rate', value: '92%' },
    ],
  },
  {
    title: 'Repayment health',
    metrics: [
      { label: 'Due this cycle', value: '₹5.4Cr' },
      { label: 'Received', value: '₹3.1Cr', tone: 'good' },
      { label: 'On-time rate', value: '68%', tone: 'warn' },
      { label: 'eNACH bounce rate', value: '11.8%', tone: 'bad' },
    ],
  },
  {
    title: 'Suspicious activity',
    metrics: [
      { label: 'Dormant accounts', value: '22', tone: 'warn' },
      { label: 'Instant withdrawals', value: '18', tone: 'bad' },
      { label: 'Linked accounts', value: '11', tone: 'bad' },
      { label: 'Circular transfers', value: '7', tone: 'bad' },
    ],
  },
  {
    title: 'Evidence readiness',
    metrics: [
      { label: 'Complete', value: '720', tone: 'good' },
      { label: 'Partial', value: '85', tone: 'warn' },
      { label: 'Missing', value: '12', tone: 'bad' },
      { label: 'Dispute ready', value: '89%' },
    ],
  },
]

/** Razorpay-style settlement cascade: stage → amount → conversion vs sent. */
const moneyFlow = [
  { label: 'Sent', amountCr: 42, pct: 100, tone: 'blue' as const },
  { label: 'Confirmed', amountCr: 38, pct: 90.5, tone: 'green' as const },
  { label: 'Pending confirm', amountCr: 3.2, pct: 7.6, tone: 'amber' as const },
  { label: 'At risk', amountCr: 3.8, pct: 9, tone: 'red' as const },
  { label: 'Recovered', amountCr: 1.2, pct: 2.9, tone: 'olive' as const },
]

const suspiciousBehavior: RiskRow[] = [
  { label: 'Dormant account', value: 22, tone: 'amber' },
  { label: 'Instant withdrawal', value: 18, tone: 'red' },
  { label: 'Linked accounts', value: 11, tone: 'amber' },
  { label: 'Circular transfers', value: 7, tone: 'red' },
]

/** 12-week on-time repayment series with portfolio baseline. */
const repaymentTrend = {
  baselinePct: 80,
  weeks: [
    { label: 'W1', pct: 84 },
    { label: 'W2', pct: 86 },
    { label: 'W3', pct: 85 },
    { label: 'W4', pct: 83 },
    { label: 'W5', pct: 82 },
    { label: 'W6', pct: 80 },
    { label: 'W7', pct: 78 },
    { label: 'W8', pct: 77 },
    { label: 'W9', pct: 75 },
    { label: 'W10', pct: 72 },
    { label: 'W11', pct: 70 },
    { label: 'W12', pct: 68 },
  ],
}

const connectionClusters: ConnectionCluster[] = [
  {
    id: 'cluster-1',
    title: 'Cluster 1 — L-1102 (Suresh Mishra)',
    riskLabel: 'Shared device + circular transfers across 3 accounts',
    nodes: [
      { id: 'b1', label: 'Suresh Mishra · L-1102', type: 'borrower', risk: '41 DPD' },
      { id: 'a1', label: 'SBI ····1234', type: 'account', risk: 'Disbursal account' },
      { id: 'a2', label: 'ICICI ····9871', type: 'account', risk: 'Shared device' },
      { id: 'a3', label: 'Axis ····7891', type: 'account', risk: 'Circular transfers' },
    ],
    edges: [
      { from: 'b1', to: 'a1', label: 'disbursed ₹4L' },
      { from: 'a1', to: 'a2', label: '₹2.1L in 12 min' },
      { from: 'a2', to: 'a3', label: '₹2.0L same day' },
      { from: 'a3', to: 'a1', label: '₹1.9L returned' },
    ],
  },
  {
    id: 'cluster-2',
    title: 'Cluster 2 — L-1072 (Imran Sheikh)',
    riskLabel: 'Funds routed to common counterparty seen on 2 NPA loans',
    nodes: [
      { id: 'b2', label: 'Imran Sheikh · L-1072', type: 'borrower', risk: '96 DPD · NPA' },
      { id: 'a4', label: 'PNB ····2210', type: 'account', risk: 'Disbursal account' },
      { id: 'c1', label: 'Counterparty K. Traders', type: 'counterparty', risk: 'Seen on 2 NPA loans' },
    ],
    edges: [
      { from: 'b2', to: 'a4', label: 'disbursed ₹8.5L' },
      { from: 'a4', to: 'c1', label: '₹7.9L in 3 tranches' },
    ],
  },
]

export const POST_DISBURSAL_MONITORING_MOCK = {
  header: {
    title: 'Post-Disbursal Monitoring',
    statusPill: 'Live',
  },
  summaryCards,
  checkBreakdownCards,
  dpdBuckets,
  rollRates,
  enach,
  alerts,
  moneyFlow,
  suspiciousBehavior,
  repaymentTrend,
  connectionClusters,
  queueCounts,
  queueRows,
}

export type BorrowerQueueStatus = 'Safe' | 'Review' | 'Blocked' | 'Rejected'
export type SignalLevel = 'pass' | 'warn' | 'fail'
export type LoanProduct = 'Personal loan' | 'Business loan' | 'LAP' | 'Two-wheeler'
export type VerificationStage =
  | 'Completed'
  | 'Doc check'
  | 'Aadhaar XML'
  | 'Liveness'
  | 'CKYC pull'
  | 'Penny-drop'
  | 'AML screen'
  | 'Fraud screen'

export type BorrowerQueueRow = {
  borrowerId: string
  borrowerName: string
  product: LoanProduct
  loanAmountInr: number
  kyc: SignalLevel
  bank: SignalLevel
  fraud: SignalLevel
  aml: SignalLevel
  /** 0 = clean, 100 = certain fraud. */
  riskScore: number
  /** Minutes left on the review SLA. Null when verification is complete / terminal. */
  slaMinutes: number | null
  stage: VerificationStage
  failReason?: string
  status: BorrowerQueueStatus
  source: 'Sumsub' | 'Manual'
}

export type VerificationInsight = {
  severity: 'high' | 'medium' | 'low'
  title: string
  detail: string
  caseCount?: number
}

type BorrowerQueueBucket = {
  status: BorrowerQueueStatus
  count: number
  rows: BorrowerQueueRow[]
}

type FunnelStep = {
  label: string
  count: number
}

type RiskSignal = {
  label: string
  value: number
}

const TOTAL_BORROWERS = 910

const borrowerVerification = {
  verified: 842,
  highRisk: 21,
  rejected: 9,
}

const bankAccount = {
  verified: 780,
  nameMismatch: 18,
  verifyFailed: 9,
  pennyDropOk: 771,
}

const fraudRisk = {
  amlAlerts: 6,
  deviceRisk: 14,
  duplicates: 11,
  deepfakeSignal: 3,
}

const proofReadiness = {
  ready: 780,
  awaitingConfirm: 40,
  missingProof: 12,
}

const queueBuckets: BorrowerQueueBucket[] = [
  {
    status: 'Safe',
    count: 780,
    rows: [
      { borrowerId: 'R-1001', borrowerName: 'Ananya Sharma', product: 'Personal loan', loanAmountInr: 250000, kyc: 'pass', bank: 'pass', fraud: 'pass', aml: 'pass', riskScore: 12, slaMinutes: null, stage: 'Completed', status: 'Safe', source: 'Sumsub' },
      { borrowerId: 'R-1004', borrowerName: 'Nita Rao', product: 'Personal loan', loanAmountInr: 120000, kyc: 'pass', bank: 'pass', fraud: 'pass', aml: 'pass', riskScore: 9, slaMinutes: null, stage: 'Completed', status: 'Safe', source: 'Sumsub' },
      { borrowerId: 'R-1009', borrowerName: 'Amit Bansal', product: 'Business loan', loanAmountInr: 600000, kyc: 'pass', bank: 'pass', fraud: 'pass', aml: 'pass', riskScore: 18, slaMinutes: null, stage: 'Completed', status: 'Safe', source: 'Sumsub' },
      { borrowerId: 'R-1012', borrowerName: 'Kavita Joshi', product: 'Two-wheeler', loanAmountInr: 60000, kyc: 'pass', bank: 'pass', fraud: 'pass', aml: 'pass', riskScore: 8, slaMinutes: null, stage: 'Completed', status: 'Safe', source: 'Sumsub' },
      { borrowerId: 'R-1017', borrowerName: 'Rohan Mehta', product: 'LAP', loanAmountInr: 4500000, kyc: 'pass', bank: 'pass', fraud: 'pass', aml: 'pass', riskScore: 22, slaMinutes: null, stage: 'Completed', status: 'Safe', source: 'Sumsub' },
      { borrowerId: 'R-1020', borrowerName: 'Sneha Kulkarni', product: 'Personal loan', loanAmountInr: 320000, kyc: 'pass', bank: 'pass', fraud: 'pass', aml: 'pass', riskScore: 11, slaMinutes: null, stage: 'Completed', status: 'Safe', source: 'Sumsub' },
      { borrowerId: 'R-1027', borrowerName: 'Vikram Singh', product: 'Business loan', loanAmountInr: 1200000, kyc: 'pass', bank: 'pass', fraud: 'pass', aml: 'pass', riskScore: 25, slaMinutes: null, stage: 'Completed', status: 'Safe', source: 'Sumsub' },
      { borrowerId: 'R-1031', borrowerName: 'Divya Nair', product: 'Personal loan', loanAmountInr: 180000, kyc: 'pass', bank: 'pass', fraud: 'pass', aml: 'pass', riskScore: 14, slaMinutes: null, stage: 'Completed', status: 'Safe', source: 'Sumsub' },
      { borrowerId: 'R-1036', borrowerName: 'Arjun Reddy', product: 'Two-wheeler', loanAmountInr: 85000, kyc: 'pass', bank: 'pass', fraud: 'pass', aml: 'pass', riskScore: 10, slaMinutes: null, stage: 'Completed', status: 'Safe', source: 'Sumsub' },
      { borrowerId: 'R-1042', borrowerName: 'Farhan Khan', product: 'Personal loan', loanAmountInr: 220000, kyc: 'pass', bank: 'pass', fraud: 'pass', aml: 'pass', riskScore: 16, slaMinutes: null, stage: 'Completed', status: 'Safe', source: 'Sumsub' },
    ],
  },
  {
    status: 'Review',
    count: 97,
    rows: [
      { borrowerId: 'R-1023', borrowerName: 'Ravi Kumar', product: 'Business loan', loanAmountInr: 200000, kyc: 'pass', bank: 'warn', fraud: 'pass', aml: 'pass', riskScore: 41, slaMinutes: 192, stage: 'Penny-drop', failReason: 'Penny-drop name mismatch (78% match)', status: 'Review', source: 'Sumsub' },
      { borrowerId: 'R-1138', borrowerName: 'Pooja Desai', product: 'Personal loan', loanAmountInr: 180000, kyc: 'pass', bank: 'pass', fraud: 'warn', aml: 'pass', riskScore: 48, slaMinutes: 140, stage: 'Fraud screen', failReason: 'Device shared with 1 other applicant', status: 'Review', source: 'Sumsub' },
      { borrowerId: 'R-1045', borrowerName: 'Manish Gupta', product: 'LAP', loanAmountInr: 7500000, kyc: 'pass', bank: 'warn', fraud: 'pass', aml: 'pass', riskScore: 38, slaMinutes: 360, stage: 'Penny-drop', failReason: 'Awaiting LAP field verification report', status: 'Review', source: 'Sumsub' },
      { borrowerId: 'R-1051', borrowerName: 'Ritu Agarwal', product: 'Personal loan', loanAmountInr: 280000, kyc: 'warn', bank: 'pass', fraud: 'pass', aml: 'pass', riskScore: 44, slaMinutes: 95, stage: 'Aadhaar XML', failReason: 'Aadhaar XML share-code expired', status: 'Review', source: 'Sumsub' },
      { borrowerId: 'R-1058', borrowerName: 'Sanjay Patil', product: 'Two-wheeler', loanAmountInr: 70000, kyc: 'pass', bank: 'warn', fraud: 'pass', aml: 'pass', riskScore: 36, slaMinutes: 210, stage: 'Penny-drop', failReason: 'Account name partial match (82%)', status: 'Review', source: 'Sumsub' },
      { borrowerId: 'R-1064', borrowerName: 'Neha Verma', product: 'Personal loan', loanAmountInr: 350000, kyc: 'pass', bank: 'pass', fraud: 'pass', aml: 'warn', riskScore: 52, slaMinutes: 75, stage: 'AML screen', failReason: 'PEP near-match — manual adjudication', status: 'Review', source: 'Sumsub' },
      { borrowerId: 'R-1072', borrowerName: 'Imran Sheikh', product: 'Business loan', loanAmountInr: 850000, kyc: 'pass', bank: 'pass', fraud: 'warn', aml: 'pass', riskScore: 55, slaMinutes: 160, stage: 'Fraud screen', failReason: 'IP geolocation mismatch with address', status: 'Review', source: 'Sumsub' },
      { borrowerId: 'R-1079', borrowerName: 'Lakshmi Iyer', product: 'Personal loan', loanAmountInr: 150000, kyc: 'warn', bank: 'pass', fraud: 'pass', aml: 'pass', riskScore: 39, slaMinutes: 240, stage: 'Liveness', failReason: 'Low liveness score (0.61) — retake requested', status: 'Review', source: 'Sumsub' },
    ],
  },
  {
    status: 'Blocked',
    count: 21,
    rows: [
      { borrowerId: 'R-1091', borrowerName: 'Meena Pillai', product: 'Personal loan', loanAmountInr: 500000, kyc: 'pass', bank: 'pass', fraud: 'pass', aml: 'fail', riskScore: 78, slaMinutes: 45, stage: 'AML screen', failReason: 'AML alert: sanctions list partial hit', status: 'Blocked', source: 'Sumsub' },
      { borrowerId: 'R-1152', borrowerName: 'Kiran Thakur', product: 'Business loan', loanAmountInr: 320000, kyc: 'fail', bank: 'fail', fraud: 'fail', aml: 'pass', riskScore: 92, slaMinutes: 30, stage: 'Doc check', failReason: 'Document tampering suspected on PAN', status: 'Blocked', source: 'Sumsub' },
      { borrowerId: 'R-1096', borrowerName: 'Deepak Chawla', product: 'Personal loan', loanAmountInr: 420000, kyc: 'pass', bank: 'pass', fraud: 'fail', aml: 'pass', riskScore: 84, slaMinutes: 60, stage: 'Fraud screen', failReason: 'Duplicate identity across 3 applications', status: 'Blocked', source: 'Sumsub' },
      { borrowerId: 'R-1103', borrowerName: 'Asha Menon', product: 'Two-wheeler', loanAmountInr: 55000, kyc: 'pass', bank: 'fail', fraud: 'pass', aml: 'pass', riskScore: 71, slaMinutes: 120, stage: 'Penny-drop', failReason: 'Penny-drop failed — account closed', status: 'Blocked', source: 'Sumsub' },
    ],
  },
  {
    status: 'Rejected',
    count: 12,
    rows: [
      { borrowerId: 'R-1124', borrowerName: 'Suresh Mishra', product: 'Personal loan', loanAmountInr: 400000, kyc: 'fail', bank: 'pass', fraud: 'fail', aml: 'pass', riskScore: 95, slaMinutes: null, stage: 'Doc check', failReason: 'Forged bank statement detected', status: 'Rejected', source: 'Manual' },
      { borrowerId: 'R-1110', borrowerName: 'Geeta Yadav', product: 'Personal loan', loanAmountInr: 110000, kyc: 'fail', bank: 'pass', fraud: 'pass', aml: 'pass', riskScore: 88, slaMinutes: null, stage: 'Liveness', failReason: 'Face match failed (0.32) vs PAN photo', status: 'Rejected', source: 'Manual' },
      { borrowerId: 'R-1117', borrowerName: 'Mohit Saini', product: 'Two-wheeler', loanAmountInr: 48000, kyc: 'pass', bank: 'pass', fraud: 'fail', aml: 'pass', riskScore: 90, slaMinutes: null, stage: 'Liveness', failReason: 'Deepfake signal on liveness video', status: 'Rejected', source: 'Sumsub' },
    ],
  },
]

const riskSignals: RiskSignal[] = [
  { label: 'Name mismatch', value: bankAccount.nameMismatch },
  { label: 'Device risk', value: fraudRisk.deviceRisk },
  { label: 'Duplicate identity', value: fraudRisk.duplicates },
  { label: 'AML alert', value: fraudRisk.amlAlerts },
  { label: 'Deepfake signal', value: fraudRisk.deepfakeSignal },
]

const funnel: FunnelStep[] = [
  { label: 'Applications', count: TOTAL_BORROWERS },
  { label: 'PAN + identity check', count: 880 },
  { label: 'Face + liveness', count: 858 },
  { label: 'Bank penny-drop', count: 830 },
  { label: 'Fraud + AML screen', count: 805 },
  { label: 'Safe to disburse', count: 780 },
]

/** 7-day daily series feeding the Stripe-style area chart + hero sparklines. */
const trend = {
  days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  verificationsProcessed: [118, 134, 126, 141, 156, 149, 162],
  passRatePct: [91.2, 92.0, 91.6, 92.4, 93.1, 92.6, 92.5],
  flagsRaised: [9, 7, 11, 8, 6, 9, 6],
  safeToDisburse: [102, 119, 112, 127, 142, 135, 148],
}

const insights: VerificationInsight[] = [
  {
    severity: 'high',
    title: 'Name-mismatch spike on penny-drop',
    detail: '18 penny-drop name mismatches this week — 11 concentrated on co-operative bank accounts.',
    caseCount: 18,
  },
  {
    severity: 'high',
    title: 'PEP near-matches waiting on adjudication',
    detail: '6 AML/PEP near-match holds have been waiting more than 4 hours for manual review.',
    caseCount: 6,
  },
  {
    severity: 'medium',
    title: 'Aadhaar XML latency up 2.1s',
    detail: 'Aadhaar offline XML verification is running slower since the UIDAI maintenance window.',
  },
  {
    severity: 'medium',
    title: 'Duplicate identity cluster — Pune',
    detail: '3 applications share a device fingerprint and contact number across the Pune branch.',
    caseCount: 3,
  },
  {
    severity: 'low',
    title: 'CKYC hit rate improving',
    detail: 'CKYC registry pull succeeded for 96% of new applicants — up 3pp week over week.',
  },
]

const checkBreakdown = {
  borrowerVerification,
  bankAccount,
  fraudRisk,
  proofReadiness,
}

function percent(value: number, total: number): number {
  if (total <= 0) return 0
  return Number(((value / total) * 100).toFixed(1))
}

const queueCounts = queueBuckets.reduce<Record<'All' | BorrowerQueueStatus, number>>(
  (acc, bucket) => {
    acc[bucket.status] = bucket.count
    acc.All += bucket.count
    return acc
  },
  {
    All: 0,
    Safe: 0,
    Review: 0,
    Blocked: 0,
    Rejected: 0,
  },
)

const queueRows = queueBuckets.flatMap((bucket) => bucket.rows)

const passRate = percent(borrowerVerification.verified, TOTAL_BORROWERS)
const proofCoveragePct = 94

const summary = {
  safeToDisburse: queueCounts.Safe,
  blockedOrReview: queueCounts.All - queueCounts.Safe,
  exposurePreventedLabel: '₹3.2Cr',
  kycPassRate: passRate,
  proofCoveragePct,
}

export const BORROWER_VERIFICATION_MOCK = {
  header: {
    title: 'Borrower Verification Control Center',
    statusPill: 'Live',
    providerPill: 'KYC provider: Sumsub',
    syncLine: 'KYC sync healthy',
    lastPullMinutes: 2,
    manualReviewFallbackBorrowers: 11,
  },
  summary,
  totals: {
    totalBorrowers: queueCounts.All,
  },
  checkBreakdown,
  riskSignals,
  funnel,
  trend,
  insights,
  queueCounts,
  queueRows,
}

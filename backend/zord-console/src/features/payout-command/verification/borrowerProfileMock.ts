import {
  BORROWER_VERIFICATION_MOCK,
  type BorrowerQueueRow,
  type LoanProduct,
  type SignalLevel,
} from './borrowerVerificationMock'

export type DocumentState = 'verified' | 'pending' | 'failed'
export type CheckSource = 'Sumsub' | 'NBFC'

export type BorrowerDocument = {
  kind: 'pan' | 'aadhaar' | 'liveness' | 'bank-statement' | 'sanction-letter' | 'loan-agreement'
  title: string
  state: DocumentState
  /** Primary line on the sample card, e.g. masked PAN. */
  primary: string
  /** Secondary metadata line, e.g. score / period. */
  meta: string
  verifiedBy: CheckSource
}

export type KycCheckEvent = {
  time: string
  label: string
  result: SignalLevel | 'pending'
  source: CheckSource
  note?: string
}

export type ChecklistItem = {
  label: string
  state: 'done' | 'pending' | 'na'
  note?: string
}

export type BorrowerProfile = {
  borrowerId: string
  name: string
  initials: string
  product: LoanProduct
  loanAmountInr: number
  tenureMonths: number
  interestRatePct: number
  emiInr: number
  emiDay: number
  status: BorrowerQueueRow['status']
  riskScore: number
  failReason?: string
  documents: BorrowerDocument[]
  bank: {
    bankName: string
    maskedAccount: string
    ifsc: string
    pennyDropMatchPct: number
    mandateStatus: 'Registered' | 'Pending' | 'Bounced'
  }
  timeline: KycCheckEvent[]
  sumsubChecks: ChecklistItem[]
  nbfcChecks: ChecklistItem[]
}

const BANKS = [
  { name: 'HDFC Bank', ifsc: 'HDFC0001234' },
  { name: 'ICICI Bank', ifsc: 'ICIC0000871' },
  { name: 'State Bank of India', ifsc: 'SBIN0004521' },
  { name: 'Axis Bank', ifsc: 'UTIB0000789' },
  { name: 'Kotak Mahindra Bank', ifsc: 'KKBK0000661' },
  { name: 'Punjab National Bank', ifsc: 'PUNB0244200' },
] as const

const PRODUCT_TERMS: Record<LoanProduct, { tenureMonths: number; interestRatePct: number }> = {
  'Two-wheeler': { tenureMonths: 18, interestRatePct: 16 },
  'Personal loan': { tenureMonths: 24, interestRatePct: 18 },
  'Business loan': { tenureMonths: 36, interestRatePct: 17 },
  LAP: { tenureMonths: 120, interestRatePct: 11 },
}

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

function computeEmi(principal: number, annualRatePct: number, months: number): number {
  const r = annualRatePct / 12 / 100
  const factor = Math.pow(1 + r, months)
  return Math.round((principal * r * factor) / (factor - 1))
}

function docStateFor(level: SignalLevel): DocumentState {
  if (level === 'pass') return 'verified'
  if (level === 'warn') return 'pending'
  return 'failed'
}

function buildDocuments(row: BorrowerQueueRow, seed: number): BorrowerDocument[] {
  const panState = docStateFor(row.kyc)
  const livenessScore = row.kyc === 'pass' ? 0.9 + (seed % 9) / 100 : row.kyc === 'warn' ? 0.61 : 0.32
  const ocrScore = row.kyc === 'pass' ? 98 + (seed % 2) : row.kyc === 'warn' ? 87 : 54
  const isTerminalSafe = row.status === 'Safe'
  return [
    {
      kind: 'pan',
      title: 'PAN card',
      state: panState,
      primary: `${'ABCDE'[seed % 5]}${'FGHJK'[(seed >> 2) % 5]}•PD••••${'ABCDE'[(seed >> 4) % 5]}`,
      meta: `OCR match ${ocrScore}.${seed % 10}%`,
      verifiedBy: 'Sumsub',
    },
    {
      kind: 'aadhaar',
      title: 'Aadhaar offline XML',
      state: row.stage === 'Aadhaar XML' ? 'pending' : panState,
      primary: `•••• •••• ${String(4000 + (seed % 6000)).slice(0, 4)}`,
      meta: row.stage === 'Aadhaar XML' ? 'Share-code expired — re-requested' : 'Share-code verified',
      verifiedBy: 'Sumsub',
    },
    {
      kind: 'liveness',
      title: 'Selfie liveness',
      state: row.stage === 'Liveness' ? 'pending' : docStateFor(row.kyc === 'fail' ? 'fail' : row.fraud === 'fail' ? 'fail' : 'pass'),
      primary: `Score ${livenessScore.toFixed(2)}`,
      meta: row.fraud === 'fail' ? 'Deepfake signal flagged' : 'Active + passive checks',
      verifiedBy: 'Sumsub',
    },
    {
      kind: 'bank-statement',
      title: 'Bank statement',
      state: docStateFor(row.bank),
      primary: '6 months parsed',
      meta: `Avg balance ₹${(((seed % 80) + 18) * 1000).toLocaleString('en-IN')}`,
      verifiedBy: 'NBFC',
    },
    {
      kind: 'sanction-letter',
      title: 'Sanction letter',
      state: isTerminalSafe ? 'verified' : 'pending',
      primary: isTerminalSafe ? 'Issued' : 'Awaiting clearance',
      meta: isTerminalSafe ? 'Auto-generated on approval' : 'Blocked on verification',
      verifiedBy: 'NBFC',
    },
    {
      kind: 'loan-agreement',
      title: 'Loan agreement',
      state: isTerminalSafe ? 'verified' : 'pending',
      primary: isTerminalSafe ? 'e-signed' : 'Not sent',
      meta: isTerminalSafe ? 'Aadhaar eSign complete' : 'Pending sanction',
      verifiedBy: 'NBFC',
    },
  ]
}

function buildTimeline(row: BorrowerQueueRow): KycCheckEvent[] {
  const base: KycCheckEvent[] = [
    { time: '09:58', label: 'Document OCR (PAN)', result: row.kyc === 'fail' && row.stage === 'Doc check' ? 'fail' : 'pass', source: 'Sumsub' },
    { time: '09:59', label: 'Face match vs PAN photo', result: row.kyc === 'fail' && row.stage === 'Liveness' ? 'fail' : 'pass', source: 'Sumsub' },
    {
      time: '10:00',
      label: 'Liveness check',
      result: row.stage === 'Liveness' ? (row.status === 'Rejected' ? 'fail' : 'warn') : row.fraud === 'fail' ? 'fail' : 'pass',
      source: 'Sumsub',
    },
    {
      time: '10:01',
      label: 'AML / PEP / sanctions screen',
      result: row.aml,
      source: 'Sumsub',
      note: row.aml !== 'pass' ? row.failReason : undefined,
    },
    {
      time: '10:02',
      label: 'Aadhaar offline XML verify',
      result: row.stage === 'Aadhaar XML' ? 'warn' : 'pass',
      source: 'Sumsub',
    },
    { time: '10:03', label: 'CKYC registry pull', result: 'pass', source: 'NBFC' },
    {
      time: '10:05',
      label: 'Penny-drop bank verify',
      result: row.bank,
      source: 'NBFC',
      note: row.bank !== 'pass' ? row.failReason : undefined,
    },
    {
      time: '10:07',
      label: 'Device + fraud screen',
      result: row.fraud,
      source: 'NBFC',
      note: row.fraud !== 'pass' ? row.failReason : undefined,
    },
    {
      time: '10:09',
      label: 'eNACH mandate registration',
      result: row.status === 'Safe' ? 'pass' : 'pending',
      source: 'NBFC',
    },
  ]
  return base
}

function checklistState(level: SignalLevel): ChecklistItem['state'] {
  return level === 'pass' ? 'done' : 'pending'
}

export function getBorrowerProfile(borrowerId: string): BorrowerProfile | null {
  const row = BORROWER_VERIFICATION_MOCK.queueRows.find((r) => r.borrowerId === borrowerId)
  if (!row) return null

  const seed = hashId(row.borrowerId)
  const bank = BANKS[seed % BANKS.length]
  const terms = PRODUCT_TERMS[row.product]
  const emi = computeEmi(row.loanAmountInr, terms.interestRatePct, terms.tenureMonths)
  const pennyDropMatchPct = row.bank === 'pass' ? 100 : row.bank === 'warn' ? 78 + (seed % 8) : 0

  return {
    borrowerId: row.borrowerId,
    name: row.borrowerName,
    initials: initialsOf(row.borrowerName),
    product: row.product,
    loanAmountInr: row.loanAmountInr,
    tenureMonths: terms.tenureMonths,
    interestRatePct: terms.interestRatePct,
    emiInr: emi,
    emiDay: 5,
    status: row.status,
    riskScore: row.riskScore,
    failReason: row.failReason,
    documents: buildDocuments(row, seed),
    bank: {
      bankName: bank.name,
      maskedAccount: `···· ${String(1000 + (seed % 9000)).slice(0, 4)}`,
      ifsc: bank.ifsc,
      pennyDropMatchPct,
      mandateStatus: row.status === 'Safe' ? 'Registered' : row.bank === 'fail' ? 'Bounced' : 'Pending',
    },
    timeline: buildTimeline(row),
    sumsubChecks: [
      { label: 'ID document authenticity', state: row.kyc === 'fail' ? 'pending' : 'done' },
      { label: 'Face match', state: checklistState(row.kyc) },
      { label: 'Liveness detection', state: row.fraud === 'fail' ? 'pending' : checklistState(row.kyc) },
      { label: 'AML / PEP / sanctions', state: checklistState(row.aml) },
    ],
    nbfcChecks: [
      { label: 'Penny-drop bank verify', state: checklistState(row.bank), note: pennyDropMatchPct > 0 ? `${pennyDropMatchPct}% name match` : 'Failed' },
      { label: 'CKYC registry pull', state: 'done' },
      { label: 'CIBIL bureau pull', state: 'done', note: `Score ${680 + (seed % 120)}` },
      { label: 'eNACH mandate', state: row.status === 'Safe' ? 'done' : 'pending' },
      {
        label: 'Field verification',
        state: row.product === 'LAP' ? (row.status === 'Safe' ? 'done' : 'pending') : 'na',
        note: row.product === 'LAP' ? 'Required for LAP' : 'Not required',
      },
    ],
  }
}

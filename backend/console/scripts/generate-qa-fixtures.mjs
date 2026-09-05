import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const outDir = path.resolve(__dirname, '../../../functional-tests/test-data')

const intentHeaders = [
  'schema_version',
  'intent_type',
  'client_batch_ref',
  'client_payout_ref',
  'amount.value',
  'amount.currency',
  'beneficiary.name',
  'account_number',
  'beneficiary.instrument.kind',
  'beneficiary.instrument.ifsc',
  'beneficiary.instrument.vpa',
  'beneficiary.country',
  'remitter.customer_id',
  'remitter.phone',
  'remitter.email',
  'purpose_code',
  'provider_hint',
  'intended_execution_at',
  'idempotency_key',
  'source',
  'source_system',
  'constraints.execution_window',
]

const settlementHeaders = [
  'transaction_entity',
  'entity_id',
  'amount',
  'currency',
  'fee (exclusive tax)',
  'tax',
  'debit',
  'credit',
  'payment_method',
  'card_type',
  'issuer_name',
  'entity_created_at',
  'payment_captured_at',
  'payment_notes',
  'refund_notes',
  'arn',
  'entity_description',
  'order_id',
  'order_receipt',
  'order_notes',
  'dispute_id',
  'dispute_created_at',
  'dispute_reason',
  'settlement_id',
  'settled_at',
  'settlement_utr',
  'settled_by',
]

const names = [
  'Aarav Mehta',
  'Ananya Rao',
  'Vihaan Shah',
  'Isha Nair',
  'Arjun Kapoor',
  'Meera Iyer',
  'Kabir Malhotra',
  'Riya Das',
  'Rohan Khanna',
  'Tara Menon',
]

const ifscs = [
  'HDFC0001234',
  'ICIC0005678',
  'SBIN0004321',
  'UTIB0002468',
  'KKBK0001357',
  'BARB0QA1234',
]

const methods = ['NEFT', 'IMPS', 'RTGS', 'UPI', 'BANK_TRANSFER']
const batchRef = 'ZORD_QA_BATCH_20260617_A'

const invalidPlans = new Map([
  [7, { kind: 'BANK', ifsc: 'hdfc0001234', reason: 'lowercase IFSC should fail strict regex before canonical uppercasing' }],
  [13, { kind: 'BANK', ifsc: 'HDFC1234567', reason: 'IFSC missing required fifth-character zero' }],
  [19, { kind: 'UPI', vpa: 'qa600019upi', reason: 'UPI VPA has no @ delimiter' }],
  [25, { amount: '(2775.25)', reason: 'accounting parentheses are not a valid decimal in canonical fast path' }],
  [31, { amount: '-4100.00', reason: 'negative amount policy flag' }],
  [37, { amount: '0.00', reason: 'zero amount semantic validation' }],
  [43, { amount: '5188.777', reason: 'decimal scale greater than 2' }],
  [49, { currency: 'AED', reason: 'currency unsupported by validator allowlist' }],
])

function pad(value, size = 2) {
  return String(value).padStart(size, '0')
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function iso(date) {
  return date.toISOString().replace(/\.000Z$/, 'Z')
}

function sqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

function fixedAmount(index) {
  return (1250 + index * 137.29 + (index % 5) * 0.11).toFixed(2)
}

function cleanSettlementAmount(raw, fallback) {
  if (/^-?\d+(\.\d+)?$/.test(raw) && Number(raw) > 0) {
    return Number(raw).toFixed(2)
  }

  const cleaned = String(raw).replace(/[()]/g, '').replace(/[^0-9.]/g, '')
  const parsed = Number(cleaned)
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed.toFixed(2)
  }

  return fallback
}

function csvEscape(value) {
  const text = value == null ? '' : String(value)
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }

  return text
}

function toCsv(headers, rows) {
  return `${[headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n')}\r\n`
}

const intentRows = []
const settlementRows = []
const manifest = []

for (let index = 1; index <= 50; index += 1) {
  const plan = invalidPlans.get(index) ?? {}
  const name = names[(index - 1) % names.length]
  const payoutRef = `ZORD_QA_PAY_${600000 + index}`
  const customerId = `CUST-QA-${700000 + index}`
  const baseAmount = fixedAmount(index)
  const amountValue = plan.amount ?? baseAmount
  const currency = plan.currency ?? 'INR'
  const isUpi = plan.kind ? plan.kind === 'UPI' : index % 6 === 0
  const kind = plan.kind ?? (isUpi ? 'UPI' : 'BANK')
  const accountNumber = kind === 'UPI' ? '' : `91${String(4400000000 + index * 7919).slice(0, 10)}`
  const ifsc = plan.ifsc !== undefined ? plan.ifsc : kind === 'UPI' ? '' : ifscs[(index - 1) % ifscs.length]
  const vpa = plan.vpa !== undefined ? plan.vpa : kind === 'UPI' ? `qa${600000 + index}@upi` : ''
  const intended = new Date(Date.UTC(2026, 6 + Math.floor((index - 1) / 16), 2 + ((index - 1) % 16), 10 + (index % 5), (index * 7) % 60, 0))
  const settledOffset = 1 + ((index * 11) % 71)
  const capturedAt = addMinutes(intended, 12 + (index % 17))
  const settledAt = addHours(intended, settledOffset)
  const settlementAmount = cleanSettlementAmount(amountValue, baseAmount)
  const fee = (Number(settlementAmount) * 0.006).toFixed(2)
  const tax = (Number(fee) * 0.18).toFixed(2)
  const method = kind === 'UPI' ? 'UPI' : methods[(index - 1) % methods.length]

  const intent = {
    schema_version: 'v1',
    intent_type: 'PAYOUT',
    client_batch_ref: batchRef,
    client_payout_ref: payoutRef,
    'amount.value': amountValue,
    'amount.currency': currency,
    'beneficiary.name': name,
    account_number: accountNumber,
    'beneficiary.instrument.kind': kind,
    'beneficiary.instrument.ifsc': ifsc,
    'beneficiary.instrument.vpa': vpa,
    'beneficiary.country': 'IN',
    'remitter.customer_id': customerId,
    'remitter.phone': `+9198${pad(300000 + index * 37, 6)}`,
    'remitter.email': `qa.payout.${600000 + index}@example.test`,
    purpose_code: index % 4 === 0 ? 'REFUND' : 'VENDOR_PAYMENT',
    provider_hint: 'razorpay',
    intended_execution_at: iso(intended),
    idempotency_key: `idem-qa-${batchRef}-${pad(index, 3)}`,
    source: 'QA_BULK_UPLOAD',
    source_system: 'razorpay',
    'constraints.execution_window': '09:00-18:00',
  }
  intentRows.push(intentHeaders.map((header) => intent[header]))

  const settlement = {
    transaction_entity: 'payout',
    entity_id: 'razorpay',
    amount: settlementAmount,
    currency: 'INR',
    'fee (exclusive tax)': fee,
    tax,
    debit: '0.00',
    credit: settlementAmount,
    payment_method: method,
    card_type: '',
    issuer_name: '',
    entity_created_at: sqlDateTime(addMinutes(intended, -45)),
    payment_captured_at: sqlDateTime(capturedAt),
    payment_notes: plan.reason ? `QA settlement row maps cleanly; intent negative: ${plan.reason}` : 'QA settlement row maps cleanly',
    refund_notes: '',
    arn: '',
    entity_description: `Payout for ${name}`,
    order_id: customerId,
    order_receipt: payoutRef,
    order_notes: `QA-VOUCH-${800000 + index}`,
    dispute_id: '',
    dispute_created_at: '',
    dispute_reason: '',
    settlement_id: `setl_qa_${batchRef}_${pad(index, 3)}`,
    settled_at: sqlDateTime(settledAt),
    settlement_utr: `UTRQA${String(930000000000 + index * 104729)}`,
    settled_by: 'Razorpay',
  }
  settlementRows.push(settlementHeaders.map((header) => settlement[header]))

  if (plan.reason) {
    manifest.push({
      row: index,
      client_payout_ref: payoutRef,
      expected_dlq: true,
      target_reason: plan.reason,
    })
  }
}

const intentPath = path.join(outDir, 'qa_intent_engine_50_rows.csv')
const settlementCsvPath = path.join(outDir, 'qa_razorpay_settlement_50_rows.csv')
const settlementXlsxPath = path.join(outDir, 'qa_razorpay_settlement_50_rows.xlsx')
const manifestPath = path.join(outDir, 'qa_intent_engine_expected_dlq_rows.json')

await fs.writeFile(intentPath, toCsv(intentHeaders, intentRows), 'utf8')
await fs.writeFile(settlementCsvPath, toCsv(settlementHeaders, settlementRows), 'utf8')
await fs.writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      generated_at: '2026-06-17',
      intent_file: path.basename(intentPath),
      settlement_csv_file: path.basename(settlementCsvPath),
      settlement_xlsx_file: path.basename(settlementXlsxPath),
      upload_notes: {
        intent: 'Use bulk ingest pass-through mode: omit x-zord-tenant-type and omit X-Zord-Source-System so canonical dot headers reach zord-intent-engine without profile remapping.',
        settlement: 'Use psp=razorpay. The XLSX is the service-ready file for the Razorpay parser; the CSV has the same headers and values for review.',
      },
      expected_intent_dlq_rows: manifest,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

const worksheet = XLSX.utils.aoa_to_sheet([settlementHeaders, ...settlementRows])
const workbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(workbook, worksheet, 'qa_razorpay_settlement_50_rows')
XLSX.writeFile(workbook, settlementXlsxPath, { bookType: 'xlsx' })

console.log(
  JSON.stringify(
    {
      written: [intentPath, settlementCsvPath, settlementXlsxPath, manifestPath],
      intent_rows: intentRows.length,
      settlement_rows: settlementRows.length,
      expected_dlq_rows: manifest.map((item) => item.row),
    },
    null,
    2,
  ),
)

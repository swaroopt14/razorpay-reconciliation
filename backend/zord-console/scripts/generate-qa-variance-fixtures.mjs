import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const outDir = path.resolve(__dirname, '../../../functional-tests/test-data')

const sizes = [100, 200, 500]

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
  'Devika Sen',
  'Karan Batra',
  'Nisha Kulkarni',
  'Samar Arora',
  'Pooja Reddy',
  'Aditya Bose',
]

const ifscs = [
  'HDFC0001234',
  'ICIC0005678',
  'SBIN0004321',
  'UTIB0002468',
  'KKBK0001357',
  'BARB0QA1234',
  'YESB0009876',
  'CNRB0002468',
]

const methods = ['NEFT', 'IMPS', 'RTGS', 'UPI', 'BANK_TRANSFER']

const failureRules = [
  {
    name: 'LOWERCASE_IFSC_REGEX_FAILURE',
    test: (row) => row % 23 === 0,
    apply: (intent) => {
      intent['beneficiary.instrument.kind'] = 'BANK'
      intent.account_number ||= '914411223344'
      intent['beneficiary.instrument.ifsc'] = 'hdfc0001234'
      intent['beneficiary.instrument.vpa'] = ''
    },
    expected_detail: 'validator SEMANTIC_INVALID: Invalid IFSC format',
  },
  {
    name: 'IFSC_MISSING_REQUIRED_ZERO',
    test: (row) => row % 29 === 0,
    apply: (intent) => {
      intent['beneficiary.instrument.kind'] = 'BANK'
      intent.account_number ||= '914455667788'
      intent['beneficiary.instrument.ifsc'] = 'HDFC1234567'
      intent['beneficiary.instrument.vpa'] = ''
    },
    expected_detail: 'validator SEMANTIC_INVALID: Invalid IFSC format',
  },
  {
    name: 'UPI_VPA_WITHOUT_HANDLE',
    test: (row) => row % 31 === 0,
    apply: (intent) => {
      intent['beneficiary.instrument.kind'] = 'UPI'
      intent.account_number = ''
      intent['beneficiary.instrument.ifsc'] = ''
      intent['beneficiary.instrument.vpa'] = `qa${intent.client_payout_ref.slice(-6)}upi`
    },
    expected_detail: 'validator SEMANTIC_INVALID: invalid UPI VPA',
  },
  {
    name: 'ACCOUNTING_PARENTHESES_AMOUNT',
    test: (row) => row % 37 === 0,
    apply: (intent) => {
      intent['amount.value'] = `(${intent['amount.value']})`
    },
    expected_detail: 'validator SEMANTIC_INVALID: amount must be a valid decimal',
  },
  {
    name: 'NEGATIVE_AMOUNT_POLICY',
    test: (row) => row % 41 === 0,
    apply: (intent) => {
      intent['amount.value'] = `-${intent['amount.value']}`
    },
    expected_detail: 'policy SEMANTIC_INVALID: NEGATIVE_AMOUNT_NOT_ALLOWED',
  },
  {
    name: 'ZERO_AMOUNT_VALIDATION',
    test: (row) => row % 43 === 0,
    apply: (intent) => {
      intent['amount.value'] = '0.00'
    },
    expected_detail: 'validator SEMANTIC_INVALID: amount must be greater than zero',
  },
  {
    name: 'THREE_DECIMAL_AMOUNT_SCALE',
    test: (row) => row % 47 === 0,
    apply: (intent) => {
      intent['amount.value'] = `${intent['amount.value']}7`
    },
    expected_detail: 'validator SEMANTIC_INVALID: amount must not have more than two decimal places',
  },
  {
    name: 'UNSUPPORTED_CURRENCY_AED',
    test: (row) => row % 53 === 0,
    apply: (intent) => {
      intent['amount.currency'] = 'AED'
    },
    expected_detail: 'validator SEMANTIC_INVALID: currency must be ISO-4217 compliant',
  },
]

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

function baseAmount(row, size) {
  const value = 950 + row * 83.37 + (row % 17) * 4.19 + size / 10
  return value.toFixed(2)
}

function positiveDecimalFromIntent(raw, fallback) {
  if (/^\d+(\.\d+)?$/.test(raw) && Number(raw) > 0) {
    return Number(raw).toFixed(2)
  }

  const cleaned = String(raw).replace(/[()]/g, '').replace(/[^0-9.]/g, '')
  const parsed = Number(cleaned)
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed.toFixed(2)
  }

  return fallback
}

function settlementVariance(row, amount) {
  const amountNum = Number(amount)

  if (row % 16 === 0) {
    const delta = Math.min(125, Math.max(7.5, amountNum * 0.015))
    return { type: 'UNDER_SETTLEMENT', credit: (amountNum - delta).toFixed(2), delta: -delta }
  }

  if (row % 21 === 0) {
    const delta = Math.min(175, Math.max(11, amountNum * 0.018))
    return { type: 'OVER_SETTLEMENT', credit: (amountNum + delta).toFixed(2), delta }
  }

  if (row % 34 === 0) {
    const delta = Math.min(60, Math.max(5, amountNum * 0.006))
    return { type: 'FEE_DEDUCTION_VARIANCE', credit: (amountNum - delta).toFixed(2), delta: -delta }
  }

  return { type: 'EXACT_SETTLEMENT', credit: amount, delta: 0 }
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

function buildIntent(row, size, batchRef) {
  const name = names[(row - 1) % names.length]
  const payoutRef = `ZORD_QA_${size}_PAY_${String(700000 + row)}`
  const customerId = `CUST-QA-${size}-${String(800000 + row)}`
  const isUpi = row % 9 === 0
  const intended = new Date(Date.UTC(2026, 6 + Math.floor((row - 1) / 180), 10 + ((row - 1) % 18), 9 + (row % 7), (row * 5) % 60, 0))

  const intent = {
    schema_version: 'v1',
    intent_type: 'PAYOUT',
    client_batch_ref: batchRef,
    client_payout_ref: payoutRef,
    'amount.value': baseAmount(row, size),
    'amount.currency': 'INR',
    'beneficiary.name': name,
    account_number: isUpi ? '' : `91${String(5500000000 + row * 3571).slice(0, 10)}`,
    'beneficiary.instrument.kind': isUpi ? 'UPI' : 'BANK',
    'beneficiary.instrument.ifsc': isUpi ? '' : ifscs[(row - 1) % ifscs.length],
    'beneficiary.instrument.vpa': isUpi ? `qa${size}${700000 + row}@upi` : '',
    'beneficiary.country': 'IN',
    'remitter.customer_id': customerId,
    'remitter.phone': `+9177${pad(400000 + row * 19, 6)}`,
    'remitter.email': `qa.${size}.${700000 + row}@example.test`,
    purpose_code: row % 11 === 0 ? 'REFUND' : 'VENDOR_PAYMENT',
    provider_hint: 'razorpay',
    intended_execution_at: iso(intended),
    idempotency_key: `idem-qa-${batchRef}-${pad(row, 4)}`,
    source: 'QA_VARIANCE_BULK_UPLOAD',
    source_system: 'razorpay',
    'constraints.execution_window': '09:00-18:00',
    _intendedDate: intended,
  }

  const failure = failureRules.find((rule) => rule.test(row))
  if (failure) {
    failure.apply(intent)
  }

  return { intent, failure }
}

function buildSettlement(row, size, batchRef, intent, failure) {
  const intended = intent._intendedDate
  const baseSettlementAmount = positiveDecimalFromIntent(intent['amount.value'], baseAmount(row, size))
  const variance = failure ? { type: 'INTENT_EXPECTED_DLQ', credit: baseSettlementAmount, delta: 0 } : settlementVariance(row, baseSettlementAmount)
  const fee = variance.type === 'EXACT_SETTLEMENT' ? '0.00' : Math.abs(variance.delta * 0.72).toFixed(2)
  const tax = variance.type === 'EXACT_SETTLEMENT' ? '0.00' : (Number(fee) * 0.18).toFixed(2)
  const settledOffsetHours = 1 + ((row * 13 + size) % 71)
  const capturedAt = addMinutes(intended, 8 + (row % 23))
  const settledAt = addHours(intended, settledOffsetHours)
  const method = intent['beneficiary.instrument.kind'] === 'UPI' ? 'UPI' : methods[(row - 1) % methods.length]

  return {
    transaction_entity: 'payout',
    entity_id: intent.provider_hint,
    amount: baseSettlementAmount,
    currency: intent['amount.currency'],
    'fee (exclusive tax)': fee,
    tax,
    debit: '0.00',
    credit: variance.credit,
    payment_method: method,
    card_type: '',
    issuer_name: '',
    entity_created_at: sqlDateTime(addMinutes(intended, -35)),
    payment_captured_at: sqlDateTime(capturedAt),
    payment_notes: `${variance.type}${failure ? `; ${failure.name}` : ''}`,
    refund_notes: '',
    arn: '',
    entity_description: `Payout for ${intent['beneficiary.name']}`,
    order_id: intent['remitter.customer_id'],
    order_receipt: intent.client_payout_ref,
    order_notes: `QA-${size}-VOUCH-${String(900000 + row)}`,
    dispute_id: '',
    dispute_created_at: '',
    dispute_reason: '',
    settlement_id: `setl_qa_${size}_${pad(row, 5)}`,
    settled_at: sqlDateTime(settledAt),
    settlement_utr: `UTRQA${size}${String(940000000000 + row * 7919)}`,
    settled_by: 'Razorpay',
    _variance: variance,
    _settledOffsetHours: settledOffsetHours,
  }
}

async function writeDataset(size) {
  const batchRef = `ZORD_QA_VARIANCE_BATCH_${size}`
  const intentRows = []
  const settlementRows = []
  const dlqRows = []
  const varianceRows = []

  for (let row = 1; row <= size; row += 1) {
    const { intent, failure } = buildIntent(row, size, batchRef)
    const settlement = buildSettlement(row, size, batchRef, intent, failure)

    intentRows.push(intentHeaders.map((header) => intent[header]))
    settlementRows.push(settlementHeaders.map((header) => settlement[header]))

    if (failure) {
      dlqRows.push({
        row,
        client_payout_ref: intent.client_payout_ref,
        expected_dlq: true,
        failure_code: failure.name,
        expected_detail: failure.expected_detail,
      })
    } else if (settlement._variance.type !== 'EXACT_SETTLEMENT') {
      varianceRows.push({
        row,
        client_payout_ref: intent.client_payout_ref,
        variance_type: settlement._variance.type,
        intended_amount: settlement.amount,
        settled_credit: settlement.credit,
      })
    }
  }

  const stem = `qa_variance_${size}_rows`
  const intentPath = path.join(outDir, `${stem}_intent.csv`)
  const settlementCsvPath = path.join(outDir, `${stem}_razorpay_settlement.csv`)
  const settlementXlsxPath = path.join(outDir, `${stem}_razorpay_settlement.xlsx`)
  const manifestPath = path.join(outDir, `${stem}_manifest.json`)

  await fs.writeFile(intentPath, toCsv(intentHeaders, intentRows), 'utf8')
  await fs.writeFile(settlementCsvPath, toCsv(settlementHeaders, settlementRows), 'utf8')

  const worksheet = XLSX.utils.aoa_to_sheet([settlementHeaders, ...settlementRows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, stem)
  XLSX.writeFile(workbook, settlementXlsxPath, { bookType: 'xlsx' })

  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        generated_at: '2026-06-18',
        row_count: size,
        client_batch_ref: batchRef,
        intent_file: path.basename(intentPath),
        settlement_csv_file: path.basename(settlementCsvPath),
        settlement_xlsx_file: path.basename(settlementXlsxPath),
        expected_valid_intents: size - dlqRows.length,
        expected_dlq_count: dlqRows.length,
        settlement_variance_count: varianceRows.length,
        upload_notes: {
          intent: 'Use bulk ingest pass-through mode: omit x-zord-tenant-type and omit X-Zord-Source-System.',
          settlement: 'Use psp=razorpay. The XLSX is the service-ready upload file for zord-outcome-engine; the CSV has identical rows for inspection.',
        },
        expected_dlq_rows: dlqRows,
        settlement_variance_rows: varianceRows,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  return {
    size,
    intentPath,
    settlementCsvPath,
    settlementXlsxPath,
    manifestPath,
    expectedValidIntents: size - dlqRows.length,
    expectedDlqCount: dlqRows.length,
    settlementVarianceCount: varianceRows.length,
  }
}

const results = []
for (const size of sizes) {
  results.push(await writeDataset(size))
}

console.log(JSON.stringify({ generated: results }, null, 2))

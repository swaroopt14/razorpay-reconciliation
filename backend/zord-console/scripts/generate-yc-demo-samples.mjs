/**
 * Demo upload samples → public/samples/
 * Schema matches generate-qa-fixtures.mjs (intentHeaders / settlementHeaders).
 * Run: node scripts/generate-yc-demo-samples.mjs
 */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '../public/samples')

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
]

const NAMES = [
  'Aarav Mehta',
  'Vihaan Shah',
  'Aditya Rao',
  'Arjun Nair',
  'Kabir Iyer',
  'Reyansh Gupta',
  'Vivaan Joshi',
  'Shaurya Desai',
  'Atharv Reddy',
  'Krishna Pillai',
  'Dev Patel',
  'Ishaan Banerjee',
  'Rudra Chatterjee',
  'Yash Malhotra',
  'Om Kapoor',
  'Sai Menon',
  'Ayaan Kulkarni',
  'Rohan Bhat',
  'Kunal Saxena',
  'Nikhil Verma',
]

function csvEscape(value) {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCsv(headers, rows) {
  return [headers.join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n') + '\n'
}

function amountFor(i) {
  if (i === 2) return '2265.33'
  if (i === 10) return '2210.11'
  if (i === 19) return '2188.22'
  return (2150 + (i + 1) * 5.11).toFixed(2)
}

function intentRow(i, { duplicateOf } = {}) {
  const n = i + 1
  const ref = duplicateOf ?? `ZORD_SCN01_PAY_${String(n).padStart(3, '0')}`
  const amount = duplicateOf ? amountFor(0) : amountFor(i)
  return intentHeaders.map((h) => {
    switch (h) {
      case 'schema_version':
        return 'v1'
      case 'intent_type':
        return 'PAYOUT'
      case 'client_batch_ref':
        return 'BATCH-001'
      case 'client_payout_ref':
        return ref
      case 'amount.value':
        return amount
      case 'amount.currency':
        return 'INR'
      case 'beneficiary.name':
        return NAMES[i % NAMES.length]
      case 'account_number':
        return i === 2 ? '914400007003' : `91440000${String(7910 + n).slice(-4)}`
      case 'beneficiary.instrument.kind':
        return 'BANK'
      case 'beneficiary.instrument.ifsc':
        return 'HDFC0001234'
      case 'beneficiary.instrument.vpa':
        return ''
      case 'beneficiary.country':
        return 'IN'
      case 'remitter.customer_id':
        return `CUST-YC-${700000 + n}`
      case 'remitter.phone':
        return `+91983000${String(30 + n).padStart(2, '0')}`
      case 'remitter.email':
        return `yc.demo.${String(n).padStart(3, '0')}@example.test`
      case 'purpose_code':
        return 'VENDOR_PAYMENT'
      case 'provider_hint':
        return 'razorpay'
      case 'intended_execution_at':
        return '2026-06-12T02:30:00Z'
      case 'idempotency_key':
        return `idem-demo-BATCH-001-${String(n).padStart(3, '0')}`
      case 'source':
        return 'YC_DEMO_SAMPLE'
      case 'source_system':
        return 'erp_file'
      case 'constraints.execution_window':
        return '09:00-18:00'
      default:
        return ''
    }
  })
}

function settlementRow(i, { short, returned } = {}) {
  const n = i + 1
  const ref = `ZORD_SCN01_PAY_${String(n).padStart(3, '0')}`
  const expected = amountFor(i)
  let credit = expected
  if (short) credit = '2090.11'
  if (returned) credit = '0.00'
  return settlementHeaders.map((h) => {
    switch (h) {
      case 'transaction_entity':
        return 'payout'
      case 'entity_id':
        return 'razorpay'
      case 'amount':
        return expected
      case 'currency':
        return 'INR'
      case 'fee (exclusive tax)':
        return '0.00'
      case 'tax':
        return '0.00'
      case 'debit':
        return '0.00'
      case 'credit':
        return credit
      case 'payment_method':
        return 'bank_transfer'
      case 'entity_created_at':
        return '2026-06-12 10:00:00'
      case 'payment_captured_at':
        return returned ? '' : '2026-06-12 14:40:00'
      case 'payment_notes':
        return short ? 'short settlement demo' : returned ? 'return demo' : 'exact match'
      case 'entity_description':
        return `Payout for ${NAMES[i % NAMES.length]}`
      case 'order_id':
        return `CUST-YC-${700000 + n}`
      case 'order_receipt':
        return ref
      case 'settlement_id':
        return `settle_yc_${String(n).padStart(3, '0')}`
      case 'settled_at':
        return returned ? '' : '2026-06-12 16:00:00'
      default:
        return ''
    }
  })
}

await fs.mkdir(outDir, { recursive: true })

const intents20 = Array.from({ length: 20 }, (_, i) => intentRow(i))
const intentsIssues = [
  ...intents20,
  intentRow(0, { duplicateOf: 'ZORD_SCN01_PAY_001' }),
  (() => {
    const row = intentRow(21)
    const idx = intentHeaders.indexOf('amount.value')
    row[idx] = ''
    return row
  })(),
]

const settlementsExact = Array.from({ length: 20 }, (_, i) => {
  if (i === 10) return settlementRow(i, { short: true })
  if (i === 19) return settlementRow(i, { returned: true })
  if (i === 2) return settlementRow(i) // blocked intent may still have no settle - keep row for schema
  return settlementRow(i)
})

await fs.writeFile(path.join(outDir, 'demo_intents_20.csv'), toCsv(intentHeaders, intents20))
await fs.writeFile(path.join(outDir, 'demo_intents_with_issues.csv'), toCsv(intentHeaders, intentsIssues))
await fs.writeFile(path.join(outDir, 'demo_settlement_exact.csv'), toCsv(settlementHeaders, settlementsExact))
await fs.writeFile(path.join(outDir, 'demo_settlement_exceptions.csv'), toCsv(settlementHeaders, settlementsExact))

await fs.writeFile(
  path.join(outDir, 'README.md'),
  `# Demo sample upload files

Illustrative data for Download → upload → validate against bulk-ingest / settlement upload.

| File | Purpose |
|------|---------|
| demo_intents_20.csv | 20 valid payout obligations |
| demo_intents_with_issues.csv | + duplicate + missing amount |
| demo_settlement_exact.csv | Settlement with short + return rows |
| demo_settlement_exceptions.csv | Same for outcome review |

Batch ref: \`BATCH-001\` · prepared console batch id: \`batch-001\`
`,
)

console.log(JSON.stringify({ outDir, files: await fs.readdir(outDir) }, null, 2))

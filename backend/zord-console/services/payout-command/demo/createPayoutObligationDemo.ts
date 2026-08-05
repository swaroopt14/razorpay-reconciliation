/** Spec 7.4 - Create Payout Obligation copy + demo helpers. */

export const CREATE_OBLIGATION_HEADER = {
  title: 'Create payout',
  subtitle: 'Upload a batch or add a single obligation.',
} as const

export const CREATE_OBLIGATION_TABS = [
  { id: 'upload', label: 'Upload' },
  { id: 'single', label: 'Single' },
  { id: 'api', label: 'API' },
] as const

export type CreateObligationTabId = (typeof CREATE_OBLIGATION_TABS)[number]['id']

export const REQUIRED_FIELD_LABELS = [
  'Obligation ID',
  'Payer entity',
  'Beneficiary',
  'Amount',
  'Currency',
  'Planned date',
  'Purpose',
  'Source system',
] as const

export const BUSINESS_REFERENCE_TYPES = [
  'Invoice',
  'Purchase order',
  'Claim',
  'Loan',
  'Contract',
  'Seller settlement',
  'Payroll reference',
] as const

export const MAPPING_PROFILES = [
  { id: 'payroll-intent-v1', label: 'Payroll intent v1' },
  { id: 'sap-fi-payment', label: 'SAP FI payment run' },
  { id: 'generic-csv-v1', label: 'Generic CSV v1' },
] as const

export const POLICY_PACKS = [
  { id: 'enterprise-default', label: 'Enterprise default' },
  { id: 'nbfc-disbursement', label: 'NBFC disbursement' },
  { id: 'cross-border-vendor', label: 'Cross-border vendor' },
  { id: 'marketplace-seller', label: 'Marketplace seller' },
] as const

/** X-Zord-Source-System options (Batch Intake + Create payout Settings). */
export const SOURCE_CONNECTIONS = [
  { id: 'tally-erp', label: 'Tally / ERP' },
  { id: 'bank-file', label: 'Bank file' },
  { id: 'psp-gateway', label: 'PSP / Payment gateway' },
  { id: 'manual-csv', label: 'Manual CSV' },
  { id: 'api-upload', label: 'API upload' },
  { id: 'sap', label: 'SAP' },
  { id: 'sap-s4', label: 'SAP S/4HANA' },
  { id: 'sftp', label: 'Treasury SFTP' },
  { id: 'file-upload', label: 'File upload (active)' },
  { id: 'other', label: 'Other' },
] as const

/** x-zord-source-type allowlist forwarded to bulk-ingest. */
export const INGEST_SOURCE_TYPES = ['CSV', 'FILE_UPLOAD', 'JSON', 'XLSX', 'XLS'] as const

/** Optional x-zord-tenant-type (edge static parser / profile). */
export const TENANT_TYPE_OPTIONS = [
  { id: '', label: 'Not set' },
  { id: 'BANK', label: 'BANK' },
  { id: 'NBFC', label: 'NBFC' },
  { id: 'MERCHANT', label: 'MERCHANT' },
  { id: 'VENDOR', label: 'VENDOR' },
  { id: 'GATEWAY', label: 'GATEWAY' },
] as const

/** Step 2 psp query options. */
export const PSP_OPTIONS = [
  'razorpay',
  'cashfree',
  'payu',
  'phonepe',
  'paytm',
  'stripe',
  'adyen',
  'other',
] as const

export type ValidationPreview = {
  rowsValid: number
  rowsNeedingMapping: number
  duplicateCandidates: number
  missingRequiredFields: number
  artifactId: string
  fileHash: string
  issues: { row: number; field: string; message: string }[]
  previewRows: {
    obligationId: string
    beneficiary: string
    amount: string
    currency: string
    purpose: string
  }[]
}

/** Deterministic demo validation when a file is selected (before / after parse). */
export function buildValidationPreview(opts: {
  fileName: string
  rowCount: number
  sampleRows?: { obligationId?: string; beneficiary?: string; amount?: string; currency?: string; purpose?: string }[]
}): ValidationPreview {
  const rows = Math.max(opts.rowCount, 0)
  const missing = opts.fileName.includes('issues') ? Math.min(2, rows) : 0
  const duplicates = opts.fileName.includes('issues') ? 1 : 0
  const needingMapping = 0
  const valid = Math.max(0, rows - missing - duplicates)

  const hashSeed = Array.from(opts.fileName).reduce((a, ch) => a + ch.charCodeAt(0), 0)
  const fileHash = `sha256:${(hashSeed * 7919).toString(16).padStart(8, '0')}…${(hashSeed * 13)
    .toString(16)
    .slice(0, 4)}`

  const previewRows =
    opts.sampleRows && opts.sampleRows.length > 0
      ? opts.sampleRows.slice(0, 5).map((r, i) => ({
          obligationId: r.obligationId || `ROW-${i + 1}`,
          beneficiary: r.beneficiary || '-',
          amount: r.amount || '-',
          currency: r.currency || 'INR',
          purpose: r.purpose || '-',
        }))
      : Array.from({ length: Math.min(5, rows || 3) }, (_, i) => ({
          obligationId: `ZORD_SCN01_PAY_0${i + 1}`,
          beneficiary: ['Priya Sharma', 'Amit Verma', 'Neha Joshi', 'Rahul Mehta', 'Sanjay Patil'][i] ?? `Payee ${i + 1}`,
          amount: ['4500', '3200', '2800', '5100', '1900'][i] ?? '1000',
          currency: 'INR',
          purpose: 'Payroll',
        }))

  return {
    rowsValid: valid || (rows === 0 ? 0 : previewRows.length),
    rowsNeedingMapping: needingMapping,
    duplicateCandidates: duplicates,
    missingRequiredFields: missing,
    artifactId: `art_${opts.fileName.replace(/\W+/g, '_').slice(0, 24)}_${hashSeed.toString(36)}`,
    fileHash,
    issues:
      missing || duplicates
        ? [
            ...(missing
              ? [{ row: 3, field: 'Amount', message: 'Missing required field: amount' }]
              : []),
            ...(duplicates
              ? [{ row: 7, field: 'Obligation ID', message: 'Duplicate candidate for obligation ID' }]
              : []),
          ]
        : [],
    previewRows,
  }
}

export const API_REQUEST_PREVIEW = `{
  "obligation_id": "ZORD_OBL_20260612_001",
  "payer_entity": "Acme Payments Pvt Ltd",
  "beneficiary": {
    "legal_name": "Priya Sharma",
    "account_token": "····4821",
    "country": "IN",
    "beneficiary_version": "bv_3"
  },
  "amount": { "value": "4500.00", "currency": "INR" },
  "planned_date": "2026-06-12",
  "purpose": "Payroll",
  "source_system": "file_upload",
  "business_reference": { "type": "payroll_reference", "id": "PAY-JUN-2026" },
  "mapping_profile": "payroll-intent-v1",
  "policy_pack": "enterprise-default"
}` as const

/** Shared smoke tenant + programmatic batch catalogue for manual payout-command review. */

export const TENANT_ID =
  process.env.SMOKE_TENANT_ID?.trim() || '00000000-0000-0000-0000-000000000001'

export const SMOKE_API_KEY = process.env.SMOKE_API_KEY?.trim() || 'smoke-local-api-key'

const PARTNERS = ['razorpay', 'cashfree']
const FINALITY_STATUSES = ['OPEN', 'PARTIALLY_SETTLED', 'FULLY_SETTLED']
const BATCH_LABELS = [
  'Alpha payroll',
  'Beta vendor run',
  'Gamma refunds',
  'Delta contractor',
  'Epsilon incentives',
  'Zeta reimbursements',
  'Eta partner payouts',
  'Theta sweep',
  'Iota micro-batch',
  'Kappa close-out',
]

export function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Default 10 batches — override with SMOKE_BATCH_COUNT. */
export const BATCH_COUNT = parsePositiveInt(process.env.SMOKE_BATCH_COUNT, 10)

/**
 * Generate N batches with varied counts (similar spirit to intelligence e2e tests
 * that seed one snapshot row per batch with different JSON payloads).
 */
export function buildSmokeBatches(count = BATCH_COUNT) {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1
    const id = `smoke-batch-${String(n).padStart(2, '0')}`
    return {
      id,
      label: BATCH_LABELS[i] ?? `Smoke batch ${n}`,
      intentCount: 10 + ((i * 5 + 7) % 22),
      observationCount: 8 + ((i * 11 + 3) % 35),
      totalIntendedMinor: 850_000 + n * 520_000,
      partner: PARTNERS[i % PARTNERS.length],
      finality: FINALITY_STATUSES[i % FINALITY_STATUSES.length],
    }
  })
}

export const BATCHES = buildSmokeBatches(BATCH_COUNT)

export const PRIMARY_BATCH = BATCHES[0]?.id ?? 'smoke-batch-01'

export const EVIDENCE_BATCH = PRIMARY_BATCH
export const PACK_BATCH = 'pack-batch-smoke-001'
export const PACK_INTENT_A = 'pack-intent-smoke-a'
export const PACK_INTENT_B = 'pack-intent-smoke-b'

export function intentId(batchId, index) {
  return `smoke-intent-${batchId.replace(/[^a-z0-9]/gi, '')}-${String(index + 1).padStart(3, '0')}`
}

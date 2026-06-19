import { apiTrimmedString } from './coerceApiField'

export type ParsedDlqIntentContext = {
  amount: number
  currency: string | null
  beneficiaryName: string | null
  idempotencyKey: string | null
  sourceSystem: string | null
  paymentMethod: string | null
}

function parseDlqAmount(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const token = raw.trim().split(/\s+/)[0] ?? ''
    const n = Number.parseFloat(token.replace(/,/g, ''))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

/** Map connector/source labels to EntityLogo registry names. */
export function normalizePspDisplayName(raw: string | null | undefined): string {
  const name = apiTrimmedString(raw)
  if (!name) return '—'
  const lower = name.toLowerCase()
  if (lower.includes('razor')) return 'Razorpay'
  if (lower.includes('cashfree')) return 'Cashfree'
  if (lower.includes('payu')) return 'PayU'
  if (lower.includes('stripe')) return 'Stripe'
  return name
}

export function parseDlqIntentContext(raw: unknown): ParsedDlqIntentContext {
  if (!raw || typeof raw !== 'object') {
    return {
      amount: 0,
      currency: null,
      beneficiaryName: null,
      idempotencyKey: null,
      sourceSystem: null,
      paymentMethod: null,
    }
  }
  const ctx = raw as Record<string, unknown>
  const amountRaw = ctx.amount
  let currency: string | null = null
  if (typeof amountRaw === 'string' && amountRaw.trim()) {
    const parts = amountRaw.trim().split(/\s+/)
    if (parts.length > 1) currency = parts[parts.length - 1]!.toUpperCase()
  }
  if (!currency && typeof ctx.currency === 'string' && ctx.currency.trim()) {
    currency = ctx.currency.trim().toUpperCase()
  }
  const instrument =
    typeof ctx.instrument === 'string'
      ? ctx.instrument
      : typeof ctx.payment_method === 'string'
        ? ctx.payment_method
        : typeof ctx.rail_hint === 'string'
          ? ctx.rail_hint
          : null
  return {
    amount: parseDlqAmount(amountRaw),
    currency,
    beneficiaryName: typeof ctx.beneficiary_name === 'string' ? ctx.beneficiary_name.trim() || null : null,
    idempotencyKey: typeof ctx.idempotency_key === 'string' ? ctx.idempotency_key.trim() || null : null,
    sourceSystem: typeof ctx.source_system === 'string' ? ctx.source_system.trim() || null : null,
    paymentMethod: instrument?.trim() || null,
  }
}

export function formatDlqStageLabel(stage?: string): string {
  const s = apiTrimmedString(stage)
  if (!s) return '—'
  return s
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ')
}

export function resolveDlqDisplayStatus(input: {
  dlq_status?: string
  stage?: string
  reason_code?: string
  replayable?: boolean
}): string {
  const status = apiTrimmedString(input.dlq_status)
  if (status) return formatDlqStatusLabel(status)
  const parts = [
    formatDlqStageLabel(input.stage),
    apiTrimmedString(input.reason_code)
      ?.split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(' '),
    input.replayable === true ? 'Replayable' : input.replayable === false ? 'Not replayable' : null,
  ].filter((p) => p && p !== '—')
  return parts.join(' · ') || '—'
}

export function formatDlqStatusLabel(status?: string): string {
  const s = apiTrimmedString(status)
  if (!s) return '—'
  if (s === 'NEEDS_MANUAL_REVIEW') return 'Manual review'
  if (s === 'DLQ_TERMINAL') return 'Terminal DLQ'
  return s.replace(/_/g, ' ')
}

export function dlqItemMatchesBatch(
  item: { client_batch_ref?: string; batch_id?: string },
  batchId: string,
): boolean {
  const bid = batchId.trim()
  if (!bid) return false
  const ref = apiTrimmedString(item.client_batch_ref) || apiTrimmedString(item.batch_id)
  return ref === bid
}

export function mergeDlqItemsById<T extends { dlq_id?: string }>(primary: T[], secondary: T[]): T[] {
  const merged = new Map<string, T>()
  for (const item of [...secondary, ...primary]) {
    const id = apiTrimmedString(item.dlq_id)
    if (!id) continue
    const existing = merged.get(id)
    merged.set(id, existing ? { ...existing, ...item } : item)
  }
  return [...merged.values()]
}

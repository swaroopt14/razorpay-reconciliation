/** Shared prod BFF fetchers for /customer pages (credentials: include). */

export type CustomerIntentRow = {
  intent_id: string
  envelope_id?: string
  status?: string
  intent_type?: string
  amount?: string | number
  currency?: string
  created_at?: string
}

export type CustomerDlqRow = {
  dlq_id: string
  envelope_id?: string
  stage?: string
  reason_code?: string
  error_detail?: string
  replayable?: boolean
  created_at?: string
}

export async function fetchCustomerIntents(params?: {
  page?: number
  page_size?: number
  status?: string
}): Promise<{ items: CustomerIntentRow[]; total: number }> {
  const qs = new URLSearchParams()
  qs.set('page', String(params?.page ?? 1))
  qs.set('page_size', String(params?.page_size ?? 50))
  if (params?.status) qs.set('status', params.status)
  const res = await fetch(`/api/prod/intents?${qs}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`intents: ${res.status}`)
  const data = await res.json()
  return {
    items: (data.items ?? data.intents ?? []) as CustomerIntentRow[],
    total: data.pagination?.total ?? 0,
  }
}

export async function fetchCustomerDlq(): Promise<CustomerDlqRow[]> {
  const res = await fetch('/api/prod/dlq?page=1&page_size=100', { cache: 'no-store' })
  if (!res.ok) throw new Error(`dlq: ${res.status}`)
  const data = await res.json()
  return (data.items ?? data.recent_failures ?? []) as CustomerDlqRow[]
}

export function formatRelativeAge(iso?: string): string {
  if (!iso) return '-'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '-'
  const diffMin = Math.max(0, Math.floor((Date.now() - t) / 60_000))
  if (diffMin < 60) return `${diffMin}m`
  const h = Math.floor(diffMin / 60)
  if (h < 48) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function formatInrAmount(amount?: string | number, currency = 'INR'): string {
  const n = typeof amount === 'string' ? Number(amount) : amount ?? 0
  if (!Number.isFinite(n)) return '-'
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)
  } catch {
    return String(n)
  }
}

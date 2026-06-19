import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'

/** Table date column — MMM DD, YYYY */
export function formatEvidenceDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return '—'
  }
}

export function formatIsoDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export function shortHash(h: string, len = 22): string {
  const t = apiTrimmedString(h)
  if (!t || t === '—') return '—'
  return t.length > len ? `${t.slice(0, len)}…` : t
}

export const EVIDENCE_ASK = {
  canvas: 'bg-[#f7f7f4]',
  inset: 'bg-[#fcfcfa]',
  field: 'bg-[#f8f8f6]',
  muted: 'text-[#8a8a86]',
  border: 'border-[#E5E5E5]',
} as const

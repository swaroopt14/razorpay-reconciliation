import { formatDistanceToNowStrict } from 'date-fns'

export function maskSensitive(value: string): string {
  const trimmed = (value || '').trim()
  if (!trimmed) return ''
  if (trimmed.length <= 4) return '*'.repeat(trimmed.length)
  if (trimmed.length <= 8) return `${trimmed.slice(0, 1)}${'*'.repeat(trimmed.length - 2)}${trimmed.slice(-1)}`
  return `${trimmed.slice(0, 2)}${'*'.repeat(trimmed.length - 4)}${trimmed.slice(-2)}`
}

export function amountINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

export function pct(value: number, digits = 2): string {
  return `${value.toFixed(digits)}%`
}

export function relativeTs(iso: string): string {
  if (!iso) return '-'
  return `${formatDistanceToNowStrict(new Date(iso), { addSuffix: true })}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function toBucketHour(input: Date): string {
  const d = new Date(input)
  d.setMinutes(0, 0, 0)
  return d.toISOString()
}

export function parseTimeRange(rangeRaw?: string): { from: Date; to: Date; label: string } {
  const now = new Date()
  const range = (rangeRaw || '24h').toLowerCase()

  const configs: Record<string, number> = {
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  }

  const duration = configs[range] || configs['24h']
  return {
    from: new Date(now.getTime() - duration),
    to: now,
    label: range,
  }
}

export function seededRandom(seed: string): () => number {
  let state = 0
  for (let i = 0; i < seed.length; i += 1) {
    state = (state * 31 + seed.charCodeAt(i)) >>> 0
  }

  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 4294967296
  }
}

export function choose<T>(rng: () => number, values: T[]): T {
  return values[Math.floor(rng() * values.length)]
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

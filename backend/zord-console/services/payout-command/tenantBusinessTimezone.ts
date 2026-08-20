/**
 * CON-P1-29 — tenant business timezone for financial day windows.
 * Backend (intent-engine) tracks daily limits on business_date in this IANA zone.
 * Console filters/grouping must use the same civil day, never the browser timezone.
 */

/** Product default when tenant config / env is absent (matches analytics + India ops). */
export const DEFAULT_TENANT_BUSINESS_TIMEZONE = 'Asia/Kolkata'

export type BusinessDatePreset = 'all' | '7d' | '30d' | '90d' | 'ytd'

/** Normalize IANA timezone; invalid → default. */
export function resolveTenantBusinessTimezone(raw?: string | null): string {
  const tz = String(raw ?? '').trim()
  if (!tz) return DEFAULT_TENANT_BUSINESS_TIMEZONE
  try {
    // Throws RangeError for invalid IANA zones in modern runtimes.
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date())
    return tz
  } catch {
    return DEFAULT_TENANT_BUSINESS_TIMEZONE
  }
}

/** Civil YYYY-MM-DD for `instant` in the tenant business timezone. */
export function businessDateYmd(instant: Date | number | string, timeZone: string): string {
  const d = instant instanceof Date ? instant : new Date(instant)
  if (Number.isNaN(d.getTime())) return ''
  const tz = resolveTenantBusinessTimezone(timeZone)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  if (!y || !m || !day) return ''
  return `${y}-${m}-${day}`
}

/** Add/subtract civil calendar days on a YYYY-MM-DD (timezone-agnostic date math). */
export function addCivilDaysYmd(ymd: string, deltaDays: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  if (!m) return ''
  const utc = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  utc.setUTCDate(utc.getUTCDate() + deltaDays)
  return utc.toISOString().slice(0, 10)
}

export function businessPresetStartYmd(
  preset: BusinessDatePreset,
  timeZone: string,
  now: Date = new Date(),
): string | null {
  if (preset === 'all') return null
  const today = businessDateYmd(now, timeZone)
  if (!today) return null
  if (preset === 'ytd') return `${today.slice(0, 4)}-01-01`
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90
  return addCivilDaysYmd(today, -(days - 1))
}

/**
 * True when `instant` falls on a tenant business date within the preset window
 * (inclusive start → today in that timezone).
 */
export function isInstantInBusinessDatePreset(
  instant: Date | number | string | null | undefined,
  preset: BusinessDatePreset,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  if (preset === 'all') return true
  if (instant == null || instant === '') return true
  const observed = businessDateYmd(instant, timeZone)
  if (!observed) return true
  const today = businessDateYmd(now, timeZone)
  const start = businessPresetStartYmd(preset, timeZone, now)
  if (!today || !start) return true
  return observed >= start && observed <= today
}

/** Display timestamps in tenant business timezone (formatting only — not for grouping). */
export function formatInTenantBusinessTimezone(
  instant: Date | number | string | null | undefined,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (instant == null || instant === '') return '—'
  const d = instant instanceof Date ? instant : new Date(instant)
  if (Number.isNaN(d.getTime())) return String(instant)
  const tz = resolveTenantBusinessTimezone(timeZone)
  return d.toLocaleString('en-IN', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  })
}

export type TrendRange = 'week' | 'month' | 'quarter' | 'year'

function lastCivilDayOfMonth(year: number, monthIndex0: number): string {
  const utc = new Date(Date.UTC(year, monthIndex0 + 1, 0))
  return utc.toISOString().slice(0, 10)
}

/**
 * Financial chart / KPI windows as civil dates in the tenant business timezone
 * (not UTC midnight, not browser local).
 */
export function businessTrendWindowYmd(
  range: TrendRange,
  timeZone: string,
  now: Date = new Date(),
): { from_date: string; to_date: string } {
  const today = businessDateYmd(now, timeZone)
  if (!today) {
    const fallback = now.toISOString().slice(0, 10)
    return { from_date: fallback, to_date: fallback }
  }
  const year = Number(today.slice(0, 4))
  const monthIndex0 = Number(today.slice(5, 7)) - 1

  if (range === 'week') {
    return { from_date: addCivilDaysYmd(today, -6), to_date: today }
  }
  if (range === 'month') {
    const from_date = `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-01`
    return { from_date, to_date: lastCivilDayOfMonth(year, monthIndex0) }
  }
  if (range === 'quarter') {
    const qStart = Math.floor(monthIndex0 / 3) * 3
    const from_date = `${year}-${String(qStart + 1).padStart(2, '0')}-01`
    return { from_date, to_date: lastCivilDayOfMonth(year, qStart + 2) }
  }
  return {
    from_date: `${year}-01-01`,
    to_date: lastCivilDayOfMonth(year, 11),
  }
}

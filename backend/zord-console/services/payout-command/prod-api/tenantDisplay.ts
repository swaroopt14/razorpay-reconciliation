import { apiTrimmedString } from './coerceApiField'

/** Last UUID segment or short suffix for Zord ID column (session tenant). */
export function tenantZordIdSuffix(tenantId: string): string {
  const t = apiTrimmedString(tenantId)
  if (!t) return '—'
  const last = t.split('-').pop() ?? t
  if (last.length >= 4) return `…${last.slice(-4)}`
  return t.length > 8 ? `…${t.slice(-8)}` : t
}

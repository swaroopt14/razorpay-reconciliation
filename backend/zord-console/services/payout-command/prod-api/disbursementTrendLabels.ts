import type { DisbursementTrendRange } from './disbursementTrendTypes'

/** X-axis / tooltip label for one daily trend bucket (UTC calendar day). */
export function formatTrendBucketLabel(isoDate: string, range: DisbursementTrendRange): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`)
  if (range === 'week') {
    return d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
  }
  if (range === 'year') {
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
      timeZone: 'UTC',
    })
  }
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

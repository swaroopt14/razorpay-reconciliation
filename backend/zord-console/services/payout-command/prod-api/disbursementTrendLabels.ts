import type { DisbursementTrendRange } from './disbursementTrendTypes'
import { DEFAULT_TENANT_BUSINESS_TIMEZONE } from '@/services/payout-command/tenantBusinessTimezone'

/** X-axis / tooltip label for one daily trend bucket (tenant business civil day). */
export function formatTrendBucketLabel(isoDate: string, range: DisbursementTrendRange): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`)
  if (range === 'week') {
    return d.toLocaleString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      timeZone: DEFAULT_TENANT_BUSINESS_TIMEZONE,
    })
  }
  if (range === 'year') {
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
      timeZone: DEFAULT_TENANT_BUSINESS_TIMEZONE,
    })
  }
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: DEFAULT_TENANT_BUSINESS_TIMEZONE,
  })
}

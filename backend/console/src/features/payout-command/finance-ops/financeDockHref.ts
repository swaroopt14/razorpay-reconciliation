import type { DockId } from '@/services/payout-command/model'
import { canonicalDockPath } from '@/services/payout-command/canonicalDockPath'

/** Canonical India Finance Controller routes. */
export function financeDockHref(id: DockId): string {
  const dest = canonicalDockPath(id)
  if (dest.includes('?')) {
    return dest.includes('demo=') ? dest : `${dest}&demo=sandbox`
  }
  if (dest === '/overview' || dest === '/ask') {
    return dest === '/overview' ? '/overview' : '/ask'
  }
  return `${dest}?demo=sandbox`
}

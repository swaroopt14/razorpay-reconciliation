import type { DockId } from '@/services/payout-command/model'
import { sandboxDockHref } from '@/services/payout-command/demo/ycDemoConstants'

/** Canonical India Finance Controller routes. Dock fallbacks keep sandbox shells working. */
export function financeDockHref(id: DockId): string {
  switch (id) {
    case 'home':
      return '/overview'
    case 'grid':
      return '/transactions?demo=sandbox'
    case 'exceptions':
    case 'leakage':
      return '/exceptions?demo=sandbox'
    case 'ambiguity':
      return '/reconciliation?demo=sandbox'
    case 'settlement':
      return '/settlements?demo=sandbox'
    case 'proof':
      return '/proof?demo=sandbox'
    case 'workspace':
      return '/ask'
    case 'connectors':
      return '/connections?demo=sandbox'
    case 'billing':
      return sandboxDockHref('billing')
    case 'support':
      return '/admin?tab=support'
    default:
      return sandboxDockHref(id)
  }
}

/** Canonical India Finance Controller paths for legacy dock ids. */

export function canonicalDockPath(dock: string): string {
  switch (dock) {
    case 'home':
      return '/overview'
    case 'grid':
      return '/transactions'
    case 'exceptions':
    case 'leakage':
    case 'ambiguity':
      return '/exceptions'
    case 'settlement':
      return '/settlement/journal'
    case 'proof':
      return '/proof'
    case 'workspace':
      return '/ask'
    case 'connectors':
      return '/connections'
    case 'support':
      return '/admin?tab=support'
    case 'billing':
    default:
      return '/overview'
  }
}

function firstParam(raw: string | string[] | undefined): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw
  const t = v?.trim()
  return t || undefined
}

export type LegacyPayoutSearchParams = {
  dock?: string | string[]
  batch_id?: string | string[]
  client_batch_id?: string | string[]
}

/** Map `/sandbox?dock=` and `/payout-command-view/today?dock=` onto standalone routes. */
export function legacyPayoutCommandRedirect(searchParams: LegacyPayoutSearchParams): string {
  const dest = canonicalDockPath(firstParam(searchParams.dock) ?? 'home')
  const [path, existing = ''] = dest.split('?')
  const q = new URLSearchParams(existing)
  if (!q.has('demo')) q.set('demo', 'sandbox')
  const batch = firstParam(searchParams.batch_id) || firstParam(searchParams.client_batch_id)
  if (batch) {
    q.set('batch_id', batch)
    q.set('client_batch_id', batch)
  }
  const qs = q.toString()
  return qs ? `${path}?${qs}` : path
}

import { dockItems, type DockId } from '@/services/payout-command/model'

/** Resolve `?dock=` for the payout command shell — safe for Server Components (no `window`). */
export function resolveInitialDock(
  raw: string | string[] | undefined,
  /** When set, unknown or disallowed ids fall back to `home` (e.g. sandbox hides Connectors). */
  allowed?: readonly DockId[],
): DockId {
  const s = Array.isArray(raw) ? raw[0] : raw
  if (!s || typeof s !== 'string') return 'home'
  const id = s as DockId
  if (!dockItems.some((d) => d.id === id)) return 'home'
  if (allowed?.length && !allowed.includes(id)) return 'home'
  return id
}

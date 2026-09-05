export type LeakageWidgetId =
  | 'kpiHero'
  | 'trendChart'
  | 'watchlistTable'
  | 'batchScoreHealth'
  | 'zordInsight'

export const LEAKAGE_WIDGET_LABELS: Record<LeakageWidgetId, string> = {
  kpiHero: 'KPI hero',
  trendChart: 'Leakage trend',
  watchlistTable: 'Batch watchlist',
  batchScoreHealth: 'Batch score health',
  zordInsight: 'Zord insights',
}

export const DEFAULT_LEAKAGE_WIDGET_ORDER: LeakageWidgetId[] = [
  'kpiHero',
  'watchlistTable',
  'batchScoreHealth',
  'zordInsight',
]

const STORAGE_KEY = 'payout-leakage-widget-layout-v3'

export function loadLeakageWidgetLayout(): LeakageWidgetId[] {
  if (typeof window === 'undefined') return DEFAULT_LEAKAGE_WIDGET_ORDER
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_LEAKAGE_WIDGET_ORDER
    const parsed = JSON.parse(raw) as LeakageWidgetId[]
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_LEAKAGE_WIDGET_ORDER
    return parsed.filter((id): id is LeakageWidgetId => id in LEAKAGE_WIDGET_LABELS)
  } catch {
    return DEFAULT_LEAKAGE_WIDGET_ORDER
  }
}

export function saveLeakageWidgetLayout(order: LeakageWidgetId[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
}

export function resetLeakageWidgetLayout() {
  saveLeakageWidgetLayout(DEFAULT_LEAKAGE_WIDGET_ORDER)
}

/** Re-insert widgets hidden from the layout while keeping visible widget order. */
export function restoreHiddenLeakageWidgets(current: LeakageWidgetId[]): LeakageWidgetId[] {
  const next = [...current]
  for (const id of DEFAULT_LEAKAGE_WIDGET_ORDER) {
    if (next.includes(id)) continue
    const defaultIdx = DEFAULT_LEAKAGE_WIDGET_ORDER.indexOf(id)
    let insertAt = next.length
    for (let i = 0; i < next.length; i++) {
      const posInDefault = DEFAULT_LEAKAGE_WIDGET_ORDER.indexOf(next[i])
      if (posInDefault > defaultIdx) {
        insertAt = i
        break
      }
    }
    next.splice(insertAt, 0, id)
  }
  return next
}

export function hiddenLeakageWidgetIds(current: LeakageWidgetId[]): LeakageWidgetId[] {
  return DEFAULT_LEAKAGE_WIDGET_ORDER.filter((id) => !current.includes(id))
}

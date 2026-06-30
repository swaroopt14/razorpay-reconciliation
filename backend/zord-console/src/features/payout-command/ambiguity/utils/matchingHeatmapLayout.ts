import type { MatchingExecutionHeatmap } from '@/services/payout-command/prod-api/intelligenceTypes'

export type HeatmapColumnStat = {
  label: string
  fullLabel: string
  reviewing: number
  syncing: number
  idle: number
  count: number
}

const COLUMN_FULL_LABELS: Record<string, string> = {
  Exact: 'Exact match',
  High: 'High confidence',
  Amb: 'Ambiguous',
  Unres: 'Unresolved',
  Conf: 'Conflicted',
  Intended: 'Intended match',
}

export function columnFullLabel(short: string): string {
  return COLUMN_FULL_LABELS[short] ?? short
}

/** Derive column intensity counts from heatmap cells only — not tenant KPI math. */
export function buildHeatmapColumnStats(heatmap: MatchingExecutionHeatmap): HeatmapColumnStat[] {
  const { x_labels, cells, column_totals } = heatmap
  return x_labels.map((label, colIdx) => {
    let reviewing = 0
    let syncing = 0
    let idle = 0
    for (const row of cells) {
      const v = row[colIdx] ?? 0
      if (v === 2) reviewing += 1
      else if (v === 1) syncing += 1
      else idle += 1
    }
    return {
      label,
      fullLabel: columnFullLabel(label),
      reviewing,
      syncing,
      idle,
      count: column_totals?.[colIdx] ?? 0,
    }
  })
}

export function countBatchesWithActiveReview(cells: number[][]): number {
  return cells.filter((row) => row.some((v) => v === 2)).length
}

const RISK_COLUMN_LABELS = new Set(['Amb', 'Unres', 'Conf'])

export function topReviewColumn(stats: HeatmapColumnStat[]): HeatmapColumnStat | null {
  const riskStats = stats.filter((s) => RISK_COLUMN_LABELS.has(s.label))
  if (!riskStats.length) return null
  return [...riskStats].sort((a, b) => b.reviewing - a.reviewing)[0] ?? null
}

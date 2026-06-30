import type {
  AmbiguityHeatmapBatchRow,
  AmbiguityHeatmapResponse,
  MatchingExecutionHeatmap,
} from './intelligenceTypes'
import { isDataAvailable } from './intelligenceTypes'

/** Column keys from ambiguity heatmap API — display labels applied in UI. */
const HEATMAP_X_LABELS = ['Exact', 'High', 'Amb', 'Unres', 'Conf'] as const
const MAX_ROWS = 12

/** Exact + High: high share is healthy (light). Amb + Unres + Conf: high share needs attention (dark). */
const HEALTHY_COLUMN = new Set([0, 1])

function batchRowLabel(batchId: string, index: number): number {
  const parts = batchId.split('_')
  const tail = parts[parts.length - 1]
  const n = Number.parseInt(tail, 10)
  return Number.isFinite(n) ? n : index + 1
}

function cellIntensity(count: number, total: number, columnIndex: number): number {
  const ratio = total > 0 ? count / total : 0
  if (HEALTHY_COLUMN.has(columnIndex)) {
    if (count <= 0) return 2
    if (ratio >= 0.55) return 0
    if (ratio >= 0.25) return 1
    return 2
  }
  if (count <= 0) return 0
  if (ratio >= 0.22) return 2
  if (ratio >= 0.06) return 1
  return 0
}

function buildSummary(batches: AmbiguityHeatmapBatchRow[]): string {
  if (!batches.length) return ''
  const reviewing = batches.filter((b) => b.finality_status === 'REQUIRES_REVIEW').length
  const syncing = batches.filter((b) => b.finality_status === 'PROCESSING').length
  const avgScore =
    batches.reduce((sum, b) => sum + (Number.isFinite(b.aggregate_score) ? b.aggregate_score : 0), 0) /
    batches.length
  const intents = batches.reduce((sum, b) => sum + (b.total_count ?? 0), 0)
  const parts = [
    `${batches.length} batch${batches.length === 1 ? '' : 'es'} in matching log`,
    syncing > 0 ? `${syncing} syncing` : null,
    reviewing > 0 ? `${reviewing} in review` : null,
    `avg match score ${Math.round(avgScore)}%`,
  ].filter(Boolean)
  return `${parts.join(' · ')} · ${intents.toLocaleString('en-IN')} intents tracked.`
}

export function mapAmbiguityHeatmapResponse(
  res: AmbiguityHeatmapResponse | null,
): MatchingExecutionHeatmap | null {
  if (!res || !isDataAvailable(res) || !res.batches?.length) return null

  const allBatches = res.batches

  // Sum ambiguous + unresolved across ALL batches — not just the display-capped slice.
  const intents_under_evaluation_count = allBatches.reduce(
    (sum, b) => sum + (b.ambiguous_count ?? 0) + (b.unresolved_count ?? 0),
    0,
  )

  const batches = allBatches.slice(0, MAX_ROWS)
  const y_labels = batches.map((b, i) => batchRowLabel(b.batch_id, i))
  const batch_ids = batches.map((b) => b.batch_id)
  const cells = batches.map((b) => {
    const total = b.total_count > 0 ? b.total_count : 1
    return [
      cellIntensity(b.exact_match_count, total, 0),
      cellIntensity(b.high_confidence_count, total, 1),
      cellIntensity(b.ambiguous_count, total, 2),
      cellIntensity(b.unresolved_count, total, 3),
      cellIntensity(b.conflicted_count, total, 4),
    ]
  })

  const column_totals = [
    batches.reduce((sum, b) => sum + (b.exact_match_count ?? 0), 0),
    batches.reduce((sum, b) => sum + (b.high_confidence_count ?? 0), 0),
    batches.reduce((sum, b) => sum + (b.ambiguous_count ?? 0), 0),
    batches.reduce((sum, b) => sum + (b.unresolved_count ?? 0), 0),
    batches.reduce((sum, b) => sum + (b.conflicted_count ?? 0), 0),
  ]

  return {
    y_labels,
    batch_ids,
    x_labels: [...HEATMAP_X_LABELS],
    cells,
    summary: buildSummary(batches),
    intents_under_evaluation_count,
    column_totals,
  }
}

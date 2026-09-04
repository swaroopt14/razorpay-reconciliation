import { formatInrPrecise } from '@/services/payout-command/batch-model'
import { BATCH_REVIEW_COPY } from '../copy/batchCommandCenterCopy'

export function formatBatchMetricPercent(
  numerator: number,
  denominator: number,
): { display: string; isEmpty: boolean } {
  if (denominator <= 0) {
    return { display: BATCH_REVIEW_COPY.kpis.noData, isEmpty: true }
  }
  const pct = (numerator / denominator) * 100
  return { display: `${pct.toFixed(1)}%`, isEmpty: false }
}

export function formatBatchCountPair(processed: number, total: number): string {
  if (total <= 0) return BATCH_REVIEW_COPY.kpis.recordsProcessed.empty
  return `${processed.toLocaleString('en-IN')} / ${total.toLocaleString('en-IN')} payments`
}

export function formatMinorDisplay(minor: number | null | undefined): string {
  if (minor == null || !Number.isFinite(minor) || minor <= 0) return BATCH_REVIEW_COPY.kpis.noData
  return formatInrPrecise(minor)
}

export function formatConfidencePct(confidence: number | null | undefined): string {
  if (confidence == null || !Number.isFinite(confidence)) return BATCH_REVIEW_COPY.kpis.noData
  return `${Math.round(confidence * 100)}%`
}

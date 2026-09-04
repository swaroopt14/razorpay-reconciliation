'use client'

import { useMemo } from 'react'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type {
  DefensibilityKpiResolved,
  PatternsKpiResolved,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import { toPortfolioLeakageViewModel, type PortfolioLeakageViewModel } from '../normalizeLeakagePayload'

export function usePortfolioLeakageData(tenantReady: boolean, batchId?: string) {
  const scopedBatchId = batchId?.trim() || undefined
  const { leakage, ambiguity, defensibility, patterns, loading, lastFetchedAt, refresh } = useIntelligenceKpis({
    tenantReady,
    batchId: scopedBatchId,
  })

  const leak = isDataAvailable(leakage) ? leakage : null
  const amb = isDataAvailable(ambiguity) ? ambiguity : null
  const def = isDataAvailable(defensibility) ? defensibility : null

  const patternsForScope = useMemo((): PatternsKpiResolved | null => {
    if (loading) return null
    if (!patterns || !isDataAvailable(patterns)) return null
    if (scopedBatchId) {
      const responseBatchId = patterns.batch_id?.trim()
      if (responseBatchId && responseBatchId !== scopedBatchId) return null
    }
    return patterns
  }, [loading, patterns, scopedBatchId])

  const patternsEmptyReason = useMemo(() => {
    if (loading || patternsForScope) return undefined
    if (patterns && !isDataAvailable(patterns) && patterns.reason) return patterns.reason
    if (scopedBatchId) return 'No pattern data for this batch yet.'
    return 'No workspace pattern snapshot yet. Select a batch from the watchlist.'
  }, [loading, patternsForScope, patterns, scopedBatchId])

  const viewModel: PortfolioLeakageViewModel | null = useMemo(() => {
    if (!leak) return null
    return toPortfolioLeakageViewModel(leak)
  }, [leak])

  return {
    viewModel,
    leak,
    ambiguity: amb,
    patterns: patternsForScope,
    patternsLoading: loading,
    patternsEmptyReason,
    defensibility: def as DefensibilityKpiResolved | null,
    loading,
    lastFetchedAt,
    refresh,
    hasData: Boolean(viewModel),
    emptyReason: leakage && !isDataAvailable(leakage) ? leakage.reason : undefined,
  }
}

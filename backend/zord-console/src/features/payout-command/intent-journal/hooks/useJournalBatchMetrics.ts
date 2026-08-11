'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchJournalBatchBundle } from '../journalBatchCache'
import { enrichBatchRecordWithMetrics } from '../mappers/mapIntentBatchSidebar'
import { deriveIntentBatchMetrics } from '../selectors/deriveIntentBatchMetrics'
import { LIVE_JOURNAL_POLL_MS } from '../journalConstants'
import type { JournalBatchRecord } from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import { findJournalBatch, fetchJournalSidebarBatches } from '../journalBatchCache'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { getProdDlqManualReview } from '@/services/payout-command/prod-api/getProdDlqManualReview'
import { dlqItemMatchesBatch } from '@/services/payout-command/prod-api/mapDlqContext'

/** Batch KPIs + enriched sidebar record from payment-intents + dlq-items + manual-review API. */
export function useJournalBatchMetrics(batchId: string, enabled: boolean, pollMs = LIVE_JOURNAL_POLL_MS) {
  const { tenantId, tenantReady } = useSessionTenant()
  const [baseBatch, setBaseBatch] = useState<JournalBatchRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<ReturnType<typeof deriveIntentBatchMetrics> | null>(null)

  const load = useCallback(async () => {
    const bid = batchId.trim()
    if (!bid || !enabled || !tenantReady || !tenantId.trim()) {
      setBaseBatch(null)
      setMetrics(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [list, bundle, manualReviewRes] = await Promise.all([
        fetchJournalSidebarBatches(tenantId),
        fetchJournalBatchBundle(bid),
        getProdDlqManualReview(),
      ])
      const found = findJournalBatch(list, bid)
      setBaseBatch(found)

      const paymentItems = bundle.paymentIntents?.items ?? []
      const dlqItems = bundle.dlqItems?.items ?? []

      // CON-P1-23: authoritative review count from manual-review endpoint (batch-scoped items).
      // Do not use tenant-wide pagination.total for a single batch.
      const manualReviewApiTotal = (manualReviewRes?.items ?? []).filter((row) =>
        dlqItemMatchesBatch(row, bid),
      ).length

      setMetrics(
        deriveIntentBatchMetrics(paymentItems, dlqItems, {
          paymentIntentTotal: bundle.paymentIntents?.pagination?.total,
          batchTotalAmount: found?.totalValue,
          manualReviewApiTotal,
        }),
      )
    } catch {
      setError('Could not load batch metrics.')
      setBaseBatch(null)
      setMetrics(null)
    } finally {
      setLoading(false)
    }
  }, [batchId, enabled, tenantId, tenantReady])

  useEffect(() => {
    if (!enabled || !tenantReady || !tenantId.trim()) {
      setBaseBatch(null)
      setMetrics(null)
      return
    }
    void load()
    const id = window.setInterval(() => void load(), pollMs)
    return () => window.clearInterval(id)
  }, [enabled, tenantReady, tenantId, load, pollMs])

  const batch = useMemo(() => {
    if (!baseBatch || !metrics) return baseBatch
    return enrichBatchRecordWithMetrics(baseBatch, {
      instructionCount: metrics.instructionCount,
      intendedValue: metrics.intendedValue,
      batchAggregateConfidenceScore: metrics.batchAggregateConfidenceScore,
      reviewCount: metrics.needsReviewCount,
    })
  }, [baseBatch, metrics])

  return { batch, metrics, loading, error, refetch: load }
}

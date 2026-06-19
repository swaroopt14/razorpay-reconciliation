/**
 * In-flight dedupe for journal widgets — each hook calls these helpers independently;
 * concurrent requests for the same key share one promise.
 */
import {
  getIntentJournalBatchIdsForSession,
  getIntentJournalDlqItemsForSession,
  getIntentJournalPaymentIntentsForSession,
} from '@/services/payout-command/prod-api/intentJournalApi'
import type {
  IntentJournalDlqItemsResponse,
  IntentJournalPaymentIntentsResponse,
} from '@/services/payout-command/prod-api/intentJournalTypes'
import { getIntelligenceBatches } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import {
  mapIntelligenceRowToBatchRecord,
  type JournalBatchRecord,
} from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import { getAllProdDlqRows } from '@/services/payout-command/prod-api/getProdDlqPage'
import { getProdDlqManualReview } from '@/services/payout-command/prod-api/getProdDlqManualReview'
import { dlqItemMatchesBatch, mergeDlqItemsById } from '@/services/payout-command/prod-api/mapDlqContext'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { mapBatchIdItemToBatchRecord } from './mappers/mapIntentBatchSidebar'

const listInflight = new Map<string, Promise<JournalBatchRecord[]>>()
const intentsInflight = new Map<string, Promise<IntentJournalPaymentIntentsResponse | null>>()
const dlqInflight = new Map<string, Promise<IntentJournalDlqItemsResponse | null>>()
const bundleInflight = new Map<
  string,
  Promise<{ paymentIntents: IntentJournalPaymentIntentsResponse | null; dlqItems: IntentJournalDlqItemsResponse | null }>
>()

export async function fetchJournalSidebarBatches(tenantId: string): Promise<JournalBatchRecord[]> {
  const key = `batch-ids:${tenantId || 'anon'}`
  const existing = listInflight.get(key)
  if (existing) return existing

  const promise = (async () => {
    const fetchRes = await getIntentJournalBatchIdsForSession()

    const merged = new Map<string, JournalBatchRecord>()

    if (fetchRes.ok && fetchRes.data) {
      for (const row of (fetchRes.data.items ?? []).map(mapBatchIdItemToBatchRecord)) {
        const bid = apiTrimmedString(row.batchId)
        if (!bid) continue
        merged.set(bid, row)
      }
    }

    if (tenantId.trim()) {
      try {
        const batchesRes = await getIntelligenceBatches({ limit: 100 })
        for (const row of (batchesRes?.batches ?? []).map(mapIntelligenceRowToBatchRecord)) {
          const bid = apiTrimmedString(row.batchId)
          if (!bid) continue
          const existing = merged.get(bid)
          if (!existing) {
            merged.set(bid, row)
            continue
          }
          merged.set(bid, {
            ...existing,
            source: existing.source || row.source,
            intelligenceCounts: row.intelligenceCounts ?? existing.intelligenceCounts,
          })
        }
      } catch {
        /* optional enrichment */
      }

      try {
        const dlqItems = await getAllProdDlqRows()
        const counts = new Map<string, number>()
        for (const row of dlqItems) {
          const bid = apiTrimmedString(row.client_batch_ref) || apiTrimmedString(row.batch_id)
          if (!bid) continue
          counts.set(bid, (counts.get(bid) ?? 0) + 1)
        }

        for (const [bid, count] of counts.entries()) {
          const existing = merged.get(bid)
          if (!existing) {
            merged.set(bid, {
              batchId: bid,
              type: 'Disbursement',
              apiType: '—',
              source: 'DLQ',
              totalValue: 0,
              transactions: count,
              confirmedCount: 0,
              highConfidenceCount: 0,
              mismatchCount: 0,
              unresolvedCount: count,
              engineSidebar: true,
            })
            continue
          }
          merged.set(bid, {
            ...existing,
            transactions: Math.max(existing.transactions, count),
            unresolvedCount: Math.max(existing.unresolvedCount, count),
          })
        }
      } catch {
        /* optional enrichment */
      }
    }

    return Array.from(merged.values())
  })().finally(() => {
    listInflight.delete(key)
  })

  listInflight.set(key, promise)
  return promise
}

export function findJournalBatch(
  batches: JournalBatchRecord[],
  batchId: string,
): JournalBatchRecord | null {
  const bid = batchId.trim()
  if (!bid) return null
  return batches.find((b) => b.batchId === bid) ?? null
}

export async function fetchJournalPaymentIntents(batchId: string): Promise<IntentJournalPaymentIntentsResponse | null> {
  const bid = batchId.trim()
  if (!bid) return null

  const existing = intentsInflight.get(bid)
  if (existing) return existing

  const promise = (async () => {
    const res = await getIntentJournalPaymentIntentsForSession(bid)
    return res.ok && res.data ? res.data : null
  })().finally(() => {
    intentsInflight.delete(bid)
  })

  intentsInflight.set(bid, promise)
  return promise
}

export async function fetchJournalDlqItems(batchId: string): Promise<IntentJournalDlqItemsResponse | null> {
  const bid = batchId.trim()
  if (!bid) return null

  const existing = dlqInflight.get(bid)
  if (existing) return existing

  const promise = (async () => {
    const [manualReviewRes, sessionRes] = await Promise.all([
      getProdDlqManualReview(),
      getIntentJournalDlqItemsForSession(bid),
    ])

    const manualForBatch = (manualReviewRes?.items ?? [])
      .filter((row) => dlqItemMatchesBatch(row, bid))
      .map((row) => ({
        dlq_id: row.dlq_id,
        client_batch_ref: row.client_batch_ref,
        batch_id: row.batch_id,
        source_row_num: row.source_row_num,
        stage: row.stage,
        reason_code: row.reason_code,
        error_detail: row.error_detail,
        dlq_status: row.dlq_status,
        intent_context: row.intent_context,
        replayable: row.replayable,
        created_at: row.created_at,
        tenant_id: row.tenant_id,
      }))

    const sessionItems = sessionRes.ok && sessionRes.data ? (sessionRes.data.items ?? []) : []

    if (manualForBatch.length > 0 || sessionItems.length > 0) {
      const merged = mergeDlqItemsById(manualForBatch, sessionItems)
      return {
        items: merged,
        pagination: {
          page: 1,
          page_size: merged.length,
          total: merged.length,
        },
      }
    }

    try {
      const dlqItems = await getAllProdDlqRows()
      const filteredItems = dlqItems.filter((row) => dlqItemMatchesBatch(row, bid))

      if (filteredItems.length > 0) {
        const merged = mergeDlqItemsById(manualForBatch, filteredItems.map((row) => ({
          dlq_id: row.dlq_id,
          client_batch_ref: row.client_batch_ref,
          batch_id: row.batch_id,
          source_row_num: row.source_row_num,
          stage: row.stage,
          reason_code: row.reason_code,
          error_detail: row.error_detail,
          dlq_status: row.dlq_status,
          intent_context: row.intent_context,
          replayable: row.replayable,
          created_at: row.created_at,
        })))
        return {
          items: merged,
          pagination: {
            page: 1,
            page_size: merged.length,
            total: merged.length,
          },
        }
      }
    } catch {
      /* optional fallback */
    }

    if (sessionRes.ok && sessionRes.data) return sessionRes.data
    if (manualForBatch.length > 0) {
      return {
        items: manualForBatch,
        pagination: {
          page: 1,
          page_size: manualForBatch.length,
          total: manualForBatch.length,
        },
      }
    }
    return null
  })().finally(() => {
    dlqInflight.delete(bid)
  })

  dlqInflight.set(bid, promise)
  return promise
}

export async function fetchJournalBatchBundle(batchId: string): Promise<{
  paymentIntents: IntentJournalPaymentIntentsResponse | null
  dlqItems: IntentJournalDlqItemsResponse | null
}> {
  const bid = batchId.trim()
  if (!bid) return { paymentIntents: null, dlqItems: null }

  const existing = bundleInflight.get(bid)
  if (existing) return existing

  const promise = Promise.all([fetchJournalPaymentIntents(bid), fetchJournalDlqItems(bid)]).then(
    ([paymentIntents, dlqItems]) => ({ paymentIntents, dlqItems }),
  ).finally(() => {
    bundleInflight.delete(bid)
  })

  bundleInflight.set(bid, promise)
  return promise
}

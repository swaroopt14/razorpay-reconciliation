/**
  * In-flight dedupe for journal widgets - each hook calls these helpers independently;
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
            transactions: existing.transactions > 0 ? existing.transactions : (row.transactions || existing.transactions),
            totalValue: existing.totalValue > 0 ? existing.totalValue : (row.totalValue || existing.totalValue),
            confirmedCount:
              existing.confirmedCount > 0 ? existing.confirmedCount : (row.confirmedCount || existing.confirmedCount),
            unresolvedCount: Math.max(existing.unresolvedCount || 0, row.unresolvedCount || 0),
            reviewAmount: Math.max(existing.reviewAmount || 0, row.reviewAmount || 0),
            failedAmount: Math.max(existing.failedAmount || 0, row.failedAmount || 0),
            confirmedAmount: Math.max(existing.confirmedAmount || 0, row.confirmedAmount || 0),
          })
        }
      } catch {
        /* optional enrichment */
      }

      // Enrich totals + status counts from payment-intents (authoritative for Transactions KPIs)
      try {
        const batchIds = Array.from(merged.keys())
        const intentResults = await Promise.allSettled(batchIds.map((bid) => fetchJournalPaymentIntents(bid)))
        for (let i = 0; i < batchIds.length; i++) {
          const result = intentResults[i]
          if (result?.status !== 'fulfilled' || !result.value) continue
          const items = result.value.items ?? []
          if (items.length === 0) continue
          const bid = batchIds[i]!
          const existing = merged.get(bid)
          if (!existing) continue

          let amount = 0
          let confirmed = 0
          let confirmedAmount = 0
          let failed = 0
          let failedAmount = 0
          let review = 0
          let reviewAmount = 0
          let confidence: number | null = null

          for (const item of items) {
            const rawAmt = item.amount
            const amt =
              typeof rawAmt === 'number' ? rawAmt : Number.parseFloat(String(rawAmt ?? '').replace(/,/g, ''))
            const safe = Number.isFinite(amt) ? amt : 0
            amount += safe
            const st = String(item.status ?? '').toLowerCase()
            if (st === 'processed' || st === 'confirmed' || st.includes('success') || st === 'settled') {
              confirmed += 1
              confirmedAmount += safe
            } else if (
              st === 'failed' ||
              st === 'reversed' ||
              st === 'rejected' ||
              st === 'cancelled' ||
              st.includes('fail')
            ) {
              failed += 1
              failedAmount += safe
            } else {
              review += 1
              reviewAmount += safe
            }
            if (confidence == null && item.aggregate_confidence_score != null) {
              const raw = item.aggregate_confidence_score
              const score = typeof raw === 'string' ? Number.parseFloat(raw) : raw
              if (typeof score === 'number' && Number.isFinite(score)) confidence = score
            }
          }

          merged.set(bid, {
            ...existing,
            transactions: Math.max(existing.transactions || 0, items.length, result.value.pagination?.total ?? 0),
            totalValue: amount > 0 ? amount : existing.totalValue,
            confirmedCount: confirmed > 0 ? confirmed : existing.confirmedCount,
            confirmedAmount: confirmedAmount > 0 ? confirmedAmount : existing.confirmedAmount,
            failedAmount: failedAmount > 0 ? failedAmount : existing.failedAmount,
            reviewAmount: reviewAmount > 0 ? reviewAmount : existing.reviewAmount,
            unresolvedCount: Math.max(existing.unresolvedCount || 0, review),
            mismatchCount: Math.max(existing.mismatchCount || 0, 0),
            intelligenceCounts: {
              success_count: confirmed,
              failed_count: failed,
              pending_count: review,
              finality_status: existing.intelligenceCounts?.finality_status ?? 'OPEN',
            },
            aggregateConfidenceScore: confidence ?? existing.aggregateConfidenceScore,
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
              apiType: '-',
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
            // Keep payout-intent counts authoritative — do not inflate with DLQ row counts.
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

/**
 * In-flight dedupe for settlement journal widgets — each hook calls these helpers independently;
 * concurrent requests for the same key share one promise.
 */
import {
  extractClientBatchIdsFromListResponse,
  getSettlementObservationBatchesForSession,
  getSettlementObservationsForClientBatch,
  getSettlementObservationsPageForClientBatch,
  mapObservationToTableRow,
  type SettlementObservationDetailResponse,
  type SettlementObservationTableRow,
} from '@/services/payout-command/prod-api/settlementObservations'

const listInflight = new Map<string, Promise<string[]>>()
const detailInflight = new Map<string, Promise<SettlementObservationsFetchResult>>()

export type SettlementObservationsFetchResult = {
  rows: SettlementObservationTableRow[]
  total: number | null
}

function mergeBatchIds(apiIds: string[], pinned?: string): string[] {
  const out = [...apiIds]
  const pin = pinned?.trim()
  if (pin && !out.includes(pin)) out.unshift(pin)
  return out
}

export async function fetchSettlementSidebarBatches(pinnedId?: string): Promise<string[]> {
  const key = `list:${pinnedId?.trim() || 'all'}`
  const existing = listInflight.get(key)
  if (existing) return existing

  const promise = (async () => {
    const fetchRes = await getSettlementObservationBatchesForSession()
    const apiIds =
      fetchRes.ok && fetchRes.data ? extractClientBatchIdsFromListResponse(fetchRes.data) : []
    return mergeBatchIds(apiIds, pinnedId)
  })().finally(() => {
    listInflight.delete(key)
  })

  listInflight.set(key, promise)
  return promise
}

export async function fetchSettlementObservationsWithMeta(
  clientBatchId: string,
): Promise<SettlementObservationsFetchResult> {
  const bid = clientBatchId.trim()
  if (!bid) return { rows: [], total: null }

  const key = `all:${bid}`
  const existing = detailInflight.get(key)
  if (existing) return existing

  const promise = (async () => {
    const obsRes = await getSettlementObservationsForClientBatch(bid)
    if (!obsRes.ok || !obsRes.data?.items?.length) {
      return { rows: [], total: obsRes.data?.total ?? null }
    }
    const rows = obsRes.data.items.map((it, rowIndex) =>
      mapObservationToTableRow(it, { clientBatchId: bid, rowIndex }),
    )
    return {
      rows,
      total: obsRes.data.total,
    }
  })().finally(() => {
    detailInflight.delete(key)
  })

  detailInflight.set(key, promise)
  return promise
}

export async function fetchSettlementObservationsPageWithMeta(
  clientBatchId: string,
  page: number,
  pageSize: number,
): Promise<SettlementObservationsFetchResult> {
  const bid = clientBatchId.trim()
  if (!bid) return { rows: [], total: null }

  const key = `page:${bid}:${page}:${pageSize}`
  const existing = detailInflight.get(key)
  if (existing) return existing

  const promise = (async () => {
    const obsRes = await getSettlementObservationsPageForClientBatch(bid, { page, pageSize })
    if (!obsRes.ok || !obsRes.data?.items?.length) {
      return { rows: [], total: obsRes.data?.total ?? null }
    }
    const rows = obsRes.data.items.map((it, rowIndex) =>
      mapObservationToTableRow(it, { clientBatchId: bid, rowIndex }),
    )
    return {
      rows,
      total: obsRes.data.total,
    }
  })().finally(() => {
    detailInflight.delete(key)
  })

  detailInflight.set(key, promise)
  return promise
}

export async function fetchSettlementObservations(
  clientBatchId: string,
): Promise<SettlementObservationTableRow[]> {
  const result = await fetchSettlementObservationsWithMeta(clientBatchId)
  return result.rows
}

export type { SettlementObservationDetailResponse }

import { apiTrimmedString } from './coerceApiField'
import type { EvidencePackSummaryRow } from './evidenceTypes'
import { getEvidencePacksForBatchIntents } from './getEvidencePacksForBatchIntents'
import { listEvidencePacks } from './getEvidencePacks'
import { getIntentJournalBatchIdsForSession } from './intentJournalApi'
import {
  batchPackSummaryFromLineage,
  isBatchEvidencePack,
} from './resolveBatchEvidencePack'
import { getEvidenceBatchLineageGraph } from './getEvidenceBatchLineageGraph'

/** Session-scoped batch ids from intent-engine BFF (tenant injected server-side). */
export async function getEvidenceBatchIdsForSession(): Promise<string[]> {
  const res = await getIntentJournalBatchIdsForSession()
  if (!res.ok || !res.data?.items?.length) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of res.data.items) {
    const id = apiTrimmedString(item.batch_id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export type ListEvidencePacksForBatchResult = {
  packs: EvidencePackSummaryRow[]
  /** Non-fatal upstream errors (401/502/empty) for UI diagnostics. */
  errors: string[]
}

function mergePackRows(
  bid: string,
  intentPacks: EvidencePackSummaryRow[],
  batchScoped: Awaited<ReturnType<typeof listEvidencePacks>>,
  batchLineage: Awaited<ReturnType<typeof getEvidenceBatchLineageGraph>>,
): EvidencePackSummaryRow[] {
  const byId = new Map<string, EvidencePackSummaryRow>()
  const upsert = (row: EvidencePackSummaryRow) => {
    const id = apiTrimmedString(row.evidence_pack_id)
    if (!id) return
    const prev = byId.get(id)
    byId.set(id, prev ? { ...prev, ...row } : row)
  }

  for (const row of batchScoped?.packs ?? []) upsert(row)
  for (const row of intentPacks) upsert(row)
  if (batchLineage.data) {
    const fromLineage = batchPackSummaryFromLineage(bid, batchLineage.data)
    if (fromLineage) upsert(fromLineage)
  }

  const rows = [...byId.values()]
  rows.sort((a, b) => {
    const aIsBatch = isBatchEvidencePack(a)
    const bIsBatch = isBatchEvidencePack(b)
    if (aIsBatch !== bIsBatch) return aIsBatch ? -1 : 1
    return (a.created_at ?? '').localeCompare(b.created_at ?? '')
  })
  return rows
}

/**
 * Packs for one batch: intent-level list + batch-scoped list + batch lineage graph
 * (GET /v1/evidence/batch/:batchId/lineage-graph exposes the batch pack id).
 */
export async function listEvidencePacksForBatch(batchId: string): Promise<ListEvidencePacksForBatchResult> {
  const bid = apiTrimmedString(batchId)
  if (!bid) return { packs: [], errors: [] }

  const [intentRes, batchScoped, batchLineage] = await Promise.all([
    getEvidencePacksForBatchIntents(bid),
    listEvidencePacks({ batchId: bid }),
    getEvidenceBatchLineageGraph(bid),
  ])

  const errors: string[] = []
  if (intentRes.error) errors.push(`batch/intents: ${intentRes.error}`)
  if (!batchScoped) errors.push('packs list: no response (check session / evidence service)')
  if (batchLineage.error) errors.push(`batch/lineage-graph: ${batchLineage.error}`)

  const packs = mergePackRows(bid, intentRes.packs, batchScoped, batchLineage)
  return { packs, errors }
}

/** Try multiple batch ids (intent journal + intelligence) until packs are found. */
export async function listEvidencePacksForFirstBatchWithData(
  batchIds: string[],
): Promise<ListEvidencePacksForBatchResult & { resolvedBatchId: string | null }> {
  const seen = new Set<string>()
  const errors: string[] = []
  for (const raw of batchIds) {
    const bid = apiTrimmedString(raw)
    if (!bid || seen.has(bid)) continue
    seen.add(bid)
    const result = await listEvidencePacksForBatch(bid)
    if (result.packs.length > 0) {
      return { ...result, resolvedBatchId: bid }
    }
    if (result.errors.length) {
      errors.push(...result.errors.map((e) => `[${bid}] ${e}`))
    }
  }
  return { packs: [], errors, resolvedBatchId: null }
}

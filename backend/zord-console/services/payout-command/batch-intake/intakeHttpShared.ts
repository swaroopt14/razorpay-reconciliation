/** Shared helpers for batch intake API calls (intent + settlement). */

/**
 * zord-edge `/v1/*` API-key middleware only accepts `Authorization: Bearer <prefix>.<secret>`.
 * Strip optional `Bearer` / `ApiKey` / `API-Key` prefix from pasted values, then always send `Bearer`.
 */
export function normalizeAuthorizationHeader(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  let token = v
  if (/^(Bearer|ApiKey|API-Key)\s+/i.test(token)) {
    token = token.replace(/^(Bearer|ApiKey|API-Key)\s+/i, '').trim()
  }
  if (!token) return null
  return `Bearer ${token}`
}

export function extractBatchIdFromBulkIngestResponse(text: string): string | null {
  if (!text.trim()) return null
  try {
    const j = JSON.parse(text) as Record<string, unknown>
    const data = j.data && typeof j.data === 'object' ? (j.data as Record<string, unknown>) : null
    const candidates: unknown[] = [j.batchId, j.batch_id, j.BatchId, data?.batchId, data?.batch_id, data?.BatchId]
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim()
    }
  } catch {
    /* ignore */
  }
  return null
}

/** One row from zord-edge `POST /v1/bulk-ingest` accepted body (`BulkResult` JSON). */
export type BulkIngestAckRow = {
  row: number
  envelopeId: string
  traceId: string
  status: string
  receivedAt: string
  error?: string
}

export type ParsedBulkIngestAccepted = {
  total: number
  accepted: number
  failed: number
  duplicates: number
  conflicts: number
  rows: BulkIngestAckRow[]
}

function readJsonString(o: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return ''
}

/**
 * Parses a successful bulk-ingest JSON body (`total` + `results[]`).
 * Returns null if the payload is not in that shape (caller may fall back to raw text).
 */
export function parseBulkIngestAcceptedResponse(text: string): ParsedBulkIngestAccepted | null {
  if (!text.trim()) return null
  try {
    const j = JSON.parse(text) as Record<string, unknown>
    const totalRaw = j.total
    const total =
      typeof totalRaw === 'number'
        ? totalRaw
        : typeof totalRaw === 'string' && totalRaw.trim()
          ? Number(totalRaw)
          : NaN
    const results = j.results
    if (!Array.isArray(results) || !Number.isFinite(total)) return null

    const rows: BulkIngestAckRow[] = []
    let accepted = 0
    let failed = 0
    let duplicates = 0
    let conflicts = 0

    for (const raw of results) {
      if (!raw || typeof raw !== 'object') continue
      const o = raw as Record<string, unknown>
      const rowNum = typeof o.row === 'number' ? o.row : Number(o.row)
      if (!Number.isFinite(rowNum)) continue

      const envelopeId = readJsonString(o, 'EnvelopeID', 'envelope_id')
      const traceId = readJsonString(o, 'Trace_id', 'TraceID', 'trace_id')
      const status = readJsonString(o, 'Status', 'status') || '-'
      const receivedAt = readJsonString(o, 'Received_At', 'received_at')
      const err = readJsonString(o, 'error', 'Error')

      switch (status.trim().toUpperCase()) {
        case 'ACCEPTED':
          accepted += 1
          break
        case 'DUPLICATE':
          duplicates += 1
          break
        case 'CONFLICT':
          conflicts += 1
          break
        default:
          failed += 1
          break
      }

      rows.push({
        row: rowNum,
        envelopeId,
        traceId,
        status,
        receivedAt,
        ...(err ? { error: err } : {}),
      })
    }

    return { total, accepted, failed, duplicates, conflicts, rows }
  } catch {
    return null
  }
}

export function errorMessageFromProxyResponse(status: number, responseText: string): string {
  if (!responseText.trim()) return `HTTP ${status}`
  let parsed: unknown = null
  try {
    parsed = JSON.parse(responseText)
  } catch {
    return responseText.slice(0, 500)
  }
  if (parsed && typeof parsed === 'object') {
    const o = parsed as Record<string, unknown>
    if (typeof o.error === 'string' && o.error.trim()) return o.error
    const errCap = o.Error
    if (typeof errCap === 'string' && errCap.trim()) return errCap
    if (o.error && typeof o.error === 'object') {
      const inner = o.error as Record<string, unknown>
      if (typeof inner.message === 'string' && inner.message.trim()) return inner.message
    }
    if (typeof o.message === 'string' && o.message.trim()) return o.message
    if (typeof o.details === 'string' && o.details.trim()) return o.details
    if (typeof o.upstream === 'string' && o.upstream.trim()) {
      const base =
        typeof o.error === 'string' && o.error.trim()
          ? o.error
          : typeof o.message === 'string' && o.message.trim()
            ? o.message
            : `HTTP ${status}`
      return `${base} (${o.upstream})`
    }
  }
  return `HTTP ${status}`
}

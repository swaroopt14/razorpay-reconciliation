/**
 * Step 1 — Intent batch file → Next proxy → zord-edge POST /v1/bulk-ingest (never intelligence)
 * Breakpoint-friendly: all request/response handling lives here.
 *
 * Product default (Arealis): failed **bulk rows** (validation / business rules after a row
 * is identified) should remain **intents** (or dedicated batch line-item entities) with
 * **FAILED** status and **structured errors**, reconciled in Intent Journal / batch UIs.
 * Reserve **DLQ** for true ingest/engine **dead letters** that never became a proper intent
 * (or must not be mixed with normal intent lists).
 */
import {
  errorMessageFromProxyResponse,
  extractBatchIdFromBulkIngestResponse,
  normalizeAuthorizationHeader,
} from './intakeHttpShared'

export const INTENT_BULK_INGEST_PROXY_PATH = '/api/bulk-ingest'

export type PostIntentBulkIngestParams = {
  file: File
  /**
   * Optional. When empty, `/api/bulk-ingest` uses `ZORD_BULK_INGEST_API_KEY` on the server (if set).
   * Otherwise raw pasted key or full `Bearer …` / `ApiKey …` / `API-Key …` (normalized to `Bearer …` for zord-edge).
   */
  apiKeyRaw?: string
  /** e.g. CSV, FILE_UPLOAD — must match zord-edge TransportValidation allowlist */
  sourceType: string
  /**
   * Optional static parser type (BANK / NBFC / MERCHANT / VENDOR / GATEWAY).
   * Omit to use profile-driven pass-through + intent-engine source auto-detection (Postman default).
   */
  tenantType?: string
  /** Optional; forwarded as Batch-Id when set */
  optionalBatchId?: string
  /** Optional; forwarded as X-Idempotency-Key */
  idempotencyKey?: string
  /** Optional; forwarded as X-Zord-Source-System */
  sourceSystem?: string
  /** When true, forwards X-Zord-Force-Reprocess (Batch-Id required upstream). */
  forceReprocess?: boolean
  /** Override for tests or non-Next callers */
  endpointPath?: string
}

export type PostIntentBulkIngestResult = {
  ok: boolean
  httpStatus: number
  responseText: string
  batchIdFromBody: string | null
  errorMessage: string | null
  requestPath: string
}

export async function postIntentBulkIngest(params: PostIntentBulkIngestParams): Promise<PostIntentBulkIngestResult> {
  const path = params.endpointPath ?? INTENT_BULK_INGEST_PROXY_PATH
  const auth = normalizeAuthorizationHeader(params.apiKeyRaw ?? '')

  const formData = new FormData()
  formData.append('file', params.file, params.file.name)

  const headers: Record<string, string> = {
    'x-zord-source-type': params.sourceType,
    'x-zord-source-class': 'INTENT',
  }
  const tenantType = params.tenantType?.trim()
  if (tenantType) headers['x-zord-tenant-type'] = tenantType
  if (auth) headers.authorization = auth
  const bid = params.optionalBatchId?.trim()
  if (bid) headers['Batch-ID'] = bid
  const idempotencyKey = params.idempotencyKey?.trim()
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey
  const sourceSystem = params.sourceSystem?.trim()
  if (sourceSystem) headers['X-Zord-Source-System'] = sourceSystem
  if (params.forceReprocess) headers['X-Zord-Force-Reprocess'] = 'true'

  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network request failed'
    return {
      ok: false,
      httpStatus: 0,
      responseText: '',
      batchIdFromBody: null,
      errorMessage: `${msg}. Check zord-edge is running (default :8080) or set ZORD_EDGE_URL.`,
      requestPath: path,
    }
  }
  const responseText = await response.text()
  const batchIdFromBody = extractBatchIdFromBulkIngestResponse(responseText)

  if (!response.ok) {
    return {
      ok: false,
      httpStatus: response.status,
      responseText,
      batchIdFromBody,
      errorMessage: errorMessageFromProxyResponse(response.status, responseText),
      requestPath: path,
    }
  }

  return {
    ok: true,
    httpStatus: response.status,
    responseText,
    batchIdFromBody,
    errorMessage: null,
    requestPath: path,
  }
}

/**
 * Step 2 — Settlement file → Next BFF `/api/settlement/upload` → outcome-engine:
 *
 *   POST {ZORD_SETTLEMENT_URL}/v1/settlement/upload?tenant_id=<session>&psp=<psp>&batch_id=<optional>
 *
 * Headers forwarded by BFF:
 *   Content-Type: multipart/form-data
 *   Batch-Id: <client batch id>
 *   X-Zord-Force-Reprocess: true
 *   X-Zord-Force-Reprocess-Reason: CLIENT_CORRECTED_FILE
 *
 * Body: multipart field `file`
 *
 * `tenant_id` is never sent from the browser — the BFF injects it from the signed-in session.
 */
import { errorMessageFromProxyResponse, normalizeAuthorizationHeader } from './intakeHttpShared'

export const SETTLEMENT_UPLOAD_PROXY_PATH = '/api/settlement/upload'

/** Settlement uploads accept common bank/PSP export formats (no PSP-specific filter). */
export const SETTLEMENT_FILE_ACCEPT =
  '.csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export type PostSettlementFileUploadParams = {
  file: File
  /** Optional; server uses `ZORD_SETTLEMENT_API_KEY` or `ZORD_BULK_INGEST_API_KEY` when unset. */
  apiKeyRaw?: string
  /** Ignored by BFF: tenant is injected from the signed-in session. */
  tenantId?: string
  psp: string
  batchId: string
  /** Override for tests */
  endpointPath?: string
}

export type PostSettlementFileUploadResult = {
  ok: boolean
  httpStatus: number
  responseText: string
  errorMessage: string | null
  requestUrl: string
}

export async function postSettlementFileUpload(params: PostSettlementFileUploadParams): Promise<PostSettlementFileUploadResult> {
  const base = params.endpointPath ?? SETTLEMENT_UPLOAD_PROXY_PATH
  const auth = normalizeAuthorizationHeader(params.apiKeyRaw ?? '')

  const psp = params.psp.trim()
  const batchId = params.batchId.trim()
  const q = new URLSearchParams({ psp })
  if (batchId) q.set('batch_id', batchId)
  const requestUrl = `${base}?${q.toString()}`

  const formData = new FormData()
  formData.append('file', params.file, params.file.name)

  const uploadHeaders: Record<string, string> = {
    'X-Zord-Force-Reprocess': 'true',
    'X-Zord-Force-Reprocess-Reason': 'CLIENT_CORRECTED_FILE',
  }
  if (batchId) uploadHeaders['Batch-Id'] = batchId
  if (auth) uploadHeaders.authorization = auth

  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: uploadHeaders,
      body: formData,
      credentials: 'include',
    })

    const responseText = await response.text()

    if (!response.ok) {
      const parsed = errorMessageFromProxyResponse(response.status, responseText)
      return {
        ok: false,
        httpStatus: response.status,
        responseText,
        errorMessage: parsed || `HTTP ${response.status}`,
        requestUrl,
      }
    }

    return {
      ok: true,
      httpStatus: response.status,
      responseText,
      errorMessage: null,
      requestUrl,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network request failed'
    return {
      ok: false,
      httpStatus: 0,
      responseText: '',
      errorMessage: `${msg}. Check outcome-engine is running (default :8081) or set ZORD_SETTLEMENT_URL.`,
      requestUrl,
    }
  }
}

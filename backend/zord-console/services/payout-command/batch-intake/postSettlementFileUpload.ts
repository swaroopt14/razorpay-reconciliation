/**
 * Step 2 — Settlement file → Next BFF `/api/settlement/upload` → outcome-engine:
 *
 *   POST {ZORD_SETTLEMENT_URL}/v1/settlement/upload?tenant_id=<session>&psp=<psp>&batch_id=<optional>
 *
 * Headers forwarded by BFF:
 *   Content-Type: multipart/form-data
 *   Batch-Id: <client batch id>
 *   X-Zord-Force-Reprocess / Reason: only when explicitly selected in the UI
 *
 * Body: multipart field `file`
 *
 * `tenant_id` is never sent from the browser — the BFF injects it from the signed-in session.
 */
import { csrfMutationHeaders } from '@/services/auth/csrfBrowser'
import { errorMessageFromProxyResponse, normalizeAuthorizationHeader } from './intakeHttpShared'
import type { ReprocessReason } from './reprocessReason'

export const SETTLEMENT_UPLOAD_PROXY_PATH = '/api/settlement/upload'

/** Settlement uploads accept common bank/PSP export formats (no PSP-specific filter). */
export const SETTLEMENT_FILE_ACCEPT =
  '.csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export type PostSettlementFileUploadParams = {
  file: File
  /**
   * Optional explicit Authorization. When empty, `/api/settlement/upload` uses the
   * signed-in session cookie only — never a server env ingest key (CON-P0-02).
   */
  apiKeyRaw?: string
  /** Ignored by BFF: tenant is injected from the signed-in session. */
  tenantId?: string
  psp: string
  batchId: string
  forceReprocess?: boolean
  reprocessReason?: ReprocessReason
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

  const uploadHeaders: Record<string, string> = csrfMutationHeaders()
  if (params.forceReprocess) {
    uploadHeaders['X-Zord-Force-Reprocess'] = 'true'
    if (params.reprocessReason) uploadHeaders['X-Zord-Force-Reprocess-Reason'] = params.reprocessReason
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

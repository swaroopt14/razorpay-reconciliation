/**
 * Step 2 — Settlement file → Next BFF `/api/settlement/upload` → outcome-engine:
 *
 *   POST {ZORD_SETTLEMENT_URL}/v1/settlement/upload?tenant_id=<session>&psp=<psp>&batch_id=<optional>
 *
 * CON-P0-03 — normal uploads send no force headers. Reprocess/correction only when
 * the operator explicitly chooses that mode (force=true + reason).
 *
 * Body: multipart field `file`
 *
 * `tenant_id` is never sent from the browser — the BFF injects it from the signed-in session.
 */
import { csrfMutationHeaders } from '@/services/auth/csrfBrowser'
import { errorMessageFromProxyResponse, normalizeAuthorizationHeader } from './intakeHttpShared'

export const SETTLEMENT_UPLOAD_PROXY_PATH = '/api/settlement/upload'

/** Settlement uploads accept common bank/PSP export formats (no PSP-specific filter). */
export const SETTLEMENT_FILE_ACCEPT =
  '.csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Aligns with Outcome Engine allowed `X-Zord-Force-Reprocess-Reason` values. */
export const SETTLEMENT_FORCE_REASONS = [
  'CLIENT_CORRECTED_FILE',
  'PARSER_FIX',
  'BACKFILL',
  'MANUAL',
] as const

export type SettlementForceReason = (typeof SETTLEMENT_FORCE_REASONS)[number]

/**
 * - `new` — first / normal upload (no force headers)
 * - `reprocess` — same-content reprocess of existing version (force + reason)
 * - `correction` — changed-content correction (force + CLIENT_CORRECTED_FILE)
 */
export type SettlementUploadMode = 'new' | 'reprocess' | 'correction'

export type SettlementBaselineInfo = {
  settlementBatchId: string | null
  clientBatchId: string | null
  activeRunId: string | null
  outcomeArtifactId: string | null
  outcomeArtifactVersionId: string | null
  runNumber: number | null
  alreadyProcessed: boolean
  status: string | null
}

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
  /** Default `new` — does not force reprocess/correction. */
  mode?: SettlementUploadMode
  /**
   * Required when mode is `reprocess` or `correction`.
   * Correction defaults to `CLIENT_CORRECTED_FILE` when omitted.
   */
  forceReprocessReason?: SettlementForceReason | string
  /** Override for tests */
  endpointPath?: string
}

export type PostSettlementFileUploadResult = {
  ok: boolean
  httpStatus: number
  responseText: string
  errorMessage: string | null
  requestUrl: string
  /** True when Outcome returned already_processed for an exact duplicate (no force). */
  alreadyProcessed: boolean
  baseline: SettlementBaselineInfo | null
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function parseSettlementUploadBaseline(responseText: string): SettlementBaselineInfo | null {
  if (!responseText.trim()) return null
  try {
    const body = JSON.parse(responseText) as Record<string, unknown>
    const runNumberRaw = body.run_number
    return {
      settlementBatchId: asTrimmedString(body.settlement_batch_id),
      clientBatchId: asTrimmedString(body.client_batch_id),
      activeRunId: asTrimmedString(body.active_run_id) ?? asTrimmedString(body.ingest_run_id),
      outcomeArtifactId: asTrimmedString(body.outcome_artifact_id),
      outcomeArtifactVersionId: asTrimmedString(body.outcome_artifact_version_id),
      runNumber: typeof runNumberRaw === 'number' && Number.isFinite(runNumberRaw) ? runNumberRaw : null,
      alreadyProcessed: body.already_processed === true,
      status: asTrimmedString(body.status),
    }
  } catch {
    return null
  }
}

export async function postSettlementFileUpload(
  params: PostSettlementFileUploadParams,
): Promise<PostSettlementFileUploadResult> {
  const base = params.endpointPath ?? SETTLEMENT_UPLOAD_PROXY_PATH
  const auth = normalizeAuthorizationHeader(params.apiKeyRaw ?? '')
  const mode: SettlementUploadMode = params.mode ?? 'new'

  const psp = params.psp.trim()
  const batchId = params.batchId.trim()
  if ((mode === 'reprocess' || mode === 'correction') && !batchId) {
    return {
      ok: false,
      httpStatus: 0,
      responseText: '',
      errorMessage: 'Reprocess and correction require a batch reference.',
      requestUrl: base,
      alreadyProcessed: false,
      baseline: null,
    }
  }

  const q = new URLSearchParams({ psp })
  if (batchId) q.set('batch_id', batchId)
  const requestUrl = `${base}?${q.toString()}`

  const formData = new FormData()
  formData.append('file', params.file, params.file.name)

  const uploadHeaders: Record<string, string> = csrfMutationHeaders()
  if (batchId) uploadHeaders['Batch-Id'] = batchId
  if (auth) uploadHeaders.authorization = auth

  // CON-P0-03: only send force headers for explicit reprocess/correction.
  if (mode === 'reprocess' || mode === 'correction') {
    const reason =
      (params.forceReprocessReason?.trim() ||
        (mode === 'correction' ? 'CLIENT_CORRECTED_FILE' : '')) || ''
    if (!reason) {
      return {
        ok: false,
        httpStatus: 0,
        responseText: '',
        errorMessage: 'A reprocess/correction reason is required.',
        requestUrl,
        alreadyProcessed: false,
        baseline: null,
      }
    }
    uploadHeaders['X-Zord-Force-Reprocess'] = 'true'
    uploadHeaders['X-Zord-Force-Reprocess-Reason'] = reason
  }

  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: uploadHeaders,
      body: formData,
      credentials: 'include',
    })

    const responseText = await response.text()
    const baseline = parseSettlementUploadBaseline(responseText)
    const alreadyProcessed = baseline?.alreadyProcessed === true

    if (!response.ok) {
      const parsed = errorMessageFromProxyResponse(response.status, responseText)
      return {
        ok: false,
        httpStatus: response.status,
        responseText,
        errorMessage: parsed || `HTTP ${response.status}`,
        requestUrl,
        alreadyProcessed: false,
        baseline,
      }
    }

    return {
      ok: true,
      httpStatus: response.status,
      responseText,
      errorMessage: null,
      requestUrl,
      alreadyProcessed,
      baseline,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network request failed'
    return {
      ok: false,
      httpStatus: 0,
      responseText: '',
      errorMessage: `${msg}. Check outcome-engine is running (default :8081) or set ZORD_SETTLEMENT_URL.`,
      requestUrl,
      alreadyProcessed: false,
      baseline: null,
    }
  }
}

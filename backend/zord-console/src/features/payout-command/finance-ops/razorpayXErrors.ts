import { lookupRazorpayReason } from './payoutReconCopy'

export type RazorpayXErrorType =
  | 'API Error Codes'
  | 'Contact Error Codes'
  | 'Fund Account Error Codes'
  | 'Payout Status Details'

export type RazorpayXErrorObject = {
  code: string
  description: string
  source: 'business' | 'internal'
  step: string
  reason: string
  metadata: Record<string, unknown>
  field?: string
}

/** Where in the payout pipeline the failure was observed. */
export type FailureForensics = {
  failedProcess: string
  failedProcessDetail: string
  signalName: string
  signalTold: string
  errorCodeOrigin: string
  errorCodePath: string
  pipelineStage: string
  providerStatusKept: string
  timeline: Array<{ at: string; label: string; detail: string; tone: 'ok' | 'warn' | 'fail' }>
}

export type RazorpayXErrorView = {
  errorType: RazorpayXErrorType
  httpCode: number | null
  httpLabel: string | null
  nextSteps: string
  retrySchedule: string[] | null
  error: RazorpayXErrorObject
  forensics: FailureForensics
  /** 0–1 display confidence when API does not supply one */
  defaultConfidence: number
}

export const INVESTIGATION_STEPS = [
  { id: 'pull', label: 'Pulling payout events', atSec: 3 },
  { id: 'bank', label: 'Checking bank / settlement signals', atSec: 7 },
  { id: 'map', label: 'Mapping status_details', atSec: 11 },
  { id: 'origin', label: 'Locating error code origin', atSec: 15 },
  { id: 'score', label: 'Scoring confidence', atSec: 18 },
  { id: 'finalize', label: 'Finalizing investigation report', atSec: 20 },
] as const

export const INVESTIGATION_TOTAL_MS = 20_000

const HTTP_BY_CODE: Record<string, { http: number; label: string }> = {
  BAD_REQUEST_ERROR: { http: 400, label: 'BAD_REQUEST_ERROR' },
  BAD_REQUEST_AUTHENTICATION_ERROR: { http: 401, label: 'BAD_REQUEST_AUTHENTICATION_ERROR' },
  SERVER_ERROR: { http: 500, label: 'SERVER_ERROR' },
  GATEWAY_ERROR: { http: 502, label: 'GATEWAY_ERROR' },
  SERVICE_UNAVAILABLE: { http: 503, label: 'SERVICE_UNAVAILABLE' },
}

const FIVE_XX_RETRY = [
  'After 1 minute',
  'After 2 minutes',
  'After 5 minutes',
  'After 3 retries with no success, wait at least 1 hour before marking failed.',
]

function apiCodeForSource(source: string, reason: string): string {
  if (reason === 'authentication_failed') return 'BAD_REQUEST_AUTHENTICATION_ERROR'
  if (reason === 'server_error' || source === 'internal') return 'SERVER_ERROR'
  if (reason === 'gateway_error' || source === 'gateway' || reason.includes('gateway')) return 'GATEWAY_ERROR'
  if (reason === 'service_unavailable') return 'SERVICE_UNAVAILABLE'
  return 'BAD_REQUEST_ERROR'
}

function apiSource(payoutSource?: string | null): 'business' | 'internal' {
  const s = String(payoutSource || '').toLowerCase()
  if (s === 'internal' || s === 'gateway') return 'internal'
  return 'business'
}

function errorTypeForReason(reason: string): RazorpayXErrorType {
  if (reason.includes('contact')) return 'Contact Error Codes'
  if (reason.includes('fund_account') || reason.includes('account_number') || reason.includes('ifsc')) {
    return 'Fund Account Error Codes'
  }
  if (
    reason === 'input_validation_failed' ||
    reason === 'authentication_failed' ||
    reason === 'payout_approval_not_allowed' ||
    reason === 'server_error' ||
    reason === 'gateway_error' ||
    reason === 'service_unavailable'
  ) {
    return 'API Error Codes'
  }
  return 'Payout Status Details'
}

function buildForensics(opts: {
  reason: string
  status?: string | null
  payoutSource: string
  code: string
  description: string
  errorType: RazorpayXErrorType
}): FailureForensics {
  const src = String(opts.payoutSource || '').toLowerCase()
  const reason = opts.reason.toLowerCase()
  const status = String(opts.status || 'failed').toLowerCase()

  let failedProcess = 'Provider payout pipeline'
  let failedProcessDetail = 'Failure observed while RazorpayX advanced the payout lifecycle.'
  let signalName = 'status_details'
  let signalTold = `status_details.reason = ${opts.reason}`
  let pipelineStage = status || 'failed'
  let errorCodeOrigin = 'RazorpayX payout status_details.reason'
  let errorCodePath = 'payout.status_details → reason / source / description'

  if (src === 'beneficiary_bank' || reason.includes('bank_account') || reason.includes('ifsc') || reason.includes('imps')) {
    failedProcess = 'Beneficiary bank confirmation'
    failedProcessDetail =
      'Partner / beneficiary bank rejected or could not credit. Razorpay preserved provider status; recon must not invent a payment status.'
    signalName = 'beneficiary_bank signal'
    signalTold = `status_details.source = beneficiary_bank · reason = ${opts.reason}`
    pipelineStage = 'processing → failed (bank response)'
    errorCodeOrigin = 'Beneficiary bank → RazorpayX status_details'
    errorCodePath = 'bank NACK / reject → webhook/API status_details.reason'
  } else if (src === 'gateway' || reason.includes('gateway')) {
    failedProcess = 'Partner gateway rail'
    failedProcessDetail = 'Gateway timed out or returned a technical error before a clean bank acknowledgement.'
    signalName = 'gateway signal'
    signalTold = `status_details.source = gateway · reason = ${opts.reason}`
    pipelineStage = 'queued/processing → failed (gateway)'
    errorCodeOrigin = 'Partner gateway → RazorpayX'
    errorCodePath = 'gateway error envelope → status_details / HTTP error.code'
  } else if (src === 'internal' || opts.code === 'SERVER_ERROR') {
    failedProcess = 'Internal RazorpayX processing'
    failedProcessDetail = 'Internal/server fault while handling the payout request. Retry with the same idempotency key.'
    signalName = 'internal error envelope'
    signalTold = `error.code = ${opts.code} · source = internal`
    pipelineStage = 'API accept → failed (internal)'
    errorCodeOrigin = 'RazorpayX API error envelope'
    errorCodePath = 'HTTP body.error.code / error.reason'
  } else if (reason.includes('pending_approval') || reason.includes('approval')) {
    failedProcess = 'Merchant approval workflow'
    failedProcessDetail = 'Payout is blocked on approver action — not a bank failure.'
    signalName = 'business workflow signal'
    signalTold = `status_details.reason = ${opts.reason}`
    pipelineStage = 'pending (awaiting approval)'
    errorCodeOrigin = 'Business workflow · status_details'
    errorCodePath = 'payout.status_details.reason'
  } else if (
    reason.includes('variance') ||
    reason.includes('mismatch') ||
    reason.includes('amount') ||
    opts.description.toLowerCase().includes('utr') ||
    opts.description.toLowerCase().includes('amount differs')
  ) {
    failedProcess = 'Settlement ↔ bank amount match'
    failedProcessDetail =
      'A unique UTR matched a bank row whose amount differs from the settlement net. Do not force MATCHED.'
    signalName = 'recon variance signal'
    signalTold = 'UTR match + amount mismatch between settlement net and bank credit'
    pipelineStage = 'settlement recon → UNRESOLVED / VARIANCE'
    errorCodeOrigin = 'Finance recon engine (not a Razorpay status rename)'
    errorCodePath = 'settlement line ↔ bank observation · variance_amount'
  } else if (opts.errorType === 'Fund Account Error Codes') {
    failedProcess = 'Fund account validation'
    failedProcessDetail = 'Beneficiary fund account / IFSC validation failed before rail dispatch.'
    signalName = 'fund_account validation'
    signalTold = `status_details.reason = ${opts.reason}`
    pipelineStage = 'created → failed (validation)'
    errorCodeOrigin = 'Fund account error catalogue'
    errorCodePath = 'fund_account validation → status_details.reason'
  }

  return {
    failedProcess,
    failedProcessDetail,
    signalName,
    signalTold,
    errorCodeOrigin,
    errorCodePath,
    pipelineStage,
    providerStatusKept: status || 'failed',
    timeline: [
      {
        at: 'T+0',
        label: 'Payout accepted',
        detail: 'Request landed on RazorpayX with idempotency key intact.',
        tone: 'ok',
      },
      {
        at: 'T+1',
        label: 'Rail / workflow advanced',
        detail: `Lifecycle moved toward ${pipelineStage.split('→')[0]?.trim() || 'processing'}.`,
        tone: 'ok',
      },
      {
        at: 'T+2',
        label: `Signal · ${signalName}`,
        detail: signalTold,
        tone: 'warn',
      },
      {
        at: 'T+3',
        label: `Failed at · ${failedProcess}`,
        detail: `${opts.code} · ${opts.reason} — provider status kept as “${status || 'failed'}”.`,
        tone: 'fail',
      },
    ],
  }
}

/**
 * Build the RazorpayX error object used on Dashboard + API/webhook payloads.
 * Payout failures use status_details; API failures use the HTTP error envelope.
 */
export function buildRazorpayXError(opts: {
  reason?: string | null
  status?: string | null
  description?: string | null
  source?: string | null
  nextSteps?: string | null
  payoutId?: string | null
  fundAccountId?: string | null
  field?: string | null
}): RazorpayXErrorView {
  const meta = lookupRazorpayReason(opts.reason, opts.status || undefined)
  const reason = meta?.reason || String(opts.reason || '').trim() || 'server_error'
  const description =
    opts.description ||
    meta?.description ||
    'We are facing some trouble completing your request at the moment. Please try again shortly.'
  const payoutSource = opts.source || meta?.source || 'internal'
  const source = apiSource(payoutSource)
  const code = apiCodeForSource(payoutSource, reason)
  const http = HTTP_BY_CODE[code] || null
  const errorType = errorTypeForReason(reason)
  const nextSteps =
    opts.nextSteps && opts.nextSteps !== 'NA'
      ? opts.nextSteps
      : meta?.nextSteps && meta.nextSteps !== 'NA'
        ? meta.nextSteps
        : source === 'internal'
          ? 'Do not force a match. Retry the request using the same idempotency key and request body.'
          : 'Do not force a match. Review fee/tax/adjustment and the bank amount. Contact the beneficiary bank if the payout remains failed.'

  const is5xx = http != null && http.http >= 500
  const forensics = buildForensics({
    reason,
    status: opts.status,
    payoutSource,
    code,
    description,
    errorType,
  })

  return {
    errorType,
    httpCode: http?.http ?? null,
    httpLabel: http?.label ?? null,
    nextSteps,
    retrySchedule: is5xx
      ? FIVE_XX_RETRY
      : reason.toLowerCase().includes('retry') || nextSteps.toLowerCase().includes('retry')
        ? ['Retry after 30 min where the bank window allows.', 'Do not change the Razorpay payout status.']
        : [
            'Do not rename provider status.',
            'Keep Provider / Reconciliation / Investigation lanes separate.',
            'Open bank + settlement evidence before forcing MATCHED.',
          ],
    error: {
      code,
      description,
      source,
      step: forensics.pipelineStage.includes('validation') ? 'validate_fund_account' : 'NA',
      reason,
      metadata: {
        ...(opts.payoutId ? { payout_id: opts.payoutId } : {}),
        ...(opts.fundAccountId ? { fund_account_id: opts.fundAccountId } : {}),
        payout_source: payoutSource,
        failed_process: forensics.failedProcess,
        signal: forensics.signalName,
        error_code_origin: forensics.errorCodeOrigin,
      },
      ...(opts.field ? { field: opts.field } : {}),
    },
    forensics,
    defaultConfidence: is5xx ? 0.91 : srcConfidence(payoutSource),
  }
}

function srcConfidence(source: string): number {
  const s = source.toLowerCase()
  if (s === 'beneficiary_bank') return 0.94
  if (s === 'gateway') return 0.88
  if (s === 'internal') return 0.91
  return 0.86
}

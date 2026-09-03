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

export type RazorpayXErrorView = {
  errorType: RazorpayXErrorType
  httpCode: number | null
  httpLabel: string | null
  nextSteps: string
  retrySchedule: string[] | null
  error: RazorpayXErrorObject
}

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
  const nextSteps =
    opts.nextSteps && opts.nextSteps !== 'NA'
      ? opts.nextSteps
      : meta?.nextSteps && meta.nextSteps !== 'NA'
        ? meta.nextSteps
        : source === 'internal'
          ? 'Retry the request using the same idempotency key and request body.'
          : 'No further action required. Contact the beneficiary bank if the payout remains failed.'

  const is5xx = http != null && http.http >= 500
  return {
    errorType: errorTypeForReason(reason),
    httpCode: http?.http ?? null,
    httpLabel: http?.label ?? null,
    nextSteps,
    retrySchedule: is5xx ? FIVE_XX_RETRY : reason.toLowerCase().includes('retry') || nextSteps.toLowerCase().includes('retry')
      ? ['Retry after 30 min where the bank window allows.', 'Do not change the Razorpay payout status.']
      : null,
    error: {
      code,
      description,
      source,
      step: 'NA',
      reason,
      metadata: {
        ...(opts.payoutId ? { payout_id: opts.payoutId } : {}),
        ...(opts.fundAccountId ? { fund_account_id: opts.fundAccountId } : {}),
        payout_source: payoutSource,
      },
      ...(opts.field ? { field: opts.field } : {}),
    },
  }
}

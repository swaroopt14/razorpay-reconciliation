import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { applyRefreshedSessionCookies } from '@/services/auth/resolvePayoutTenant.server'
import { readIntentQualityScore } from '@/services/payout-command/prod-api/resolveIntentQualityScore'
import {
  intentEngineForwardHeaders,
  requireIntentEngineProxyGate,
} from '../_intentEngineProxy'

export const dynamic = 'force-dynamic'

type PaymentIntentLiteUpstream = {
  tenant_id?: string
  amount?: string | number
  currency?: string
  intended_execution_at?: string | null
  provider_hint?: string | null
  intent_quality_score?: number | string | null
  aggregate_confidence_score?: number | string | null
  intent_id?: string | null
  batchid?: string | null
  batch_id?: string | null
  client_payout_ref?: string | null
  client_batch_ref?: string | null
  source_row_num?: number | string | null
  beneficiary_type?: string | null
  beneficiary?: Record<string, unknown> | null
}

function coerceScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number.parseFloat(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function inferRailHint(item: PaymentIntentLiteUpstream): string | undefined {
  const beneficiary = item.beneficiary
  const instrumentKind =
    typeof beneficiary?.instrument === 'object' &&
    beneficiary?.instrument &&
    typeof (beneficiary.instrument as { kind?: unknown }).kind === 'string'
      ? String((beneficiary.instrument as { kind?: string }).kind || '')
      : ''

  const candidates = [
    String(item.beneficiary_type ?? ''),
    instrumentKind,
    String(item.provider_hint ?? ''),
  ]
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean)

  for (const value of candidates) {
    if (value.includes('RTGS')) return 'RTGS'
    if (value.includes('NEFT')) return 'NEFT'
    if (value.includes('NACH')) return 'NACH'
    if (value.includes('IMPS')) return 'IMPS'
    if (value.includes('UPI')) return 'UPI'
    if (value.includes('LSM') || value.includes('INSTA')) return 'LSM'
    if (value.includes('BANK_TRANSFER') || value.includes('BANK TRANSFER')) return 'Bank Transfer'
  }
  return undefined
}

/** BFF: GET /api/prod/intents/payment-intents?batch_id= → intent-engine journal lite API. */
export async function GET(request: NextRequest) {
  const batchId = request.nextUrl.searchParams.get('batch_id')?.trim()
  const gate = await requireIntentEngineProxyGate(request)
  if (!gate.ok) return gate.response

  if (!batchId) {
    const res = NextResponse.json({ error: 'batch_id query parameter is required' }, { status: 400 })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }

  const upstreamParams = new URLSearchParams({ batch_id: batchId })
  const url = `${BACKEND_SERVICES.INTENT_ENGINE.BASE_URL}/api/prod/intents/payment-intents?${upstreamParams.toString()}`

  try {
    const upstream = await fetch(url, {
      method: 'GET',
      headers: intentEngineForwardHeaders(gate.tenantId, gate.authorization, batchId),
      cache: 'no-store',
    })

    if (!upstream.ok) {
      const res = NextResponse.json(
        {
          items: [],
          pagination: { page: 1, page_size: 0, total: 0 },
          error: `intent-engine returned HTTP ${upstream.status}`,
        },
        { status: upstream.status },
      )
      applyRefreshedSessionCookies(res, gate.refreshedPayload)
      return res
    }

    const payload = (await upstream.json()) as {
      items?: PaymentIntentLiteUpstream[]
      pagination?: { page?: number; page_size?: number; total?: number }
    }
    const rawItems = payload.items ?? []
    const upstreamPagination = payload.pagination

    const items = rawItems.map((item) => {
      const resolvedBatchId =
        (typeof item.batchid === 'string' && item.batchid.trim()) ||
        (typeof item.batch_id === 'string' && item.batch_id.trim()) ||
        batchId

      return {
        tenant_id: item.tenant_id ?? gate.tenantId,
        amount: item.amount,
        currency: item.currency ?? 'INR',
        intended_execution_at: item.intended_execution_at ?? null,
        provider_hint: item.provider_hint ?? null,
        intent_quality_score: readIntentQualityScore(item),
        aggregate_confidence_score: coerceScore(item.aggregate_confidence_score),
        intent_id: item.intent_id ?? null,
        batch_id: resolvedBatchId,
        client_payout_ref: item.client_payout_ref ?? null,
        client_batch_ref: item.client_batch_ref ?? resolvedBatchId,
        source_row_num:
          typeof item.source_row_num === 'number'
            ? item.source_row_num
            : typeof item.source_row_num === 'string' && item.source_row_num.trim()
              ? Number.parseInt(item.source_row_num, 10) || null
              : null,
        beneficiary_type: item.beneficiary_type ?? null,
        beneficiary: item.beneficiary ?? null,
        rail_hint: inferRailHint(item) ?? null,
      }
    })

    const res = NextResponse.json({
      items,
      pagination: {
        page: upstreamPagination?.page ?? 1,
        page_size: upstreamPagination?.page_size ?? items.length,
        total: upstreamPagination?.total ?? items.length,
      },
    })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  } catch (error) {
    const res = NextResponse.json(
      {
        items: [],
        pagination: { page: 1, page_size: 0, total: 0 },
        error: error instanceof Error ? error.message : 'Failed to fetch payment intents',
      },
      { status: 502 },
    )
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }
}

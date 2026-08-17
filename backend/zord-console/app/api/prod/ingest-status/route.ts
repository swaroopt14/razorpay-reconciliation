import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
  sessionUpstreamHeaders,
} from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'

type SourceStatus = 'received' | 'missing' | 'partial' | 'processing'

type IngestSource = {
  id: 'intent_file' | 'settlement_file' | 'bank_statement' | 'evidence'
  label: string
  status: SourceStatus
  detail?: string
}

async function probeJson<T>(url: string, tenantId: string, accessToken: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: sessionUpstreamHeaders(tenantId, accessToken),
      cache: 'no-store',
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response
  const tenantId = gate.tenantId
  const accessToken = gate.accessToken

  const intentBase = BACKEND_SERVICES.INTENT_ENGINE.BASE_URL
  const intelBase = BACKEND_SERVICES.INTELLIGENCE.BASE_URL
  const evidenceBase = BACKEND_SERVICES.EVIDENCE.BASE_URL

  const [intentProbe, settlement, evidencePacks, patterns] = await Promise.all([
    probeJson<{ pagination?: { total?: number }; items?: unknown[] }>(
      `${intentBase}/v1/intents?page=1&page_size=1&tenant_id=${encodeURIComponent(tenantId)}`,
      tenantId,
      accessToken,
    ),
    probeJson<{ items?: unknown[]; observations?: unknown[] }>(
      `${(process.env.ZORD_SETTLEMENT_URL || 'http://localhost:8081').replace(/\/$/, '')}/v1/settlement/observations/batches?tenant_id=${encodeURIComponent(tenantId)}`,
      tenantId,
      accessToken,
    ),
    probeJson<{ packs?: unknown[] }>(
      `${evidenceBase}${BACKEND_SERVICES.EVIDENCE.ENDPOINTS.PACKS}?tenant_id=${encodeURIComponent(tenantId)}&limit=1`,
      tenantId,
      accessToken,
    ),
    probeJson<{ data_available?: boolean; total_count?: number }>(
      `${intelBase}${BACKEND_SERVICES.INTELLIGENCE.ENDPOINTS.PATTERNS}?tenant_id=${encodeURIComponent(tenantId)}`,
      tenantId,
      accessToken,
    ),
  ])

  const intentCount =
    intentProbe?.pagination?.total ??
    intentProbe?.items?.length ??
    (patterns?.data_available === true ? (patterns.total_count ?? 0) : 0)
  const settlementCount = settlement?.items?.length ?? settlement?.observations?.length ?? 0
  const packCount = evidencePacks?.packs?.length ?? 0

  const sources: IngestSource[] = [
    {
      id: 'intent_file',
      label: 'Payment instructions',
      status: intentCount > 0 ? 'received' : 'missing',
      detail: intentCount > 0 ? `${intentCount} instruction(s)` : undefined,
    },
    {
      id: 'settlement_file',
      label: 'Settlement file',
      status: settlementCount > 0 ? 'received' : 'missing',
      detail: settlementCount > 0 ? `${settlementCount} batch(es)` : undefined,
    },
    {
      id: 'bank_statement',
      label: 'Bank statement',
      status: 'missing',
      detail: 'Not connected — bank-statement status comes from the artifact/source registry, not intelligence confirmation coverage.',
    },
    {
      id: 'evidence',
      label: 'Evidence',
      status: packCount > 0 ? 'received' : 'missing',
      detail: packCount > 0 ? `${packCount}+ pack(s)` : undefined,
    },
  ]

  const res = NextResponse.json({ tenant_id: tenantId, sources })
  applyRefreshedSessionCookies(res, gate.refreshedPayload)
  return res
}

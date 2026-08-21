// Overview Service - Aggregates data from multiple backend services
import { BACKEND_SERVICES, buildUrl, DEFAULT_FETCH_OPTIONS, API_TIMEOUT } from '@/config/api.endpoints'

export type AvailabilityState = 'AVAILABLE' | 'EMPTY' | 'STALE' | 'UNAVAILABLE'

export interface OverviewKPIs {
  intents_received_24h: number | null
  canonicalized_24h: number | null
  rejected_24h: number | null
  idempotency_hits_24h: number | null
  p95_ingest_latency_ms: number | null
  slo: {
    latency_ms: number | null
    success_rate_pct: number | null
  } | null
}

export interface ComponentHealth {
  component: string
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY'
  meta: string
}

export interface RecentActivity {
  time: string
  object: 'INTENT' | 'RAW_ENVELOPE'
  id: string
  source: string
  status: string
}

export interface EvidenceStatus {
  worm_active: boolean | null
  last_write: string | null
  hash_chain: 'OK' | 'BROKEN' | 'UNKNOWN'
}

export interface OverviewData {
  environment: 'PRODUCTION' | 'SANDBOX'
  availability: AvailabilityState
  reason?: string
  as_of?: string | null
  kpis: OverviewKPIs
  health: ComponentHealth[]
  errors_last_24h: Record<string, number>
  recent_activity: RecentActivity[]
  evidence: EvidenceStatus
}

type EdgeOverviewResponse = Partial<Omit<OverviewData, 'kpis'>> & {
  data_available?: boolean
  computed_at?: string
  kpis?: Partial<OverviewKPIs> & {
    slo?: Partial<OverviewKPIs['slo']>
  }
  intents_received_24h?: number
  canonicalized_24h?: number
  rejected_24h?: number
  idempotency_hits_24h?: number
  p95_ingest_latency_ms?: number
  latency_ms?: number
  success_rate_pct?: number
}

function toOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function readAvailability(value: unknown): AvailabilityState | null {
  return value === 'AVAILABLE' || value === 'EMPTY' || value === 'STALE' || value === 'UNAVAILABLE'
    ? value
    : null
}

function emptyKpis(): OverviewKPIs {
  return {
    intents_received_24h: null,
    canonicalized_24h: null,
    rejected_24h: null,
    idempotency_hits_24h: null,
    p95_ingest_latency_ms: null,
    slo: null,
  }
}

function unknownEvidence(): EvidenceStatus {
  return {
    worm_active: null,
    last_write: null,
    hash_chain: 'UNKNOWN',
  }
}

export function buildUnavailableOverview(
  health: ComponentHealth[] = [],
  reason = 'Production overview is temporarily unavailable.',
): OverviewData {
  return {
    environment: 'PRODUCTION',
    availability: 'UNAVAILABLE',
    reason,
    as_of: null,
    kpis: emptyKpis(),
    health,
    errors_last_24h: {},
    recent_activity: [],
    evidence: unknownEvidence(),
  }
}

/**
 * Check health of a backend service
 */
async function checkServiceHealth(
  service: 'EDGE' | 'INTENT_ENGINE' | 'VAULT_JOURNAL' | 'CONTRACTS' | 'PII_ENCLAVE',
  componentName: string
): Promise<ComponentHealth> {
  const baseUrl = BACKEND_SERVICES[service].BASE_URL
  const healthEndpoint = BACKEND_SERVICES[service].ENDPOINTS.HEALTH
  const url = `${baseUrl}${healthEndpoint}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000) // 5s timeout for health checks

  try {
    const startTime = Date.now()
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    })
    const latency = Date.now() - startTime

    clearTimeout(timeoutId)

    if (response.ok) {
      return {
        component: componentName,
        status: 'HEALTHY',
        meta: `p95 ${latency}ms`,
      }
    } else {
      return {
        component: componentName,
        status: 'DEGRADED',
        meta: `HTTP ${response.status}`,
      }
    }
  } catch (error) {
    clearTimeout(timeoutId)
    return {
      component: componentName,
      status: 'UNHEALTHY',
      meta: 'Connection failed',
    }
  }
}

async function fetchEdgeOverview(): Promise<OverviewData | null> {
  const url = buildUrl('EDGE', BACKEND_SERVICES.EDGE.ENDPOINTS.OVERVIEW)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

  try {
    const response = await fetch(url, {
      ...DEFAULT_FETCH_OPTIONS,
      method: 'GET',
      signal: controller.signal,
    })

    if (!response.ok) return null
    const payload = (await response.json()) as EdgeOverviewResponse
    const payloadKpis = (payload.kpis ?? payload) as Partial<OverviewKPIs> & {
      slo?: { latency_ms?: number; success_rate_pct?: number } | null
      latency_ms?: number
      success_rate_pct?: number
    }
    const payloadSlo = (payloadKpis.slo ?? {}) as {
      latency_ms?: unknown
      success_rate_pct?: unknown
    }
    const latencyMs = toOptionalNumber(payloadSlo.latency_ms ?? payloadKpis.latency_ms)
    const successRatePct = toOptionalNumber(payloadSlo.success_rate_pct ?? payloadKpis.success_rate_pct)
    const kpis: OverviewKPIs = {
      intents_received_24h: toOptionalNumber(payloadKpis.intents_received_24h),
      canonicalized_24h: toOptionalNumber(payloadKpis.canonicalized_24h),
      rejected_24h: toOptionalNumber(payloadKpis.rejected_24h),
      idempotency_hits_24h: toOptionalNumber(payloadKpis.idempotency_hits_24h),
      p95_ingest_latency_ms: toOptionalNumber(payloadKpis.p95_ingest_latency_ms),
      slo: latencyMs == null && successRatePct == null
        ? null
        : { latency_ms: latencyMs, success_rate_pct: successRatePct },
    }
    const hashChain = payload.evidence?.hash_chain
    const evidence: EvidenceStatus = {
      worm_active: typeof payload.evidence?.worm_active === 'boolean' ? payload.evidence.worm_active : null,
      last_write:
        typeof payload.evidence?.last_write === 'string' && payload.evidence.last_write.trim()
          ? payload.evidence.last_write
          : null,
      hash_chain: hashChain === 'OK' || hashChain === 'BROKEN' ? hashChain : 'UNKNOWN',
    }
    const upstreamAvailability = readAvailability(payload.availability)
    const hasAuthoritativeValue =
      Object.values(kpis).some((value) => value !== null)
      || evidence.worm_active !== null
      || evidence.last_write !== null
      || evidence.hash_chain !== 'UNKNOWN'
      || (Array.isArray(payload.health) && payload.health.length > 0)
      || (Array.isArray(payload.recent_activity) && payload.recent_activity.length > 0)
      || Object.keys(payload.errors_last_24h ?? {}).length > 0
    const availability =
      upstreamAvailability
      ?? (payload.data_available === false ? 'EMPTY' : hasAuthoritativeValue ? 'AVAILABLE' : 'UNAVAILABLE')

    return {
      environment: payload.environment === 'SANDBOX' ? 'SANDBOX' : 'PRODUCTION',
      availability,
      reason:
        availability === 'UNAVAILABLE'
          ? payload.reason || 'Overview response did not contain authoritative values.'
          : payload.reason,
      as_of: payload.as_of ?? payload.computed_at ?? null,
      kpis,
      health: Array.isArray(payload.health) ? payload.health : [],
      errors_last_24h: payload.errors_last_24h ?? {},
      recent_activity: Array.isArray(payload.recent_activity) ? payload.recent_activity : [],
      evidence,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Fetch overview data by aggregating from multiple services
 * This aggregates health checks and returns empty data for metrics
 */
export async function fetchOverview(): Promise<OverviewData> {
  const edgeOverview = await fetchEdgeOverview()
  if (edgeOverview) {
    if (edgeOverview.health.length > 0) return edgeOverview

    const healthChecks = await Promise.all([
      checkServiceHealth('EDGE', 'API_GATEWAY'),
      checkServiceHealth('INTENT_ENGINE', 'INTENT_ENGINE'),
      checkServiceHealth('VAULT_JOURNAL', 'VAULT_JOURNAL'),
      checkServiceHealth('CONTRACTS', 'CONTRACTS'),
      checkServiceHealth('PII_ENCLAVE', 'PII_ENCLAVE'),
    ])

    return {
      ...edgeOverview,
      health: healthChecks,
    }
  }

  const healthChecks = await Promise.all([
    checkServiceHealth('EDGE', 'API_GATEWAY'),
    checkServiceHealth('INTENT_ENGINE', 'INTENT_ENGINE'),
    checkServiceHealth('VAULT_JOURNAL', 'VAULT_JOURNAL'),
    checkServiceHealth('CONTRACTS', 'CONTRACTS'),
    checkServiceHealth('PII_ENCLAVE', 'PII_ENCLAVE'),
  ])

  return buildUnavailableOverview(
    healthChecks,
    'Edge overview could not be reached. Metrics and evidence integrity are unknown.',
  )
}

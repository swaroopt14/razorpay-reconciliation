// Overview Service - Aggregates data from multiple backend services
import { BACKEND_SERVICES, buildUrl, DEFAULT_FETCH_OPTIONS, API_TIMEOUT } from '@/config/api.endpoints'

export interface OverviewKPIs {
  intents_received_24h: number
  canonicalized_24h: number
  rejected_24h: number
  idempotency_hits_24h: number
  p95_ingest_latency_ms: number
  slo: {
    latency_ms: number
    success_rate_pct: number
  }
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
  worm_active: boolean
  last_write: string
  hash_chain: 'OK' | 'BROKEN'
}

export interface OverviewData {
  environment: 'PRODUCTION' | 'SANDBOX'
  kpis: OverviewKPIs
  health: ComponentHealth[]
  errors_last_24h: Record<string, number>
  recent_activity: RecentActivity[]
  evidence: EvidenceStatus
}

type EdgeOverviewResponse = Partial<Omit<OverviewData, 'kpis'>> & {
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

function toSafeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
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
      slo?: Partial<OverviewKPIs['slo']>
      latency_ms?: number
      success_rate_pct?: number
    }
    const payloadSlo = (payloadKpis.slo ?? {}) as Partial<OverviewKPIs['slo']>

    return {
      environment: payload.environment === 'SANDBOX' ? 'SANDBOX' : 'PRODUCTION',
      kpis: {
        intents_received_24h: toSafeNumber(payloadKpis.intents_received_24h, 0),
        canonicalized_24h: toSafeNumber(payloadKpis.canonicalized_24h, 0),
        rejected_24h: toSafeNumber(payloadKpis.rejected_24h, 0),
        idempotency_hits_24h: toSafeNumber(payloadKpis.idempotency_hits_24h, 0),
        p95_ingest_latency_ms: toSafeNumber(payloadKpis.p95_ingest_latency_ms, 0),
        slo: {
          latency_ms: toSafeNumber(payloadSlo.latency_ms ?? payloadKpis.latency_ms, 60),
          success_rate_pct: toSafeNumber(payloadSlo.success_rate_pct ?? payloadKpis.success_rate_pct, 99.9),
        },
      },
      health: Array.isArray(payload.health) ? payload.health : [],
      errors_last_24h: payload.errors_last_24h ?? {},
      recent_activity: Array.isArray(payload.recent_activity) ? payload.recent_activity : [],
      evidence: {
        worm_active: payload.evidence?.worm_active ?? false,
        last_write: payload.evidence?.last_write ?? '',
        hash_chain: payload.evidence?.hash_chain === 'BROKEN' ? 'BROKEN' : 'OK',
      },
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

  return {
    environment: 'PRODUCTION',
    kpis: {
      intents_received_24h: 0,
      canonicalized_24h: 0,
      rejected_24h: 0,
      idempotency_hits_24h: 0,
      p95_ingest_latency_ms: 0,
      slo: {
        latency_ms: 60,
        success_rate_pct: 99.9,
      },
    },
    health: healthChecks,
    errors_last_24h: {},
    recent_activity: [],
    evidence: {
      worm_active: false,
      last_write: '',
      hash_chain: 'OK',
    },
  }
}

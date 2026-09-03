import { NextRequest, NextResponse } from 'next/server'
import { APIIngestionData } from '@/types/ingress'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  await new Promise(resolve => setTimeout(resolve, 80))

  const mockData: APIIngestionData = {
    health: {
      status: 'HEALTHY',
      success_rate: 98.2,
      requests_per_hour: 8247,
      latency: { p50_ms: 89, p95_ms: 214, p99_ms: 892 },
    },
    rate_limits: {
      tenants: [
        { tenant_id: 't1', tenant_name: 'acme_nbfc', used: 892, limit: 1000, percent: 89 },
        { tenant_id: 't2', tenant_name: 'foo_psp', used: 247, limit: 500, percent: 49 },
        { tenant_id: 't3', tenant_name: 'bar_bank', used: 156, limit: 500, percent: 31 },
      ],
      global: { used: 8247, limit: 20000, percent: 41 },
    },
    top_errors: [
      { category: 'Schema Validation', count: 147, percent: 47 },
      { category: 'PII Tokenization', count: 67, percent: 23 },
      { category: 'Authentication', count: 44, percent: 21 },
      { category: 'Rate Limit', count: 12, percent: 9 },
    ],
    endpoints: [
      { method: 'POST', path: '/v1/intents', volume_percent: 67, success_rate: 98.1, avg_latency_ms: 214 },
      { method: 'POST', path: '/v1/payouts', volume_percent: 23, success_rate: 97.2, avg_latency_ms: 312 },
      { method: 'GET', path: '/v1/status', volume_percent: 10, success_rate: 99.8, avg_latency_ms: 45 },
    ],
    tenant_breakdown: [
      { tenant_name: 'acme_nbfc', requests: 3247, failure_rate: 1.2 },
      { tenant_name: 'foo_psp', requests: 2891, failure_rate: 2.1 },
      { tenant_name: 'bar_bank', requests: 1247, failure_rate: 0.8 },
      { tenant_name: 'xyz_wallet', requests: 862, failure_rate: 3.2 },
    ],
  }

  return NextResponse.json(mockData)
}

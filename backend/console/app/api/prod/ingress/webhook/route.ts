import { NextRequest, NextResponse } from 'next/server'
import { WebhookIngestionData } from '@/types/ingress'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  await new Promise(resolve => setTimeout(resolve, 80))

  const mockData: WebhookIngestionData = {
    health: {
      status: 'HEALTHY',
      delivery_rate: 97.8,
      requests_per_hour: 3129,
      delivery_latency: { p50_ms: 312, p95_ms: 892, p99_ms: 1847 },
    },
    retry_status: {
      retrying: 18,
      retrying_percent: 0.6,
      max_attempts: 3,
      max_attempts_allowed: 5,
      success_after_retry_percent: 89,
    },
    failure_reasons: [
      { reason: 'PII Token Failure', count: 67, percent: 32 },
      { reason: 'Timeout', count: 44, percent: 21 },
      { reason: 'Authentication', count: 23, percent: 11 },
      { reason: 'Schema Validation', count: 19, percent: 9 },
      { reason: 'Rate Limited', count: 12, percent: 6 },
    ],
    endpoints: [
      { tenant_name: 'acme_nbfc', endpoint_name: '/webhook', volume: 1247, success_rate: 98.2 },
      { tenant_name: 'foo_psp', endpoint_name: '/hook', volume: 891, success_rate: 96.1 },
      { tenant_name: 'bar_bank', endpoint_name: '/callback', volume: 567, success_rate: 99.1 },
      { tenant_name: 'xyz_wallet', endpoint_name: '/events', volume: 424, success_rate: 97.8 },
    ],
  }

  return NextResponse.json(mockData)
}

import { NextRequest, NextResponse } from 'next/server'
import { PlatformHealthResponse } from '@/types/platform-health'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  await new Promise(resolve => setTimeout(resolve, 80))

  const mockData: PlatformHealthResponse = {
    overall: {
      status: 'HEALTHY',
      message: 'All systems operational',
      uptime_24h: 99.98,
      last_incident_at: '2026-01-12T18:30:00Z',
      active_incidents: 0,
    },
    throughput: {
      events_per_second: 3.47,
      events_per_hour: 12482,
      p50_latency_ms: 89,
      p95_latency_ms: 214,
      p99_latency_ms: 892,
      backlog_count: 142,
      backlog_trend_percent: -2,
    },
    errors: {
      client_4xx_percent: 1.2,
      server_5xx_percent: 0.3,
      dlq_created_percent: 1.5,
      total_errors_24h: 374,
    },
    critical_services: [
      {
        service_name: 'zord-edge',
        display_name: 'Edge Gateway',
        status: 'HEALTHY',
        uptime_24h: 99.9,
        traffic_percent: 67,
        error_rate: 0.8,
        owner_team: 'Edge Team',
        sla_target: 99.9,
      },
      {
        service_name: 'zord-vault-journal',
        display_name: 'Vault Journal',
        status: 'HEALTHY',
        uptime_24h: 99.8,
        traffic_percent: 23,
        error_rate: 0.2,
        owner_team: 'Vault Team',
        sla_target: 99.8,
      },
      {
        service_name: 'zord-contracts',
        display_name: 'Contracts Engine',
        status: 'HEALTHY',
        uptime_24h: 100,
        traffic_percent: 10,
        error_rate: 0,
        owner_team: 'Contracts Team',
        sla_target: 99.99,
      },
      {
        service_name: 'zord-relay',
        display_name: 'Event Relay',
        status: 'HEALTHY',
        uptime_24h: 99.7,
        traffic_percent: 0,
        error_rate: 0.5,
        owner_team: 'Platform Team',
        sla_target: 99.5,
      },
    ],
    incidents: [
      {
        incident_id: 'inc_001',
        age_minutes: 2,
        service: 'zord-relay',
        status: 'INVESTIGATING',
        severity: 'P3',
        title: 'Elevated retry rate on webhook delivery',
        created_at: '2026-01-13T14:38:00Z',
        resolved_at: null,
      },
      {
        incident_id: 'inc_002',
        age_minutes: 14,
        service: 'zord-edge',
        status: 'RESOLVED',
        severity: 'P4',
        title: 'Brief latency spike on /v1/intents',
        created_at: '2026-01-13T14:26:00Z',
        resolved_at: '2026-01-13T14:35:00Z',
      },
    ],
    service_breakdown: [
      { service_name: 'zord-edge', display_name: 'Edge Gateway', traffic_percent: 67, status: 'HEALTHY', requests_per_hour: 8363 },
      { service_name: 'zord-vault-journal', display_name: 'Vault Journal', traffic_percent: 23, status: 'HEALTHY', requests_per_hour: 2871 },
      { service_name: 'zord-contracts', display_name: 'Contracts', traffic_percent: 10, status: 'HEALTHY', requests_per_hour: 1248 },
    ],
    last_updated: new Date().toISOString(),
  }

  return NextResponse.json(mockData)
}

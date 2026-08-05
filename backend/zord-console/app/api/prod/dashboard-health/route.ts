import { NextRequest, NextResponse } from 'next/server'
import { DashboardHealthResponse } from '@/types/dashboard-health'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Simulate API latency
  await new Promise(resolve => setTimeout(resolve, 100))

  const mockData: DashboardHealthResponse = {
    overall_status: 'OPERATIONAL',
    environment: 'PRODUCTION',
    region: 'ap-south-1',
    last_updated_seconds_ago: 8,

    // Hero metrics
    events_per_hour: 12482,
    success_rate: 98.55,
    p95_latency: 182,

    // Golden Signals (Google SRE Canon)
    golden_signals: {
      latency: {
        status: 'healthy',
        p95_ms: 182,
        p99_ms: 311,
        trend: -3,
      },
      traffic: {
        status: 'healthy',
        events_per_second: 3.47,
        backlog: 142,
        backlog_trend: -2,
      },
      errors: {
        status: 'healthy',
        rate_percent: 1.45,
        dlq_count: 47,
        replayable: 12,
      },
      saturation: {
        status: 'healthy',
        capacity_percent: 63,
        peak_percent: 78,
      },
    },

    // System Health Summary (expandable banner)
    system_health: [
      { name: 'ingestion', display_name: 'INGESTION', status: 'healthy', metric_value: 12482, metric_label: 'e/hr' },
      { name: 'delivery', display_name: 'DELIVERY', status: 'healthy', metric_value: 99.1, metric_label: '%' },
      { name: 'validation', display_name: 'VALIDATION', status: 'healthy', metric_value: 98.55, metric_label: '%' },
      { name: 'evidence', display_name: 'EVIDENCE', status: 'healthy', metric_value: 100, metric_label: '%' },
    ],

    // Nervous System Grid (service instances)
    service_instances: [
      {
        service_name: 'zord-edge',
        instance_id: 'edge-1',
        display_name: 'zord-edge',
        cpu: 'healthy',
        memory: 'healthy',
        errors: 'healthy',
        traffic: 'healthy',
        cpu_percent: 42,
        memory_percent: 58,
        error_count_5m: 2,
        requests_5m: 1247,
        href: '/console/services/zord-edge/edge-1',
      },
      {
        service_name: 'zord-vault-journal',
        instance_id: 'journal-1',
        display_name: 'zord-journal',
        cpu: 'healthy',
        memory: 'healthy',
        errors: 'healthy',
        traffic: 'warning',
        cpu_percent: 38,
        memory_percent: 67,
        error_count_5m: 0,
        requests_5m: 892,
        href: '/console/services/zord-vault-journal/journal-1',
      },
      {
        service_name: 'zord-intent-engine',
        instance_id: 'engine-1',
        display_name: 'zord-intent-engine',
        cpu: 'healthy',
        memory: 'healthy',
        errors: 'healthy',
        traffic: 'healthy',
        cpu_percent: 55,
        memory_percent: 61,
        error_count_5m: 3,
        requests_5m: 1089,
        href: '/console/services/zord-intent-engine/engine-1',
      },
      {
        service_name: 'zord-relay',
        instance_id: 'relay-1',
        display_name: 'zord-relay',
        cpu: 'healthy',
        memory: 'healthy',
        errors: 'healthy',
        traffic: 'healthy',
        cpu_percent: 29,
        memory_percent: 44,
        error_count_5m: 0,
        requests_5m: 756,
        href: '/console/services/zord-relay/relay-1',
      },
      {
        service_name: 'zord-contracts',
        instance_id: 'contracts-1',
        display_name: 'zord-contracts',
        cpu: 'healthy',
        memory: 'healthy',
        errors: 'healthy',
        traffic: 'healthy',
        cpu_percent: 21,
        memory_percent: 38,
        error_count_5m: 0,
        requests_5m: 421,
        href: '/console/services/zord-contracts/contracts-1',
      },
    ],

    // Legacy support
    throughput: {
      events_per_second: 3.47,
      intents_processed_24h: 12482,
      success_rate_percent: 98.55,
      p95_latency_ms: 182,
      p99_latency_ms: 311,
      backlog: 142,
      backlog_trend: -2,
    },

    failures: {
      dlq_items_24h: 47,
      replayable: 12,
      outbox_pending: 142,
      stuck_events: 0,
    },

    services: [
      {
        service_name: 'zord-edge',
        display_name: 'zord-edge',
        status: 'OK',
        uptime_percent: 99.9,
        last_incident: null,
        href: '/console/ingestion/api',
      },
      {
        service_name: 'zord-vault-journal',
        display_name: 'zord-journal',
        status: 'OK',
        uptime_percent: 99.8,
        last_incident: null,
        href: '/console/ingestion/intents',
      },
      {
        service_name: 'zord-intent-engine',
        display_name: 'z-int-engine',
        status: 'OK',
        uptime_percent: 98.2,
        last_incident: null,
        href: '/console/ingestion/pre-acc-guard',
      },
      {
        service_name: 'zord-relay',
        display_name: 'zord-relay',
        status: 'OK',
        uptime_percent: 99.9,
        last_incident: null,
        href: '/console/ingestion/outbox-health',
      },
      {
        service_name: 'zord-contracts',
        display_name: 'zord-contracts',
        status: 'OK',
        uptime_percent: 100,
        last_incident: null,
        href: '/console/ingestion/evidence/integrity',
      },
    ],

    incidents: {
      count: 0,
      critical: 0,
      items: [],
    },
  }

  return NextResponse.json(mockData)
}

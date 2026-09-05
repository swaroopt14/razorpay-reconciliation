import { NextRequest, NextResponse } from 'next/server'
import { 
  OutboxHealthResponse,
  DeliveryGuarantee,
  RetryDiscipline,
  EventBusStatus,
  BacklogBreakdown,
  AtRiskEvent,
  AuditMetrics,
  EventType,
  EventBusHealth
} from '@/types/outbox'

export const dynamic = 'force-dynamic'

function generateMockData(): OutboxHealthResponse {
  const now = new Date()
  
  // Delivery Guarantee - Fintech SLA
  const deliveryGuarantee: DeliveryGuarantee = {
    overall_health: 'HEALTHY',
    delivery_sla_percent: 98.7,
    delivered_count: 12322,
    total_count: 12482,
    sla_target: 99.5,
    sla_met: true,
  }

  // Retry Discipline
  const retryDiscipline: RetryDiscipline = {
    events_retrying: 18,
    max_attempts_seen: 3,
    max_attempts_allowed: 5,
    avg_retry_delay_ms: 30000,
  }

  // Event Bus Status
  const eventBusStatus: EventBusStatus[] = [
    {
      service: 'zord-relay',
      display_name: 'Zord Relay',
      health: 'OK',
      last_delivery_ago_seconds: 12,
      events_in_flight: 23,
      error_rate_percent: 0.1,
    },
    {
      service: 'zord-contracts',
      display_name: 'Zord Contracts',
      health: 'OK',
      last_delivery_ago_seconds: 8,
      events_in_flight: 5,
      error_rate_percent: 0.0,
    },
    {
      service: 'external-webhook',
      display_name: 'External Webhook',
      health: 'DEGRADED',
      last_delivery_ago_seconds: 45,
      events_in_flight: 142,
      error_rate_percent: 2.3,
    },
    {
      service: 'zord-evidence',
      display_name: 'Zord Evidence',
      health: 'OK',
      last_delivery_ago_seconds: 3,
      events_in_flight: 8,
      error_rate_percent: 0.0,
    },
  ]

  // Backlog Breakdown
  const backlog: BacklogBreakdown = {
    pending: 142,
    retrying: 18,
    delivered: 12322,
    failed: 0,
    dead_letter: 0,
  }

  // At-Risk Events
  const eventTypes: EventType[] = ['INTENT', 'CONTRACT', 'EVIDENCE', 'WEBHOOK', 'NOTIFICATION']
  const tenants = [
    { id: '11111111-1111-1111-1111-111111111111', name: 'acme_nbfc' },
    { id: '22222222-2222-2222-2222-222222222222', name: 'fintech_corp' },
    { id: '33333333-3333-3333-3333-333333333333', name: 'foo_psp' },
  ]

  const atRiskEvents: AtRiskEvent[] = [
    {
      outbox_id: 'obx_91af3c7d8e2b',
      event_type: 'INTENT',
      target_service: 'external-webhook',
      attempts: 3,
      max_attempts: 5,
      created_at: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
      last_attempt_at: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      next_retry_at: new Date(now.getTime() + 18 * 60 * 1000).toISOString(),
      error_message: 'Connection timeout to merchant endpoint',
      tenant_id: tenants[0].id,
      tenant_name: tenants[0].name,
      intent_id: 'pi_20260205_91XK',
      worm_ref: 'worm://prod/outbox/obx_91af3c7d8e2b',
    },
    {
      outbox_id: 'obx_77bd8e4a1c9f',
      event_type: 'CONTRACT',
      target_service: 'zord-contracts',
      attempts: 2,
      max_attempts: 5,
      created_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
      last_attempt_at: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
      next_retry_at: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
      error_message: 'Contract service temporarily unavailable',
      tenant_id: tenants[1].id,
      tenant_name: tenants[1].name,
      worm_ref: 'worm://prod/outbox/obx_77bd8e4a1c9f',
    },
    {
      outbox_id: 'obx_a2c4d5e6f789',
      event_type: 'EVIDENCE',
      target_service: 'zord-evidence',
      attempts: 3,
      max_attempts: 5,
      created_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      last_attempt_at: new Date(now.getTime() - 8 * 60 * 1000).toISOString(),
      next_retry_at: new Date(now.getTime() + 12 * 60 * 1000).toISOString(),
      error_message: 'WORM storage write timeout',
      tenant_id: tenants[0].id,
      tenant_name: tenants[0].name,
      envelope_id: 'env_20260205T103011Z_abc1',
      worm_ref: 'worm://prod/outbox/obx_a2c4d5e6f789',
    },
    {
      outbox_id: 'obx_b3d5e7f8a901',
      event_type: 'WEBHOOK',
      target_service: 'external-webhook',
      attempts: 1,
      max_attempts: 5,
      created_at: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
      last_attempt_at: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
      next_retry_at: new Date(now.getTime() + 3 * 60 * 1000).toISOString(),
      error_message: 'HTTP 503 from merchant',
      tenant_id: tenants[2].id,
      tenant_name: tenants[2].name,
      worm_ref: 'worm://prod/outbox/obx_b3d5e7f8a901',
    },
  ]

  // Audit Metrics
  const auditMetrics: AuditMetrics = {
    delivery_rate_24h: 98.7,
    max_retry_attempts: 5,
    event_finality_percent: 100,
    max_age_hours: 24,
    oldest_pending_age_minutes: 65,
  }

  return {
    delivery_guarantee: deliveryGuarantee,
    retry_discipline: retryDiscipline,
    event_bus_status: eventBusStatus,
    last_delivery_seconds_ago: 12,
    backlog: backlog,
    at_risk_events: atRiskEvents,
    audit_metrics: auditMetrics,
    as_of: now.toISOString(),
  }
}

export async function GET(request: NextRequest) {
  const data = generateMockData()
  return NextResponse.json(data)
}

import { NextRequest, NextResponse } from 'next/server'
import { TenantHealthResponse } from '@/types/tenant-health'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  await new Promise(resolve => setTimeout(resolve, 100))

  const mockData: TenantHealthResponse = {
    environment: 'PRODUCTION',
    last_updated_seconds_ago: 12,

    summary: {
      total: 42,
      healthy: 38,
      healthy_percent: 90.5,
      at_risk: 3,
      at_risk_percent: 7.1,
      impacted: 1,
      impacted_percent: 2.4,
      trend_wow_percent: 2,
    },

    at_risk_tenants: [
      {
        tenant_id: 't_91af3c7e',
        tenant_name: 'Acme_Fintech',
        status: 'IMPACTED',
        success_rate: 82.1,
        primary_issue: 'DLQ Spike',
        issue_channel: 'UPI',
        issue_count: 47,
        last_issue_ago: '12m ago',
        volume_per_hour: 847,
        dlq_count: 47,
      },
      {
        tenant_id: 't_77bd8e2a',
        tenant_name: 'ZenPay',
        status: 'AT_RISK',
        success_rate: 95.4,
        primary_issue: 'Webhook Failures',
        last_issue_ago: '3h ago',
        volume_per_hour: 231,
        dlq_count: 8,
      },
      {
        tenant_id: 't_12ac4f91',
        tenant_name: 'NovaBank',
        status: 'AT_RISK',
        success_rate: 96.8,
        primary_issue: 'Schema Errors',
        last_issue_ago: '5h ago',
        volume_per_hour: 156,
        dlq_count: 3,
      },
    ],

    all_tenants: [
      { tenant_id: 't_91af3c7e', tenant_name: 'Acme_Fintech', status: 'IMPACTED', success_rate: 82.1, last_issue_ago: '12m ago', volume_24h: 20328, dlq_count: 47, is_starred: true },
      { tenant_id: 't_77bd8e2a', tenant_name: 'ZenPay', status: 'AT_RISK', success_rate: 95.4, last_issue_ago: '3h ago', volume_24h: 5544, dlq_count: 8, is_starred: true },
      { tenant_id: 't_12ac4f91', tenant_name: 'NovaBank', status: 'AT_RISK', success_rate: 96.8, last_issue_ago: '5h ago', volume_24h: 3744, dlq_count: 3, is_starred: false },
      { tenant_id: 't_99dd1234', tenant_name: 'AlphaRetail', status: 'HEALTHY', success_rate: 99.1, last_issue_ago: null, volume_24h: 12482, dlq_count: 0, is_starred: true },
      { tenant_id: 't_34ef5678', tenant_name: 'PayCore', status: 'HEALTHY', success_rate: 99.8, last_issue_ago: '2d ago', volume_24h: 8921, dlq_count: 0, is_starred: false },
      { tenant_id: 't_56gh9012', tenant_name: 'FinServe', status: 'HEALTHY', success_rate: 100, last_issue_ago: '7d ago', volume_24h: 4521, dlq_count: 0, is_starred: false },
      { tenant_id: 't_78ij3456', tenant_name: 'QuickLend', status: 'HEALTHY', success_rate: 99.5, last_issue_ago: null, volume_24h: 6234, dlq_count: 0, is_starred: false },
      { tenant_id: 't_90kl7890', tenant_name: 'TrustBank', status: 'HEALTHY', success_rate: 99.9, last_issue_ago: '14d ago', volume_24h: 11234, dlq_count: 0, is_starred: false },
      { tenant_id: 't_12mn1234', tenant_name: 'CashFlow', status: 'HEALTHY', success_rate: 99.7, last_issue_ago: null, volume_24h: 3421, dlq_count: 0, is_starred: false },
      { tenant_id: 't_34op5678', tenant_name: 'PayEase', status: 'HEALTHY', success_rate: 99.2, last_issue_ago: '5d ago', volume_24h: 2891, dlq_count: 0, is_starred: false },
    ],

    quick_links: [
      { label: 'Incidents & Hot Queue', sublabel: '47 items need attention', detail: 'Recent: Acme_Fintech DLQ', href: '/console/incidents', count: 47 },
      { label: 'Failed Transactions', sublabel: 'Global failure overview', detail: '1,247 failures (24h)', href: '/console/ingestion/dlq' },
      { label: 'DLQ Overview', sublabel: 'Dead letter queue', detail: '47 items', href: '/console/ingestion/dlq', count: 47 },
    ],
  }

  return NextResponse.json(mockData)
}

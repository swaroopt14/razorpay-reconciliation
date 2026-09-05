// Tenant Health Dashboard Types

export type TenantStatus = 'HEALTHY' | 'AT_RISK' | 'IMPACTED'

export interface TenantHealthSummary {
  total: number
  healthy: number
  healthy_percent: number
  at_risk: number
  at_risk_percent: number
  impacted: number
  impacted_percent: number
  trend_wow_percent: number
}

export interface TenantAtRisk {
  tenant_id: string
  tenant_name: string
  status: TenantStatus
  success_rate: number
  primary_issue: string
  issue_channel?: string
  issue_count?: number
  last_issue_ago: string
  volume_per_hour: number
  dlq_count: number
}

export interface TenantRow {
  tenant_id: string
  tenant_name: string
  status: TenantStatus
  success_rate: number
  last_issue_ago: string | null
  volume_24h: number
  dlq_count: number
  is_starred: boolean
}

export interface QuickLinkInfo {
  label: string
  sublabel: string
  detail: string
  href: string
  count?: number
}

export interface TenantHealthResponse {
  environment: string
  last_updated_seconds_ago: number
  summary: TenantHealthSummary
  at_risk_tenants: TenantAtRisk[]
  all_tenants: TenantRow[]
  quick_links: QuickLinkInfo[]
}

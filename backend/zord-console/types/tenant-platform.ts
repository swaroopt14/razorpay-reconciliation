// Tenant Platform Types (Adyen Dashboard Grade)

export type TenantStatus = 'HEALTHY' | 'AT_RISK' | 'IMPACTED'
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'
export type TenantTier = 'STANDARD' | 'PREMIUM' | 'ENTERPRISE'
export type MonitorStatus = 'OK' | 'WARNING' | 'CRITICAL'

export interface TenantIdentity {
  tenant_id: string
  tenant_name: string
  display_name: string
  environment: string
  region: string
  onboarded_date: string
  tier: TenantTier
  risk_level: RiskLevel
}

export interface TenantStatusInfo {
  overall: TenantStatus
  primary_issue: string | null
  last_incident_minutes_ago: number | null
}

export interface UsageMetrics {
  api_calls_24h: number
  webhooks_24h: number
  streams_24h: number
  batch_rows_24h: number
  api_quota_percent: number
  webhook_quota_percent: number
  stream_lag_percent: number
}

export interface ReliabilityMetrics {
  success_rate_percent: number
  failed_intents_24h: number
  dlq_items_24h: number
  replayable_24h: number
  top_failures: { reason: string; count: number }[]
}

export interface EvidenceCompliance {
  coverage_percent: number
  hash_chain_status: 'VERIFIED' | 'PENDING' | 'FAILED'
  retention_years: number
  last_verification_minutes_ago: number
}

export interface ActivityEvent {
  timestamp: string
  message: string
  type: 'info' | 'warning' | 'error'
}

export interface MonitorItem {
  name: string
  status: MonitorStatus
  description: string
}

export interface ChannelBreakdown {
  channel: string
  count: number
  percent: number
  color: string
}

export interface TransactionMetrics {
  total: number
  successful: number
  failed: number
  pending: number
  by_channel: ChannelBreakdown[]
  by_type: ChannelBreakdown[]
}

export interface TenantPlatformResponse {
  identity: TenantIdentity
  status: TenantStatusInfo
  usage: UsageMetrics
  reliability: ReliabilityMetrics
  evidence: EvidenceCompliance
  recent_activity: ActivityEvent[]
  monitors: MonitorItem[]
  transactions: TransactionMetrics
}

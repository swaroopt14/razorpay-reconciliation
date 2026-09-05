// Platform Health Types for Ops Dashboard

export type ServiceStatus = 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN'
export type IncidentStatus = 'ACTIVE' | 'INVESTIGATING' | 'RESOLVED' | 'CLEARED'

export interface OverallStatus {
  status: ServiceStatus
  message: string
  uptime_24h: number
  last_incident_at: string | null
  active_incidents: number
}

export interface ThroughputMetrics {
  events_per_second: number
  events_per_hour: number
  p50_latency_ms: number
  p95_latency_ms: number
  p99_latency_ms: number
  backlog_count: number
  backlog_trend_percent: number
}

export interface ErrorRates {
  client_4xx_percent: number
  server_5xx_percent: number
  dlq_created_percent: number
  total_errors_24h: number
}

export interface CriticalService {
  service_name: string
  display_name: string
  status: ServiceStatus
  uptime_24h: number
  traffic_percent: number
  error_rate: number
  owner_team: string
  sla_target: number
}

export interface Incident {
  incident_id: string
  age_minutes: number
  service: string
  status: IncidentStatus
  severity: 'P1' | 'P2' | 'P3' | 'P4'
  title: string
  created_at: string
  resolved_at: string | null
}

export interface ServiceBreakdown {
  service_name: string
  display_name: string
  traffic_percent: number
  status: ServiceStatus
  requests_per_hour: number
}

export interface PlatformHealthResponse {
  overall: OverallStatus
  throughput: ThroughputMetrics
  errors: ErrorRates
  critical_services: CriticalService[]
  incidents: Incident[]
  service_breakdown: ServiceBreakdown[]
  last_updated: string
}

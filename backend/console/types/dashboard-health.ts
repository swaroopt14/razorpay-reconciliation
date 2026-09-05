// Platform Health Dashboard Types (Datadog/New Relic Grade)

export type OverallStatus = 'OPERATIONAL' | 'DEGRADED' | 'IMPACTED'
export type CellStatus = 'healthy' | 'warning' | 'critical'
export type ServiceStatus = 'OK' | 'DEGRADED' | 'DOWN'

// Golden Signals (Google SRE Canon)
export interface GoldenSignals {
  latency: {
    status: CellStatus
    p95_ms: number
    p99_ms: number
    trend: number // percentage change
  }
  traffic: {
    status: CellStatus
    events_per_second: number
    backlog: number
    backlog_trend: number
  }
  errors: {
    status: CellStatus
    rate_percent: number
    dlq_count: number
    replayable: number
  }
  saturation: {
    status: CellStatus
    capacity_percent: number
    peak_percent: number
  }
}

// Service Instance for Nervous System Grid
export interface ServiceInstance {
  service_name: string
  instance_id: string
  display_name: string
  cpu: CellStatus
  memory: CellStatus
  errors: CellStatus
  traffic: CellStatus
  cpu_percent: number
  memory_percent: number
  error_count_5m: number
  requests_5m: number
  href: string
}

// System Health Summary (for expandable banner)
export interface SystemHealthSummary {
  name: string
  display_name: string
  status: CellStatus
  metric_value: number
  metric_label: string
}

export interface ThroughputMetrics {
  events_per_second: number
  intents_processed_24h: number
  success_rate_percent: number
  p95_latency_ms: number
  p99_latency_ms: number
  backlog: number
  backlog_trend: number
}

export interface FailureMetrics {
  dlq_items_24h: number
  replayable: number
  outbox_pending: number
  stuck_events: number
}

export interface ServiceHealthItem {
  service_name: string
  display_name: string
  status: ServiceStatus
  uptime_percent: number
  last_incident: string | null
  href: string
}

export interface IncidentItem {
  id: string
  title: string
  severity: 'P1' | 'P2' | 'P3'
  service: string
  age_minutes: number
  created_at: string
}

export interface IncidentQueue {
  count: number
  critical: number
  items: IncidentItem[]
}

export interface DashboardHealthResponse {
  overall_status: OverallStatus
  environment: string
  region: string
  last_updated_seconds_ago: number
  
  // Hero metrics
  events_per_hour: number
  success_rate: number
  p95_latency: number
  
  // Golden Signals
  golden_signals: GoldenSignals
  
  // System Health Summary (for expandable)
  system_health: SystemHealthSummary[]
  
  // Nervous System Grid (instances)
  service_instances: ServiceInstance[]
  
  // Legacy support
  throughput: ThroughputMetrics
  failures: FailureMetrics
  services: ServiceHealthItem[]
  incidents: IncidentQueue
}

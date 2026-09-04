// Service Metrics Types (Datadog/Grafana Grade)

export type MetricStatus = 'healthy' | 'warning' | 'critical'

export interface TimeSeriesPoint {
  timestamp: string
  value: number
}

export interface MetricSeries {
  name: string
  data: TimeSeriesPoint[]
  color?: string
}

export interface ServiceMetric {
  name: string
  display_name: string
  current_value: number
  unit: string
  status: MetricStatus
  threshold_warning: number
  threshold_critical: number
  series: TimeSeriesPoint[]
}

export interface ServiceInstance {
  service_name: string
  instance_id: string
  display_name: string
  status: MetricStatus
  region: string
  availability_zone: string
  ip_address: string
  port: number
  version: string
  uptime_seconds: number
  last_restart: string
}

export interface ServiceMetricsResponse {
  service_name: string
  instance_id: string
  display_name: string
  status: MetricStatus
  environment: string
  region: string
  last_updated_seconds_ago: number
  
  // Instance info
  instance: ServiceInstance
  
  // Core metrics
  cpu: ServiceMetric
  memory: ServiceMetric
  disk: ServiceMetric
  network_in: ServiceMetric
  network_out: ServiceMetric
  
  // Application metrics
  requests_per_second: ServiceMetric
  latency_p50: ServiceMetric
  latency_p95: ServiceMetric
  latency_p99: ServiceMetric
  error_rate: ServiceMetric
  active_connections: ServiceMetric
  
  // Recent events
  recent_events: {
    timestamp: string
    type: 'info' | 'warning' | 'error'
    message: string
  }[]
}

// Ingress Types for API, Webhook, Stream, Batch, and DLQ pages

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'CRITICAL'

// Common metrics interface
export interface LatencyMetrics {
  p50_ms: number
  p95_ms: number
  p99_ms: number
}

// API Ingestion Types
export interface APIIngestionData {
  health: {
    status: HealthStatus
    success_rate: number
    requests_per_hour: number
    latency: LatencyMetrics
  }
  rate_limits: {
    tenants: Array<{
      tenant_id: string
      tenant_name: string
      used: number
      limit: number
      percent: number
    }>
    global: { used: number; limit: number; percent: number }
  }
  top_errors: Array<{
    category: string
    count: number
    percent: number
  }>
  endpoints: Array<{
    method: string
    path: string
    volume_percent: number
    success_rate: number
    avg_latency_ms: number
  }>
  tenant_breakdown: Array<{
    tenant_name: string
    requests: number
    failure_rate: number
  }>
}

// Webhook Ingestion Types
export interface WebhookIngestionData {
  health: {
    status: HealthStatus
    delivery_rate: number
    requests_per_hour: number
    delivery_latency: LatencyMetrics
  }
  retry_status: {
    retrying: number
    retrying_percent: number
    max_attempts: number
    max_attempts_allowed: number
    success_after_retry_percent: number
  }
  failure_reasons: Array<{
    reason: string
    count: number
    percent: number
  }>
  endpoints: Array<{
    tenant_name: string
    endpoint_name: string
    volume: number
    success_rate: number
  }>
}

// Stream Ingestion Types
export interface StreamIngestionData {
  health: {
    status: HealthStatus
    processing_rate: number
    messages_per_hour: number
    latency: LatencyMetrics
  }
  consumer_lag: Array<{
    consumer_group: string
    lag_messages: number
    lag_time: string
  }>
  max_lag: string
  topics: Array<{
    topic_name: string
    volume_percent: number
    messages_per_hour: number
    avg_latency_ms: number
  }>
}

// Batch Ingestion Types
export interface BatchIngestionData {
  health: {
    status: HealthStatus
    success_rate: number
    records_per_hour: number
  }
  processing_queue: {
    pending_files: number
    pending_records: number
    processing_files: number
    processing_records: number
    failed_files: number
    failed_percent: number
  }
  format_errors: Array<{
    format: string
    percent: number
  }>
  recent_batches: Array<{
    batch_id: string
    status: 'SUCCESS' | 'FAILED' | 'PROCESSING' | 'PENDING'
    success_rate: number
    records: number
    timestamp: string
  }>
}

// DLQ Types
export interface DLQData {
  overview: {
    total_failures: number
    replayable: number
    non_replayable: number
    time_range: string
  }
  by_channel: Array<{
    channel: 'API' | 'WEBHOOK' | 'STREAM' | 'BATCH'
    count: number
    percent: number
  }>
  top_reasons: Array<{
    reason: string
    count: number
    percent: number
  }>
  recent_failures: Array<{
    dlq_id: string
    envelope_id: string
    reason: string
    channel: string
    tenant_name: string
    timestamp: string
    replayable: boolean
  }>
}

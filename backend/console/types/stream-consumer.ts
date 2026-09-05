export type ConsumerStatus = 'RUNNING' | 'DEGRADED' | 'STALLED'

export type StreamName = 'zord.intent.ingress' | 'zord.webhook.ingress' | 'zord.batch.ingress'

export interface StreamConsumer {
  consumer_group: string
  stream: StreamName
  partitions: number
  lag_events: number
  ingest_rate: number // events/sec
  status: ConsumerStatus
  last_commit: string // UTC timestamp
}

export interface StreamConsumerListResponse {
  items: StreamConsumer[]
  pagination: {
    page: number
    page_size: number
    total: number
  }
}

export interface PartitionInfo {
  partition: number
  current_offset: number
  log_end_offset: number
  lag: number // derived: log_end_offset - current_offset
  status: 'OK' | 'LAGGING' | 'CRITICAL'
}

export interface ConsumerMember {
  member_id: string
  host: string
  partitions: number[]
}

export interface CommitBehavior {
  commit_mode: 'Async' | 'Sync'
  commit_interval_sec: number
  max_commit_delay_sec: number
  commit_sla_sec: number
  sla_breached: boolean
  commit_failures_1h: number
  commit_failure_breakdown: {
    OFFSET_COMMIT_TIMEOUT: number
    REBALANCE_IN_PROGRESS: number
    COORDINATOR_NOT_AVAILABLE: number
  }
}

export interface ThroughputMetrics {
  ingress_rate: number // events/sec
  processing_rate: number // events/sec
  effective_backpressure: 'ACTIVE' | 'INACTIVE'
}

export interface RebalanceEvent {
  timestamp: string
  event_type: 'REBALANCE_STARTED' | 'REBALANCE_COMPLETED'
  duration_sec?: number
}

export interface ErrorSignals {
  poison_messages_detected: number
  deserialization_errors: number
  schema_mismatch: number
}

export interface DownstreamEffects {
  intents_created_last_1h: number
  failed_conversions: number
  intents_created_last_15m?: number
  avg_event_to_intent_latency_ms?: number
}

export interface ConsumerGroupDetail {
  consumer_group: string
  stream: StreamName
  environment: string
  state: ConsumerStatus
  deployment: string
  assigned_partitions: number
  active_members: number
  total_lag: number
  lag_growth_rate: number // events/sec (derived)
  last_commit_max: string
  commit_sla_sec: number
  commit_sla_breached: boolean
  group_topology: ConsumerMember[]
  partitions_detail: PartitionInfo[]
  commit_behavior: CommitBehavior
  throughput: ThroughputMetrics
  schema_info: {
    schema_version_expected: string
    schema_mismatch_count: number
    deserialization_errors: number
  }
  poison_messages: {
    suspected_count: number
    affected_partitions: number[]
    retry_attempts: number
  }
  downstream_effects: DownstreamEffects
  rebalance_history: RebalanceEvent[]
  audit: {
    offset_commit_log: 'ENABLED' | 'DISABLED'
    consumer_state_snapshots: 'RETAINED' | 'NOT_RETAINED'
    retention_days?: number
    audit_trail_integrity: 'VERIFIED' | 'NOT_VERIFIED'
    last_verified: string
  }
  throughput_data?: Array<{
    timestamp: string
    events_per_sec: number
  }>
  commit_latency_data?: Array<{
    timestamp: string
    latency_ms: number
  }>
}

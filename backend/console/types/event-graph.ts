// Types for Event Graph Timeline page

export type EventStatus = 'PASS' | 'FAIL' | 'SKIPPED' | 'PENDING'
export type RootType = 'ENVELOPE' | 'INTENT' | 'BATCH'

export type EventNodeType = 
  | 'ENVELOPE_PERSISTED'
  | 'IDEMPOTENCY_CHECK'
  | 'SCHEMA_VALIDATION'
  | 'PII_TOKENIZATION'
  | 'BENEFICIARY_VALIDATION'
  | 'INTENT_CREATED'
  | 'COMPLIANCE_CHECK'
  | 'EXECUTION_STARTED'
  | 'RAIL_SUBMITTED'
  | 'ACKNOWLEDGMENT_RECEIVED'
  | 'DLQ_CREATED'
  | 'EVIDENCE_GENERATED'

export interface EventNode {
  node_id: string
  node_type: EventNodeType
  label: string
  service: string
  service_version: string
  status: EventStatus
  timestamp: string
  duration_ms: number
  input_size_bytes?: number
  output_size_bytes?: number
  
  // Status-specific details
  reason_code?: string
  error_detail?: string
  schema_version?: string
  
  // Evidence links
  evidence_ref?: string
  dlq_id?: string
  intent_id?: string
  envelope_id?: string
  
  // Position in timeline (calculated)
  relative_time_ms: number
}

export interface EventEdge {
  edge_id: string
  source_node_id: string
  target_node_id: string
  edge_type: 'CAUSES' | 'TRIGGERS' | 'CREATES' | 'BLOCKS'
  timestamp: string
}

export interface EventGraphSummary {
  root_id: string
  root_type: RootType
  root_label: string
  tenant_id: string
  tenant_name: string
  environment: 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT'
  
  // Timeline span
  start_time: string
  end_time: string
  total_duration_ms: number
  
  // Graph metrics
  total_nodes: number
  total_edges: number
  pass_count: number
  fail_count: number
  skipped_count: number
  
  // Related roots (for switching)
  related_roots: {
    root_id: string
    root_type: RootType
    label: string
  }[]
}

export interface EventGraphDetail {
  summary: EventGraphSummary
  nodes: EventNode[]
  edges: EventEdge[]
  
  // Service stack for Y-axis ordering
  service_stack: {
    service: string
    layer: number
    color: string
  }[]
}

export interface TimelineEvent {
  timestamp: string
  event: string
  service: string
  status: EventStatus
  evidence_ref?: string
  duration_ms: number
  node_id: string
}

export interface EventGraphResponse {
  graph: EventGraphDetail
  timeline: TimelineEvent[]
}

import { NextRequest, NextResponse } from 'next/server'
import { 
  EventGraphResponse, 
  EventGraphDetail, 
  EventNode, 
  EventEdge, 
  TimelineEvent,
  EventStatus,
  RootType,
  EventNodeType
} from '@/types/event-graph'

export const dynamic = 'force-dynamic'

// Service colors for visualization
const serviceColors: Record<string, string> = {
  'zord-edge': '#3B82F6',           // Blue
  'zord-intent-engine': '#8B5CF6', // Purple
  'zord-pii-enclave': '#F59E0B',   // Amber
  'central-dlq': '#EF4444',        // Red
  'zord-contracts': '#10B981',     // Emerald
  'zord-compliance': '#EC4899',    // Pink
  'zord-executor': '#06B6D4',      // Cyan
}

// Service layer ordering (Y-axis position)
const serviceLayers: Record<string, number> = {
  'zord-edge': 1,
  'zord-intent-engine': 2,
  'zord-pii-enclave': 3,
  'zord-compliance': 4,
  'zord-executor': 5,
  'central-dlq': 6,
  'zord-contracts': 7,
}

function parseRootId(rootId: string): { type: RootType; timestamp: Date } {
  if (rootId.startsWith('env_')) {
    return { type: 'ENVELOPE', timestamp: parseTimestamp(rootId) }
  } else if (rootId.startsWith('pi_')) {
    return { type: 'INTENT', timestamp: parseTimestamp(rootId) }
  } else if (rootId.startsWith('batch_')) {
    return { type: 'BATCH', timestamp: parseTimestamp(rootId) }
  }
  return { type: 'ENVELOPE', timestamp: new Date() }
}

function parseTimestamp(id: string): Date {
  // Format: env_20260113T122911Z_twyh or pi_20260115_91XK
  const match = id.match(/(\d{8})T?(\d{6})?/)
  if (match) {
    const dateStr = match[1]
    const timeStr = match[2] || '120000'
    return new Date(
      parseInt(dateStr.substring(0, 4)),
      parseInt(dateStr.substring(4, 6)) - 1,
      parseInt(dateStr.substring(6, 8)),
      parseInt(timeStr.substring(0, 2)),
      parseInt(timeStr.substring(2, 4)),
      parseInt(timeStr.substring(4, 6))
    )
  }
  return new Date('2026-01-13T12:29:11Z')
}

function generateFailedEnvelopeGraph(rootId: string, startTime: Date): EventGraphDetail {
  const baseMs = startTime.getTime()
  
  const nodes: EventNode[] = [
    {
      node_id: 'node_1',
      node_type: 'ENVELOPE_PERSISTED',
      label: 'Envelope persisted',
      service: 'zord-edge',
      service_version: 'v2.1.0',
      status: 'PASS',
      timestamp: new Date(baseMs).toISOString(),
      duration_ms: 8,
      input_size_bytes: 3276,
      relative_time_ms: 0,
      evidence_ref: `worm://prod/envelopes/${rootId}`,
      envelope_id: rootId,
    },
    {
      node_id: 'node_2',
      node_type: 'IDEMPOTENCY_CHECK',
      label: 'Idempotency checked',
      service: 'zord-edge',
      service_version: 'v2.1.0',
      status: 'PASS',
      timestamp: new Date(baseMs + 13).toISOString(),
      duration_ms: 5,
      relative_time_ms: 13,
    },
    {
      node_id: 'node_3',
      node_type: 'SCHEMA_VALIDATION',
      label: 'Schema validation failed',
      service: 'zord-intent-engine',
      service_version: 'v1.4.3',
      status: 'FAIL',
      timestamp: new Date(baseMs + 26).toISOString(),
      duration_ms: 13,
      relative_time_ms: 26,
      reason_code: 'INVALID_FIELD',
      error_detail: '$.beneficiary.ifsc missing',
      schema_version: 'payout.intent v1.3',
      evidence_ref: `worm://prod/validation/dlq_${startTime.toISOString().split('T')[0].replace(/-/g, '')}_9A3F`,
    },
    {
      node_id: 'node_4',
      node_type: 'PII_TOKENIZATION',
      label: 'PII tokenization',
      service: 'zord-pii-enclave',
      service_version: 'v1.2.1',
      status: 'SKIPPED',
      timestamp: new Date(baseMs + 26).toISOString(),
      duration_ms: 0,
      relative_time_ms: 26,
    },
    {
      node_id: 'node_5',
      node_type: 'INTENT_CREATED',
      label: 'Intent creation',
      service: 'zord-intent-engine',
      service_version: 'v1.4.3',
      status: 'SKIPPED',
      timestamp: new Date(baseMs + 26).toISOString(),
      duration_ms: 0,
      relative_time_ms: 26,
    },
    {
      node_id: 'node_6',
      node_type: 'DLQ_CREATED',
      label: 'DLQ item created',
      service: 'central-dlq',
      service_version: 'v1.0.2',
      status: 'PASS',
      timestamp: new Date(baseMs + 30).toISOString(),
      duration_ms: 4,
      relative_time_ms: 30,
      dlq_id: `dlq_${startTime.toISOString().split('T')[0].replace(/-/g, '')}_9A3F`,
      evidence_ref: `worm://prod/dlq/dlq_${startTime.toISOString().split('T')[0].replace(/-/g, '')}_9A3F`,
    },
  ]

  const edges: EventEdge[] = [
    { edge_id: 'edge_1', source_node_id: 'node_1', target_node_id: 'node_2', edge_type: 'TRIGGERS', timestamp: new Date(baseMs + 8).toISOString() },
    { edge_id: 'edge_2', source_node_id: 'node_2', target_node_id: 'node_3', edge_type: 'TRIGGERS', timestamp: new Date(baseMs + 18).toISOString() },
    { edge_id: 'edge_3', source_node_id: 'node_3', target_node_id: 'node_4', edge_type: 'BLOCKS', timestamp: new Date(baseMs + 26).toISOString() },
    { edge_id: 'edge_4', source_node_id: 'node_3', target_node_id: 'node_5', edge_type: 'BLOCKS', timestamp: new Date(baseMs + 26).toISOString() },
    { edge_id: 'edge_5', source_node_id: 'node_3', target_node_id: 'node_6', edge_type: 'CREATES', timestamp: new Date(baseMs + 26).toISOString() },
  ]

  const endTime = new Date(baseMs + 30)

  return {
    summary: {
      root_id: rootId,
      root_type: 'ENVELOPE',
      root_label: 'Envelope',
      tenant_id: '11111111-1111-1111-1111-111111111111',
      tenant_name: 'acme_nbfc',
      environment: 'PRODUCTION',
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      total_duration_ms: 30,
      total_nodes: nodes.length,
      total_edges: edges.length,
      pass_count: nodes.filter(n => n.status === 'PASS').length,
      fail_count: nodes.filter(n => n.status === 'FAIL').length,
      skipped_count: nodes.filter(n => n.status === 'SKIPPED').length,
      related_roots: [
        { root_id: rootId, root_type: 'ENVELOPE', label: 'Envelope (current)' },
      ],
    },
    nodes,
    edges,
    service_stack: [
      { service: 'zord-edge', layer: 1, color: serviceColors['zord-edge'] },
      { service: 'zord-intent-engine', layer: 2, color: serviceColors['zord-intent-engine'] },
      { service: 'zord-pii-enclave', layer: 3, color: serviceColors['zord-pii-enclave'] },
      { service: 'central-dlq', layer: 4, color: serviceColors['central-dlq'] },
    ],
  }
}

function generateSuccessfulIntentGraph(rootId: string, startTime: Date): EventGraphDetail {
  const baseMs = startTime.getTime()
  const envelopeId = `env_${startTime.toISOString().replace(/[-:.]/g, '').substring(0, 15)}Z_twyh`
  
  const nodes: EventNode[] = [
    {
      node_id: 'node_1',
      node_type: 'ENVELOPE_PERSISTED',
      label: 'Envelope persisted',
      service: 'zord-edge',
      service_version: 'v2.1.0',
      status: 'PASS',
      timestamp: new Date(baseMs).toISOString(),
      duration_ms: 8,
      input_size_bytes: 4521,
      relative_time_ms: 0,
      evidence_ref: `worm://prod/envelopes/${envelopeId}`,
      envelope_id: envelopeId,
    },
    {
      node_id: 'node_2',
      node_type: 'IDEMPOTENCY_CHECK',
      label: 'Idempotency checked',
      service: 'zord-edge',
      service_version: 'v2.1.0',
      status: 'PASS',
      timestamp: new Date(baseMs + 12).toISOString(),
      duration_ms: 4,
      relative_time_ms: 12,
    },
    {
      node_id: 'node_3',
      node_type: 'SCHEMA_VALIDATION',
      label: 'Schema validated',
      service: 'zord-intent-engine',
      service_version: 'v1.4.3',
      status: 'PASS',
      timestamp: new Date(baseMs + 25).toISOString(),
      duration_ms: 11,
      relative_time_ms: 25,
      schema_version: 'payout.intent v1.3',
    },
    {
      node_id: 'node_4',
      node_type: 'PII_TOKENIZATION',
      label: 'PII tokenized',
      service: 'zord-pii-enclave',
      service_version: 'v1.2.1',
      status: 'PASS',
      timestamp: new Date(baseMs + 42).toISOString(),
      duration_ms: 15,
      relative_time_ms: 42,
    },
    {
      node_id: 'node_5',
      node_type: 'BENEFICIARY_VALIDATION',
      label: 'Beneficiary validated',
      service: 'zord-intent-engine',
      service_version: 'v1.4.3',
      status: 'PASS',
      timestamp: new Date(baseMs + 63).toISOString(),
      duration_ms: 18,
      relative_time_ms: 63,
    },
    {
      node_id: 'node_6',
      node_type: 'INTENT_CREATED',
      label: 'Intent created',
      service: 'zord-intent-engine',
      service_version: 'v1.4.3',
      status: 'PASS',
      timestamp: new Date(baseMs + 85).toISOString(),
      duration_ms: 12,
      relative_time_ms: 85,
      intent_id: rootId,
      evidence_ref: `worm://prod/intents/${rootId}`,
    },
    {
      node_id: 'node_7',
      node_type: 'COMPLIANCE_CHECK',
      label: 'Compliance approved',
      service: 'zord-compliance',
      service_version: 'v1.1.0',
      status: 'PASS',
      timestamp: new Date(baseMs + 120).toISOString(),
      duration_ms: 28,
      relative_time_ms: 120,
    },
    {
      node_id: 'node_8',
      node_type: 'EXECUTION_STARTED',
      label: 'Execution started',
      service: 'zord-executor',
      service_version: 'v1.3.2',
      status: 'PASS',
      timestamp: new Date(baseMs + 155).toISOString(),
      duration_ms: 8,
      relative_time_ms: 155,
    },
    {
      node_id: 'node_9',
      node_type: 'RAIL_SUBMITTED',
      label: 'Rail submitted (IMPS)',
      service: 'zord-executor',
      service_version: 'v1.3.2',
      status: 'PASS',
      timestamp: new Date(baseMs + 180).toISOString(),
      duration_ms: 45,
      relative_time_ms: 180,
    },
    {
      node_id: 'node_10',
      node_type: 'ACKNOWLEDGMENT_RECEIVED',
      label: 'ACK received',
      service: 'zord-executor',
      service_version: 'v1.3.2',
      status: 'PASS',
      timestamp: new Date(baseMs + 1200).toISOString(),
      duration_ms: 3,
      relative_time_ms: 1200,
      evidence_ref: `worm://prod/acks/${rootId}`,
    },
    {
      node_id: 'node_11',
      node_type: 'EVIDENCE_GENERATED',
      label: 'Evidence sealed',
      service: 'zord-contracts',
      service_version: 'v2.0.1',
      status: 'PASS',
      timestamp: new Date(baseMs + 1220).toISOString(),
      duration_ms: 15,
      relative_time_ms: 1220,
      evidence_ref: `worm://prod/evidence/ev_${rootId}`,
    },
  ]

  const edges: EventEdge[] = [
    { edge_id: 'edge_1', source_node_id: 'node_1', target_node_id: 'node_2', edge_type: 'TRIGGERS', timestamp: new Date(baseMs + 8).toISOString() },
    { edge_id: 'edge_2', source_node_id: 'node_2', target_node_id: 'node_3', edge_type: 'TRIGGERS', timestamp: new Date(baseMs + 16).toISOString() },
    { edge_id: 'edge_3', source_node_id: 'node_3', target_node_id: 'node_4', edge_type: 'TRIGGERS', timestamp: new Date(baseMs + 36).toISOString() },
    { edge_id: 'edge_4', source_node_id: 'node_4', target_node_id: 'node_5', edge_type: 'TRIGGERS', timestamp: new Date(baseMs + 57).toISOString() },
    { edge_id: 'edge_5', source_node_id: 'node_5', target_node_id: 'node_6', edge_type: 'CREATES', timestamp: new Date(baseMs + 81).toISOString() },
    { edge_id: 'edge_6', source_node_id: 'node_6', target_node_id: 'node_7', edge_type: 'TRIGGERS', timestamp: new Date(baseMs + 97).toISOString() },
    { edge_id: 'edge_7', source_node_id: 'node_7', target_node_id: 'node_8', edge_type: 'TRIGGERS', timestamp: new Date(baseMs + 148).toISOString() },
    { edge_id: 'edge_8', source_node_id: 'node_8', target_node_id: 'node_9', edge_type: 'TRIGGERS', timestamp: new Date(baseMs + 163).toISOString() },
    { edge_id: 'edge_9', source_node_id: 'node_9', target_node_id: 'node_10', edge_type: 'TRIGGERS', timestamp: new Date(baseMs + 225).toISOString() },
    { edge_id: 'edge_10', source_node_id: 'node_10', target_node_id: 'node_11', edge_type: 'CREATES', timestamp: new Date(baseMs + 1203).toISOString() },
  ]

  const endTime = new Date(baseMs + 1235)

  return {
    summary: {
      root_id: rootId,
      root_type: 'INTENT',
      root_label: 'Payment Intent',
      tenant_id: '11111111-1111-1111-1111-111111111111',
      tenant_name: 'acme_nbfc',
      environment: 'PRODUCTION',
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      total_duration_ms: 1235,
      total_nodes: nodes.length,
      total_edges: edges.length,
      pass_count: nodes.filter(n => n.status === 'PASS').length,
      fail_count: nodes.filter(n => n.status === 'FAIL').length,
      skipped_count: nodes.filter(n => n.status === 'SKIPPED').length,
      related_roots: [
        { root_id: envelopeId, root_type: 'ENVELOPE', label: 'Source Envelope' },
        { root_id: rootId, root_type: 'INTENT', label: 'Intent (current)' },
      ],
    },
    nodes,
    edges,
    service_stack: [
      { service: 'zord-edge', layer: 1, color: serviceColors['zord-edge'] },
      { service: 'zord-intent-engine', layer: 2, color: serviceColors['zord-intent-engine'] },
      { service: 'zord-pii-enclave', layer: 3, color: serviceColors['zord-pii-enclave'] },
      { service: 'zord-compliance', layer: 4, color: serviceColors['zord-compliance'] },
      { service: 'zord-executor', layer: 5, color: serviceColors['zord-executor'] },
      { service: 'zord-contracts', layer: 6, color: serviceColors['zord-contracts'] },
    ],
  }
}

function generateTimeline(nodes: EventNode[]): TimelineEvent[] {
  return nodes
    .filter(n => n.status !== 'SKIPPED')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map(node => ({
      timestamp: node.timestamp,
      event: node.label,
      service: node.service,
      status: node.status,
      evidence_ref: node.evidence_ref,
      duration_ms: node.duration_ms,
      node_id: node.node_id,
    }))
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ root_id: string }> }
) {
  const { root_id } = await params
  const decodedRootId = decodeURIComponent(root_id)
  
  const { type, timestamp } = parseRootId(decodedRootId)
  
  let graph: EventGraphDetail
  
  // Generate different graphs based on root type
  if (type === 'INTENT' || decodedRootId.startsWith('pi_')) {
    graph = generateSuccessfulIntentGraph(decodedRootId, timestamp)
  } else {
    // Default to failed envelope scenario for demo
    graph = generateFailedEnvelopeGraph(decodedRootId, timestamp)
  }
  
  const timeline = generateTimeline(graph.nodes)
  
  const response: EventGraphResponse = {
    graph,
    timeline,
  }
  
  return NextResponse.json(response)
}

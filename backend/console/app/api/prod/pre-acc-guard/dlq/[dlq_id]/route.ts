import { NextRequest, NextResponse } from 'next/server'
import { DLQItemDetail, GuardStage, GuardReasonCode, FailureSeverity, FinancialRisk, GuardPipelineStep, AccessLogEntry } from '@/types/validation'

export const dynamic = 'force-dynamic'

// Stage execution order map
const stageOrder: Record<GuardStage, number> = {
  IDEMPOTENCY_CHECK: 1,
  SCHEMA_VALIDATION: 2,
  PII_TOKENIZATION: 3,
  BENEFICIARY_VALIDATION: 4,
  AMOUNT_CURRENCY_SANITY: 5,
  DEADLINE_CONSTRAINTS: 6,
}

// Error messages by reason code
const errorMessages: Record<GuardReasonCode, { message: string; detail: string }> = {
  INVALID_FIELD: {
    message: 'beneficiary.ifsc is required',
    detail: 'Field missing in payload',
  },
  MISSING_FIELD: {
    message: 'Required field not present',
    detail: 'A required field was not included in the request payload',
  },
  SCHEMA_MISMATCH: {
    message: 'Payload structure does not match schema',
    detail: 'The payload structure differs from the expected schema definition',
  },
  DUPLICATE_REQUEST: {
    message: 'Idempotency key already used',
    detail: 'This request has already been processed with a different outcome',
  },
  TOKENIZATION_FAIL: {
    message: 'Failed to tokenize PII data',
    detail: 'PII tokenization service returned an error during processing',
  },
  INVALID_BENEFICIARY: {
    message: 'Beneficiary account details invalid',
    detail: 'The beneficiary account number or IFSC code is not valid',
  },
  INVALID_AMOUNT: {
    message: 'Amount format invalid or out of range',
    detail: 'The transaction amount is not in valid format or exceeds limits',
  },
  INVALID_CURRENCY: {
    message: 'Currency code not supported',
    detail: 'The specified currency is not supported for this transaction type',
  },
  DEADLINE_EXCEEDED: {
    message: 'Payment deadline has passed',
    detail: 'The requested execution time has already passed',
  },
  UNKNOWN_ERROR: {
    message: 'An unexpected error occurred',
    detail: 'The guard encountered an unexpected condition',
  },
}

// Severity mapping by stage
const severityByStage: Record<GuardStage, FailureSeverity> = {
  IDEMPOTENCY_CHECK: 'SOFT_RETRY',
  SCHEMA_VALIDATION: 'HARD_BLOCK',
  PII_TOKENIZATION: 'HARD_BLOCK',
  BENEFICIARY_VALIDATION: 'HARD_BLOCK',
  AMOUNT_CURRENCY_SANITY: 'HARD_BLOCK',
  DEADLINE_CONSTRAINTS: 'SOFT_RETRY',
}

// Risk mapping by stage
const riskByStage: Record<GuardStage, FinancialRisk> = {
  IDEMPOTENCY_CHECK: 'MEDIUM',
  SCHEMA_VALIDATION: 'HIGH',
  PII_TOKENIZATION: 'HIGH',
  BENEFICIARY_VALIDATION: 'HIGH',
  AMOUNT_CURRENCY_SANITY: 'HIGH',
  DEADLINE_CONSTRAINTS: 'MEDIUM',
}

// Executed by service
const executedByService: Record<GuardStage, string> = {
  IDEMPOTENCY_CHECK: 'zord-edge v2.1.0',
  SCHEMA_VALIDATION: 'zord-intent-engine v1.4.3',
  PII_TOKENIZATION: 'zord-pii-enclave v1.2.1',
  BENEFICIARY_VALIDATION: 'zord-intent-engine v1.4.3',
  AMOUNT_CURRENCY_SANITY: 'zord-intent-engine v1.4.3',
  DEADLINE_CONSTRAINTS: 'zord-intent-engine v1.4.3',
}

function generatePipelineSteps(failedStage: GuardStage): GuardPipelineStep[] {
  const stages: { stage: string; order: number }[] = [
    { stage: 'Envelope persisted', order: 0 },
    { stage: 'Idempotency check', order: 1 },
    { stage: 'Schema validation', order: 2 },
    { stage: 'PII tokenization', order: 3 },
    { stage: 'Beneficiary validation', order: 4 },
    { stage: 'Amount/currency sanity', order: 5 },
  ]

  const failOrder = stageOrder[failedStage]
  
  return stages.map(s => {
    if (s.order < failOrder) {
      return { stage: s.stage, status: 'PASS' as const, is_failure_point: false }
    } else if (s.order === failOrder) {
      return { stage: s.stage, status: 'FAIL' as const, is_failure_point: true }
    } else {
      return { stage: s.stage, status: 'SKIPPED' as const, is_failure_point: false }
    }
  })
}

function generateAccessLog(dlqId: string, createdAt: Date): AccessLogEntry[] {
  const baseTime = new Date(createdAt.getTime() + 15 * 60 * 1000) // 15 min after creation
  
  return [
    {
      timestamp: new Date(baseTime.getTime()).toISOString(),
      action: 'Viewed by:',
      actor: 'admin_ops_1@arealis.com',
    },
    {
      timestamp: new Date(baseTime.getTime() + 2 * 60 * 1000).toISOString(),
      action: 'Replay attempt denied:',
      actor: 'admin_ops_1@arealis.com',
      details: 'Insufficient permissions',
    },
    {
      timestamp: new Date(baseTime.getTime() + 4 * 60 * 1000).toISOString(),
      action: 'Evidence downloaded:',
      actor: 'admin_compliance_2@arealis.com',
    },
  ]
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dlq_id: string }> }
) {
  const { dlq_id } = await params
  const decodedDlqId = decodeURIComponent(dlq_id)

  // Parse DLQ ID to extract timestamp for realistic mock data
  // Format: dlq_20260113T123201Z_9A3F
  const timestampMatch = decodedDlqId.match(/dlq_(\d{8})T?(\d{6})?/)
  let createdAt: Date
  
  if (timestampMatch) {
    const dateStr = timestampMatch[1]
    const timeStr = timestampMatch[2] || '120000'
    createdAt = new Date(
      parseInt(dateStr.substring(0, 4)),
      parseInt(dateStr.substring(4, 6)) - 1,
      parseInt(dateStr.substring(6, 8)),
      parseInt(timeStr.substring(0, 2)),
      parseInt(timeStr.substring(2, 4)),
      parseInt(timeStr.substring(4, 6))
    )
  } else {
    createdAt = new Date('2026-01-13T12:32:01Z')
  }

  // Determine stage based on ID pattern (for demo)
  const stages: GuardStage[] = ['SCHEMA_VALIDATION', 'IDEMPOTENCY_CHECK', 'PII_TOKENIZATION', 'BENEFICIARY_VALIDATION', 'AMOUNT_CURRENCY_SANITY', 'DEADLINE_CONSTRAINTS']
  const stageIndex = decodedDlqId.charCodeAt(decodedDlqId.length - 1) % stages.length
  const stage = stages[stageIndex]

  // Get reason codes for stage
  const reasonCodes: Record<GuardStage, GuardReasonCode[]> = {
    SCHEMA_VALIDATION: ['INVALID_FIELD', 'MISSING_FIELD', 'SCHEMA_MISMATCH'],
    IDEMPOTENCY_CHECK: ['DUPLICATE_REQUEST'],
    PII_TOKENIZATION: ['TOKENIZATION_FAIL'],
    BENEFICIARY_VALIDATION: ['INVALID_BENEFICIARY', 'MISSING_FIELD'],
    AMOUNT_CURRENCY_SANITY: ['INVALID_AMOUNT', 'INVALID_CURRENCY'],
    DEADLINE_CONSTRAINTS: ['DEADLINE_EXCEEDED'],
  }
  const reasonCode = reasonCodes[stage][0]
  const errorInfo = errorMessages[reasonCode]

  // Generate envelope ID based on DLQ time
  const envelopeId = `env_${createdAt.toISOString().replace(/[-:.]/g, '').substring(0, 15)}Z_twyh`
  const correlationId = `corr_${createdAt.toISOString().replace(/[-:.]/g, '').substring(0, 15)}Z_twyh`

  // Build the detail response
  const detail: DLQItemDetail = {
    // Basic GuardFailure fields
    dlq_id: decodedDlqId,
    envelope_id: envelopeId,
    stage,
    reason_code: reasonCode,
    created_at: createdAt.toISOString(),
    replayable: stage !== 'SCHEMA_VALIDATION' && stage !== 'PII_TOKENIZATION',

    // Error details
    error_message: errorInfo.message,
    error_detail: errorInfo.detail,
    schema_path: stage === 'SCHEMA_VALIDATION' ? '$.beneficiary.ifsc' : undefined,
    expected_type: stage === 'SCHEMA_VALIDATION' ? 'string (pattern: ^[A-Z]{4}0[A-Z0-9]{6}$)' : undefined,
    actual_value: stage === 'SCHEMA_VALIDATION' ? 'null' : undefined,
    raw_payload_hash: `sha256:${Math.random().toString(36).substring(2, 66)}`,
    raw_payload_snippet: JSON.stringify({
      intent_type: 'PAYOUT',
      amount: '125000.00',
      currency: 'INR',
      beneficiary: {
        account_number: '****4567',
        ifsc: null, // Missing IFSC causing validation failure
      },
      idempotency_key: 'pay_20260113_emp01',
    }, null, 2),

    // Failure classification
    failure_type: 'VALIDATION_FAILURE',
    guard_layer: 'Pre-ACC Guard',
    severity: severityByStage[stage],
    financial_risk: riskByStage[stage],
    cross_tenant_impact: '1 tenant affected (acme_nbfc)',

    // Guard stage breakdown
    executed_by: executedByService[stage],
    execution_order: stageOrder[stage],
    total_stages: 6,
    schema_version: stage === 'SCHEMA_VALIDATION' ? 'payout.intent v1.3' : undefined,
    pipeline_steps: generatePipelineSteps(stage),

    // Linked objects
    linked_envelope: {
      envelope_id: envelopeId,
      source: 'API',
      ingress_method: 'REST / v1/intents',
      received_at: new Date(createdAt.getTime() - 10000).toISOString(), // 10s before DLQ
      source_ip: '203.0.113.42',
      correlation_id: correlationId,
    },
    linked_intent_id: undefined, // Intent was never created
    tenant_id: '11111111-1111-1111-1111-111111111111',
    tenant_name: 'acme_nbfc',

    // Replay eligibility
    replay_reason: stage === 'SCHEMA_VALIDATION' 
      ? 'Schema violation cannot be auto-corrected'
      : 'Transient failure may be retried after cooldown',
    manual_intervention_required: stage === 'SCHEMA_VALIDATION' || stage === 'PII_TOKENIZATION',
    safe_replay_path: stage === 'SCHEMA_VALIDATION' ? [
      'Upstream corrects payload',
      'Schema v1.3 still active',
      'Internal Ops approves replay',
    ] : stage === 'DEADLINE_CONSTRAINTS' ? [
      'Update scheduled execution time',
      'Resubmit with new deadline',
    ] : undefined,

    // Evidence & audit
    envelope_persisted: true,
    failure_recorded: true,
    evidence_status: 'GENERATED',
    evidence_ref: `worm://prod/dlq/${decodedDlqId}`,
    evidence_receipt_id: `ev_${createdAt.toISOString().split('T')[0].replace(/-/g, '')}_dlq_${Math.random().toString(36).substring(2, 8)}`,

    // Access log
    access_log: generateAccessLog(decodedDlqId, createdAt),

    // Replay tracking
    replay_attempts: 0,
    last_replay_at: undefined,
    metadata: {
      guard_version: '1.4.3',
      schema_version: 'payout.intent v1.3',
      environment: 'PRODUCTION',
    },
  }

  return NextResponse.json(detail)
}

import { NextRequest, NextResponse } from 'next/server'
import { GuardFailureListResponse, GuardFailure, GuardRule, GuardStage, GuardReasonCode } from '@/types/validation'

export const dynamic = 'force-dynamic'

// Static guard rules
const guardRules: GuardRule[] = [
  {
    name: 'Schema Validation',
    stage: 'SCHEMA_VALIDATION',
    description: 'Validates incoming payload against registered JSON Schema',
    enforced_by: 'zord-intent-engine',
    failure_stage_code: 'SCHEMA_VALIDATION',
    enabled: true,
  },
  {
    name: 'Idempotency Check',
    stage: 'IDEMPOTENCY_CHECK',
    description: 'Ensures duplicate requests do not create duplicate intents',
    enforced_by: 'zord-edge',
    failure_stage_code: 'IDEMPOTENCY_CHECK',
    enabled: true,
  },
  {
    name: 'PII Tokenization',
    stage: 'PII_TOKENIZATION',
    description: 'Tokenizes sensitive PII fields before processing',
    enforced_by: 'zord-pii-enclave',
    failure_stage_code: 'PII_TOKENIZATION',
    enabled: true,
  },
  {
    name: 'Beneficiary Validation',
    stage: 'BENEFICIARY_VALIDATION',
    description: 'Validates beneficiary account details and IFSC codes',
    enforced_by: 'zord-intent-engine',
    failure_stage_code: 'BENEFICIARY_VALIDATION',
    enabled: true,
  },
  {
    name: 'Amount & Currency Sanity',
    stage: 'AMOUNT_CURRENCY_SANITY',
    description: 'Validates amount format and currency codes',
    enforced_by: 'zord-intent-engine',
    failure_stage_code: 'AMOUNT_CURRENCY_SANITY',
    enabled: true,
  },
  {
    name: 'Deadline Constraints',
    stage: 'DEADLINE_CONSTRAINTS',
    description: 'Validates scheduling and deadline constraints',
    enforced_by: 'zord-intent-engine',
    failure_stage_code: 'DEADLINE_CONSTRAINTS',
    enabled: true,
  },
]

// Generate mock guard failures
function generateMockFailures(): GuardFailure[] {
  const stages: GuardStage[] = [
    'SCHEMA_VALIDATION',
    'IDEMPOTENCY_CHECK',
    'PII_TOKENIZATION',
    'BENEFICIARY_VALIDATION',
    'AMOUNT_CURRENCY_SANITY',
    'DEADLINE_CONSTRAINTS',
  ]
  
  const reasonCodes: Record<GuardStage, GuardReasonCode[]> = {
    SCHEMA_VALIDATION: ['INVALID_FIELD', 'MISSING_FIELD', 'SCHEMA_MISMATCH'],
    IDEMPOTENCY_CHECK: ['DUPLICATE_REQUEST'],
    PII_TOKENIZATION: ['TOKENIZATION_FAIL'],
    BENEFICIARY_VALIDATION: ['INVALID_BENEFICIARY', 'MISSING_FIELD'],
    AMOUNT_CURRENCY_SANITY: ['INVALID_AMOUNT', 'INVALID_CURRENCY'],
    DEADLINE_CONSTRAINTS: ['DEADLINE_EXCEEDED'],
  }
  
  const failures: GuardFailure[] = []
  const now = new Date()
  
  for (let i = 0; i < 100; i++) {
    const stage = stages[Math.floor(Math.random() * stages.length)]
    const possibleReasons = reasonCodes[stage]
    const reasonCode = possibleReasons[Math.floor(Math.random() * possibleReasons.length)]
    const date = new Date(now.getTime() - Math.random() * 86400000 * 7) // Last 7 days
    
    failures.push({
      dlq_id: `dlq_${date.toISOString().split('T')[0].replace(/-/g, '')}_${Math.random().toString(36).substring(2, 10)}`,
      envelope_id: `env_${date.toISOString().split('T')[0].replace(/-/g, '')}_${Math.random().toString(36).substring(2, 10)}`,
      stage,
      reason_code: reasonCode,
      created_at: date.toISOString(),
      replayable: stage !== 'IDEMPOTENCY_CHECK' && Math.random() > 0.3,
    })
  }
  
  // Sort by created_at descending
  failures.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  
  return failures
}

const mockFailures = generateMockFailures()

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const page = parseInt(searchParams.get('page') || '1', 10)
  const pageSize = parseInt(searchParams.get('page_size') || '50', 10)
  const stageFilter = searchParams.get('stage') as GuardStage | null
  const reasonFilter = searchParams.get('reason_code') as GuardReasonCode | null
  const replayableFilter = searchParams.get('replayable')
  const search = searchParams.get('search') || ''

  // Filter failures
  let filteredFailures = [...mockFailures]

  if (stageFilter) {
    filteredFailures = filteredFailures.filter(f => f.stage === stageFilter)
  }

  if (reasonFilter) {
    filteredFailures = filteredFailures.filter(f => f.reason_code === reasonFilter)
  }

  if (replayableFilter !== null && replayableFilter !== '') {
    const isReplayable = replayableFilter === 'true'
    filteredFailures = filteredFailures.filter(f => f.replayable === isReplayable)
  }

  if (search) {
    const searchLower = search.toLowerCase()
    filteredFailures = filteredFailures.filter(
      f =>
        f.dlq_id.toLowerCase().includes(searchLower) ||
        f.envelope_id.toLowerCase().includes(searchLower)
    )
  }

  // Paginate
  const total = filteredFailures.length
  const totalPages = Math.ceil(total / pageSize)
  const start = (page - 1) * pageSize
  const items = filteredFailures.slice(start, start + pageSize)

  // Calculate summary (last 24h)
  const last24h = new Date(Date.now() - 86400000)
  const failuresLast24h = mockFailures.filter(f => new Date(f.created_at) > last24h)
  const dlqLast24h = failuresLast24h.length

  const response: GuardFailureListResponse = {
    items,
    summary: {
      intents_evaluated_24h: 12482,
      passed_guards_24h: 12482 - 181,
      rejected_24h: 181,
      sent_to_dlq_24h: dlqLast24h + 47, // Add baseline
    },
    rules: guardRules,
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages,
    },
  }

  return NextResponse.json(response)
}

import { NextRequest, NextResponse } from 'next/server'
import { 
  ErrorMonitorResponse, 
  ErrorSummary, 
  StageBreakdown, 
  ServiceBreakdown, 
  RecentError,
  ErrorStage,
  ErrorSeverity
} from '@/types/error-monitor'

export const dynamic = 'force-dynamic'

// Stage display names and metadata
const stageMetadata: Record<ErrorStage, { display: string; replayable: boolean; severity: ErrorSeverity }> = {
  SCHEMA_VALIDATION: { display: 'Schema Validation', replayable: false, severity: 'CRITICAL' },
  PII_ENCLAVE: { display: 'PII Enclave', replayable: true, severity: 'HIGH' },
  CONSTRAINT_CHECKS: { display: 'Constraint Checks', replayable: true, severity: 'MEDIUM' },
  SIGNATURE_VERIFICATION: { display: 'Signature Verification', replayable: false, severity: 'CRITICAL' },
  IDEMPOTENCY_CHECK: { display: 'Idempotency Check', replayable: true, severity: 'LOW' },
  BENEFICIARY_VALIDATION: { display: 'Beneficiary Validation', replayable: false, severity: 'HIGH' },
  AMOUNT_SANITY: { display: 'Amount Sanity', replayable: false, severity: 'HIGH' },
  DEADLINE_CONSTRAINTS: { display: 'Deadline Constraints', replayable: true, severity: 'MEDIUM' },
}

// Service ownership mapping
const serviceOwnership: Record<string, { display: string; team: string; priority: 'P1' | 'P2' | 'P3' }> = {
  'zord-intent-engine': { display: 'Intent Engine', team: 'Engine', priority: 'P1' },
  'zord-pii-enclave': { display: 'PII Enclave', team: 'Security', priority: 'P2' },
  'zord-edge': { display: 'Edge Gateway', team: 'Edge', priority: 'P2' },
  'zord-schema-registry': { display: 'Schema Registry', team: 'Schema', priority: 'P2' },
  'central-dlq': { display: 'Central DLQ', team: 'Platform', priority: 'P3' },
  'zord-compliance': { display: 'Compliance Engine', team: 'Compliance', priority: 'P1' },
}

// Reason codes by stage
const reasonCodes: Record<ErrorStage, { code: string; detail: string }[]> = {
  SCHEMA_VALIDATION: [
    { code: 'INVALID_FIELD', detail: '$.beneficiary.ifsc missing' },
    { code: 'INVALID_SCHEMA', detail: 'v1.2 deprecated' },
    { code: 'FIELD_TYPE_MISMATCH', detail: 'amount: expected number, got string' },
    { code: 'MISSING_REQUIRED', detail: '$.payer.account_number required' },
  ],
  PII_ENCLAVE: [
    { code: 'TOKENIZATION_FAILED', detail: 'HSM unavailable' },
    { code: 'ENCRYPTION_ERROR', detail: 'Key rotation in progress' },
  ],
  CONSTRAINT_CHECKS: [
    { code: 'AMOUNT_LIMIT_EXCEEDED', detail: 'Max ₹2L per transaction' },
    { code: 'VELOCITY_LIMIT', detail: '5 txns/min exceeded' },
  ],
  SIGNATURE_VERIFICATION: [
    { code: 'INVALID_SIGNATURE', detail: 'HMAC mismatch' },
    { code: 'EXPIRED_SIGNATURE', detail: 'Timestamp > 5min old' },
    { code: 'MISSING_SIGNATURE', detail: 'X-Signature header absent' },
  ],
  IDEMPOTENCY_CHECK: [
    { code: 'DUPLICATE_REQUEST', detail: 'Key already consumed' },
  ],
  BENEFICIARY_VALIDATION: [
    { code: 'INVALID_IFSC', detail: 'IFSC not in NPCI registry' },
    { code: 'ACCOUNT_FROZEN', detail: 'Beneficiary account frozen' },
  ],
  AMOUNT_SANITY: [
    { code: 'NEGATIVE_AMOUNT', detail: 'Amount < 0' },
    { code: 'ZERO_AMOUNT', detail: 'Amount = 0' },
    { code: 'CURRENCY_MISMATCH', detail: 'Expected INR, got USD' },
  ],
  DEADLINE_CONSTRAINTS: [
    { code: 'DEADLINE_EXCEEDED', detail: 'Scheduled time in past' },
    { code: 'CUTOFF_MISSED', detail: 'NEFT cutoff 6PM exceeded' },
  ],
}

function generateMockData(
  timeRange: string,
  tenantFilter?: string,
  severityFilter?: string,
  stageFilter?: string
): ErrorMonitorResponse {
  const now = new Date()
  const stages: ErrorStage[] = [
    'SCHEMA_VALIDATION', 'PII_ENCLAVE', 'CONSTRAINT_CHECKS', 
    'SIGNATURE_VERIFICATION', 'IDEMPOTENCY_CHECK', 'BENEFICIARY_VALIDATION',
    'AMOUNT_SANITY', 'DEADLINE_CONSTRAINTS'
  ]
  const services = Object.keys(serviceOwnership)
  const tenants = [
    { id: '11111111-1111-1111-1111-111111111111', name: 'acme_nbfc' },
    { id: '22222222-2222-2222-2222-222222222222', name: 'fintech_corp' },
    { id: '33333333-3333-3333-3333-333333333333', name: 'foo_psp' },
  ]

  // Generate stage breakdown
  const stageCounts: Record<ErrorStage, number> = {
    SCHEMA_VALIDATION: 19,
    PII_ENCLAVE: 8,
    CONSTRAINT_CHECKS: 6,
    SIGNATURE_VERIFICATION: 14,
    IDEMPOTENCY_CHECK: 3,
    BENEFICIARY_VALIDATION: 5,
    AMOUNT_SANITY: 4,
    DEADLINE_CONSTRAINTS: 2,
  }

  const totalDlq = Object.values(stageCounts).reduce((a, b) => a + b, 0)
  
  const stageBreakdown: StageBreakdown[] = stages
    .map(stage => ({
      stage,
      display_name: stageMetadata[stage].display,
      count: stageCounts[stage] || 0,
      percentage: Math.round((stageCounts[stage] / totalDlq) * 1000) / 10,
      replayable: stageMetadata[stage].replayable,
      severity: stageMetadata[stage].severity,
    }))
    .filter(s => s.count > 0)
    .sort((a, b) => b.count - a.count)

  // Generate service breakdown (filtered by stage if applicable)
  const serviceBreakdownData: ServiceBreakdown[] = [
    { service: 'zord-intent-engine', display_name: 'Intent Engine', count: 32, percentage: 52.5, owner_team: 'Engine', runbook_priority: 'P1' },
    { service: 'zord-edge', display_name: 'Edge Gateway', count: 18, percentage: 29.5, owner_team: 'Edge', runbook_priority: 'P2' },
    { service: 'zord-pii-enclave', display_name: 'PII Enclave', count: 8, percentage: 13.1, owner_team: 'Security', runbook_priority: 'P2' },
    { service: 'zord-schema-registry', display_name: 'Schema Registry', count: 3, percentage: 4.9, owner_team: 'Schema', runbook_priority: 'P2' },
  ]

  // Generate recent errors
  const recentErrors: RecentError[] = []
  for (let i = 0; i < 25; i++) {
    const errorTime = new Date(now.getTime() - Math.random() * 86400000) // Last 24h
    const stage = stages[Math.floor(Math.random() * stages.length)]
    const tenant = tenants[Math.floor(Math.random() * tenants.length)]
    const service = services[Math.floor(Math.random() * services.length)]
    const reasons = reasonCodes[stage]
    const reason = reasons[Math.floor(Math.random() * reasons.length)]
    const meta = stageMetadata[stage]

    recentErrors.push({
      error_id: `err_${errorTime.getTime()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: errorTime.toISOString(),
      envelope_id: `env_${errorTime.toISOString().replace(/[-:.]/g, '').substring(0, 15)}Z_${Math.random().toString(36).substring(2, 6)}`,
      dlq_id: `dlq_${errorTime.toISOString().split('T')[0].replace(/-/g, '')}_${Math.random().toString(36).substring(2, 6)}`,
      stage,
      reason_code: reason.code,
      reason_detail: reason.detail,
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      service,
      replayable: meta.replayable,
      severity: meta.severity,
    })
  }

  // Sort by timestamp descending
  recentErrors.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // Apply filters
  let filteredErrors = recentErrors
  if (stageFilter) {
    filteredErrors = filteredErrors.filter(e => e.stage === stageFilter)
  }
  if (tenantFilter && tenantFilter !== 'all') {
    filteredErrors = filteredErrors.filter(e => e.tenant_id === tenantFilter)
  }
  if (severityFilter && severityFilter !== 'all') {
    filteredErrors = filteredErrors.filter(e => e.severity === severityFilter)
  }

  // Calculate summary
  const replayableCount = stageBreakdown.filter(s => s.replayable).reduce((sum, s) => sum + s.count, 0)
  const nonReplayableCount = totalDlq - replayableCount

  const summary: ErrorSummary = {
    total_failures_24h: 181,
    dlq_created_24h: totalDlq,
    replayable_24h: replayableCount,
    non_replayable_24h: nonReplayableCount,
    total_trend_percent: -12, // 12% decrease from yesterday
    dlq_trend_percent: 8, // 8% increase in DLQ
  }

  return {
    summary,
    stage_breakdown: stageBreakdown,
    service_breakdown: serviceBreakdownData,
    recent_errors: filteredErrors.slice(0, 20),
    filters: {
      time_range: (timeRange as '1h' | '6h' | '24h' | '7d') || '24h',
      tenant_id: tenantFilter,
      severity: severityFilter as ErrorSeverity | undefined,
      stage: stageFilter as ErrorStage | undefined,
    },
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const timeRange = searchParams.get('time_range') || '24h'
  const tenantFilter = searchParams.get('tenant_id') || undefined
  const severityFilter = searchParams.get('severity') || undefined
  const stageFilter = searchParams.get('stage') || undefined

  const data = generateMockData(timeRange, tenantFilter, severityFilter, stageFilter)
  
  return NextResponse.json(data)
}

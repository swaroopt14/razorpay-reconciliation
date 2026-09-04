'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'
import { DLQItemDetail, GuardStage, GuardReasonCode, FailureSeverity } from '@/types/validation'

function getStageBadge(stage: GuardStage) {
  const styles: Record<GuardStage, string> = {
    SCHEMA_VALIDATION: 'bg-blue-50 text-blue-800 border-blue-200',
    IDEMPOTENCY_CHECK: 'bg-purple-50 text-purple-800 border-purple-200',
    PII_TOKENIZATION: 'bg-orange-50 text-orange-800 border-orange-200',
    BENEFICIARY_VALIDATION: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    AMOUNT_CURRENCY_SANITY: 'bg-green-50 text-green-800 border-green-200',
    DEADLINE_CONSTRAINTS: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${styles[stage]}`}>
      {stage.replace(/_/g, ' ')}
    </span>
  )
}

function getSeverityBadge(severity: FailureSeverity) {
  const styles: Record<FailureSeverity, string> = {
    HARD_BLOCK: 'bg-red-100 text-red-800 border-red-300',
    SOFT_RETRY: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded border text-xs font-semibold ${styles[severity]}`}>
      {severity}
    </span>
  )
}

function getReasonBadge(reasonCode: GuardReasonCode) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium bg-red-50 text-red-800 border-red-200">
      {reasonCode}
    </span>
  )
}

// Collapsible Section Component
function CollapsibleSection({ 
  title, 
  subtitle,
  defaultExpanded = true, 
  children 
}: { 
  title: string
  subtitle?: string
  defaultExpanded?: boolean
  children: React.ReactNode 
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between text-left"
      >
        <div>
          <h2 className="text-sm font-medium text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <svg 
          className={`w-5 h-5 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && <div className="p-6">{children}</div>}
    </div>
  )
}

export default function DLQDetailPage() {
  const router = useRouter()
  const params = useParams()
  const dlqId = decodeURIComponent(params?.dlq_id as string)
  
  const [dlqDetail, setDlqDetail] = useState<DLQItemDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [showRawPayload, setShowRawPayload] = useState(false)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    if (dlqId) {
      loadDLQDetail()
    }
  }, [dlqId, router])

  const loadDLQDetail = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/prod/pre-acc-guard/dlq/${encodeURIComponent(dlqId)}`)
      if (!response.ok) {
        if (response.status === 404) {
          setError('DLQ item not found')
          return
        }
        setError('Failed to load DLQ item details')
        return
      }
      const data: DLQItemDetail = await response.json()
      setDlqDetail(data)
    } catch (err) {
      console.error('Failed to load DLQ detail:', err)
      setError('Failed to load DLQ item details')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const exportAccessLog = () => {
    if (!dlqDetail) return
    const csv = [
      'Timestamp,Action,Actor,Details',
      ...dlqDetail.access_log.map(entry => 
        `"${entry.timestamp}","${entry.action}","${entry.actor}","${entry.details || ''}"`
      )
    ].join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${dlqId}_access_log.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Validation & Safety', 'Pre-ACC Guard', 'DLQ Item', dlqId]}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading DLQ item details...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error || !dlqDetail) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Validation & Safety', 'Pre-ACC Guard', 'DLQ Item', dlqId]}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white border border-red-200 rounded shadow-sm p-6 text-center">
            <svg className="mx-auto h-12 w-12 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{error || 'DLQ item not found'}</h3>
            <button
              onClick={() => router.push('/console/ingestion/pre-acc-guard')}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              Back to Pre-ACC Guard
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  const user = getCurrentUser()

  return (
    <Layout
      serviceName="Ingestion"
      breadcrumbs={['Validation & Safety', 'Pre-ACC Guard', 'DLQ Item', dlqDetail.dlq_id]}
      tenant={user?.tenant}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* DLQ Header (Immutable Identity) */}
        <div className="bg-white border border-gray-200 rounded shadow-sm mb-6">
          <div className="px-6 py-5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-3">
                  <button
                    onClick={() => router.push('/console/ingestion/pre-acc-guard')}
                    className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                    title="Back to list"
                  >
                    <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h1 className="text-xl font-semibold text-gray-900">DLQ Item Detail</h1>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">DLQ ID</dt>
                    <dd className="flex items-center space-x-2">
                      <span className="font-mono text-sm text-gray-900">{dlqDetail.dlq_id}</span>
                      <button
                        onClick={() => copyToClipboard(dlqDetail.dlq_id, 'dlq_id')}
                        className="text-gray-400 hover:text-gray-600"
                        title="Copy DLQ ID"
                      >
                        {copiedField === 'dlq_id' ? (
                          <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Stage</dt>
                    <dd>{getStageBadge(dlqDetail.stage)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Replayable</dt>
                    <dd>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded border text-xs font-medium ${
                        dlqDetail.replayable 
                          ? 'bg-green-50 text-green-800 border-green-300' 
                          : 'bg-red-50 text-red-800 border-red-300'
                      }`}>
                        {dlqDetail.replayable ? 'YES' : 'NO'}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Environment</dt>
                    <dd>
                      <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-300">
                        PRODUCTION
                      </span>
                    </dd>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200 flex items-center space-x-4">
                  <div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tenant:</span>
                    <span className="ml-2 font-mono text-sm text-gray-900">{dlqDetail.tenant_name}</span>
                    <span className="ml-1 text-xs text-gray-500">(cross-tenant)</span>
                  </div>
                  <Link
                    href={`/console/tenants/${dlqDetail.tenant_id}`}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    [View Tenant Activity]
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Failure Classification (High-Signal Block) */}
        <CollapsibleSection 
          title="Failure Classification" 
          subtitle="This was blocked for a reason. Do not bypass casually."
        >
          <div className={`p-4 rounded-lg border mb-4 ${
            dlqDetail.severity === 'HARD_BLOCK' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
          }`}>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Failure type</dt>
                <dd className="text-sm font-semibold text-gray-900">{dlqDetail.failure_type}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Guard layer</dt>
                <dd className="text-sm text-gray-900">{dlqDetail.guard_layer}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Severity</dt>
                <dd>{getSeverityBadge(dlqDetail.severity)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Financial risk</dt>
                <dd className={`text-sm font-semibold ${
                  dlqDetail.financial_risk === 'HIGH' ? 'text-red-600' :
                  dlqDetail.financial_risk === 'MEDIUM' ? 'text-yellow-600' : 'text-green-600'
                }`}>
                  {dlqDetail.financial_risk}
                  {dlqDetail.financial_risk === 'HIGH' && (
                    <span className="font-normal text-gray-600 ml-2">(prevented invalid payout)</span>
                  )}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Cross-tenant impact</dt>
                <dd className="text-sm text-gray-900">{dlqDetail.cross_tenant_impact}</dd>
              </div>
            </dl>
          </div>
        </CollapsibleSection>

        {/* Guard Stage Breakdown */}
        <CollapsibleSection 
          title="Guard Stage Breakdown" 
          subtitle="AWS EventBridge pipeline tracing pattern"
        >
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mb-6">
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Stage name</dt>
              <dd className="text-sm font-mono text-gray-900">{dlqDetail.stage}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Executed by</dt>
              <dd className="text-sm text-gray-900">{dlqDetail.executed_by}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Execution order</dt>
              <dd className="text-sm text-gray-900">{dlqDetail.execution_order} of {dlqDetail.total_stages}</dd>
            </div>
            {dlqDetail.schema_version && (
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Schema version</dt>
                <dd className="text-sm font-mono text-gray-900">{dlqDetail.schema_version}</dd>
              </div>
            )}
          </dl>

          {/* Pipeline Visualization */}
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Full Guard Pipeline (read-only)</p>
            <div className="space-y-2">
              {dlqDetail.pipeline_steps.map((step, index) => (
                <div 
                  key={index}
                  className={`flex items-center justify-between p-3 rounded border ${
                    step.is_failure_point 
                      ? 'bg-red-50 border-red-300' 
                      : step.status === 'PASS' 
                        ? 'bg-white border-gray-200' 
                        : 'bg-gray-100 border-gray-200'
                  }`}
                >
                  <span className="text-sm text-gray-900">{step.stage}</span>
                  <span className={`text-sm font-medium flex items-center space-x-1 ${
                    step.status === 'PASS' ? 'text-green-600' :
                    step.status === 'FAIL' ? 'text-red-600' : 'text-gray-400'
                  }`}>
                    {step.status === 'PASS' && (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>PASS</span>
                      </>
                    )}
                    {step.status === 'FAIL' && (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span>FAIL</span>
                        {step.is_failure_point && <span className="text-xs ml-1">←HERE</span>}
                      </>
                    )}
                    {step.status === 'SKIPPED' && (
                      <>
                        <span>-</span>
                        <span>SKIPPED</span>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CollapsibleSection>

        {/* Error Details (Forensic Precision) */}
        <CollapsibleSection 
          title="Error Details" 
          subtitle="Forensic precision for Dev team debugging"
        >
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Reason code</dt>
              <dd>{getReasonBadge(dlqDetail.reason_code)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Error message</dt>
              <dd className="text-sm text-red-700 font-medium">{dlqDetail.error_message}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Error detail</dt>
              <dd className="text-sm text-gray-900">{dlqDetail.error_detail}</dd>
            </div>
            {dlqDetail.schema_path && (
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Schema path</dt>
                <dd className="text-sm font-mono text-gray-900">{dlqDetail.schema_path}</dd>
              </div>
            )}
            {dlqDetail.expected_type && (
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Expected type</dt>
                <dd className="text-sm font-mono text-gray-900">{dlqDetail.expected_type}</dd>
              </div>
            )}
            {dlqDetail.actual_value !== undefined && (
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Actual payload</dt>
                <dd className="text-sm font-mono text-red-600">{dlqDetail.actual_value || 'null'}</dd>
              </div>
            )}
          </dl>

          {dlqDetail.raw_payload_snippet && (
            <div className="mt-4">
              <button
                onClick={() => setShowRawPayload(!showRawPayload)}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center space-x-1"
              >
                <svg className={`w-4 h-4 transition-transform ${showRawPayload ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span>{showRawPayload ? 'Hide' : 'View'} Raw Payload Snippet</span>
              </button>
              {showRawPayload && (
                <div className="mt-2 bg-gray-900 rounded border border-gray-700 p-4 overflow-x-auto">
                  <pre className="text-sm font-mono text-gray-100">{dlqDetail.raw_payload_snippet}</pre>
                </div>
              )}
            </div>
          )}

          <p className="mt-4 text-xs text-gray-500">
            Mapped to: <span className="font-mono">dlq_items.reason_code + dlq_items.error_detail</span>
          </p>
        </CollapsibleSection>

        {/* Linked Objects (Chain of Custody) */}
        <CollapsibleSection 
          title="Linked Objects" 
          subtitle="Chain of custody - Internal Arealis cross-tenant drilldown available"
        >
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Envelope ID</dt>
              <dd className="text-sm">
                {dlqDetail.linked_envelope ? (
                  <>
                    <Link
                      href={`/console/ingestion/raw-envelopes/${dlqDetail.linked_envelope.envelope_id}`}
                      className="font-mono text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {dlqDetail.linked_envelope.envelope_id}
                    </Link>
                    <span className="text-gray-400 ml-2">[Open Envelope Detail]</span>
                  </>
                ) : (
                  <span className="text-gray-400 font-mono">(not linked)</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Intent ID</dt>
              <dd className="text-sm">
                {dlqDetail.linked_intent_id ? (
                  <Link
                    href={`/console/ingestion/intents/${dlqDetail.linked_intent_id}`}
                    className="font-mono text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {dlqDetail.linked_intent_id}
                  </Link>
                ) : (
                  <span className="text-gray-500">- (never created)</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Tenant ID</dt>
              <dd className="flex items-center space-x-2">
                <span className="font-mono text-sm text-gray-900">{dlqDetail.tenant_id}</span>
                <Link
                  href={`/console/tenants/${dlqDetail.tenant_id}`}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  [View Tenant]
                </Link>
              </dd>
            </div>
            {dlqDetail.linked_envelope && (
              <>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Ingress source</dt>
                  <dd className="text-sm text-gray-900">{dlqDetail.linked_envelope.source} ({dlqDetail.linked_envelope.ingress_method})</dd>
                </div>
                {dlqDetail.linked_envelope.source_ip && (
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Source IP</dt>
                    <dd className="text-sm font-mono text-gray-900">
                      {dlqDetail.linked_envelope.source_ip}
                      <span className="text-xs text-green-600 ml-2">(allowlisted)</span>
                    </dd>
                  </div>
                )}
                {dlqDetail.linked_envelope.correlation_id && (
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Correlation ID</dt>
                    <dd className="text-sm font-mono text-gray-900">{dlqDetail.linked_envelope.correlation_id}</dd>
                  </div>
                )}
              </>
            )}
          </dl>

          {/* Event Graph Link */}
          {dlqDetail.linked_envelope && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <Link
                href={`/console/ingestion/event-graph/${encodeURIComponent(dlqDetail.linked_envelope.envelope_id)}`}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                View Event Graph Timeline
              </Link>
              <p className="mt-2 text-xs text-gray-500">
                Stock chart-style causality timeline for this envelope
              </p>
            </div>
          )}
        </CollapsibleSection>

        {/* Replay Eligibility (Critical Safety) */}
        <CollapsibleSection 
          title="Replay Eligibility" 
          subtitle="Critical safety - Internal Arealis controls with safeguards"
        >
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mb-4">
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Replayable</dt>
              <dd className={`text-sm font-semibold ${dlqDetail.replayable ? 'text-green-600' : 'text-red-600'}`}>
                {dlqDetail.replayable ? 'YES' : 'NO'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Manual intervention required</dt>
              <dd className={`text-sm font-semibold ${dlqDetail.manual_intervention_required ? 'text-yellow-600' : 'text-gray-600'}`}>
                {dlqDetail.manual_intervention_required ? 'YES' : 'NO'}
              </dd>
            </div>
            {dlqDetail.replay_reason && (
              <div className="md:col-span-2">
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Reason</dt>
                <dd className="text-sm text-gray-900">{dlqDetail.replay_reason}</dd>
              </div>
            )}
          </dl>

          {dlqDetail.safe_replay_path && dlqDetail.safe_replay_path.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-xs font-medium text-blue-800 uppercase tracking-wide mb-2">Safe replay path (if fixed)</p>
              <ol className="list-decimal list-inside space-y-1">
                {dlqDetail.safe_replay_path.map((step, i) => (
                  <li key={i} className="text-sm text-blue-700">{step}</li>
                ))}
              </ol>
            </div>
          )}

          {dlqDetail.manual_intervention_required && (
            <button
              className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded hover:bg-yellow-700 flex items-center space-x-2"
              onClick={() => alert('This would create an internal approval ticket in production.')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Request Manual Replay Approval</span>
            </button>
          )}

          <p className="mt-4 text-xs text-gray-500 italic">
            Internal Arealis Ops only. Creates approval ticket, not instant replay.
          </p>
        </CollapsibleSection>

        {/* Evidence & Audit (Regulator-Grade) */}
        <CollapsibleSection 
          title="Evidence & Audit" 
          subtitle="Regulator-grade - immutable evidence for compliance"
        >
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Envelope persisted</dt>
              <dd className="flex items-center space-x-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  dlqDetail.envelope_persisted ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {dlqDetail.envelope_persisted ? 'YES' : 'NO'}
                </span>
                {dlqDetail.envelope_persisted && <span className="text-xs text-gray-500">(zord-vault-journal)</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Failure recorded</dt>
              <dd className="flex items-center space-x-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  dlqDetail.failure_recorded ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {dlqDetail.failure_recorded ? 'YES' : 'PENDING'}
                </span>
                {dlqDetail.failure_recorded && <span className="text-xs text-gray-500">(append-only)</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Evidence receipt</dt>
              <dd>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  dlqDetail.evidence_status === 'GENERATED' ? 'bg-green-100 text-green-800' : 
                  dlqDetail.evidence_status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {dlqDetail.evidence_status}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Evidence reference</dt>
              <dd className="text-sm font-mono text-gray-700 break-all">{dlqDetail.evidence_ref}</dd>
            </div>
          </dl>

          {dlqDetail.evidence_receipt_id && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <Link
                href={`/console/ingestion/evidence/${dlqDetail.evidence_receipt_id}`}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                View DLQ Evidence Receipt
              </Link>
            </div>
          )}

          <p className="mt-4 text-xs text-gray-500">
            Mapped to: <span className="font-mono">intent_worm_ref + zord-contracts</span>
          </p>
        </CollapsibleSection>

        {/* Access & Audit Log (Internal Only) */}
        <CollapsibleSection 
          title="Access & Audit Log" 
          subtitle="Who touched this - Internal Arealis audit trail (AWS CloudTrail pattern)"
          defaultExpanded={false}
        >
          {dlqDetail.access_log && dlqDetail.access_log.length > 0 ? (
            <>
              <div className="space-y-2 mb-4">
                {dlqDetail.access_log.map((entry, i) => (
                  <div key={i} className="flex items-start space-x-4 py-2 border-b border-gray-100 last:border-0">
                    <span className="text-xs font-mono text-gray-500 flex-shrink-0 w-40">
                      {format(new Date(entry.timestamp), 'yyyy-MM-dd HH:mm')} UTC
                    </span>
                    <span className="text-sm text-gray-900">{entry.action}</span>
                    <span className="text-sm text-gray-600">{entry.actor}</span>
                    {entry.details && (
                      <span className="text-sm text-gray-500">{entry.details}</span>
                    )}
                  </div>
                ))}
              </div>
              
              <button
                onClick={exportAccessLog}
                className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Export Access Log (CSV for internal audit)</span>
              </button>
            </>
          ) : (
            <p className="text-sm text-gray-500">No access log entries recorded yet.</p>
          )}
        </CollapsibleSection>

        {/* Final Lock Statement */}
        <div className="bg-gray-900 border border-gray-700 rounded shadow-sm p-4 text-center">
          <p className="text-sm text-gray-300">
            <span className="text-white font-medium">This page is the legal and technical proof that Zord blocked unsafe money movement.</span>
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs text-gray-400">
            <span className="flex items-center space-x-1">
              <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Cross-tenant drilldown</span>
            </span>
            <span className="flex items-center space-x-1">
              <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Full pipeline debug</span>
            </span>
            <span className="flex items-center space-x-1">
              <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Replay approval workflow</span>
            </span>
            <span className="flex items-center space-x-1">
              <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Forensic schema path</span>
            </span>
            <span className="flex items-center space-x-1">
              <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Evidence receipt linking</span>
            </span>
          </div>
        </div>
      </div>
    </Layout>
  )
}

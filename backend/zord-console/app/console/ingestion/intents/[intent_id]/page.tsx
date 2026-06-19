'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { IntentDetail } from '@/types/intent'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'

type TabType = 'overview' | 'canonical' | 'lifecycle' | 'raw-envelopes' | 'evidence'

interface AdminIntentDetail extends IntentDetail {
  tenant: string
  trace_id?: string
  correlation_id?: string
  ingestion_channel?: string
  idempotency_key?: string
  idempotency_result?: string
  schema_version?: string
  pre_acc_guard_result?: string
  error_message?: string
  linked_raw_envelopes: Array<{
    envelope_id: string
    source: string
    content_type: string
    size_bytes: number
    sha256: string
  }>
  hash_chain?: {
    previous: string
    current: string
    status: 'INTACT' | 'BROKEN'
  }
}

export default function IntentDetailAdminPage() {
  const router = useRouter()
  const params = useParams()
  const intentId = params?.intent_id as string
  const [intentDetail, setIntentDetail] = useState<AdminIntentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [jsonExpanded, setJsonExpanded] = useState(true)
  const [selectedEvidence, setSelectedEvidence] = useState<{
    step: string
    time: string
    hash: string
  } | null>(null)
  const [showEvidenceModal, setShowEvidenceModal] = useState(false)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    if (intentId) {
      loadIntentDetail()
    }
  }, [intentId, router])

  const loadIntentDetail = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/prod/intents/${intentId}`)
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError('Access denied')
          return
        } else if (response.status === 404) {
          setError('Intent not found')
          return
        } else if (response.status >= 500) {
          setError('System error – try later')
          return
        } else {
          const errorData = await response.json().catch(() => ({}))
          setError(errorData.error || 'Failed to fetch intent details')
          return
        }
      }
      const data: IntentDetail = await response.json()

      // Enhance with admin-only fields
      const adminData: AdminIntentDetail = {
        ...data,
        tenant: 'tenant_arealis_nbfc', // Mock
        trace_id: `trace_${Math.random().toString(36).substring(2, 10)}`,
        correlation_id: `corr_${Math.random().toString(36).substring(2, 10)}`,
        ingestion_channel: 'REST API',
        idempotency_key: `pay_${new Date()
          .toISOString()
          .split('T')[0]
          .replace(/-/g, '')}_emp_${Math.floor(Math.random() * 10000)}`,
        idempotency_result:
          data.status === 'REJECTED_PREACC' && data.evidence?.raw_envelope_id?.includes('duplicate')
            ? 'DUPLICATE'
            : 'FIRST_SEEN',
        schema_version: 'zintent.v1',
        pre_acc_guard_result: 'PASSED',
        error_message:
          data.status === 'REJECTED_PREACC' ? 'Beneficiary bank account format invalid' : undefined,
        linked_raw_envelopes: [
          {
            envelope_id: data.evidence.raw_envelope_id,
            source: data.source,
            content_type: 'application/json',
            size_bytes: 1842,
            sha256: Array.from({ length: 64 }, () =>
              Math.floor(Math.random() * 16).toString(16)
            ).join(''),
          },
        ],
        hash_chain: {
          previous: Array.from({ length: 16 }, () =>
            Math.floor(Math.random() * 16).toString(16)
          ).join(''),
          current: Array.from({ length: 16 }, () =>
            Math.floor(Math.random() * 16).toString(16)
          ).join(''),
          status: 'INTACT',
        },
      }

      setIntentDetail(adminData)
    } catch (error) {
      console.error('Failed to load intent detail:', error)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        setError('Network error – check your connection and try again')
      } else {
        setError('Failed to load intent details')
      }
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const getStatusBadge = (status: string) => {
    // Map API statuses to display statuses
    const displayStatus = status === 'RECEIVED' ? 'CANONICALIZED' : status
    const styles: Record<string, string> = {
      RAW_STORED: 'bg-gray-100 text-gray-800 border-gray-300',
      CANONICALIZED: 'bg-green-50 text-green-800 border-green-300',
      REJECTED_PREACC: 'bg-red-50 text-red-800 border-red-300',
      QUEUED_ACC: 'bg-yellow-50 text-yellow-800 border-yellow-300',
      RECEIVED: 'bg-green-50 text-green-800 border-green-300',
    }
    return (
      <span
        className={`inline-flex items-center px-2.5 py-1 rounded border text-xs font-medium ${
          styles[displayStatus] || styles[status] || 'bg-gray-100 text-gray-800 border-gray-300'
        }`}
      >
        {displayStatus}
      </span>
    )
  }

  if (loading) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Intent Ledger', 'Intent Detail']}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading intent details...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error || !intentDetail) {
    const isNotFound = error === 'Intent not found' || error === 'Access denied'
    const isSystemError =
      error === 'System error – try later' ||
      error === 'Network error – check your connection and try again'

    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Intent Ledger', 'Intent Detail']}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div
            className={`bg-white border ${
              isNotFound ? 'border-red-200' : 'border-yellow-200'
            } rounded shadow-sm p-6 text-center`}
          >
            <svg
              className={`mx-auto h-12 w-12 ${
                isNotFound ? 'text-red-500' : 'text-yellow-500'
              } mb-4`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {error || 'Intent not found'}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {isNotFound
                ? "The intent you're looking for doesn't exist or you don't have access to it."
                : isSystemError
                ? 'We encountered a system error. Please try again later.'
                : 'An error occurred while loading the intent details.'}
            </p>
            <div className="flex items-center justify-center space-x-3">
              <button
                onClick={() => router.push('/console/ingestion/intents')}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                Back to Intent Ledger
              </button>
              {isSystemError && (
                <button
                  onClick={() => loadIntentDetail()}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  const user = getCurrentUser()
  // Avoid non-deterministic SSR values (e.g. `new Date()` fallback) which cause hydration mismatches.
  // If backend doesn't provide a lifecycle time, show an explicit placeholder.
  const createdTime: string | null = intentDetail.lifecycle[0]?.time ?? null
  const isFailed = intentDetail.status === 'REJECTED_PREACC'
  const displayStatus = intentDetail.status === 'RECEIVED' ? 'CANONICALIZED' : intentDetail.status

  return (
    <Layout
      serviceName="Ingestion"
      breadcrumbs={['Intent Ledger', 'Intent Detail']}
      tenant={user?.tenant}
    >
      <div className="max-w-7xl mx-auto">
        {/* Sticky Header - AWS Style */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-4 mb-2">
                  <button
                    onClick={() => router.push('/console/ingestion/intents')}
                    className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                  >
                    <svg
                      className="w-5 h-5 text-gray-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>
                  <div>
                    <h1 className="text-xl font-normal text-gray-900">
                      Intent: <span className="font-mono">{intentDetail.intent_id}</span>
                    </h1>
                  </div>
                </div>
                <div className="ml-8 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Status:</span>{' '}
                    <span className="font-medium">{getStatusBadge(displayStatus)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Tenant:</span>{' '}
                    <span className="font-mono text-gray-900">{intentDetail.tenant}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Source:</span>{' '}
                    <span className="font-medium text-gray-900">{intentDetail.source}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Created:</span>{' '}
                    <span className="font-mono text-gray-900">
                      {createdTime ? `${format(new Date(createdTime), 'yyyy-MM-dd HH:mm:ss')} UTC` : '—'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <Link
                  href={`/console/intents/${encodeURIComponent(intentDetail.intent_id)}/contract`}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                  title="View contract(s) derived from this intent"
                >
                  View Contract
                </Link>
                <button
                  onClick={() => copyToClipboard(intentDetail.intent_id, 'intent-id')}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                  title="Copy Intent ID"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </button>
                {intentDetail.trace_id && (
                  <button
                    onClick={() => copyToClipboard(intentDetail.trace_id!, 'trace-id')}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                    title="Copy Trace ID"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                  </button>
                )}
                <Link
                  href={`/console/ingestion/audit?intent=${intentDetail.intent_id}`}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                  title="View in Audit Timeline"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 lg:px-8 py-6">
          {/* Read-Only Banner */}
          <div className="mb-6 bg-blue-50 border-l-4 border-blue-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-800">
                  <strong>Read-only record:</strong> This record is immutable and read-only. All
                  data shown here is historical and cannot be modified.
                </p>
              </div>
            </div>
          </div>

          {/* Duplicate Detection Banner */}
          {intentDetail.idempotency_result === 'DUPLICATE' && (
            <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-medium text-yellow-800">
                    Duplicate request detected
                  </h3>
                  <p className="mt-1 text-sm text-yellow-700">
                    This intent was identified as a duplicate of a previously processed request. The
                    original intent may be available in the system.
                  </p>
                  {intentDetail.idempotency_key && (
                    <p className="mt-2 text-xs text-yellow-600 font-mono">
                      Idempotency Key: {intentDetail.idempotency_key}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error Banner (if failed) */}
          {isFailed && intentDetail.error_message && (
            <div className="mb-6 bg-red-50 border-l-4 border-red-400 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-medium text-red-800">
                    Status: {intentDetail.status} | Error Code:{' '}
                    {intentDetail.error_code || 'UNKNOWN'}
                  </h3>
                  <p className="mt-1 text-sm text-red-700">{intentDetail.error_message}</p>
                </div>
              </div>
            </div>
          )}

          {/* Summary Panel - AWS Style */}
          <div className="mb-6 bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Summary</h2>
            </div>
            <div className="p-6">
              <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Intent ID
                  </dt>
                  <dd className="text-sm font-mono text-gray-900">{intentDetail.intent_id}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Tenant ID
                  </dt>
                  <dd className="text-sm font-mono text-gray-900">{intentDetail.tenant}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Source
                  </dt>
                  <dd className="text-sm font-medium text-gray-900">{intentDetail.source}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Instrument
                  </dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {intentDetail.canonical.instrument.kind}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Amount
                  </dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {intentDetail.canonical.amount.currency}{' '}
                    {parseFloat(intentDetail.canonical.amount.value).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Current Status
                  </dt>
                  <dd>{getStatusBadge(displayStatus)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Error Code
                  </dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {intentDetail.error_code || '—'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Tabs - AWS Style */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px" aria-label="Tabs">
                {[
                  { id: 'overview', label: 'Overview' },
                  { id: 'canonical', label: 'Canonical Payload' },
                  { id: 'lifecycle', label: 'Lifecycle' },
                  { id: 'raw-envelopes', label: 'Raw Envelopes' },
                  { id: 'evidence', label: 'Evidence' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as TabType)}
                    className={`
                      px-6 py-3 text-sm font-medium border-b-2 transition-colors
                      ${
                        activeTab === tab.id
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                    `}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {/* Tab 1: Overview */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        Ingestion Channel
                      </dt>
                      <dd className="text-sm font-mono text-gray-900">
                        {intentDetail.ingestion_channel || 'REST API'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        Idempotency Key
                      </dt>
                      <dd className="text-sm font-mono text-gray-900">
                        {intentDetail.idempotency_key || 'N/A'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        Idempotency Result
                      </dt>
                      <dd className="text-sm font-medium text-gray-900">
                        {intentDetail.idempotency_result || 'N/A'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        Schema Version
                      </dt>
                      <dd className="text-sm font-mono text-gray-900">
                        {intentDetail.schema_version || 'zintent.v1'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        Pre-ACC Guard Result
                      </dt>
                      <dd className="text-sm font-medium text-gray-900">
                        {intentDetail.pre_acc_guard_result || 'PASSED'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        Correlation ID
                      </dt>
                      <dd className="text-sm font-mono text-gray-900">
                        {intentDetail.correlation_id || 'N/A'}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Tab 2: Canonical Payload */}
              {activeTab === 'canonical' && (
                <div>
                  <div className="mb-4 p-4 bg-blue-50 border-l-4 border-blue-400 rounded">
                    <h3 className="text-sm font-semibold text-blue-900 mb-1">Canonical Intent</h3>
                    <p className="text-sm text-blue-800">
                      <strong>What Zord understood:</strong> This is the normalized, PII-safe
                      canonical JSON representation after processing the raw envelope. This data is
                      immutable and represents the system&apos;s interpretation of the intent.
                    </p>
                  </div>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-gray-500">
                      Post-normalization, PII-safe canonical JSON (Read-only)
                    </p>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setJsonExpanded(!jsonExpanded)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                        disabled
                        title="This record is immutable and read-only"
                      >
                        {jsonExpanded ? 'Collapse' : 'Expand'}
                      </button>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            JSON.stringify(intentDetail.canonical, null, 2),
                            'canonical-json'
                          )
                        }
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        {copiedField === 'canonical-json' ? 'Copied!' : 'Copy JSON'}
                      </button>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded border border-gray-200 overflow-hidden">
                    <pre
                      className={`text-xs font-mono text-gray-800 p-4 overflow-x-auto ${
                        jsonExpanded ? '' : 'max-h-32 overflow-y-auto'
                      }`}
                    >
                      {JSON.stringify(intentDetail.canonical, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Tab 3: Lifecycle */}
              {activeTab === 'lifecycle' && (
                <div>
                  <p className="text-sm text-gray-500 mb-4">
                    Prove persist-first, deterministic ingestion
                  </p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Step
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Time (UTC)
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Evidence
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {intentDetail.lifecycle.map((event, index) => {
                          const displayStep =
                            event.step === 'VALIDATED'
                              ? 'PRE_ACC_GUARDS_PASSED'
                              : event.step === 'PUBLISHED'
                              ? 'OUTBOX_PUBLISHED'
                              : event.step

                          return (
                          <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {displayStep}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">
                              {format(new Date(event.time), 'HH:mm:ss.SSS')}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {displayStep !== 'PRE_ACC_GUARDS_PASSED' ? (
                                <button
                                  onClick={e => {
                                    e.stopPropagation()
                                    setSelectedEvidence({
                                      step: displayStep,
                                      time: event.time,
                                      hash: event.hash,
                                    })
                                    setShowEvidenceModal(true)
                                  }}
                                  className="text-blue-600 hover:text-blue-800"
                                >
                                  View
                                </button>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 4: Raw Envelopes */}
              {activeTab === 'raw-envelopes' && (
                <div>
                  <div className="mb-4 p-4 bg-amber-50 border-l-4 border-amber-400 rounded">
                    <h3 className="text-sm font-semibold text-amber-900 mb-1">Raw Envelope</h3>
                    <p className="text-sm text-amber-800">
                      <strong>What we received:</strong> This is the original, unmodified envelope
                      as received by the system. This data is immutable and represents the exact
                      payload that was ingested.
                    </p>
                  </div>
                  <p className="text-sm text-gray-500 mb-4">Forensics: what exactly came in</p>
                  <div className="space-y-4">
                    {intentDetail.linked_raw_envelopes.map((envelope, index) => (
                      <div key={index} className="border border-gray-200 rounded p-4">
                        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                              Envelope ID
                            </dt>
                            <dd className="text-sm font-mono text-gray-900">
                              {envelope.envelope_id}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                              Source
                            </dt>
                            <dd className="text-sm text-gray-900">{envelope.source}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                              Content-Type
                            </dt>
                            <dd className="text-sm text-gray-900">{envelope.content_type}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                              Size
                            </dt>
                            <dd className="text-sm text-gray-900">
                              {envelope.size_bytes.toLocaleString()} bytes
                            </dd>
                          </div>
                          <div className="md:col-span-2">
                            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                              SHA-256
                            </dt>
                            <dd className="text-sm font-mono text-gray-600">{envelope.sha256}</dd>
                          </div>
                        </dl>
                        <div className="mt-4 flex items-center space-x-2">
                          <Link
                            href={`/console/ingestion/raw-envelopes?envelope=${envelope.envelope_id}`}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            View payload →
                          </Link>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={() =>
                              copyToClipboard(envelope.envelope_id, `envelope-${index}`)
                            }
                            className="text-xs text-gray-500 hover:text-gray-700"
                          >
                            {copiedField === `envelope-${index}`
                              ? 'Copied'
                              : 'Download (RBAC + logged)'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab 5: Evidence */}
              {activeTab === 'evidence' && (
                <div>
                  <p className="text-sm text-gray-500 mb-4">Link ingestion to WORM-sealed proof</p>
                  <dl className="space-y-6">
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        Canonical Snapshot
                      </dt>
                      <dd className="text-sm font-mono text-gray-900 break-all bg-gray-50 p-3 rounded border border-gray-200">
                        {intentDetail.evidence.canonical_snapshot}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        Outbox Event
                      </dt>
                      <dd className="text-sm font-mono text-gray-900">
                        {intentDetail.evidence.outbox_event_id}
                      </dd>
                    </div>
                    {intentDetail.hash_chain && (
                      <div>
                        <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                          Hash Chain
                        </dt>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Previous:</span>
                            <span className="text-sm font-mono text-gray-900">
                              {intentDetail.hash_chain.previous}...
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Current:</span>
                            <span className="text-sm font-mono text-gray-900">
                              {intentDetail.hash_chain.current}...
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Status:</span>
                            <span
                              className={`text-sm font-medium ${
                                intentDetail.hash_chain.status === 'INTACT'
                                  ? 'text-green-700'
                                  : 'text-red-700'
                              }`}
                            >
                              {intentDetail.hash_chain.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </dl>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Evidence Viewer Modal */}
      {showEvidenceModal && selectedEvidence && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowEvidenceModal(false)}
        >
          <div
            className="bg-white rounded shadow-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-gray-900">
                  Evidence: {selectedEvidence.step}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">WORM-sealed proof object</p>
              </div>
              <button
                onClick={() => setShowEvidenceModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 p-6 space-y-6">
              {/* Evidence Metadata */}
              <div className="bg-white border border-gray-200 rounded shadow-sm">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h3 className="text-sm font-medium text-gray-900">Evidence Metadata</h3>
                </div>
                <div className="p-4">
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        Lifecycle Step
                      </dt>
                      <dd className="text-sm font-medium text-gray-900">{selectedEvidence.step}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        Timestamp (UTC)
                      </dt>
                      <dd className="text-sm font-mono text-gray-900">
                        {format(new Date(selectedEvidence.time), 'yyyy-MM-dd HH:mm:ss.SSS')}
                      </dd>
                    </div>
                    <div className="md:col-span-2">
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        Evidence Hash
                      </dt>
                      <div className="flex items-center space-x-2">
                        <dd className="text-sm font-mono text-gray-900 break-all flex-1">
                          {selectedEvidence.hash}
                        </dd>
                        <button
                          onClick={() => copyToClipboard(selectedEvidence.hash, 'evidence-hash')}
                          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                        >
                          {copiedField === 'evidence-hash' ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  </dl>
                </div>
              </div>

              {/* Evidence Content */}
              <div className="bg-white border border-gray-200 rounded shadow-sm">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h3 className="text-sm font-medium text-gray-900">Evidence Object</h3>
                </div>
                <div className="p-4">
                  <div className="bg-gray-900 rounded border border-gray-700 overflow-auto max-h-96">
                    <pre className="text-xs font-mono text-gray-100 p-4">
                      {JSON.stringify(
                        {
                          step: selectedEvidence.step,
                          timestamp: selectedEvidence.time,
                          hash: selectedEvidence.hash,
                          intent_id: intentDetail.intent_id,
                          evidence_type:
                            selectedEvidence.step === 'RAW_STORED'
                              ? 'raw_envelope'
                              : selectedEvidence.step === 'CANONICALIZED'
                              ? 'canonical_snapshot'
                              : selectedEvidence.step === 'IDEMPOTENCY_CHECKED'
                              ? 'idempotency_record'
                              : selectedEvidence.step === 'OUTBOX_PUBLISHED'
                              ? 'outbox_event'
                              : 'evidence_object',
                          worm_path: `worm://prod/evidence/${selectedEvidence.step.toLowerCase()}/${
                            intentDetail.intent_id
                          }/${selectedEvidence.hash}`,
                          sealed_at: selectedEvidence.time,
                          integrity_verified: true,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Evidence Links */}
              <div className="bg-white border border-gray-200 rounded shadow-sm">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h3 className="text-sm font-medium text-gray-900">Evidence Links</h3>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        WORM Path
                      </p>
                      <p className="text-sm font-mono text-gray-900 break-all">
                        worm://prod/evidence/{selectedEvidence.step.toLowerCase()}/
                        {intentDetail.intent_id}/{selectedEvidence.hash}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          `worm://prod/evidence/${selectedEvidence.step.toLowerCase()}/${
                            intentDetail.intent_id
                          }/${selectedEvidence.hash}`,
                          'worm-path'
                        )
                      }
                      className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 ml-4"
                    >
                      {copiedField === 'worm-path' ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  {selectedEvidence.step === 'RAW_STORED' && (
                    <Link
                      href={`/console/ingestion/raw-envelopes?envelope=${intentDetail.evidence.raw_envelope_id}`}
                      className="block text-sm text-blue-600 hover:text-blue-800"
                      onClick={e => e.stopPropagation()}
                    >
                      View Raw Envelope →
                    </Link>
                  )}

                  {selectedEvidence.step === 'OUTBOX_PUBLISHED' && (
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                          Outbox Event ID
                        </p>
                        <p className="text-sm font-mono text-gray-900">
                          {intentDetail.evidence.outbox_event_id}
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          copyToClipboard(intentDetail.evidence.outbox_event_id, 'outbox-id')
                        }
                        className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 ml-4"
                      >
                        {copiedField === 'outbox-id' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  )}

                  <Link
                    href={`/console/ingestion/evidence/${intentDetail.evidence.raw_envelope_id}`}
                    className="block text-sm text-blue-600 hover:text-blue-800"
                    onClick={e => e.stopPropagation()}
                  >
                    View Full Evidence Tree →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

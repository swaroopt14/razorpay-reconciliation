'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'
import { GuardFailure, GuardRule, GuardFailureListResponse, GuardStage, GuardReasonCode } from '@/types/validation'

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
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${styles[stage]}`}
    >
      {stage.replace(/_/g, ' ')}
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

export default function PreAccGuardPage() {
  const router = useRouter()
  const [failures, setFailures] = useState<GuardFailure[]>([])
  const [rules, setRules] = useState<GuardRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<{
    intents_evaluated_24h: number
    passed_guards_24h: number
    rejected_24h: number
    sent_to_dlq_24h: number
  } | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('')
  const [replayableFilter, setReplayableFilter] = useState<string>('')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(50)
  const [total, setTotal] = useState(0)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      params.set('page', currentPage.toString())
      params.set('page_size', pageSize.toString())

      if (stageFilter) params.set('stage', stageFilter)
      if (replayableFilter) params.set('replayable', replayableFilter)
      if (searchQuery) params.set('search', searchQuery)

      const response = await fetch(`/api/prod/pre-acc-guard?${params.toString()}`)

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError('Access denied')
          return
        }
        setError('Failed to load guard data')
        return
      }

      const data: GuardFailureListResponse = await response.json()
      setFailures(data.items)
      setRules(data.rules)
      setSummary(data.summary)
      setTotal(data.pagination.total)
    } catch (err) {
      console.error('Failed to load guard data:', err)
      setError('Failed to load guard data')
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, stageFilter, replayableFilter, searchQuery])

  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1)
    }
  }, [stageFilter, replayableFilter, searchQuery])

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    loadData()
  }, [router, loadData])

  const totalPages = Math.ceil(total / pageSize)

  if (loading && failures.length === 0) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Validation & Safety', 'Pre-ACC Guard']}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading guard data...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error && failures.length === 0) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Validation & Safety', 'Pre-ACC Guard']}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
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
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error loading guard data</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
                <button
                  onClick={() => loadData()}
                  className="mt-3 text-sm text-red-800 underline hover:text-red-900"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  const user = getCurrentUser()

  return (
    <Layout serviceName="Ingestion" breadcrumbs={['Validation & Safety', 'Pre-ACC Guard']} tenant={user?.tenant}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <div className="mb-6 flex items-center justify-between border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-2xl font-normal text-gray-900">Pre-ACC Guard</h1>
            <p className="text-sm text-gray-500 mt-1">
              Validation checks before compliance & decisioning
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => loadData()}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              title="Refresh"
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Critical Banner */}
        <div className="mb-6 bg-amber-50 border-l-4 border-amber-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-amber-800">Critical Safety Layer</h3>
              <p className="mt-1 text-sm text-amber-700">
                Pre-ACC Guards block unsafe or invalid intents before they reach compliance & routing. These pages are read-only guardrails - they explain why something was blocked, not how to fix it.
              </p>
            </div>
          </div>
        </div>

        {/* Guard Summary */}
        {summary && (
          <div className="mb-6 bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Guard Summary (last 24h)</h2>
            </div>
            <div className="p-4">
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Intents Evaluated
                  </dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {summary.intents_evaluated_24h.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Passed Guards
                  </dt>
                  <dd className="text-2xl font-semibold text-green-600">
                    {summary.passed_guards_24h.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Rejected
                  </dt>
                  <dd className="text-2xl font-semibold text-red-600">
                    {summary.rejected_24h.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Sent to DLQ
                  </dt>
                  <dd className="text-2xl font-semibold text-yellow-600">
                    {summary.sent_to_dlq_24h}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        {/* Guard Rules */}
        {rules.length > 0 && (
          <div className="mb-6 bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Guard Rules</h2>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {rules.map(rule => (
                  <div
                    key={rule.stage}
                    className="flex items-start space-x-3 p-3 bg-gray-50 rounded border border-gray-200"
                  >
                    <div className="flex-shrink-0">
                      {rule.enabled ? (
                        <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{rule.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Enforced by: {rule.enforced_by}</p>
                      <p className="text-xs text-gray-500">Stage: {rule.failure_stage_code}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Filters Panel */}
        <div className="mb-4 bg-white border border-gray-200 rounded shadow-sm">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-medium text-gray-900">Filters</h2>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by envelope ID..."
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Stage</label>
                <select
                  value={stageFilter}
                  onChange={e => setStageFilter(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="">All stages</option>
                  <option value="SCHEMA_VALIDATION">Schema Validation</option>
                  <option value="IDEMPOTENCY_CHECK">Idempotency Check</option>
                  <option value="PII_TOKENIZATION">PII Tokenization</option>
                  <option value="BENEFICIARY_VALIDATION">Beneficiary Validation</option>
                  <option value="AMOUNT_CURRENCY_SANITY">Amount & Currency Sanity</option>
                  <option value="DEADLINE_CONSTRAINTS">Deadline Constraints</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Replayable</label>
                <select
                  value={replayableFilter}
                  onChange={e => setReplayableFilter(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="">All</option>
                  <option value="true">Replayable</option>
                  <option value="false">Not Replayable</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Guard Failures Table */}
        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-medium text-gray-900">
              Guard Failures ({total} {total === 1 ? 'failure' : 'failures'})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Envelope ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stage
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reason Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Replayable
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created At
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {failures.length > 0 ? (
                  failures.map(failure => (
                    <tr
                      key={failure.dlq_id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/console/ingestion/pre-acc-guard/dlq/${encodeURIComponent(failure.dlq_id)}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-blue-600 hover:text-blue-800 font-mono text-sm">
                          {failure.envelope_id}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStageBadge(failure.stage)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getReasonBadge(failure.reason_code)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {failure.replayable ? (
                          <span className="text-green-600 font-medium">YES</span>
                        ) : (
                          <span className="text-gray-400">NO</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                        {format(new Date(failure.created_at), 'yyyy-MM-dd HH:mm')}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="text-sm text-gray-500">
                        <p className="font-medium">No guard failures found</p>
                        <p className="mt-1">
                          {stageFilter || replayableFilter || searchQuery
                            ? 'Try adjusting your filters'
                            : 'All intents have passed the guards'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                <span className="font-medium">{Math.min(currentPage * pageSize, total)}</span> of{' '}
                <span className="font-medium">{total}</span> results
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

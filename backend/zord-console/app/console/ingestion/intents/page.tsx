'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'
import { Intent, IntentListResponse, IntentStatus, IntentSource } from '@/types/intent'

// Map API status to display status
function mapStatusToDisplay(status: IntentStatus): string {
  const statusMap: Record<IntentStatus, string> = {
    RECEIVED: 'CANONICALIZED',
    REJECTED_PREACC: 'REJECTED_PREACC',
    QUEUED_ACC: 'QUEUED_ACC',
    CANONICALIZED: 'CANONICALIZED',
  }
  return statusMap[status] || status
}

export default function IntentLedgerPage() {
  const router = useRouter()
  const [intents, setIntents] = useState<Intent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Server-side filters
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [intentIdFilter, setIntentIdFilter] = useState('')
  const [envelopeIdFilter, setEnvelopeIdFilter] = useState('')
  const [fingerprintFilter, setFingerprintFilter] = useState('')
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(50)
  const [total, setTotal] = useState(0)

  const loadIntents = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Build query parameters for server-side filtering
      const params = new URLSearchParams()
      params.set('page', currentPage.toString())
      params.set('page_size', pageSize.toString())

      if (statusFilter) params.set('status', statusFilter)
      if (sourceFilter) params.set('source', sourceFilter)
      if (intentIdFilter) params.set('intent_id', intentIdFilter)
      if (envelopeIdFilter) params.set('envelope_id', envelopeIdFilter)
      if (fingerprintFilter) params.set('fingerprint', fingerprintFilter)
      if (createdFrom) params.set('created_from', createdFrom)
      if (createdTo) params.set('created_to', createdTo)
      if (searchQuery) params.set('search', searchQuery)

      const response = await fetch(`/api/prod/intents?${params.toString()}`)

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError('Access denied')
          return
        } else if (response.status >= 500) {
          setError('System error – try later')
          return
        } else {
          const errorData = await response.json().catch(() => ({}))
          setError(errorData.error || 'Failed to load intents')
          return
        }
      }

      const data: IntentListResponse = await response.json()
      setIntents(data.items)
      setTotal(data.pagination.total)
    } catch (err) {
      console.error('Failed to load intents:', err)
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setError('Network error – check your connection and try again')
      } else {
        setError('Failed to load intents')
      }
    } finally {
      setLoading(false)
    }
  }, [
    currentPage,
    pageSize,
    statusFilter,
    sourceFilter,
    intentIdFilter,
    envelopeIdFilter,
    fingerprintFilter,
    createdFrom,
    createdTo,
    searchQuery,
  ])

  // Reset to page 1 when filters change
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1)
    }
  }, [
    statusFilter,
    sourceFilter,
    intentIdFilter,
    envelopeIdFilter,
    fingerprintFilter,
    createdFrom,
    createdTo,
    searchQuery,
  ])

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    loadIntents()
  }, [
    router,
    currentPage,
    statusFilter,
    sourceFilter,
    intentIdFilter,
    envelopeIdFilter,
    fingerprintFilter,
    createdFrom,
    createdTo,
    searchQuery,
    loadIntents,
  ])

  const totalPages = Math.ceil(total / pageSize)

  const getStatusBadge = (status: IntentStatus) => {
    const displayStatus = mapStatusToDisplay(status)
    const styles: Record<string, string> = {
      RAW_STORED: 'bg-gray-100 text-gray-800 border-gray-300',
      CANONICALIZED: 'bg-green-50 text-green-800 border-green-300',
      REJECTED_PREACC: 'bg-red-50 text-red-800 border-red-300',
      QUEUED_ACC: 'bg-yellow-50 text-yellow-800 border-yellow-300',
      RECEIVED: 'bg-green-50 text-green-800 border-green-300',
    }
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${styles[displayStatus] || styles[status] || 'bg-gray-100 text-gray-800 border-gray-300'
          }`}
      >
        {displayStatus}
      </span>
    )
  }

  if (loading && intents.length === 0) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Intent Ledger']}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading intents...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error && intents.length === 0) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Intent Ledger']}
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
                <h3 className="text-sm font-medium text-red-800">Error loading intents</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
                <button
                  onClick={() => loadIntents()}
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
    <Layout serviceName="Ingestion" breadcrumbs={['Intent Ledger']} tenant={user?.tenant}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header - AWS Style */}
        <div className="mb-6 flex items-center justify-between border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-2xl font-normal text-gray-900">Intent Ledger</h1>
            <p className="text-sm text-gray-500 mt-1">
              {total} {total === 1 ? 'intent' : 'intents'}
              {loading && intents.length > 0 && ' (loading...)'}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => loadIntents()}
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

        {/* Filters Panel - AWS Style */}
        <div className="mb-4 bg-white border border-gray-200 rounded shadow-sm">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-medium text-gray-900">Filters</h2>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Global Search */}
              <div className="lg:col-span-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by intent ID, envelope ID, or fingerprint..."
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
              </div>

              {/* Intent ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Intent ID</label>
                <input
                  type="text"
                  value={intentIdFilter}
                  onChange={e => setIntentIdFilter(e.target.value)}
                  placeholder="Filter by intent ID..."
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>

              {/* Envelope ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Envelope ID</label>
                <input
                  type="text"
                  value={envelopeIdFilter}
                  onChange={e => setEnvelopeIdFilter(e.target.value)}
                  placeholder="Filter by envelope ID..."
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>

              {/* Fingerprint */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Fingerprint</label>
                <input
                  type="text"
                  value={fingerprintFilter}
                  onChange={e => setFingerprintFilter(e.target.value)}
                  placeholder="Filter by fingerprint..."
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>

              {/* Source */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Source</label>
                <select
                  value={sourceFilter}
                  onChange={e => setSourceFilter(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="">All sources</option>
                  <option value="API">API</option>
                  <option value="BATCH">Batch</option>
                  <option value="WEBHOOK">Webhook</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="">All statuses</option>
                  <option value="RECEIVED">CANONICALIZED</option>
                  <option value="REJECTED_PREACC">REJECTED_PREACC</option>
                  <option value="QUEUED_ACC">QUEUED_ACC</option>
                </select>
              </div>

              {/* Created From Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Created From</label>
                <input
                  type="date"
                  value={createdFrom}
                  onChange={e => setCreatedFrom(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>

              {/* Created To Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Created To</label>
                <input
                  type="date"
                  value={createdTo}
                  onChange={e => setCreatedTo(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Data Table - AWS Style */}
        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Intent ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Instrument
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Error Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created At
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading && intents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <div className="flex items-center justify-center">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-4 border-gray-200 border-t-blue-600 mr-3"></div>
                        <span className="text-sm text-gray-600">Loading intents...</span>
                      </div>
                    </td>
                  </tr>
                ) : intents.length > 0 ? (
                  intents.map(intent => (
                    <tr
                      key={intent.intent_id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/console/ingestion/intents/${intent.intent_id}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/console/ingestion/intents/${encodeURIComponent(intent.intent_id)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-600 hover:text-blue-800 font-mono text-sm underline"
                            title="View intent detail"
                          >
                            {intent.intent_id}
                          </Link>
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              navigator.clipboard.writeText(intent.intent_id)
                            }}
                            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
                            title="Copy Intent ID"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {intent.source}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {intent.currency}{' '}
                        {parseFloat(intent.amount).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {intent.instrument}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(intent.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                        {intent.error_code || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                        {format(new Date(intent.created_at), 'yyyy-MM-dd HH:mm:ss')}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <div className="text-sm text-gray-500">
                        <p className="font-medium">No intents found</p>
                        <p className="mt-1">
                          {statusFilter ||
                            sourceFilter ||
                            intentIdFilter ||
                            envelopeIdFilter ||
                            fingerprintFilter ||
                            createdFrom ||
                            createdTo ||
                            searchQuery
                            ? 'Try adjusting your filters'
                            : 'No intents have been created yet'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination - AWS Style */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span>{' '}
                    to{' '}
                    <span className="font-medium">{Math.min(currentPage * pageSize, total)}</span>{' '}
                    of <span className="font-medium">{total}</span> results
                  </p>
                </div>
                <div>
                  <nav
                    className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                    aria-label="Pagination"
                  >
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">Previous</span>
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (currentPage <= 3) {
                        pageNum = i + 1
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = currentPage - 2 + i
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${currentPage === pageNum
                              ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">Next</span>
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

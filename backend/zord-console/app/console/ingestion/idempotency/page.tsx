'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'
import { IdempotencyKey, IdempotencyListResponse, IdempotencyStatus } from '@/types/validation'

function getStatusBadge(status: IdempotencyStatus) {
  const styles: Record<IdempotencyStatus, string> = {
    CONSUMED: 'bg-green-50 text-green-800 border-green-300',
    REJECTED: 'bg-red-50 text-red-800 border-red-300',
    PENDING: 'bg-yellow-50 text-yellow-800 border-yellow-300',
    EXPIRED: 'bg-gray-100 text-gray-600 border-gray-300',
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  )
}

export default function IdempotencyStorePage() {
  const router = useRouter()
  const [keys, setKeys] = useState<IdempotencyKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<{
    active_keys: number
    duplicates_blocked_24h: number
    replays_allowed: number
    expired_keys_24h: number
  } | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [tenantFilter, setTenantFilter] = useState<string>('')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(50)
  const [total, setTotal] = useState(0)

  const loadKeys = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      params.set('page', currentPage.toString())
      params.set('page_size', pageSize.toString())

      if (statusFilter) params.set('status', statusFilter)
      if (tenantFilter) params.set('tenant', tenantFilter)
      if (searchQuery) params.set('search', searchQuery)

      const response = await fetch(`/api/prod/idempotency?${params.toString()}`)

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError('Access denied')
          return
        }
        setError('Failed to load idempotency keys')
        return
      }

      const data: IdempotencyListResponse = await response.json()
      setKeys(data.items)
      setSummary(data.summary)
      setTotal(data.pagination.total)
    } catch (err) {
      console.error('Failed to load idempotency keys:', err)
      setError('Failed to load idempotency keys')
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, statusFilter, tenantFilter, searchQuery])

  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1)
    }
  }, [statusFilter, tenantFilter, searchQuery])

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    loadKeys()
  }, [router, loadKeys])

  const totalPages = Math.ceil(total / pageSize)

  if (loading && keys.length === 0) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Validation & Safety', 'Idempotency Store']}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading idempotency keys...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error && keys.length === 0) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Validation & Safety', 'Idempotency Store']}
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
                <h3 className="text-sm font-medium text-red-800">Error loading idempotency keys</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
                <button
                  onClick={() => loadKeys()}
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
    <Layout serviceName="Ingestion" breadcrumbs={['Validation & Safety', 'Idempotency Store']} tenant={user?.tenant}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <div className="mb-6 flex items-center justify-between border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-2xl font-normal text-gray-900">Idempotency Store</h1>
            <p className="text-sm text-gray-500 mt-1">
              Request de-duplication and replay protection
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => loadKeys()}
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

        {/* Store Summary */}
        {summary && (
          <div className="mb-6 bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Store Summary</h2>
            </div>
            <div className="p-4">
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Active Idempotency Keys
                  </dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {summary.active_keys.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Duplicates Blocked (24h)
                  </dt>
                  <dd className="text-2xl font-semibold text-red-600">
                    {summary.duplicates_blocked_24h.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Replays Allowed
                  </dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {summary.replays_allowed}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Expired Keys (24h)
                  </dt>
                  <dd className="text-2xl font-semibold text-gray-500">
                    {summary.expired_keys_24h}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        {/* Info Banner */}
        <div className="mb-4 bg-blue-50 border-l-4 border-blue-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-800">
                <strong>Status meanings:</strong> <span className="font-mono">CONSUMED</span> = request accepted once • <span className="font-mono">REJECTED</span> = duplicate with conflict
              </p>
            </div>
          </div>
        </div>

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
                  placeholder="Search by idempotency key..."
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="">All statuses</option>
                  <option value="CONSUMED">Consumed</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="PENDING">Pending</option>
                  <option value="EXPIRED">Expired</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tenant</label>
                <select
                  value={tenantFilter}
                  onChange={e => setTenantFilter(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="">All tenants</option>
                  <option value="default">default</option>
                  <option value="tenant_arealis_nbfc">tenant_arealis_nbfc</option>
                  <option value="tenant_fintech_corp">tenant_fintech_corp</option>
                  <option value="tenant_payments_inc">tenant_payments_inc</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Idempotency Keys Table */}
        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-medium text-gray-900">
              Idempotency Keys ({total} {total === 1 ? 'key' : 'keys'})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tenant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Idempotency Key
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    First Seen
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {keys.length > 0 ? (
                  keys.map(key => (
                    <tr
                      key={`${key.tenant}-${key.idempotency_key}`}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() =>
                        router.push(
                          `/console/ingestion/idempotency/${encodeURIComponent(key.tenant)}/${encodeURIComponent(key.idempotency_key)}`
                        )
                      }
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {key.tenant}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-blue-600 hover:text-blue-800 font-mono text-sm">
                          {key.idempotency_key}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(key.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                        {format(new Date(key.first_seen), 'HH:mm')} UTC
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center">
                      <div className="text-sm text-gray-500">
                        <p className="font-medium">No idempotency keys found</p>
                        <p className="mt-1">
                          {statusFilter || tenantFilter || searchQuery
                            ? 'Try adjusting your filters'
                            : 'No idempotency keys have been recorded yet'}
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

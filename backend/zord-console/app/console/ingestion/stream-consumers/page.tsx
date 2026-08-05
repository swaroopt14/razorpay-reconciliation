'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'
import { StreamConsumer, StreamConsumerListResponse, StreamName, ConsumerStatus } from '@/types/stream-consumer'

export default function StreamConsumersPage() {
  const router = useRouter()
  const [consumers, setConsumers] = useState<StreamConsumer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Server-side filters
  const [streamFilter, setStreamFilter] = useState<string>('')
  const [consumerGroupFilter, setConsumerGroupFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [partitionFilter, setPartitionFilter] = useState('')
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(50)
  const [total, setTotal] = useState(0)

  const loadConsumers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Build query parameters for server-side filtering
      const params = new URLSearchParams()
      params.set('page', currentPage.toString())
      params.set('page_size', pageSize.toString())
      
      if (streamFilter) params.set('stream', streamFilter)
      if (consumerGroupFilter) params.set('consumer_group', consumerGroupFilter)
      if (statusFilter) params.set('status', statusFilter)
      if (partitionFilter) params.set('partition', partitionFilter)
      
      const response = await fetch(`/api/prod/stream-consumers?${params.toString()}`)
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError('Access denied')
          return
        } else if (response.status >= 500) {
          setError('System error - try later')
          return
        } else {
          const errorData = await response.json().catch(() => ({}))
          setError(errorData.error || 'Failed to load stream consumers')
          return
        }
      }
      
      const data: StreamConsumerListResponse = await response.json()
      setConsumers(data.items)
      setTotal(data.pagination.total)
    } catch (err) {
      console.error('Failed to load stream consumers:', err)
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setError('Network error - check your connection and try again')
      } else {
        setError('Failed to load stream consumers')
      }
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, streamFilter, consumerGroupFilter, statusFilter, partitionFilter])

  // Reset to page 1 when filters change
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1)
    }
  }, [streamFilter, consumerGroupFilter, statusFilter, partitionFilter])

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    loadConsumers()
  }, [router, currentPage, streamFilter, consumerGroupFilter, statusFilter, partitionFilter, loadConsumers])

  const getStatusBadge = (status: ConsumerStatus) => {
    const styles: Record<ConsumerStatus, string> = {
      RUNNING: 'bg-green-50 text-green-800 border-green-200',
      DEGRADED: 'bg-yellow-50 text-yellow-800 border-yellow-200',
      STALLED: 'bg-red-50 text-red-800 border-red-200',
    }
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${styles[status]}`}>
        {status}
      </span>
    )
  }

  const getLagColor = (lag: number, status: ConsumerStatus) => {
    if (status === 'STALLED' || lag > 10000) {
      return 'text-red-600 font-semibold'
    } else if (status === 'DEGRADED' || lag > 1000) {
      return 'text-yellow-600 font-medium'
    }
    return 'text-gray-900'
  }

  if (loading && consumers.length === 0) {
    return (
      <Layout 
        serviceName="Ingestion"
        breadcrumbs={['Stream Consumers']}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading stream consumers...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error && consumers.length === 0) {
    return (
      <Layout 
        serviceName="Ingestion"
        breadcrumbs={['Stream Consumers']}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error loading stream consumers</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
                <button
                  onClick={() => loadConsumers()}
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
  const totalPages = Math.ceil(total / pageSize)

  return (
    <Layout 
      serviceName="Ingestion"
      breadcrumbs={['Stream Consumers']}
      tenant={user?.tenant}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <div className="mb-6 flex items-center justify-between border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-2xl font-normal text-gray-900">
              Stream Consumers
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {total} {total === 1 ? 'consumer group' : 'consumer groups'}
              {loading && consumers.length > 0 && ' (loading...)'}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => loadConsumers()}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zord-blue-600"
              title="Refresh"
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Filters Panel */}
        <div className="mb-4 bg-white border border-gray-200 rounded shadow-sm">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-medium text-gray-900">Filters</h2>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Stream */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Stream</label>
                <select
                  value={streamFilter}
                  onChange={(e) => setStreamFilter(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-zord-blue-600 focus:border-zord-blue-600 sm:text-sm"
                >
                  <option value="">All streams</option>
                  <option value="zord.intent.ingress">zord.intent.ingress</option>
                  <option value="zord.webhook.ingress">zord.webhook.ingress</option>
                  <option value="zord.batch.ingress">zord.batch.ingress</option>
                </select>
              </div>

              {/* Consumer Group */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Consumer Group</label>
                <input
                  type="text"
                  value={consumerGroupFilter}
                  onChange={(e) => setConsumerGroupFilter(e.target.value)}
                  placeholder="Filter by consumer group..."
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-zord-blue-600 focus:border-zord-blue-600 sm:text-sm"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-zord-blue-600 focus:border-zord-blue-600 sm:text-sm"
                >
                  <option value="">All statuses</option>
                  <option value="RUNNING">RUNNING</option>
                  <option value="DEGRADED">DEGRADED</option>
                  <option value="STALLED">STALLED</option>
                </select>
              </div>

              {/* Partition */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Partition</label>
                <input
                  type="number"
                  value={partitionFilter}
                  onChange={(e) => setPartitionFilter(e.target.value)}
                  placeholder="Filter by partition..."
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-zord-blue-600 focus:border-zord-blue-600 sm:text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Consumer Group
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stream
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Partitions
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lag (events)
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ingest Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Commit
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading && consumers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <div className="flex items-center justify-center">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-4 border-gray-200 border-t-blue-600 mr-3"></div>
                        <span className="text-sm text-gray-600">Loading stream consumers...</span>
                      </div>
                    </td>
                  </tr>
                ) : consumers.length > 0 ? (
                  consumers.map((consumer) => (
                    <tr
                      key={consumer.consumer_group}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/console/ingestion/stream-consumers/${encodeURIComponent(consumer.consumer_group)}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            navigator.clipboard.writeText(consumer.consumer_group)
                          }}
                          className="text-zord-blue-600 hover:text-zord-blue-700 hover:underline font-mono text-sm"
                          title="Click to copy"
                        >
                          {consumer.consumer_group}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        {consumer.stream}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {consumer.partitions}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm text-right ${getLagColor(consumer.lag_events, consumer.status)}`}>
                        {consumer.lag_events.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {consumer.ingest_rate.toLocaleString()} /sec
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(consumer.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                        {format(new Date(consumer.last_commit), 'yyyy-MM-dd HH:mm:ss')} UTC
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <div className="text-sm text-gray-500">
                        <p className="font-medium">No stream consumers found</p>
                        <p className="mt-1">
                          {streamFilter || consumerGroupFilter || statusFilter || partitionFilter
                            ? 'Try adjusting your filters'
                            : 'No consumer groups are active'}
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
                    Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                    <span className="font-medium">{Math.min(currentPage * pageSize, total)}</span> of{' '}
                    <span className="font-medium">{total}</span> results
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">Previous</span>
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
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
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            currentPage === pageNum
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
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
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

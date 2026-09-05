'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated, getCurrentUser, getCurrentRole } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'
import { UserRole } from '@/types/auth'

type BatchStatus = 'RUNNING' | 'COMPLETE' | 'PARTIAL_FAIL' | 'FAILED'
type BatchMode = 'ALL_OR_NOTHING' | 'BEST_EFFORT'
type BatchSource = 'SFTP' | 'Manual Upload' | 'Partner Feed'

interface Batch {
  batch_id: string
  tenant: string
  source: BatchSource
  mode: BatchMode
  rows_total: number
  rows_accepted: number
  rows_failed: number
  status: BatchStatus
  started_at: string
  completed_at?: string
  filename?: string
  checksum?: string
  manifest_hash?: string
  linked_intent_ids?: string[]
  error_categories?: Record<string, number>
  processing_time_seconds?: number
}

// Generate realistic dummy data
function generateDummyBatches(): Batch[] {
  const tenants = ['acme-finance-prod', 'techcorp-sandbox', 'fintech-ai-prod', 'banking-platform-prod', 'payments-sandbox', 'tenant_arealis_nbfc']
  const sources: BatchSource[] = ['SFTP', 'Manual Upload', 'Partner Feed']
  const modes: BatchMode[] = ['ALL_OR_NOTHING', 'BEST_EFFORT']
  const statuses: BatchStatus[] = ['RUNNING', 'COMPLETE', 'PARTIAL_FAIL', 'FAILED']
  const batches: Batch[] = []
  const now = new Date()
  
  for (let i = 0; i < 187; i++) {
    const hoursAgo = Math.floor(Math.random() * 168) // Last 7 days
    const startedAt = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000)
    const source = sources[Math.floor(Math.random() * sources.length)]
    const mode = modes[Math.floor(Math.random() * modes.length)]
    const rowsTotal = Math.floor(Math.random() * 50000 + 1000) // 1K to 50K rows
    const rowsAccepted = Math.floor(rowsTotal * (0.85 + Math.random() * 0.15))
    const rowsFailed = rowsTotal - rowsAccepted
    
    let status: BatchStatus
    if (rowsFailed === 0) {
      status = 'COMPLETE'
    } else if (rowsFailed < rowsTotal * 0.05) {
      status = 'PARTIAL_FAIL'
    } else if (rowsFailed < rowsTotal * 0.5) {
      status = Math.random() > 0.3 ? 'PARTIAL_FAIL' : 'FAILED'
    } else {
      status = Math.random() > 0.5 ? 'RUNNING' : 'FAILED'
    }
    
    const timestamp = startedAt.toISOString().replace(/[-:T]/g, '').split('.')[0]
    const batchId = `b_${timestamp}_${['payroll', 'refunds', 'settlements', 'payouts', 'clearing'][Math.floor(Math.random() * 5)]}_${String(i + 1).padStart(2, '0')}`
    
    // Generate error categories
    const errorCategories: Record<string, number> = {}
    if (rowsFailed > 0) {
      const errorTypes = ['INSTRUMENT_FORMAT_INVALID', 'SCHEMA_INVALID', 'MISSING_FIELD', 'DUPLICATE_ENTRY', 'POLICY_VIOLATION', 'IDEMPOTENCY_CONFLICT']
      let remaining = rowsFailed
      errorTypes.forEach((type, idx) => {
        if (idx === errorTypes.length - 1 || remaining === 0) {
          if (remaining > 0) errorCategories[type] = remaining
        } else {
          const count = Math.floor(Math.random() * remaining * 0.4)
          if (count > 0) {
            errorCategories[type] = count
            remaining -= count
          }
        }
      })
    }
    
    const processingTimeSeconds = Math.floor(Math.random() * 600 + 60) // 1-10 minutes
    const completedAt = status !== 'RUNNING' ? new Date(startedAt.getTime() + processingTimeSeconds * 1000).toISOString() : undefined
    
    batches.push({
      batch_id: batchId,
      tenant: tenants[Math.floor(Math.random() * tenants.length)],
      source,
      mode,
      rows_total: rowsTotal,
      rows_accepted: rowsAccepted,
      rows_failed: rowsFailed,
      status,
      started_at: startedAt.toISOString(),
      completed_at: completedAt,
      filename: `${batchId.replace(/^b_/, '')}.csv`,
      checksum: Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      manifest_hash: Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      linked_intent_ids: Array.from({ length: Math.min(rowsAccepted, 10) }, (_, idx) => `pi_${Date.now()}_${idx}`),
      error_categories: errorCategories,
      processing_time_seconds: processingTimeSeconds,
    })
  }
  
  return batches.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
}

function getStatusBadge(status: BatchStatus) {
  const baseClasses = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium'
  switch (status) {
    case 'COMPLETE':
      return <span className={`${baseClasses} bg-green-100 text-green-800`}>COMPLETE</span>
    case 'PARTIAL_FAIL':
      return <span className={`${baseClasses} bg-amber-100 text-amber-800`}>PARTIAL_FAIL</span>
    case 'FAILED':
      return <span className={`${baseClasses} bg-red-100 text-red-800`}>FAILED</span>
    case 'RUNNING':
      return <span className={`${baseClasses} bg-blue-100 text-blue-800`}>RUNNING</span>
    default:
      return <span className={`${baseClasses} bg-gray-100 text-gray-800`}>{status}</span>
  }
}

// Check if user can download (RBAC gated)
function canDownload(role: UserRole | null): boolean {
  return role === 'ADMIN' || role === 'OPS'
}

export default function BatchPipelinesPage() {
  const router = useRouter()
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  
  // Filters
  const [tenantFilter, setTenantFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [modeFilter, setModeFilter] = useState<string>('')
  const [batchIdFilter, setBatchIdFilter] = useState<string>('')
  const [timeRangeFilter, setTimeRangeFilter] = useState<string>('')
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(50)
  const [sortColumn, setSortColumn] = useState<string>('started_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const user = getCurrentUser()
  const role = getCurrentRole()

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    loadBatches()
  }, [router])

  const loadBatches = async () => {
    try {
      setLoading(true)
      await new Promise(resolve => setTimeout(resolve, 300))
      const dummyData = generateDummyBatches()
      setBatches(dummyData)
    } catch (error) {
      console.error('Failed to load batches:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filtering
  const filteredBatches = batches.filter(batch => {
    if (tenantFilter && batch.tenant !== tenantFilter) return false
    if (statusFilter && batch.status !== statusFilter) return false
    if (sourceFilter && batch.source !== sourceFilter) return false
    if (modeFilter && batch.mode !== modeFilter) return false
    if (batchIdFilter && !batch.batch_id.toLowerCase().includes(batchIdFilter.toLowerCase())) return false
    
    if (timeRangeFilter) {
      const batchDate = new Date(batch.started_at)
      const now = new Date()
      const daysAgo = parseInt(timeRangeFilter)
      const cutoff = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
      if (batchDate < cutoff) return false
    }
    
    return true
  })

  // Sorting
  const sortedBatches = [...filteredBatches].sort((a, b) => {
    let aVal: any = a[sortColumn as keyof Batch]
    let bVal: any = b[sortColumn as keyof Batch]
    
    if (sortColumn === 'started_at') {
      aVal = new Date(aVal).getTime()
      bVal = new Date(bVal).getTime()
    }
    
    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase()
      bVal = bVal.toLowerCase()
    }
    
    if (sortDirection === 'asc') {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0
    } else {
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0
    }
  })

  // Pagination
  const totalPages = Math.ceil(sortedBatches.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const paginatedBatches = sortedBatches.slice(startIndex, endIndex)

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('desc')
    }
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const uniqueTenants = Array.from(new Set(batches.map(b => b.tenant))).sort()
  const uniqueSources = Array.from(new Set(batches.map(b => b.source))).sort()
  const uniqueModes = Array.from(new Set(batches.map(b => b.mode))).sort()

  return (
    <Layout 
      serviceName="Ingestion"
      breadcrumbs={['Batch Pipelines']}
      tenant={user?.tenant}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-normal text-gray-900">Batch Pipelines</h1>
          <p className="mt-1 text-sm text-gray-500">Operate, inspect, and prove correctness of batch ingestion</p>
        </div>

        {/* Filters Panel */}
        <div className="bg-white border border-gray-200 rounded shadow-sm mb-6 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tenant ID</label>
              <select
                value={tenantFilter}
                onChange={(e) => setTenantFilter(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Tenants</option>
                {uniqueTenants.map(tenant => (
                  <option key={tenant} value={tenant}>{tenant}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Source</label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Sources</option>
                {uniqueSources.map(source => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Mode</label>
              <select
                value={modeFilter}
                onChange={(e) => setModeFilter(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Modes</option>
                {uniqueModes.map(mode => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Statuses</option>
                <option value="RUNNING">RUNNING</option>
                <option value="COMPLETE">COMPLETE</option>
                <option value="PARTIAL_FAIL">PARTIAL_FAIL</option>
                <option value="FAILED">FAILED</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Time Range</label>
              <select
                value={timeRangeFilter}
                onChange={(e) => setTimeRangeFilter(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Time</option>
                <option value="1">Last 24 hours</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Batch ID</label>
              <input
                type="text"
                value={batchIdFilter}
                onChange={(e) => setBatchIdFilter(e.target.value)}
                placeholder="Exact match"
                className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {paginatedBatches.length} of {filteredBatches.length} batches
            </div>
            <button
              onClick={loadBatches}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading batches...</p>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      onClick={() => handleSort('batch_id')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      Batch ID
                      {sortColumn === 'batch_id' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th
                      onClick={() => handleSort('tenant')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      Tenant
                      {sortColumn === 'tenant' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th
                      onClick={() => handleSort('source')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      Source
                      {sortColumn === 'source' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th
                      onClick={() => handleSort('mode')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      Mode
                      {sortColumn === 'mode' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th
                      onClick={() => handleSort('rows_total')}
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      Rows Total
                      {sortColumn === 'rows_total' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th
                      onClick={() => handleSort('rows_accepted')}
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      Rows Accepted
                      {sortColumn === 'rows_accepted' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th
                      onClick={() => handleSort('rows_failed')}
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      Rows Failed
                      {sortColumn === 'rows_failed' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th
                      onClick={() => handleSort('status')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      Status
                      {sortColumn === 'status' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th
                      onClick={() => handleSort('started_at')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      Started At
                      {sortColumn === 'started_at' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedBatches.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-sm text-gray-500">
                        No batches found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedBatches.map((batch) => (
                      <tr
                        key={batch.batch_id}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => router.push(`/console/ingestion/batch-pipelines/${batch.batch_id}`)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              copyToClipboard(batch.batch_id, batch.batch_id)
                            }}
                            className="text-blue-600 hover:text-blue-800 font-mono text-sm underline"
                            title="Click to copy"
                          >
                            {batch.batch_id}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{batch.tenant}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{batch.source}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">{batch.mode}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{batch.rows_total.toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-700 text-right font-medium">{batch.rows_accepted.toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-red-700 text-right font-medium">{batch.rows_failed.toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(batch.status)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">
                          {format(new Date(batch.started_at), 'yyyy-MM-dd HH:mm:ss')} UTC
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-white px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                      <span className="font-medium">{Math.min(endIndex, sortedBatches.length)}</span> of{' '}
                      <span className="font-medium">{sortedBatches.length}</span> results
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
        )}
      </div>
    </Layout>
  )
}

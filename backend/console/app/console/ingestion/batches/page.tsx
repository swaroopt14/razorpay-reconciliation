'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'

type BatchStatus = 'RUNNING' | 'COMPLETE' | 'PARTIAL'
type BatchMode = 'ALL_OR_NOTHING' | 'BEST_EFFORT'
type BatchSource = 'SFTP' | 'Upload'

interface Batch {
  batch_id: string
  tenant: string
  source: BatchSource
  rows_total: number
  rows_accepted: number
  rows_failed: number
  mode: BatchMode
  status: BatchStatus
  uploaded_at: string
  filename?: string
  checksum?: string
  manifest_hash?: string
  linked_intent_ids?: string[]
  error_categories?: Record<string, number>
}

// Generate realistic dummy data
function generateDummyBatches(): Batch[] {
  const tenants = ['acme-finance-prod', 'techcorp-sandbox', 'fintech-ai-prod', 'banking-platform-prod', 'payments-sandbox']
  const sources: BatchSource[] = ['SFTP', 'Upload']
  const modes: BatchMode[] = ['ALL_OR_NOTHING', 'BEST_EFFORT']
  const statuses: BatchStatus[] = ['RUNNING', 'COMPLETE', 'PARTIAL']
  const batches: Batch[] = []
  const now = new Date()
  
  for (let i = 0; i < 142; i++) {
    const hoursAgo = Math.floor(Math.random() * 168) // Last 7 days
    const uploadedAt = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000)
    const source = sources[Math.floor(Math.random() * sources.length)]
    const mode = modes[Math.floor(Math.random() * modes.length)]
    const rowsTotal = Math.floor(Math.random() * 10000 + 100)
    const rowsAccepted = Math.floor(rowsTotal * (0.7 + Math.random() * 0.3))
    const rowsFailed = rowsTotal - rowsAccepted
    
    let status: BatchStatus
    if (rowsFailed === 0) {
      status = 'COMPLETE'
    } else if (rowsFailed < rowsTotal * 0.1) {
      status = 'PARTIAL'
    } else {
      status = Math.random() > 0.5 ? 'RUNNING' : 'PARTIAL'
    }
    
    const timestamp = uploadedAt.toISOString().replace(/[-:T]/g, '').split('.')[0]
    const batchId = `b_${timestamp}_${['payroll', 'refunds', 'settlements', 'payouts'][Math.floor(Math.random() * 4)]}_${String(i + 1).padStart(2, '0')}`
    
    // Generate error categories
    const errorCategories: Record<string, number> = {}
    if (rowsFailed > 0) {
      const errorTypes = ['SCHEMA_INVALID', 'INSTRUMENT_FORMAT_INVALID', 'MISSING_FIELD', 'DUPLICATE_ENTRY', 'POLICY_VIOLATION']
      let remaining = rowsFailed
      errorTypes.forEach((type, idx) => {
        if (idx === errorTypes.length - 1) {
          errorCategories[type] = remaining
        } else {
          const count = Math.floor(Math.random() * remaining * 0.4)
          errorCategories[type] = count
          remaining -= count
        }
      })
    }
    
    batches.push({
      batch_id: batchId,
      tenant: tenants[Math.floor(Math.random() * tenants.length)],
      source,
      rows_total: rowsTotal,
      rows_accepted: rowsAccepted,
      rows_failed: rowsFailed,
      mode,
      status,
      uploaded_at: uploadedAt.toISOString(),
      filename: `${batchId}.csv`,
      checksum: Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      manifest_hash: Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      linked_intent_ids: Array.from({ length: Math.min(rowsAccepted, 5) }, (_, idx) => `pi_${Date.now()}_${idx}`),
      error_categories: errorCategories,
    })
  }
  
  return batches.sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
}

export default function BatchPipelinesPage() {
  const router = useRouter()
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null)
  const [showDetailView, setShowDetailView] = useState(false)
  
  // Filters
  const [tenantFilter, setTenantFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(50)
  const [sortColumn, setSortColumn] = useState<string>('uploaded_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const user = getCurrentUser()

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    loadBatches()
  }, [router])

  const loadBatches = async () => {
    try {
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
    // Tenant filter
    if (tenantFilter && batch.tenant !== tenantFilter) {
      return false
    }
    
    // Status filter
    if (statusFilter && batch.status !== statusFilter) {
      return false
    }
    
    // Source filter
    if (sourceFilter && batch.source !== sourceFilter) {
      return false
    }
    
    return true
  })

  // Sorting
  const sortedBatches = [...filteredBatches].sort((a, b) => {
    let aVal: any = a[sortColumn as keyof Batch]
    let bVal: any = b[sortColumn as keyof Batch]
    
    if (sortColumn === 'uploaded_at') {
      aVal = new Date(aVal).getTime()
      bVal = new Date(bVal).getTime()
    } else if (typeof aVal === 'string') {
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
  const paginatedBatches = sortedBatches.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

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

  const handleDownloadFailedRows = (batch: Batch) => {
    // Generate CSV of failed rows
    const csvRows = [
      ['Row Number', 'Error Type', 'Error Message'],
    ]
    
    // Mock failed rows data
    Object.entries(batch.error_categories || {}).forEach(([errorType, count]) => {
      for (let i = 0; i < Math.min(count, 10); i++) {
        csvRows.push([String(i + 1), errorType, `Sample error message for ${errorType}`])
      }
    })
    
    const csv = csvRows.map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${batch.batch_id}_failed_rows.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    // Audit log
    console.log(`[AUDIT] Failed rows downloaded: ${batch.batch_id} by ${user?.email} at ${new Date().toISOString()}`)
  }

  const getStatusBadge = (status: BatchStatus) => {
    const styles = {
      RUNNING: 'bg-yellow-50 text-yellow-800 border-yellow-300',
      COMPLETE: 'bg-green-50 text-green-800 border-green-300',
      PARTIAL: 'bg-orange-50 text-orange-800 border-orange-300',
    }
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${styles[status]}`}>
        {status}
      </span>
    )
  }

  // Get unique values for filters
  const uniqueTenants = Array.from(new Set(batches.map(b => b.tenant))).sort()

  if (loading) {
    return (
      <Layout 
        serviceName="Ingestion"
        breadcrumbs={['Batch Pipelines']}
        tenant={user?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading batch pipelines...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout 
      serviceName="Ingestion"
      breadcrumbs={['Batch Pipelines']}
      tenant={user?.tenant}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header - AWS Style */}
        <div className="mb-6 flex items-center justify-between border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-2xl font-normal text-gray-900">
              Batch Pipelines
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Operate, debug, and prove correctness of high-volume ingestion jobs
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={loadBatches}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              title="Refresh"
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Tenant Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tenant</label>
                <select
                  value={tenantFilter}
                  onChange={(e) => {
                    setTenantFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="">All tenants</option>
                  {uniqueTenants.map(tenant => (
                    <option key={tenant} value={tenant}>{tenant}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="">All statuses</option>
                  <option value="RUNNING">RUNNING</option>
                  <option value="COMPLETE">COMPLETE</option>
                  <option value="PARTIAL">PARTIAL</option>
                </select>
              </div>

              {/* Source Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Source</label>
                <select
                  value={sourceFilter}
                  onChange={(e) => {
                    setSourceFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="">All sources</option>
                  <option value="SFTP">SFTP</option>
                  <option value="Upload">Upload</option>
                </select>
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
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('batch_id')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Batch ID</span>
                      {sortColumn === 'batch_id' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'transform rotate-180'}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('tenant')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Tenant</span>
                      {sortColumn === 'tenant' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'transform rotate-180'}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('source')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Source</span>
                      {sortColumn === 'source' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'transform rotate-180'}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('rows_total')}
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>Rows Total</span>
                      {sortColumn === 'rows_total' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'transform rotate-180'}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('rows_accepted')}
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>Rows Accepted</span>
                      {sortColumn === 'rows_accepted' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'transform rotate-180'}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('rows_failed')}
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>Rows Failed</span>
                      {sortColumn === 'rows_failed' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'transform rotate-180'}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('mode')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Mode</span>
                      {sortColumn === 'mode' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'transform rotate-180'}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Status</span>
                      {sortColumn === 'status' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'transform rotate-180'}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedBatches.length > 0 ? (
                  paginatedBatches.map((batch) => (
                    <tr
                      key={batch.batch_id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => {
                        setSelectedBatch(batch)
                        setShowDetailView(true)
                      }}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            copyToClipboard(batch.batch_id, 'batch-id')
                          }}
                          className="text-blue-600 hover:text-blue-800 font-mono text-sm underline"
                          title="Click to copy"
                        >
                          {batch.batch_id}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        {batch.tenant}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {batch.source}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {batch.rows_total.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-700 text-right font-medium">
                        {batch.rows_accepted.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-red-700 text-right font-medium">
                        {batch.rows_failed.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {batch.mode}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(batch.status)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center">
                      <div className="text-sm text-gray-500">
                        <p className="font-medium">No batches found</p>
                        <p className="mt-1">Try adjusting your filters</p>
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
                    Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                    <span className="font-medium">{Math.min(currentPage * pageSize, sortedBatches.length)}</span> of{' '}
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
      </div>

      {/* Batch Detail View Modal */}
      {showDetailView && selectedBatch && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowDetailView(false)}>
          <div className="bg-white rounded shadow-lg max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-gray-900">Batch: {selectedBatch.batch_id}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Admin Operations View</p>
              </div>
              <button
                onClick={() => setShowDetailView(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Content */}
            <div className="overflow-y-auto flex-1 p-6 space-y-6">
              {/* File Metadata */}
              <div className="bg-white border border-gray-200 rounded shadow-sm">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h3 className="text-sm font-medium text-gray-900">File Metadata</h3>
                </div>
                <div className="p-4">
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Filename</dt>
                      <dd className="text-sm font-mono text-gray-900">{selectedBatch.filename || 'N/A'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Checksum</dt>
                      <dd className="text-sm font-mono text-gray-600 text-xs break-all">{selectedBatch.checksum || 'N/A'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Uploaded At</dt>
                      <dd className="text-sm font-mono text-gray-900">
                        {format(new Date(selectedBatch.uploaded_at), 'yyyy-MM-dd HH:mm:ss')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Manifest Hash</dt>
                      <dd className="text-sm font-mono text-gray-600 text-xs break-all">{selectedBatch.manifest_hash || 'N/A'}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              {/* Processing Summary */}
              <div className="bg-white border border-gray-200 rounded shadow-sm">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h3 className="text-sm font-medium text-gray-900">Processing Summary</h3>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <div className="bg-green-50 rounded p-3 border border-green-200">
                      <dt className="text-xs font-medium text-green-700 uppercase tracking-wide mb-1">Accepted</dt>
                      <dd className="text-2xl font-semibold text-green-900">{selectedBatch.rows_accepted.toLocaleString()}</dd>
                    </div>
                    <div className="bg-red-50 rounded p-3 border border-red-200">
                      <dt className="text-xs font-medium text-red-700 uppercase tracking-wide mb-1">Failed</dt>
                      <dd className="text-2xl font-semibold text-red-900">{selectedBatch.rows_failed.toLocaleString()}</dd>
                    </div>
                    <div className="bg-gray-50 rounded p-3 border border-gray-200">
                      <dt className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">Total</dt>
                      <dd className="text-2xl font-semibold text-gray-900">{selectedBatch.rows_total.toLocaleString()}</dd>
                    </div>
                  </div>
                  
                  {/* Error Categories */}
                  {selectedBatch.error_categories && Object.keys(selectedBatch.error_categories).length > 0 && (
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Error Categories</dt>
                      <div className="space-y-2">
                        {Object.entries(selectedBatch.error_categories).map(([errorType, count]) => (
                          <div key={errorType} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200">
                            <span className="text-sm text-gray-900">{errorType}</span>
                            <span className="text-sm font-semibold text-red-700">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Exports */}
              <div className="bg-white border border-gray-200 rounded shadow-sm">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h3 className="text-sm font-medium text-gray-900">Exports</h3>
                </div>
                <div className="p-4 space-y-3">
                  {selectedBatch.rows_failed > 0 && (
                    <button
                      onClick={() => handleDownloadFailedRows(selectedBatch)}
                      className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download Failed Rows CSV
                    </button>
                  )}
                  
                  {selectedBatch.linked_intent_ids && selectedBatch.linked_intent_ids.length > 0 && (
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Linked Intents</dt>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {selectedBatch.linked_intent_ids.slice(0, 10).map((intentId, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200">
                            <span className="text-sm font-mono text-gray-900">{intentId}</span>
                            <Link
                              href={`/console/ingestion/intents/${intentId}`}
                              className="text-xs text-blue-600 hover:text-blue-800"
                              onClick={(e) => e.stopPropagation()}
                            >
                              View →
                            </Link>
                          </div>
                        ))}
                        {selectedBatch.linked_intent_ids.length > 10 && (
                          <p className="text-xs text-gray-500 text-center">
                            ... and {selectedBatch.linked_intent_ids.length - 10} more
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

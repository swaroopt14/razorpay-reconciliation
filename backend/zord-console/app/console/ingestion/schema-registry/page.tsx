'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'
import { Schema, SchemaListResponse, SchemaFormat, SchemaStatus } from '@/types/validation'

function getStatusBadge(status: SchemaStatus) {
  const styles: Record<SchemaStatus, string> = {
    ACTIVE: 'bg-green-50 text-green-800 border-green-300',
    DEPRECATED: 'bg-yellow-50 text-yellow-800 border-yellow-300',
    DRAFT: 'bg-gray-100 text-gray-800 border-gray-300',
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  )
}

function getFormatBadge(schemaFormat: SchemaFormat) {
  const styles: Record<SchemaFormat, string> = {
    JSON_SCHEMA: 'bg-blue-50 text-blue-800 border-blue-200',
    AVRO: 'bg-purple-50 text-purple-800 border-purple-200',
    PROTOBUF: 'bg-orange-50 text-orange-800 border-orange-200',
  }
  const labels: Record<SchemaFormat, string> = {
    JSON_SCHEMA: 'JSON Schema',
    AVRO: 'Avro',
    PROTOBUF: 'Protobuf',
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${styles[schemaFormat]}`}
    >
      {labels[schemaFormat]}
    </span>
  )
}

export default function SchemaRegistryPage() {
  const router = useRouter()
  const [schemas, setSchemas] = useState<Schema[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<{
    total_schemas: number
    active_schemas: number
    deprecated_schemas: number
    supported_formats: SchemaFormat[]
  } | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [formatFilter, setFormatFilter] = useState<string>('')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(50)
  const [total, setTotal] = useState(0)

  const loadSchemas = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      params.set('page', currentPage.toString())
      params.set('page_size', pageSize.toString())

      if (statusFilter) params.set('status', statusFilter)
      if (formatFilter) params.set('format', formatFilter)
      if (searchQuery) params.set('search', searchQuery)

      const response = await fetch(`/api/prod/schema-registry?${params.toString()}`)

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError('Access denied')
          return
        }
        setError('Failed to load schemas')
        return
      }

      const data: SchemaListResponse = await response.json()
      setSchemas(data.items)
      setSummary(data.summary)
      setTotal(data.pagination.total)
    } catch (err) {
      console.error('Failed to load schemas:', err)
      setError('Failed to load schemas')
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, statusFilter, formatFilter, searchQuery])

  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1)
    }
  }, [statusFilter, formatFilter, searchQuery])

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    loadSchemas()
  }, [router, loadSchemas])

  const totalPages = Math.ceil(total / pageSize)

  if (loading && schemas.length === 0) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Validation & Safety', 'Schema Registry']}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading schemas...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error && schemas.length === 0) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Validation & Safety', 'Schema Registry']}
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
                <h3 className="text-sm font-medium text-red-800">Error loading schemas</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
                <button
                  onClick={() => loadSchemas()}
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
    <Layout serviceName="Ingestion" breadcrumbs={['Validation & Safety', 'Schema Registry']} tenant={user?.tenant}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <div className="mb-6 flex items-center justify-between border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-2xl font-normal text-gray-900">Schema Registry</h1>
            <p className="text-sm text-gray-500 mt-1">
              Define and validate canonical intent schemas
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-300">
              PRODUCTION
            </span>
            <button
              onClick={() => loadSchemas()}
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

        {/* Registry Summary */}
        {summary && (
          <div className="mb-6 bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Registry Summary</h2>
            </div>
            <div className="p-4">
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Total Schemas
                  </dt>
                  <dd className="text-2xl font-semibold text-gray-900">{summary.total_schemas}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Active Schemas
                  </dt>
                  <dd className="text-2xl font-semibold text-green-600">{summary.active_schemas}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Deprecated Schemas
                  </dt>
                  <dd className="text-2xl font-semibold text-yellow-600">{summary.deprecated_schemas}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Supported Formats
                  </dt>
                  <dd className="text-sm text-gray-700 mt-1">
                    {summary.supported_formats.map((f, i) => (
                      <span key={f}>
                        {f === 'JSON_SCHEMA' ? 'JSON Schema' : f === 'AVRO' ? 'Avro' : 'Protobuf'}
                        {i < summary.supported_formats.length - 1 && ', '}
                      </span>
                    ))}
                  </dd>
                </div>
              </dl>
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
                  placeholder="Search by schema name..."
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
                  <option value="ACTIVE">Active</option>
                  <option value="DEPRECATED">Deprecated</option>
                  <option value="DRAFT">Draft</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Format</label>
                <select
                  value={formatFilter}
                  onChange={e => setFormatFilter(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="">All formats</option>
                  <option value="JSON_SCHEMA">JSON Schema</option>
                  <option value="AVRO">Avro</option>
                  <option value="PROTOBUF">Protobuf</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Schemas Table */}
        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-medium text-gray-900">
              Schemas ({total} {total === 1 ? 'schema' : 'schemas'})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Schema Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Version
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Format
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Used By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Updated At
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {schemas.length > 0 ? (
                  schemas.map(schema => (
                    <tr
                      key={`${schema.schema_name}-${schema.version}`}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() =>
                        router.push(
                          `/console/ingestion/schema-registry/${encodeURIComponent(schema.schema_name)}/${encodeURIComponent(schema.version)}`
                        )
                      }
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-blue-600 hover:text-blue-800 font-mono text-sm">
                          {schema.schema_name}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        {schema.version}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getFormatBadge(schema.format)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(schema.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {schema.used_by}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                        {format(new Date(schema.updated_at), 'yyyy-MM-dd HH:mm')}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="text-sm text-gray-500">
                        <p className="font-medium">No schemas found</p>
                        <p className="mt-1">
                          {statusFilter || formatFilter || searchQuery
                            ? 'Try adjusting your filters'
                            : 'No schemas have been registered yet'}
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

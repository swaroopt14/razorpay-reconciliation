'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format, formatDistanceToNow } from 'date-fns'
import { 
  SchemaEvolutionResponse, 
  SchemaInfo, 
  SchemaVersion,
  RecentFailure 
} from '@/types/schema-evolution'

// AWS-style status badge
function StatusBadge({ variant, children }: { variant: 'success' | 'warning' | 'error' | 'info' | 'neutral'; children: React.ReactNode }) {
  const styles = {
    success: 'bg-green-100 text-green-800 border-green-200',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    error: 'bg-red-100 text-red-800 border-red-200',
    info: 'bg-blue-100 text-blue-800 border-blue-200',
    neutral: 'bg-gray-100 text-gray-800 border-gray-200',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles[variant]}`}>
      {children}
    </span>
  )
}

// AWS-style metric card
function MetricCard({ label, value, sublabel, status }: { label: string; value: string | number; sublabel?: string; status?: 'good' | 'warning' | 'error' }) {
  const borderColor = status === 'error' ? 'border-l-red-500' : status === 'warning' ? 'border-l-yellow-500' : 'border-l-green-500'
  return (
    <div className={`bg-white border border-gray-200 rounded p-4 border-l-4 ${borderColor}`}>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-gray-900">{value}</dd>
      {sublabel && <dd className="text-xs text-gray-500 mt-1">{sublabel}</dd>}
    </div>
  )
}

// Compatibility indicator
function CompatibilityCell({ backward, forward }: { backward: boolean; forward: boolean }) {
  return (
    <div className="flex items-center space-x-1">
      <span className={`text-xs ${backward ? 'text-green-600' : 'text-red-600'}`} title="Backward compatible">
        {backward ? '✓' : '✗'}B
      </span>
      <span className={`text-xs ${forward ? 'text-green-600' : 'text-red-600'}`} title="Forward compatible">
        {forward ? '✓' : '✗'}F
      </span>
    </div>
  )
}

export default function SchemaEvolutionPage() {
  const router = useRouter()
  const [data, setData] = useState<SchemaEvolutionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSchema, setSelectedSchema] = useState<SchemaInfo | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    loadData()
    const interval = setInterval(loadData, 60000)
    return () => clearInterval(interval)
  }, [router])

  const loadData = async () => {
    try {
      setError(null)
      const response = await fetch('/api/prod/schema-evolution')
      if (!response.ok) {
        setError('Failed to load schema evolution data')
        return
      }
      const result: SchemaEvolutionResponse = await response.json()
      setData(result)
      setLastRefresh(new Date())
      // Auto-select schema with failures
      if (!selectedSchema && result.change_impact.top_failure_schema) {
        const topSchema = result.schemas.find(s => s.schema_name === result.change_impact.top_failure_schema)
        if (topSchema) setSelectedSchema(topSchema)
      }
    } catch (err) {
      console.error('Failed to load schema evolution:', err)
      setError('Failed to load schema evolution data')
    } finally {
      setLoading(false)
    }
  }

  const exportCSV = () => {
    if (!data) return
    const csv = [
      'Schema,Version,Compatibility,Backward,Forward,Deployed,Failures 24h,Created At',
      ...data.schemas.flatMap(s => 
        s.versions.map(v => 
          `"${s.schema_name}","${v.version}","${v.compatibility}","${v.backward_compatible}","${v.forward_compatible}","${v.deployed_to_prod}","${v.dlq_failures_24h}","${v.created_at}"`
        )
      )
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `schema_evolution_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const user = getCurrentUser()

  if (loading && !data) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={['Validation & Safety', 'Schema Registry', 'Evolution']} tenant={user?.tenant}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading schema evolution...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error || !data) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={['Validation & Safety', 'Schema Registry', 'Evolution']} tenant={user?.tenant}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white border border-red-200 rounded p-6 text-center">
            <p className="text-red-600 mb-4">{error || 'Failed to load data'}</p>
            <button onClick={loadData} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700">
              Retry
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  const hasBreakingChanges = data.registry_health.breaking_changes_30d > 0

  return (
    <Layout serviceName="Ingestion" breadcrumbs={['Validation & Safety', 'Schema Registry', 'Evolution']} tenant={user?.tenant}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-semibold text-gray-900">Schema Evolution Monitor</h1>
              {hasBreakingChanges && (
                <StatusBadge variant="error">{data.registry_health.breaking_changes_30d} Breaking Change</StatusBadge>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500">Schema stability and change impact tracking</p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-xs text-gray-500">Last updated: {format(lastRefresh, 'HH:mm:ss')}</span>
            <Link 
              href="/console/ingestion/schema-registry" 
              className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
            >
              ← Registry
            </Link>
            <button onClick={loadData} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
              Refresh
            </button>
            <button onClick={exportCSV} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
              Export CSV
            </button>
          </div>
        </div>

        {/* Registry Health + Change Impact */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Registry Health */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Registry Health</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <MetricCard 
                  label="Total Schemas" 
                  value={data.registry_health.total_schemas} 
                  status="good"
                />
                <MetricCard 
                  label="Active" 
                  value={data.registry_health.active_schemas} 
                  sublabel={`${Math.round((data.registry_health.active_schemas / data.registry_health.total_schemas) * 100)}% of total`}
                  status="good"
                />
                <MetricCard 
                  label="Breaking Changes (30d)" 
                  value={data.registry_health.breaking_changes_30d} 
                  status={data.registry_health.breaking_changes_30d > 0 ? 'error' : 'good'}
                />
                <MetricCard 
                  label="With Failures" 
                  value={data.registry_health.schemas_with_failures} 
                  status={data.registry_health.schemas_with_failures > 0 ? 'warning' : 'good'}
                />
              </div>
            </div>
          </div>

          {/* Change Impact */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Change Impact (30d)</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center p-3 bg-gray-50 rounded">
                  <div className="text-2xl font-semibold text-gray-900">{data.change_impact.changes_30d}</div>
                  <div className="text-xs text-gray-500">Total Changes</div>
                </div>
                <div className={`text-center p-3 rounded ${data.change_impact.breaking_changes_30d > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                  <div className={`text-2xl font-semibold ${data.change_impact.breaking_changes_30d > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {data.change_impact.breaking_changes_30d}
                  </div>
                  <div className="text-xs text-gray-500">Breaking</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded">
                  <div className="text-2xl font-semibold text-gray-900">{data.change_impact.validations_30d.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">Validated</div>
                </div>
                <div className={`text-center p-3 rounded ${data.change_impact.failures_30d > 0 ? 'bg-yellow-50' : 'bg-gray-50'}`}>
                  <div className={`text-2xl font-semibold ${data.change_impact.failures_30d > 0 ? 'text-yellow-600' : 'text-gray-900'}`}>
                    {data.change_impact.failures_30d}
                  </div>
                  <div className="text-xs text-gray-500">
                    DLQ Failures {data.change_impact.failure_rate_change_percent > 0 && (
                      <span className="text-red-500">↑{data.change_impact.failure_rate_change_percent}%</span>
                    )}
                  </div>
                </div>
              </div>
              {data.change_impact.top_failure_schema && (
                <div className="p-3 bg-red-50 border border-red-200 rounded">
                  <div className="text-xs font-medium text-red-800 uppercase">Top Risk</div>
                  <div className="text-sm font-medium text-red-900 mt-1">
                    {data.change_impact.top_failure_schema}
                  </div>
                  <div className="text-xs text-red-600 mt-1">
                    {data.change_impact.top_failure_schema_count} failures (24h)
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Schema List + Version Timeline */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Schema List */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Schemas ({data.schemas.length})</h2>
            </div>
            <div className="divide-y divide-gray-200 max-h-[400px] overflow-y-auto">
              {data.schemas.map((schema) => (
                <div 
                  key={schema.schema_id}
                  className={`px-4 py-3 cursor-pointer hover:bg-gray-50 ${selectedSchema?.schema_id === schema.schema_id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                  onClick={() => setSelectedSchema(schema)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{schema.display_name}</div>
                      <div className="text-xs font-mono text-gray-500">{schema.schema_name}</div>
                    </div>
                    <div className="flex flex-col items-end space-y-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        schema.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                        schema.status === 'DEPRECATED' ? 'bg-gray-100 text-gray-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {schema.current_version}
                      </span>
                      {schema.breaking_changes_30d > 0 && (
                        <span className="text-xs text-red-600">{schema.breaking_changes_30d} breaking</span>
                      )}
                      {schema.dlq_failures_30d > 0 && (
                        <span className="text-xs text-yellow-600">{schema.dlq_failures_30d} failures</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Version Timeline + Compatibility Matrix */}
          <div className="lg:col-span-2 space-y-6">
            {/* Evolution Timeline */}
            <div className="bg-white border border-gray-200 rounded shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-sm font-medium text-gray-900">
                  Evolution Timeline {selectedSchema && <span className="text-gray-500">({selectedSchema.schema_name})</span>}
                </h2>
              </div>
              {selectedSchema && selectedSchema.versions.length > 0 ? (
                <div className="p-6">
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                    
                    <div className="space-y-4">
                      {selectedSchema.versions.map((version, idx) => (
                        <div key={version.version} className="relative pl-8">
                          {/* Timeline dot */}
                          <div className={`absolute left-0 w-6 h-6 rounded-full flex items-center justify-center ${
                            version.compatibility === 'BREAKING' ? 'bg-red-100 text-red-600' :
                            version.compatibility === 'BACKWARD' ? 'bg-yellow-100 text-yellow-600' :
                            'bg-green-100 text-green-600'
                          }`}>
                            {version.compatibility === 'BREAKING' ? '!' : 
                             version.compatibility === 'FULL' ? '✓' : '~'}
                          </div>
                          
                          <div className={`p-3 rounded border ${
                            version.compatibility === 'BREAKING' ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'
                          }`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-medium text-gray-900">{version.version}</span>
                                <StatusBadge variant={
                                  version.compatibility === 'BREAKING' ? 'error' :
                                  version.compatibility === 'FULL' ? 'success' :
                                  version.compatibility === 'BACKWARD' ? 'info' : 'warning'
                                }>
                                  {version.compatibility}
                                </StatusBadge>
                              </div>
                              <span className="text-xs text-gray-500">
                                {format(new Date(version.created_at), 'yyyy-MM-dd')}
                              </span>
                            </div>
                            
                            {version.fields_changed.length > 0 && (
                              <div className="text-xs text-gray-600 mb-1">
                                <span className="font-medium">Changed:</span> {version.fields_changed.join(', ')}
                              </div>
                            )}
                            {version.fields_added.length > 0 && (
                              <div className="text-xs text-green-600 mb-1">
                                <span className="font-medium">Added:</span> {version.fields_added.join(', ')}
                              </div>
                            )}
                            {version.fields_removed.length > 0 && (
                              <div className="text-xs text-red-600 mb-1">
                                <span className="font-medium">Removed:</span> {version.fields_removed.join(', ')}
                              </div>
                            )}
                            
                            {version.dlq_failures_24h > 0 && (
                              <div className="mt-2 text-xs text-red-600 font-medium">
                                {version.dlq_failures_24h} DLQ failures triggered
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-sm text-gray-500">
                  {selectedSchema ? 'No version history available' : 'Select a schema to view timeline'}
                </div>
              )}
            </div>

            {/* Compatibility Matrix */}
            {selectedSchema && selectedSchema.versions.length > 0 && (
              <div className="bg-white border border-gray-200 rounded shadow-sm">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-sm font-medium text-gray-900">Compatibility Matrix</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Version</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Backward</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Forward</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deployed</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Safe to Use</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {selectedSchema.versions.map((version) => {
                        const isSafe = version.backward_compatible && version.forward_compatible
                        return (
                          <tr key={version.version} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{version.version}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`text-sm ${version.backward_compatible ? 'text-green-600' : 'text-red-600'}`}>
                                {version.backward_compatible ? '✓' : '✗'}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`text-sm ${version.forward_compatible ? 'text-green-600' : 'text-red-600'}`}>
                                {version.forward_compatible ? '✓' : '✗'}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`text-sm ${version.deployed_to_prod ? 'text-green-600' : 'text-gray-400'}`}>
                                {version.deployed_to_prod ? '✓' : '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                isSafe ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {isSafe ? 'Safe' : 'Risky'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Failures */}
        <div className="bg-white border border-gray-200 rounded shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-900">Recent Schema Failures ({data.recent_failures.length})</h2>
            <Link href="/console/ingestion/error-monitor" className="text-xs text-blue-600 hover:text-blue-800">
              View All Errors →
            </Link>
          </div>
          {data.recent_failures.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Schema</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Version</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.recent_failures.map((failure) => (
                    <tr key={failure.failure_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {format(new Date(failure.timestamp), 'HH:mm:ss')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-mono text-gray-900">{failure.schema_name}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-600">{failure.schema_version}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{failure.reason_code}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[200px]" title={failure.error_message}>
                          {failure.error_message}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {failure.tenant_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <Link
                            href={`/console/ingestion/pre-acc-guard/dlq/${encodeURIComponent(failure.dlq_id)}`}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            DLQ
                          </Link>
                          <Link
                            href={`/console/ingestion/event-graph/${encodeURIComponent(failure.envelope_id)}`}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Graph
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-gray-500">
              No recent schema failures
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

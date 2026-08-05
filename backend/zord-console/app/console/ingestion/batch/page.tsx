'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'
import { BatchIngestionData, HealthStatus } from '@/types/ingress'

// AWS-style status badge
function StatusBadge({ status }: { status: HealthStatus }) {
  const styles = {
    HEALTHY: 'bg-green-100 text-green-800 border-green-200',
    DEGRADED: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    CRITICAL: 'bg-red-100 text-red-800 border-red-200',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${styles[status]}`}>
      {status}
    </span>
  )
}

// Batch status badge
function BatchStatusBadge({ status }: { status: 'SUCCESS' | 'FAILED' | 'PROCESSING' | 'PENDING' }) {
  const styles = {
    SUCCESS: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    PROCESSING: 'bg-blue-100 text-blue-800',
    PENDING: 'bg-gray-100 text-gray-800',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  )
}

export default function BatchIngestionPage() {
  const router = useRouter()
  const [data, setData] = useState<BatchIngestionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    loadData()
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [router])

  const loadData = async () => {
    try {
      setError(null)
      const response = await fetch('/api/prod/ingress/batch')
      if (!response.ok) throw new Error('Failed to load')
      const result: BatchIngestionData = await response.json()
      setData(result)
      setLastRefresh(new Date())
    } catch (err) {
      setError('Failed to load batch ingestion data')
    } finally {
      setLoading(false)
    }
  }

  const user = getCurrentUser()

  if (loading && !data) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={['Ingress', 'Batch Ingestion']} tenant={user?.tenant}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading batch ingestion...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error || !data) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={['Ingress', 'Batch Ingestion']} tenant={user?.tenant}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white border border-red-200 rounded p-6 text-center">
            <p className="text-red-600 mb-4">{error || 'Failed to load data'}</p>
            <button onClick={loadData} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700">Retry</button>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout serviceName="Ingestion" breadcrumbs={['Ingress', 'Batch Ingestion']} tenant={user?.tenant}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-semibold text-gray-900">Batch Ingestion</h1>
              <StatusBadge status={data.health.status} />
              <span className="text-sm text-gray-500">{data.health.records_per_hour.toLocaleString()} rec/hr</span>
              <span className="text-sm text-gray-500">•</span>
              <span className="text-sm text-gray-500">{data.health.success_rate}%</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">zord-vault-journal → schema | 24h | Batch file processing</p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-xs text-gray-500">Updated: {format(lastRefresh, 'HH:mm:ss')}</span>
            <button onClick={loadData} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Refresh</button>
            <Link href="/console/ingestion" className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">← Ingestion Spine</Link>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Batch Health */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Batch Health</h2>
            </div>
            <div className="p-6">
              <div className={`p-4 rounded border mb-4 ${
                data.health.status === 'HEALTHY' ? 'bg-green-50 border-green-200' : 
                data.health.status === 'DEGRADED' ? 'bg-yellow-50 border-yellow-200' : 
                'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center space-x-3">
                  <span className={`text-2xl ${
                    data.health.status === 'HEALTHY' ? 'text-green-600' : 
                    data.health.status === 'DEGRADED' ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {data.health.status === 'HEALTHY' ? '✓' : '!'}
                  </span>
                  <div>
                    <div className="text-lg font-semibold text-gray-900">{data.health.status}</div>
                    <div className="text-sm text-gray-600">{data.health.success_rate}% success rate</div>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="text-xs font-medium text-gray-500 uppercase mb-3">Format Errors</div>
                <div className="space-y-2">
                  {data.format_errors.map((f, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">{f.format}</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-red-400 rounded-full" style={{ width: `${f.percent}%` }}></div>
                        </div>
                        <span className="text-sm text-gray-600">{f.percent}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Processing Queue */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Processing Queue</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 bg-gray-50 rounded border border-gray-200">
                  <div className="text-xl font-semibold text-gray-900">{data.processing_queue.pending_files}</div>
                  <div className="text-xs text-gray-500">Pending</div>
                  <div className="text-xs text-gray-400">{data.processing_queue.pending_records} rec</div>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded border border-blue-200">
                  <div className="text-xl font-semibold text-blue-700">{data.processing_queue.processing_files}</div>
                  <div className="text-xs text-gray-500">Processing</div>
                  <div className="text-xs text-gray-400">{data.processing_queue.processing_records} rec</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded border border-red-200">
                  <div className="text-xl font-semibold text-red-700">{data.processing_queue.failed_files}</div>
                  <div className="text-xs text-gray-500">Failed</div>
                  <div className="text-xs text-gray-400">{data.processing_queue.failed_percent}%</div>
                </div>
              </div>
              <Link href="/console/ingestion/batch-pipelines" className="block w-full px-4 py-2 text-sm font-medium text-center text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">
                Queue Monitor
              </Link>
            </div>
          </div>
        </div>

        {/* Recent Batches */}
        <div className="bg-white border border-gray-200 rounded shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-medium text-gray-900">Recent Batches</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Success</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Records</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.recent_batches.map((b, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link href={`/console/ingestion/batch-pipelines/${b.batch_id}`} className="text-sm font-mono text-blue-600 hover:text-blue-800">
                        {b.batch_id}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <BatchStatusBadge status={b.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {b.status !== 'PENDING' && b.status !== 'PROCESSING' ? (
                        <span className={`text-sm font-medium ${b.success_rate >= 95 ? 'text-green-600' : b.success_rate >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {b.success_rate}%
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{b.records.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {format(new Date(b.timestamp), 'MMM d, HH:mm')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  )
}

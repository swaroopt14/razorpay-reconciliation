'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'
import { StreamIngestionData, HealthStatus } from '@/types/ingress'

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

export default function StreamIngestionPage() {
  const router = useRouter()
  const [data, setData] = useState<StreamIngestionData | null>(null)
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
      const response = await fetch('/api/prod/ingress/stream')
      if (!response.ok) throw new Error('Failed to load')
      const result: StreamIngestionData = await response.json()
      setData(result)
      setLastRefresh(new Date())
    } catch (err) {
      setError('Failed to load stream ingestion data')
    } finally {
      setLoading(false)
    }
  }

  const user = getCurrentUser()

  if (loading && !data) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={['Ingress', 'Stream Ingestion']} tenant={user?.tenant}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading stream ingestion...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error || !data) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={['Ingress', 'Stream Ingestion']} tenant={user?.tenant}>
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
    <Layout serviceName="Ingestion" breadcrumbs={['Ingress', 'Stream Ingestion']} tenant={user?.tenant}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-semibold text-gray-900">Stream Ingestion</h1>
              <StatusBadge status={data.health.status} />
              <span className="text-sm text-gray-500">{data.health.messages_per_hour.toLocaleString()} msg/hr</span>
              <span className="text-sm text-gray-500">•</span>
              <span className="text-sm text-gray-500">{data.health.processing_rate}%</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">zord-vault-journal → zord-relay | 24h | Kafka stream monitoring</p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-xs text-gray-500">Updated: {format(lastRefresh, 'HH:mm:ss')}</span>
            <button onClick={loadData} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Refresh</button>
            <Link href="/console/ingestion" className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">← Ingestion Spine</Link>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Stream Health */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Stream Health</h2>
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
                    <div className="text-sm text-gray-600">{data.health.processing_rate}% processing rate</div>
                  </div>
                </div>
              </div>
              
              <div className="text-xs font-medium text-gray-500 uppercase mb-3">Processing Latency</div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded">
                  <div className="text-xl font-semibold text-gray-900">{data.health.latency.p50_ms}ms</div>
                  <div className="text-xs text-gray-500">P50</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded">
                  <div className="text-xl font-semibold text-gray-900">{data.health.latency.p95_ms}ms</div>
                  <div className="text-xs text-gray-500">P95</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded">
                  <div className="text-xl font-semibold text-gray-900">{data.health.latency.p99_ms}ms</div>
                  <div className="text-xs text-gray-500">P99</div>
                </div>
              </div>
            </div>
          </div>

          {/* Consumer Lag */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Consumer Lag (PayPal DNA)</h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {data.consumer_lag.map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{c.consumer_group}</div>
                      <div className="text-xs text-gray-500">{c.lag_messages.toLocaleString()} messages</div>
                    </div>
                    <div className={`text-sm font-medium ${
                      c.lag_messages < 500 ? 'text-green-600' : c.lag_messages < 1000 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {c.lag_time}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-yellow-50 rounded border border-yellow-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Max Lag</span>
                  <span className="text-sm font-medium text-yellow-700">{data.max_lag}</span>
                </div>
              </div>
              <Link href="/console/ingestion/stream-consumers" className="mt-4 block w-full px-4 py-2 text-sm font-medium text-center text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">
                Lag Monitor
              </Link>
            </div>
          </div>
        </div>

        {/* Topics Breakdown */}
        <div className="bg-white border border-gray-200 rounded shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-medium text-gray-900">Topics Breakdown</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Topic</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Volume</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Messages/hr</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Latency</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.topics.map((t, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-mono text-gray-900">{t.topic_name}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{t.volume_percent}%</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{t.messages_per_hour.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{t.avg_latency_ms}ms</td>
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

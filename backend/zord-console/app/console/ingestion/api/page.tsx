'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'
import { APIIngestionData, HealthStatus } from '@/types/ingress'

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

// Metric card with left border
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

// Progress bar component
function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const percent = Math.round((used / limit) * 100)
  const color = percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-yellow-500' : 'bg-green-500'
  return (
    <div className="py-2">
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-gray-700">{label}</span>
        <span className="text-gray-600">{used.toLocaleString()}/{limit.toLocaleString()} ({percent}%)</span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${percent}%` }}></div>
      </div>
    </div>
  )
}

export default function APIIngestionPage() {
  const router = useRouter()
  const [data, setData] = useState<APIIngestionData | null>(null)
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
      const response = await fetch('/api/prod/ingress/api')
      if (!response.ok) throw new Error('Failed to load')
      const result: APIIngestionData = await response.json()
      setData(result)
      setLastRefresh(new Date())
    } catch (err) {
      setError('Failed to load API ingestion data')
    } finally {
      setLoading(false)
    }
  }

  const user = getCurrentUser()

  if (loading && !data) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={['Ingress', 'API Ingestion']} tenant={user?.tenant}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading API ingestion...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error || !data) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={['Ingress', 'API Ingestion']} tenant={user?.tenant}>
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
    <Layout serviceName="Ingestion" breadcrumbs={['Ingress', 'API Ingestion']} tenant={user?.tenant}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-semibold text-gray-900">API Ingestion</h1>
              <StatusBadge status={data.health.status} />
              <span className="text-sm text-gray-500">{data.health.requests_per_hour.toLocaleString()} req/hr</span>
              <span className="text-sm text-gray-500">•</span>
              <span className="text-sm text-gray-500">{data.health.success_rate}%</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">zord-edge | 24h | REST API traffic monitoring</p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-xs text-gray-500">Updated: {format(lastRefresh, 'HH:mm:ss')}</span>
            <button onClick={loadData} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Refresh</button>
            <Link href="/console/ingestion" className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">← Ingestion Spine</Link>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* API Health */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">API Health (Stripe-style)</h2>
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
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="text-xs font-medium text-gray-500 uppercase mb-3">Top Errors (Razorpay DNA)</div>
                {data.top_errors.map((err, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-gray-700">{err.category}</span>
                    <span className="text-sm text-gray-600">{err.count} ({err.percent}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Rate Limits */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Rate Limits (PayPal-style)</h2>
            </div>
            <div className="p-6">
              <div className="text-xs font-medium text-gray-500 uppercase mb-3">Tenant Usage</div>
              {data.rate_limits.tenants.map((t, i) => (
                <UsageBar key={i} used={t.used} limit={t.limit} label={t.tenant_name} />
              ))}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <UsageBar used={data.rate_limits.global.used} limit={data.rate_limits.global.limit} label="Global" />
              </div>
              <button className="mt-4 w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">
                Adjust Limits
              </button>
            </div>
          </div>
        </div>

        {/* Endpoint Breakdown + Tenant Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Endpoint Breakdown */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Endpoint Breakdown</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Endpoint</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Volume</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Success</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Latency</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.endpoints.map((ep, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs font-medium bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded mr-2">{ep.method}</span>
                        <span className="text-sm font-mono text-gray-900">{ep.path}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{ep.volume_percent}%</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-medium ${ep.success_rate >= 98 ? 'text-green-600' : ep.success_rate >= 95 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {ep.success_rate}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{ep.avg_latency_ms}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex space-x-3">
              <Link href="/console/ingestion/event-graph" className="text-xs text-blue-600 hover:text-blue-800">Event Graph</Link>
              <Link href="/console/ingestion/dlq" className="text-xs text-blue-600 hover:text-blue-800">DLQ Detail</Link>
            </div>
          </div>

          {/* Tenant Breakdown */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Tenant Breakdown (PayPal DNA)</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {data.tenant_breakdown.map((t, i) => (
                <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{t.tenant_name}</div>
                    <div className="text-xs text-gray-500">{t.requests.toLocaleString()} requests</div>
                  </div>
                  <div className={`text-sm font-medium ${t.failure_rate < 2 ? 'text-green-600' : t.failure_rate < 5 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {t.failure_rate}% fail
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'
import { WebhookIngestionData, HealthStatus } from '@/types/ingress'

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

export default function WebhookIngestionPage() {
  const router = useRouter()
  const [data, setData] = useState<WebhookIngestionData | null>(null)
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
      const response = await fetch('/api/prod/ingress/webhook')
      if (!response.ok) throw new Error('Failed to load')
      const result: WebhookIngestionData = await response.json()
      setData(result)
      setLastRefresh(new Date())
    } catch (err) {
      setError('Failed to load webhook ingestion data')
    } finally {
      setLoading(false)
    }
  }

  const user = getCurrentUser()

  if (loading && !data) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={['Ingress', 'Webhook Ingestion']} tenant={user?.tenant}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading webhook ingestion...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error || !data) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={['Ingress', 'Webhook Ingestion']} tenant={user?.tenant}>
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
    <Layout serviceName="Ingestion" breadcrumbs={['Ingress', 'Webhook Ingestion']} tenant={user?.tenant}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-semibold text-gray-900">Webhook Ingestion</h1>
              <StatusBadge status={data.health.status} />
              <span className="text-sm text-gray-500">{data.health.requests_per_hour.toLocaleString()} req/hr</span>
              <span className="text-sm text-gray-500">•</span>
              <span className="text-sm text-gray-500">{data.health.delivery_rate}%</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">zord-edge → zord-pii-enclave | 24h | Webhook delivery monitoring</p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-xs text-gray-500">Updated: {format(lastRefresh, 'HH:mm:ss')}</span>
            <button onClick={loadData} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Refresh</button>
            <Link href="/console/ingestion" className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">← Ingestion Spine</Link>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Webhook Health */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Webhook Health</h2>
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
                    <div className="text-sm text-gray-600">{data.health.delivery_rate}% delivery rate</div>
                  </div>
                </div>
              </div>
              <div className="text-xs font-medium text-gray-500 uppercase mb-2">P95 Delivery Latency</div>
              <div className="text-2xl font-semibold text-gray-900 mb-4">{data.health.delivery_latency.p95_ms}ms</div>
              
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="text-xs font-medium text-gray-500 uppercase mb-3">Failure Reasons</div>
                {data.failure_reasons.map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-gray-700">{r.reason}</span>
                    <span className="text-sm text-gray-600">{r.count} ({r.percent}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Retry Status */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Retry Status (Stripe DNA)</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="text-center p-4 bg-gray-50 rounded border border-gray-200">
                  <div className="text-2xl font-semibold text-gray-900">{data.retry_status.retrying}</div>
                  <div className="text-xs text-gray-500">Retrying ({data.retry_status.retrying_percent}%)</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded border border-gray-200">
                  <div className="text-2xl font-semibold text-gray-900">{data.retry_status.max_attempts}/{data.retry_status.max_attempts_allowed}</div>
                  <div className="text-xs text-gray-500">Max Attempts</div>
                </div>
              </div>
              <div className={`p-4 rounded border ${data.retry_status.success_after_retry_percent >= 80 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                <div className="text-center">
                  <div className="text-2xl font-semibold text-green-700">{data.retry_status.success_after_retry_percent}%</div>
                  <div className="text-xs text-gray-600">Success after retry</div>
                </div>
              </div>
              <Link href="/console/ingestion/outbox-health" className="mt-4 block w-full px-4 py-2 text-sm font-medium text-center text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">
                Retry Monitor
              </Link>
            </div>
          </div>
        </div>

        {/* Webhook Endpoints */}
        <div className="bg-white border border-gray-200 rounded shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-medium text-gray-900">Webhook Endpoints (Razorpay)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant / Endpoint</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Volume</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Success Rate</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.endpoints.map((ep, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{ep.tenant_name}</div>
                      <div className="text-xs font-mono text-gray-500">{ep.endpoint_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{ep.volume.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${ep.success_rate >= 98 ? 'text-green-600' : ep.success_rate >= 95 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {ep.success_rate}%
                      </span>
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

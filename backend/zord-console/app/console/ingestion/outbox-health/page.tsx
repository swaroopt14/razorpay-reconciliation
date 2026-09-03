'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'
import { 
  OutboxHealthResponse, 
  EventBusHealth, 
  OverallHealth,
  AtRiskEvent 
} from '@/types/outbox'

// AWS-style status badge
function StatusBadge({ status }: { status: 'healthy' | 'degraded' | 'critical' }) {
  const styles = {
    healthy: 'bg-green-100 text-green-800 border-green-200',
    degraded: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    critical: 'bg-red-100 text-red-800 border-red-200',
  }
  const labels = {
    healthy: 'Healthy',
    degraded: 'Degraded',
    critical: 'Critical',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

// AWS-style metric box
function MetricBox({ label, value, unit, status }: { label: string; value: string | number; unit?: string; status?: 'good' | 'warning' | 'error' }) {
  const borderColor = status === 'error' ? 'border-l-red-500' : status === 'warning' ? 'border-l-yellow-500' : 'border-l-green-500'
  return (
    <div className={`bg-white border border-gray-200 rounded p-4 border-l-4 ${borderColor}`}>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-gray-900">
        {value}{unit && <span className="text-sm text-gray-500 ml-1">{unit}</span>}
      </dd>
    </div>
  )
}

export default function OutboxHealthPage() {
  const router = useRouter()
  const [data, setData] = useState<OutboxHealthResponse | null>(null)
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
      const response = await fetch('/api/prod/outbox-health')
      if (!response.ok) {
        setError('Failed to load outbox health data')
        return
      }
      const result: OutboxHealthResponse = await response.json()
      setData(result)
      setLastRefresh(new Date())
    } catch (err) {
      console.error('Failed to load outbox health:', err)
      setError('Failed to load outbox health data')
    } finally {
      setLoading(false)
    }
  }

  const exportCSV = () => {
    if (!data) return
    const csv = [
      'Outbox ID,Event Type,Target Service,Attempts,Max Attempts,Error,Tenant,Created At',
      ...data.at_risk_events.map(e => 
        `"${e.outbox_id}","${e.event_type}","${e.target_service}","${e.attempts}","${e.max_attempts}","${e.error_message || ''}","${e.tenant_name}","${e.created_at}"`
      )
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `outbox_at_risk_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const user = getCurrentUser()

  if (loading && !data) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={['Operations', 'Outbox Health']} tenant={user?.tenant}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading outbox health...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error || !data) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={['Operations', 'Outbox Health']} tenant={user?.tenant}>
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

  const overallStatus = data.delivery_guarantee.overall_health === 'HEALTHY' ? 'healthy' : 
                        data.delivery_guarantee.overall_health === 'DEGRADED' ? 'degraded' : 'critical'

  return (
    <Layout serviceName="Ingestion" breadcrumbs={['Operations', 'Outbox Health']} tenant={user?.tenant}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Outbox / Event Bus Health</h1>
            <p className="mt-1 text-sm text-gray-500">Delivery guarantee monitoring for financial events</p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-xs text-gray-500">Last updated: {format(lastRefresh, 'HH:mm:ss')}</span>
            <button onClick={loadData} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
              Refresh
            </button>
            <button onClick={exportCSV} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
              Export CSV
            </button>
          </div>
        </div>

        {/* Overall Status Banner */}
        <div className="bg-white border border-gray-200 rounded shadow-sm mb-6">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-900">Delivery Guarantee</h2>
            <StatusBadge status={overallStatus} />
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricBox 
                label="Delivery SLA" 
                value={data.delivery_guarantee.delivery_sla_percent} 
                unit="%" 
                status={data.delivery_guarantee.sla_met ? 'good' : 'error'}
              />
              <MetricBox 
                label="Delivered" 
                value={data.delivery_guarantee.delivered_count.toLocaleString()} 
                status="good"
              />
              <MetricBox 
                label="Retrying" 
                value={data.retry_discipline.events_retrying} 
                status={data.retry_discipline.events_retrying > 50 ? 'error' : data.retry_discipline.events_retrying > 20 ? 'warning' : 'good'}
              />
              <MetricBox 
                label="Max Retry Seen" 
                value={`${data.retry_discipline.max_attempts_seen}/${data.retry_discipline.max_attempts_allowed}`} 
                status={data.retry_discipline.max_attempts_seen >= 4 ? 'error' : 'good'}
              />
            </div>
          </div>
        </div>

        {/* Event Bus Status */}
        <div className="bg-white border border-gray-200 rounded shadow-sm mb-6">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-medium text-gray-900">Event Bus Status</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">In-Flight</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Error Rate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Delivery</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.event_bus_status.map((bus) => (
                  <tr key={bus.service} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{bus.display_name}</div>
                      <div className="text-xs font-mono text-gray-500">{bus.service}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        bus.health === 'OK' ? 'bg-green-100 text-green-800' :
                        bus.health === 'DEGRADED' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {bus.health}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{bus.events_in_flight}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{bus.error_rate_percent.toFixed(1)}%</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{bus.last_delivery_ago_seconds}s ago</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Backlog Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Backlog Breakdown</h2>
            </div>
            <div className="p-6">
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600">Pending</dt>
                  <dd className="text-sm font-medium text-gray-900">{data.backlog.pending.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-yellow-600">Retrying</dt>
                  <dd className="text-sm font-medium text-yellow-600">{data.backlog.retrying.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-green-600">Delivered</dt>
                  <dd className="text-sm font-medium text-green-600">{data.backlog.delivered.toLocaleString()}</dd>
                </div>
                {data.backlog.failed > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-sm text-red-600">Failed</dt>
                    <dd className="text-sm font-medium text-red-600">{data.backlog.failed.toLocaleString()}</dd>
                  </div>
                )}
                {data.backlog.dead_letter > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-sm text-red-800">Dead Letter</dt>
                    <dd className="text-sm font-medium text-red-800">{data.backlog.dead_letter.toLocaleString()}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* Audit Metrics */}
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Audit Metrics (24h)</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded">
                  <div className="text-2xl font-semibold text-gray-900">{data.audit_metrics.delivery_rate_24h}%</div>
                  <div className="text-xs text-gray-500 mt-1">Delivery Rate</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded">
                  <div className="text-2xl font-semibold text-gray-900">{data.audit_metrics.event_finality_percent}%</div>
                  <div className="text-xs text-gray-500 mt-1">Event Finality</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded">
                  <div className="text-2xl font-semibold text-gray-900">{data.audit_metrics.oldest_pending_age_minutes}m</div>
                  <div className="text-xs text-gray-500 mt-1">Oldest Pending</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* At-Risk Events */}
        <div className="bg-white border border-gray-200 rounded shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-900">At-Risk Events ({data.at_risk_events.length})</h2>
            {data.at_risk_events.length > 0 && (
              <span className="text-xs text-red-600">Action required</span>
            )}
          </div>
          {data.at_risk_events.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Outbox ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Retries</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Error</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.at_risk_events.map((event) => (
                    <tr key={event.outbox_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-mono text-gray-900">{event.outbox_id}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          event.event_type === 'INTENT' ? 'bg-purple-100 text-purple-800' :
                          event.event_type === 'CONTRACT' ? 'bg-blue-100 text-blue-800' :
                          event.event_type === 'EVIDENCE' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {event.event_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{event.target_service}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-medium ${
                          event.attempts >= 3 ? 'text-red-600' : event.attempts >= 2 ? 'text-yellow-600' : 'text-gray-600'
                        }`}>
                          {event.attempts}/{event.max_attempts}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-gray-600 truncate block max-w-[200px]" title={event.error_message}>
                          {event.error_message || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{event.tenant_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => {
                            if (event.intent_id) router.push(`/console/ingestion/event-graph/${encodeURIComponent(event.intent_id)}`)
                            else if (event.envelope_id) router.push(`/console/ingestion/event-graph/${encodeURIComponent(event.envelope_id)}`)
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          View Graph
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-gray-500">
              No at-risk events
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

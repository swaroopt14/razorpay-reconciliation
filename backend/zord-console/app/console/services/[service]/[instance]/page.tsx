'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated } from '@/services/auth'
import { Layout } from '@/components/aws/Layout'
import { ServiceMetricsResponse, ServiceMetric, TimeSeriesPoint, MetricStatus } from '@/types/service-metrics'

// Status indicator
function StatusBadge({ status }: { status: MetricStatus }) {
  const config = {
    healthy: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500', label: 'Healthy' },
    warning: { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500', label: 'Warning' },
    critical: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500', label: 'Critical' },
  }
  const c = config[status]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} mr-1.5`} />
      {c.label}
    </span>
  )
}

// Mini sparkline chart (SVG)
function Sparkline({ 
  data, 
  width = 120, 
  height = 32, 
  status = 'healthy',
  showArea = true,
}: { 
  data: TimeSeriesPoint[]
  width?: number
  height?: number
  status?: MetricStatus
  showArea?: boolean
}) {
  const values = data.map(d => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = height - ((v - min) / range) * height * 0.8 - height * 0.1
    return `${x},${y}`
  }).join(' ')

  const areaPoints = `0,${height} ${points} ${width},${height}`
  
  const colors = {
    healthy: { stroke: '#10B981', fill: '#D1FAE5' },
    warning: { stroke: '#F59E0B', fill: '#FEF3C7' },
    critical: { stroke: '#EF4444', fill: '#FEE2E2' },
  }
  const c = colors[status]

  return (
    <svg width={width} height={height} className="overflow-visible">
      {showArea && (
        <polygon points={areaPoints} fill={c.fill} opacity={0.5} />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={c.stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Full time series chart (Datadog/Grafana style)
function TimeSeriesChart({ 
  metric,
  height = 180,
}: { 
  metric: ServiceMetric
  height?: number
}) {
  const data = metric.series
  const values = data.map(d => d.value)
  const min = Math.min(...values, 0)
  const max = Math.max(...values, metric.threshold_critical * 1.1)
  const range = max - min || 1

  // Format time labels
  const getTimeLabel = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  // Y-axis labels
  const yLabels = [max, max * 0.75, max * 0.5, max * 0.25, min].map(v => Math.round(v))

  return (
    <div className="relative">
      {/* Y-axis labels */}
      <div className="absolute left-0 top-0 bottom-6 w-10 flex flex-col justify-between text-[10px] text-gray-400 text-right pr-2">
        {yLabels.map((v, i) => (
          <span key={i}>{v}{metric.unit}</span>
        ))}
      </div>

      {/* Chart area */}
      <div className="ml-12 mr-4">
        <svg width="100%" height={height} preserveAspectRatio="none" className="overflow-visible">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((y, i) => (
            <line
              key={i}
              x1="0"
              y1={y * height}
              x2="100%"
              y2={y * height}
              stroke="#E5E7EB"
              strokeDasharray={i === 4 ? '0' : '4,4'}
            />
          ))}

          {/* Warning threshold line */}
          <line
            x1="0"
            y1={height - ((metric.threshold_warning - min) / range) * height}
            x2="100%"
            y2={height - ((metric.threshold_warning - min) / range) * height}
            stroke="#F59E0B"
            strokeWidth={1}
            strokeDasharray="6,3"
            opacity={0.7}
          />

          {/* Critical threshold line */}
          <line
            x1="0"
            y1={height - ((metric.threshold_critical - min) / range) * height}
            x2="100%"
            y2={height - ((metric.threshold_critical - min) / range) * height}
            stroke="#EF4444"
            strokeWidth={1}
            strokeDasharray="6,3"
            opacity={0.7}
          />

          {/* Area fill */}
          <defs>
            <linearGradient id={`gradient-${metric.name}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={metric.status === 'critical' ? '#FEE2E2' : metric.status === 'warning' ? '#FEF3C7' : '#D1FAE5'} />
              <stop offset="100%" stopColor="white" />
            </linearGradient>
          </defs>
          <path
            d={`M 0 ${height} ${values.map((v, i) => {
              const x = (i / (values.length - 1)) * 100
              const y = height - ((v - min) / range) * height
              return `L ${x}% ${y}`
            }).join(' ')} L 100% ${height} Z`}
            fill={`url(#gradient-${metric.name})`}
            opacity={0.6}
          />

          {/* Line */}
          <path
            d={values.map((v, i) => {
              const x = (i / (values.length - 1)) * 100
              const y = height - ((v - min) / range) * height
              return `${i === 0 ? 'M' : 'L'} ${x}% ${y}`
            }).join(' ')}
            fill="none"
            stroke={metric.status === 'critical' ? '#EF4444' : metric.status === 'warning' ? '#F59E0B' : '#10B981'}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Current value dot */}
          <circle
            cx="100%"
            cy={height - ((values[values.length - 1] - min) / range) * height}
            r={4}
            fill={metric.status === 'critical' ? '#EF4444' : metric.status === 'warning' ? '#F59E0B' : '#10B981'}
            stroke="white"
            strokeWidth={2}
          />
        </svg>

        {/* X-axis labels */}
        <div className="flex justify-between mt-2 text-[10px] text-gray-400">
          <span>{getTimeLabel(data[0]?.timestamp)}</span>
          <span>{getTimeLabel(data[Math.floor(data.length / 2)]?.timestamp)}</span>
          <span>{getTimeLabel(data[data.length - 1]?.timestamp)}</span>
        </div>
      </div>

      {/* Threshold legend */}
      <div className="ml-12 mt-3 flex items-center space-x-4 text-[10px] text-gray-500">
        <span className="flex items-center">
          <span className="w-4 h-0.5 bg-yellow-500 mr-1" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #F59E0B 0, #F59E0B 3px, transparent 3px, transparent 6px)' }} />
          Warning: {metric.threshold_warning}{metric.unit}
        </span>
        <span className="flex items-center">
          <span className="w-4 h-0.5 bg-red-500 mr-1" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #EF4444 0, #EF4444 3px, transparent 3px, transparent 6px)' }} />
          Critical: {metric.threshold_critical}{metric.unit}
        </span>
      </div>
    </div>
  )
}

// Metric card with sparkline
function MetricCard({ metric, size = 'normal' }: { metric: ServiceMetric; size?: 'normal' | 'large' }) {
  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{metric.display_name}</span>
          <StatusBadge status={metric.status} />
        </div>
        <div className="flex items-end justify-between">
          <div>
            <span className="text-3xl font-semibold text-gray-900 tabular-nums">{metric.current_value}</span>
            <span className="ml-1 text-sm text-gray-500">{metric.unit}</span>
          </div>
          <Sparkline data={metric.series} status={metric.status} width={100} height={40} />
        </div>
      </div>
      {size === 'large' && (
        <div className="border-t border-gray-100 p-4">
          <TimeSeriesChart metric={metric} height={140} />
        </div>
      )}
    </div>
  )
}

// Full chart panel
function ChartPanel({ metric, title }: { metric: ServiceMetric; title?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">{title || metric.display_name}</h4>
          <p className="text-xs text-gray-500">Last 60 minutes</p>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-2xl font-semibold text-gray-900 tabular-nums">
            {metric.current_value}<span className="text-sm text-gray-500 ml-1">{metric.unit}</span>
          </span>
          <StatusBadge status={metric.status} />
        </div>
      </div>
      <div className="p-4">
        <TimeSeriesChart metric={metric} height={200} />
      </div>
    </div>
  )
}

function ServiceDetailContent() {
  const router = useRouter()
  const params = useParams()
  const service = params.service as string
  const instance = params.instance as string
  
  const [data, setData] = useState<ServiceMetricsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [secondsAgo, setSecondsAgo] = useState(0)
  const [selectedTab, setSelectedTab] = useState<'overview' | 'resources' | 'application' | 'events'>('overview')

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    loadData()
    const interval = setInterval(loadData, 15000)
    return () => clearInterval(interval)
  }, [router, service, instance])

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo(prev => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const loadData = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch(`/api/prod/services/${service}/${instance}`)
      if (!response.ok) throw new Error('Failed to load')
      const result: ServiceMetricsResponse = await response.json()
      setData(result)
      setSecondsAgo(result.last_updated_seconds_ago)
    } catch (err) {
      setError('Failed to load service metrics')
    } finally {
      setLoading(false)
    }
  }, [service, instance])

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    return `${days}d ${hours}h`
  }

  if (loading && !data) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-gray-600" />
            <p className="mt-3 text-sm text-gray-500">Loading metrics...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="bg-white border border-gray-200 rounded p-6 text-center">
          <p className="text-gray-600 mb-4">{error || 'Failed to load'}</p>
          <button onClick={loadData} className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="zord-page">
      {/* Header */}
      <div className="zord-page-header">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-3 mb-1">
              <Link href="/console/dashboards/platform-health" className="text-sm text-blue-600 hover:text-blue-700">
                ← Platform Health
              </Link>
            </div>
            <h1 className="text-xl font-semibold text-gray-900">{data.display_name}</h1>
            <p className="mt-1 text-sm text-gray-500">
              Instance: {instance} · {data.region} · v{data.instance.version}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <StatusBadge status={data.status} />
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span>Updated {secondsAgo}s ago</span>
            </div>
            <button 
              onClick={loadData}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Instance Info Bar */}
        <div className="mt-4 flex items-center space-x-6 text-sm">
          <div>
            <span className="text-gray-500">IP:</span>
            <span className="ml-1 font-mono text-gray-700">{data.instance.ip_address}:{data.instance.port}</span>
          </div>
          <div>
            <span className="text-gray-500">AZ:</span>
            <span className="ml-1 text-gray-700">{data.instance.availability_zone}</span>
          </div>
          <div>
            <span className="text-gray-500">Uptime:</span>
            <span className="ml-1 text-gray-700">{formatUptime(data.instance.uptime_seconds)}</span>
          </div>
          <div>
            <span className="text-gray-500">Last Restart:</span>
            <span className="ml-1 text-gray-700">{new Date(data.instance.last_restart).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 -mb-px flex space-x-6 border-b border-gray-200">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'resources', label: 'Resources' },
            { id: 'application', label: 'Application' },
            { id: 'events', label: 'Events' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id as typeof selectedTab)}
              className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                selectedTab === tab.id
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {selectedTab === 'overview' && (
          <>
            {/* Key Metrics Grid */}
            <div className="grid grid-cols-4 gap-4">
              <MetricCard metric={data.cpu} />
              <MetricCard metric={data.memory} />
              <MetricCard metric={data.requests_per_second} />
              <MetricCard metric={data.error_rate} />
            </div>

            {/* Main Charts */}
            <div className="grid grid-cols-2 gap-4">
              <ChartPanel metric={data.cpu} title="CPU Utilization" />
              <ChartPanel metric={data.memory} title="Memory Utilization" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <ChartPanel metric={data.requests_per_second} title="Request Rate" />
              <ChartPanel metric={data.latency_p95} title="Latency (P95)" />
            </div>
          </>
        )}

        {selectedTab === 'resources' && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <MetricCard metric={data.cpu} />
              <MetricCard metric={data.memory} />
              <MetricCard metric={data.disk} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <ChartPanel metric={data.cpu} title="CPU Utilization" />
              <ChartPanel metric={data.memory} title="Memory Utilization" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <ChartPanel metric={data.disk} title="Disk Utilization" />
              <ChartPanel metric={data.network_in} title="Network In" />
            </div>

            <ChartPanel metric={data.network_out} title="Network Out" />
          </>
        )}

        {selectedTab === 'application' && (
          <>
            <div className="grid grid-cols-4 gap-4">
              <MetricCard metric={data.requests_per_second} />
              <MetricCard metric={data.latency_p50} />
              <MetricCard metric={data.latency_p95} />
              <MetricCard metric={data.error_rate} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <ChartPanel metric={data.requests_per_second} title="Request Rate" />
              <ChartPanel metric={data.active_connections} title="Active Connections" />
            </div>

            {/* Latency comparison */}
            <div className="bg-white border border-gray-200 rounded shadow-sm">
              <div className="px-4 py-3 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900">Latency Distribution</h4>
              </div>
              <div className="p-4 grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">P50</div>
                  <TimeSeriesChart metric={data.latency_p50} height={120} />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">P95</div>
                  <TimeSeriesChart metric={data.latency_p95} height={120} />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">P99</div>
                  <TimeSeriesChart metric={data.latency_p99} height={120} />
                </div>
              </div>
            </div>

            <ChartPanel metric={data.error_rate} title="Error Rate" />
          </>
        )}

        {selectedTab === 'events' && (
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200">
              <h4 className="text-sm font-semibold text-gray-900">Recent Events</h4>
            </div>
            <div className="divide-y divide-gray-100">
              {data.recent_events.map((event, i) => (
                <div key={i} className="px-4 py-3 flex items-start space-x-3">
                  <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                    event.type === 'error' ? 'bg-red-500' :
                    event.type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">{event.message}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(event.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                    event.type === 'error' ? 'bg-red-100 text-red-700' :
                    event.type === 'warning' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {event.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ServiceDetailPage() {
  return (
    <Layout serviceName="Ops Ingestion" breadcrumbs={['Services', 'Instance Detail']}>
      <ServiceDetailContent />
    </Layout>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated } from '@/services/auth'
import { Layout } from '@/components/aws/Layout'
import { 
  DashboardHealthResponse, 
  CellStatus,
  ServiceInstance,
} from '@/types/dashboard-health'

// AWS-style status indicator
function StatusIndicator({ status, size = 'sm' }: { status: CellStatus | 'OK' | 'DEGRADED' | 'DOWN'; size?: 'sm' | 'md' | 'lg' }) {
  const colorMap: Record<string, string> = {
    healthy: 'bg-green-500',
    OK: 'bg-green-500',
    warning: 'bg-yellow-500',
    DEGRADED: 'bg-yellow-500',
    critical: 'bg-red-500',
    DOWN: 'bg-red-500',
  }
  const sizeMap = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
  }
  return <span className={`inline-block rounded-full ${colorMap[status] || 'bg-gray-400'} ${sizeMap[size]}`} />
}

// Datadog-style metric tile
function MetricTile({ 
  label, 
  value, 
  unit,
  status,
  trend,
  small = false,
}: { 
  label: string
  value: string | number
  unit?: string
  status?: CellStatus
  trend?: number
  small?: boolean
}) {
  return (
    <div className={`${small ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        {status && <StatusIndicator status={status} />}
      </div>
      <div className="flex items-baseline">
        <span className={`${small ? 'text-xl' : 'text-2xl'} font-semibold text-gray-900 tabular-nums`}>{value}</span>
        {unit && <span className="ml-1 text-sm text-gray-500">{unit}</span>}
        {trend !== undefined && (
          <span className={`ml-2 text-xs font-medium ${trend < 0 ? 'text-green-600' : trend > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {trend > 0 ? '↑' : trend < 0 ? '↓' : '-'}{Math.abs(trend)}%
          </span>
        )}
      </div>
    </div>
  )
}

// AWS-style section header
function SectionHeader({ title, action }: { title: string; action?: { label: string; href: string } }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {action && (
        <Link href={action.href} className="text-xs text-blue-600 hover:text-blue-700 hover:underline">
          {action.label}
        </Link>
      )}
    </div>
  )
}

// Time Series Chart Component (Datadog/Grafana style)
function TimeSeriesChart({ 
  title,
  data,
  color = '#10B981',
  fillColor = '#D1FAE5',
  height = 160,
  unit = '',
  showThreshold = false,
  threshold = 0,
}: { 
  title: string
  data: number[]
  color?: string
  fillColor?: string
  height?: number
  unit?: string
  showThreshold?: boolean
  threshold?: number
}) {
  const min = Math.min(...data, 0)
  const max = Math.max(...data) * 1.1
  const range = max - min || 1
  
  // Generate time labels (last 60 minutes)
  const now = new Date()
  const timeLabels = [
    new Date(now.getTime() - 60 * 60000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    new Date(now.getTime() - 30 * 60000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  ]

  // Y-axis labels
  const yLabels = [Math.round(max), Math.round(max * 0.5), Math.round(min)]

  const pathPoints = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100
    const y = ((max - v) / range) * 100
    return `${i === 0 ? 'M' : 'L'} ${x}% ${y}%`
  }).join(' ')

  const areaPoints = `M 0% 100% ${data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100
    const y = ((max - v) / range) * 100
    return `L ${x}% ${y}%`
  }).join(' ')} L 100% 100% Z`

  return (
    <div className="relative">
      {/* Y-axis */}
      <div className="absolute left-0 top-0 bottom-6 w-10 flex flex-col justify-between text-[10px] text-gray-400 text-right pr-2">
        {yLabels.map((v, i) => (
          <span key={i}>{v}{unit}</span>
        ))}
      </div>
      
      {/* Chart */}
      <div className="ml-12 mr-2">
        <svg width="100%" height={height} preserveAspectRatio="none" className="overflow-visible">
          {/* Grid lines */}
          <line x1="0" y1="0" x2="100%" y2="0" stroke="#E5E7EB" strokeWidth={1} />
          <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#E5E7EB" strokeDasharray="4,4" />
          <line x1="0" y1="100%" x2="100%" y2="100%" stroke="#E5E7EB" strokeWidth={1} />
          
          {/* Threshold line */}
          {showThreshold && threshold > 0 && (
            <line 
              x1="0" 
              y1={`${((max - threshold) / range) * 100}%`}
              x2="100%" 
              y2={`${((max - threshold) / range) * 100}%`}
              stroke="#EF4444" 
              strokeWidth={1.5} 
              strokeDasharray="6,3"
            />
          )}
          
          {/* Area fill */}
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fillColor} stopOpacity={0.8} />
              <stop offset="100%" stopColor={fillColor} stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <path d={areaPoints} fill="url(#areaGradient)" />
          
          {/* Line */}
          <path d={pathPoints} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          
          {/* Current value dot */}
          <circle 
            cx="100%" 
            cy={`${((max - data[data.length - 1]) / range) * 100}%`}
            r={4} 
            fill={color} 
            stroke="white" 
            strokeWidth={2}
          />
        </svg>
        
        {/* X-axis labels */}
        <div className="flex justify-between mt-2 text-[10px] text-gray-400">
          {timeLabels.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// Generate mock time series data
function generateMockData(baseValue: number, variance: number, points: number = 60): number[] {
  return Array.from({ length: points }, (_, i) => {
    const trend = Math.sin(i / 10) * variance * 0.3
    const noise = (Math.random() - 0.5) * variance
    return Math.max(0, baseValue + trend + noise)
  })
}

// Mini sparkline for host cards
function MiniSparkline({ data, status }: { data: number[]; status: CellStatus }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 60
    const y = 20 - ((v - min) / range) * 16
    return `${x},${y}`
  }).join(' ')

  const colors = {
    healthy: '#10B981',
    warning: '#F59E0B',
    critical: '#EF4444',
  }

  return (
    <svg width={60} height={20} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={colors[status]}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Datadog-style host map cell with sparkline
function HostMapCell({ instance, onClick }: { instance: ServiceInstance; onClick: () => void }) {
  // Calculate overall health from individual metrics
  const getOverallStatus = (): CellStatus => {
    const statuses = [instance.cpu, instance.memory, instance.errors, instance.traffic]
    if (statuses.includes('critical')) return 'critical'
    if (statuses.includes('warning')) return 'warning'
    return 'healthy'
  }
  
  const overallStatus = getOverallStatus()
  const bgColors = {
    healthy: 'bg-green-50 hover:bg-green-100 border-green-200 hover:border-green-300',
    warning: 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200 hover:border-yellow-300',
    critical: 'bg-red-50 hover:bg-red-100 border-red-200 hover:border-red-300',
  }
  
  // Generate fake sparkline data
  const sparkData = Array.from({ length: 12 }, () => instance.cpu_percent + Math.random() * 20 - 10)
  
  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-lg border-2 ${bgColors[overallStatus]} transition-all text-left w-full hover:shadow-md`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-900 truncate">{instance.display_name}</span>
        <StatusIndicator status={overallStatus} size="md" />
      </div>
      
      {/* Sparkline */}
      <div className="mb-3">
        <MiniSparkline data={sparkData} status={overallStatus} />
      </div>
      
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center justify-between bg-white/50 rounded px-2 py-1">
          <span className="text-[10px] text-gray-500">CPU</span>
          <span className="text-xs font-semibold text-gray-700">{instance.cpu_percent}%</span>
        </div>
        <div className="flex items-center justify-between bg-white/50 rounded px-2 py-1">
          <span className="text-[10px] text-gray-500">Mem</span>
          <span className="text-xs font-semibold text-gray-700">{instance.memory_percent}%</span>
        </div>
        <div className="flex items-center justify-between bg-white/50 rounded px-2 py-1">
          <span className="text-[10px] text-gray-500">Err/5m</span>
          <span className={`text-xs font-semibold ${instance.error_count_5m > 0 ? 'text-red-600' : 'text-gray-700'}`}>
            {instance.error_count_5m}
          </span>
        </div>
        <div className="flex items-center justify-between bg-white/50 rounded px-2 py-1">
          <span className="text-[10px] text-gray-500">Req/5m</span>
          <span className="text-xs font-semibold text-gray-700">{instance.requests_5m}</span>
        </div>
      </div>
      
      {/* Click hint */}
      <div className="mt-2 text-[10px] text-gray-400 text-center">
        Click to view details →
      </div>
    </button>
  )
}

function PlatformHealthContent() {
  const router = useRouter()
  const [data, setData] = useState<DashboardHealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [secondsAgo, setSecondsAgo] = useState(0)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    loadData()
    const interval = setInterval(loadData, 10000)
    return () => clearInterval(interval)
  }, [router])

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo(prev => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const loadData = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch('/api/prod/dashboard-health')
      if (!response.ok) throw new Error('Failed to load')
      const result: DashboardHealthResponse = await response.json()
      setData(result)
      setSecondsAgo(result.last_updated_seconds_ago)
    } catch (err) {
      setError('Failed to load platform health')
    } finally {
      setLoading(false)
    }
  }, [])

  if (loading && !data) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-gray-600" />
            <p className="mt-3 text-sm text-gray-500">Loading...</p>
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

  const statusConfig = {
    OPERATIONAL: { label: 'All systems operational', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', dot: 'bg-green-500' },
    DEGRADED: { label: 'Partial system degradation', color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', dot: 'bg-yellow-500' },
    IMPACTED: { label: 'Major system impact', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500' },
  }
  const status = statusConfig[data.overall_status]

  return (
    <div className="zord-page">
      {/* Page Header */}
      <div className="zord-page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="zord-page-title text-xl">Platform Health</h1>
            <p className="zord-page-subtitle">Real-time system status and metrics</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--zord-text-secondary)' }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--zord-status-healthy)' }} />
              <span>Updated {secondsAgo}s ago</span>
            </div>
            <button onClick={loadData} className="zord-btn zord-btn-secondary">
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Status Banner (AWS Alert Style) */}
        <div className={`${status.bg} ${status.border} border rounded px-4 py-3`}>
          <div className="flex items-center">
            <span className={`w-3 h-3 rounded-full ${status.dot} mr-3`} />
            <span className={`text-sm font-medium ${status.color}`}>{status.label}</span>
            <span className="mx-2 text-gray-300">|</span>
            <span className="text-sm text-gray-600">
              {data.events_per_hour.toLocaleString()} events/hr · {data.success_rate}% success · P95: {data.p95_latency}ms
            </span>
          </div>
        </div>

        {/* Top Metrics Row (Datadog Style) */}
        <div className="grid grid-cols-4 gap-4">
          {/* System Status Card */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <SectionHeader title="System Status" />
            <div className="divide-y divide-gray-100">
              {data.system_health.map((sys) => (
                <div key={sys.name} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center space-x-2">
                    <StatusIndicator status={sys.status} />
                    <span className="text-sm text-gray-700">{sys.display_name}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900 tabular-nums">
                    {sys.metric_value}{sys.metric_label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Throughput Card */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <SectionHeader title="Throughput" />
            <div className="grid grid-cols-2 divide-x divide-y divide-gray-100">
              <MetricTile label="Events/sec" value={data.golden_signals.traffic.events_per_second} status={data.golden_signals.traffic.status} small />
              <MetricTile label="P95 Latency" value={data.golden_signals.latency.p95_ms} unit="ms" status={data.golden_signals.latency.status} small />
              <MetricTile label="P99 Latency" value={data.golden_signals.latency.p99_ms} unit="ms" small />
              <MetricTile label="Backlog" value={data.golden_signals.traffic.backlog} trend={data.golden_signals.traffic.backlog_trend} small />
            </div>
          </div>

          {/* Errors Card */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <SectionHeader title="Errors & Failures" action={{ label: 'View DLQ', href: '/console/ingestion/dlq' }} />
            <div className="grid grid-cols-2 divide-x divide-y divide-gray-100">
              <MetricTile label="Error Rate" value={data.golden_signals.errors.rate_percent} unit="%" status={data.golden_signals.errors.status} small />
              <MetricTile label="DLQ Items" value={data.golden_signals.errors.dlq_count} small />
              <MetricTile label="Replayable" value={data.golden_signals.errors.replayable} small />
              <MetricTile label="Stuck" value={data.failures.stuck_events} status={data.failures.stuck_events > 0 ? 'critical' : 'healthy'} small />
            </div>
          </div>

          {/* Capacity Card */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <SectionHeader title="Capacity" />
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Saturation</span>
                <span className="text-sm font-medium text-gray-900">{data.golden_signals.saturation.capacity_percent}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${
                    data.golden_signals.saturation.capacity_percent > 80 ? 'bg-red-500' :
                    data.golden_signals.saturation.capacity_percent > 60 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${data.golden_signals.saturation.capacity_percent}%` }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                <span>Peak: {data.golden_signals.saturation.peak_percent}%</span>
                <span>Headroom: {100 - data.golden_signals.saturation.capacity_percent}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Service Health Section (Datadog Host Map Style) */}
        <div className="bg-white border border-gray-200 rounded shadow-sm">
          <SectionHeader title="Service Instances" action={{ label: 'View all services', href: '/console/infrastructure' }} />
          <div className="p-4">
            <div className="grid grid-cols-5 gap-3">
              {data.service_instances.map((instance) => (
                <HostMapCell
                  key={`${instance.service_name}-${instance.instance_id}`}
                  instance={instance}
                  onClick={() => router.push(instance.href)}
                />
              ))}
            </div>
            {/* Legend */}
            <div className="flex items-center space-x-6 mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center space-x-2 text-xs text-gray-500">
                <span className="w-3 h-3 bg-green-100 border border-green-200 rounded" />
                <span>Healthy</span>
              </div>
              <div className="flex items-center space-x-2 text-xs text-gray-500">
                <span className="w-3 h-3 bg-yellow-100 border border-yellow-200 rounded" />
                <span>Warning</span>
              </div>
              <div className="flex items-center space-x-2 text-xs text-gray-500">
                <span className="w-3 h-3 bg-red-100 border border-red-200 rounded" />
                <span>Critical</span>
              </div>
              <div className="flex-1" />
              <span className="text-xs text-gray-400">Click a tile for details</span>
            </div>
          </div>
        </div>

        {/* Time Series Charts Row */}
        <div className="grid grid-cols-2 gap-4">
          {/* Throughput Chart */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Events Throughput</h3>
                <p className="text-xs text-gray-500">Last 60 minutes</p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-semibold text-gray-900 tabular-nums">{data.golden_signals.traffic.events_per_second}</span>
                <span className="text-sm text-gray-500">e/s</span>
                <StatusIndicator status={data.golden_signals.traffic.status} size="md" />
              </div>
            </div>
            <div className="p-4">
              <TimeSeriesChart 
                title="Events/sec"
                data={generateMockData(data.golden_signals.traffic.events_per_second, 1.5, 60)}
                color="#10B981"
                fillColor="#D1FAE5"
                height={160}
                unit=""
              />
            </div>
          </div>

          {/* Latency Chart */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Response Latency (P95)</h3>
                <p className="text-xs text-gray-500">Last 60 minutes</p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-semibold text-gray-900 tabular-nums">{data.golden_signals.latency.p95_ms}</span>
                <span className="text-sm text-gray-500">ms</span>
                <StatusIndicator status={data.golden_signals.latency.status} size="md" />
              </div>
            </div>
            <div className="p-4">
              <TimeSeriesChart 
                title="Latency P95"
                data={generateMockData(data.golden_signals.latency.p95_ms, 50, 60)}
                color="#3B82F6"
                fillColor="#DBEAFE"
                height={160}
                unit="ms"
                showThreshold={true}
                threshold={500}
              />
            </div>
          </div>
        </div>

        {/* Error Rate Chart */}
        <div className="bg-white border border-gray-200 rounded shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Error Rate & DLQ</h3>
              <p className="text-xs text-gray-500">Last 60 minutes</p>
            </div>
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-1 bg-red-500 rounded" />
                <span className="text-sm text-gray-600">Error Rate:</span>
                <span className="text-lg font-semibold text-gray-900 tabular-nums">{data.golden_signals.errors.rate_percent}%</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-3 h-1 bg-amber-500 rounded" />
                <span className="text-sm text-gray-600">DLQ:</span>
                <span className="text-lg font-semibold text-gray-900 tabular-nums">{data.golden_signals.errors.dlq_count}</span>
              </div>
              <StatusIndicator status={data.golden_signals.errors.status} size="md" />
            </div>
          </div>
          <div className="p-4">
            <TimeSeriesChart 
              title="Error Rate"
              data={generateMockData(data.golden_signals.errors.rate_percent, 0.8, 60)}
              color="#EF4444"
              fillColor="#FEE2E2"
              height={140}
              unit="%"
              showThreshold={true}
              threshold={2}
            />
          </div>
        </div>

        {/* Bottom Row: Quick Links */}
        <div className="bg-white border border-gray-200 rounded shadow-sm">
          <SectionHeader title="Quick Actions" />
          <div className="p-4 flex items-center space-x-4">
            <Link href="/console/incidents" className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-colors">
              <svg className="w-4 h-4 mr-2 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Incidents ({data.incidents.count})
            </Link>
            <Link href="/console/ingestion/error-monitor" className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-colors">
              <svg className="w-4 h-4 mr-2 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Error Monitor
            </Link>
            <Link href="/console/ingestion/outbox-health" className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-colors">
              <svg className="w-4 h-4 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Outbox Health
            </Link>
            <Link href="/console/dashboards/tenant-health" className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-colors">
              <svg className="w-4 h-4 mr-2 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Tenant Health
            </Link>
            <Link href="/console/ingestion/evidence/integrity" className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-colors">
              <svg className="w-4 h-4 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Evidence Integrity
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PlatformHealthDashboard() {
  return (
    <Layout serviceName="Ops Ingestion" breadcrumbs={['Dashboards', 'Platform Health']}>
      <PlatformHealthContent />
    </Layout>
  )
}

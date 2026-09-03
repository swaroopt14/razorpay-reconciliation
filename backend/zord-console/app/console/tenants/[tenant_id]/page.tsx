'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated } from '@/services/auth'
import { Layout } from '@/components/aws/Layout'
import { TenantPlatformResponse, MonitorStatus, TenantStatus } from '@/types/tenant-platform'

// Sparkline (colored)
function Sparkline({ data, color = 'var(--zord-status-neutral)' }: { data: number[]; color?: string }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const width = 100
  const height = 32
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - 4 - ((v - min) / range) * (height - 8)
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={width} height={height}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Donut chart (colored)
function DonutChart({ data, centerValue, size = 100 }: { 
  data: { label: string; value: number; color: string }[]
  centerValue: string | number
  size?: number 
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const radius = size / 2 - 12
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="flex items-center space-x-4">
      <svg width={size} height={size} className="transform -rotate-90">
        {data.map((segment, i) => {
          const percent = total > 0 ? segment.value / total : 0
          const strokeDasharray = `${circumference * percent} ${circumference * (1 - percent)}`
          const strokeDashoffset = -offset * circumference
          offset += percent
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={14}
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
            />
          )
        })}
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="middle" 
          className="text-lg font-semibold" fill="var(--zord-text-primary)" style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}>
          {centerValue}
        </text>
      </svg>
      <div className="space-y-1">
        {data.map((segment, i) => (
          <div key={i} className="flex items-center text-xs">
            <span className="w-2.5 h-2.5 rounded-sm mr-2" style={{ backgroundColor: segment.color }} />
            <span style={{ color: 'var(--zord-text-secondary)' }} className="w-14">{segment.label}</span>
            <span style={{ color: 'var(--zord-text-primary)' }} className="font-medium tabular-nums">{segment.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TenantPlatformContent() {
  const router = useRouter()
  const params = useParams()
  const tenantId = params.tenant_id as string

  const [data, setData] = useState<TenantPlatformResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    loadData()
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [router, tenantId])

  const loadData = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch(`/api/prod/tenants/${tenantId}`)
      if (!response.ok) throw new Error('Failed to load')
      const result: TenantPlatformResponse = await response.json()
      setData(result)
    } catch (err) {
      setError('Failed to load tenant data')
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  const getStatusDotClass = (status: TenantStatus): string => {
    if (status === 'HEALTHY') return 'zord-status-dot-healthy'
    if (status === 'AT_RISK') return 'zord-status-dot-warning'
    return 'zord-status-dot-critical'
  }

  const getMonitorBadgeClass = (status: MonitorStatus): string => {
    if (status === 'OK') return 'zord-monitor-ok'
    if (status === 'WARNING') return 'zord-monitor-warning'
    return 'zord-monitor-critical'
  }

  const genSparkline = (base: number, variance: number = 10) => 
    Array.from({ length: 12 }, () => base + (Math.random() - 0.5) * variance)

  if (loading && !data) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-gray-600" />
            <p className="mt-3 text-sm" style={{ color: 'var(--zord-text-secondary)' }}>Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="zord-card p-6 text-center">
          <p style={{ color: 'var(--zord-text-secondary)' }} className="mb-4">{error || 'Failed to load'}</p>
          <button onClick={loadData} className="zord-btn zord-btn-secondary">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="zord-page">
      {/* Header */}
      <div className="zord-page-header">
        <div className="flex items-center space-x-2 text-sm mb-2" style={{ color: 'var(--zord-text-secondary)' }}>
          <Link href="/console/tenants" className="zord-link">Tenants</Link>
          <span>/</span>
          <span style={{ color: 'var(--zord-text-primary)' }}>{data.identity.display_name}</span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="zord-page-title text-xl">{data.identity.display_name}</h1>
              <span className={`zord-status-dot ${getStatusDotClass(data.status.overall)}`} style={{ width: '10px', height: '10px' }} />
            </div>
            <div className="mt-1 text-sm space-x-3" style={{ color: 'var(--zord-text-secondary)' }}>
              <span className="font-mono">{data.identity.tenant_id}</span>
              <span>·</span>
              <span>{data.identity.environment}</span>
              <span>·</span>
              <span>{data.identity.region}</span>
              <span>·</span>
              <span>{data.identity.tier}</span>
            </div>
          </div>
          <div className="text-right text-sm">
            <div style={{ color: 'var(--zord-text-secondary)' }}>
              {data.status.overall === 'HEALTHY' ? 'Healthy' : data.status.overall === 'AT_RISK' ? 'At risk' : 'Impacted'}
            </div>
            {data.status.primary_issue && (
              <div className="mt-0.5" style={{ color: 'var(--zord-text-primary)' }}>{data.status.primary_issue}</div>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Overview Row */}
        <div className="grid grid-cols-3 gap-6">
          {/* Transactions Summary */}
          <div className="zord-card">
            <div className="zord-card-header">
              <h2 className="zord-card-title">Transactions (24h)</h2>
            </div>
            <div className="zord-card-body">
              <DonutChart 
                data={[
                  { label: 'Success', value: data.transactions.successful, color: 'var(--zord-status-healthy)' },
                  { label: 'Failed', value: data.transactions.failed, color: 'var(--zord-status-critical)' },
                ]}
                centerValue={data.transactions.total}
              />
            </div>
          </div>

          {/* Key Metrics */}
          <div className="zord-card">
            <div className="zord-card-header">
              <h2 className="zord-card-title">Key metrics</h2>
            </div>
            <div className="zord-card-body space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--zord-text-secondary)' }}>Success rate</span>
                <div className="flex items-center space-x-3">
                  <Sparkline 
                    data={genSparkline(data.reliability.success_rate_percent, 5)} 
                    color={data.reliability.success_rate_percent >= 95 ? 'var(--zord-status-healthy)' : 'var(--zord-status-critical)'} 
                  />
                  <span className="text-sm font-medium w-12 text-right tabular-nums" style={{ color: 'var(--zord-text-primary)' }}>
                    {data.reliability.success_rate_percent}%
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--zord-text-secondary)' }}>DLQ items</span>
                <div className="flex items-center space-x-3">
                  <Sparkline 
                    data={genSparkline(data.reliability.dlq_items_24h, data.reliability.dlq_items_24h * 0.5)} 
                    color={data.reliability.dlq_items_24h > 10 ? 'var(--zord-status-critical)' : 'var(--zord-status-neutral)'} 
                  />
                  <span className="text-sm font-medium w-12 text-right tabular-nums" style={{ color: 'var(--zord-text-primary)' }}>
                    {data.reliability.dlq_items_24h}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--zord-text-secondary)' }}>Failed intents</span>
                <div className="flex items-center space-x-3">
                  <Sparkline 
                    data={genSparkline(data.reliability.failed_intents_24h, data.reliability.failed_intents_24h * 0.3)} 
                    color="var(--zord-status-neutral)" 
                  />
                  <span className="text-sm font-medium w-12 text-right tabular-nums" style={{ color: 'var(--zord-text-primary)' }}>
                    {data.reliability.failed_intents_24h}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Monitors */}
          <div className="zord-card">
            <div className="zord-card-header">
              <h2 className="zord-card-title">Monitors</h2>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--zord-border-secondary)' }}>
              {data.monitors.slice(0, 4).map((monitor, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-sm truncate pr-4" style={{ color: 'var(--zord-text-primary)' }}>{monitor.name}</span>
                  <span className={`zord-monitor-badge ${getMonitorBadgeClass(monitor.status)}`}>{monitor.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Usage & Reliability */}
        <div className="grid grid-cols-2 gap-6">
          {/* Usage */}
          <div className="zord-card">
            <div className="zord-card-header">
              <h2 className="zord-card-title">Usage (24h)</h2>
            </div>
            <div className="zord-card-body">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="zord-metric-label">API calls</div>
                  <div className="text-xl font-semibold mt-0.5 tabular-nums" style={{ color: 'var(--zord-text-primary)' }}>
                    {data.usage.api_calls_24h.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="zord-metric-label">Webhooks</div>
                  <div className="text-xl font-semibold mt-0.5 tabular-nums" style={{ color: 'var(--zord-text-primary)' }}>
                    {data.usage.webhooks_24h.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="zord-metric-label">Streams</div>
                  <div className="text-xl font-semibold mt-0.5 tabular-nums" style={{ color: 'var(--zord-text-primary)' }}>
                    {data.usage.streams_24h.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="zord-metric-label">Batch rows</div>
                  <div className="text-xl font-semibold mt-0.5 tabular-nums" style={{ color: 'var(--zord-text-primary)' }}>
                    {data.usage.batch_rows_24h.toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="space-y-3 pt-4 border-t" style={{ borderColor: 'var(--zord-border-secondary)' }}>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: 'var(--zord-text-secondary)' }}>API quota</span>
                    <span style={{ color: 'var(--zord-text-primary)' }}>{data.usage.api_quota_percent}%</span>
                  </div>
                  <div className="zord-progress">
                    <div 
                      className={`zord-progress-bar ${data.usage.api_quota_percent > 80 ? 'zord-progress-critical' : data.usage.api_quota_percent > 60 ? 'zord-progress-warning' : 'zord-progress-healthy'}`}
                      style={{ width: `${data.usage.api_quota_percent}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: 'var(--zord-text-secondary)' }}>Webhook quota</span>
                    <span style={{ color: 'var(--zord-text-primary)' }}>{data.usage.webhook_quota_percent}%</span>
                  </div>
                  <div className="zord-progress">
                    <div 
                      className={`zord-progress-bar ${data.usage.webhook_quota_percent > 80 ? 'zord-progress-critical' : data.usage.webhook_quota_percent > 60 ? 'zord-progress-warning' : 'zord-progress-healthy'}`}
                      style={{ width: `${data.usage.webhook_quota_percent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Reliability */}
          <div className="zord-card">
            <div className="zord-card-header">
              <h2 className="zord-card-title">Reliability</h2>
            </div>
            <div className="zord-card-body">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="zord-metric-label">Success rate</div>
                  <div className="text-xl font-semibold mt-0.5 tabular-nums" style={{ color: 'var(--zord-text-primary)' }}>
                    {data.reliability.success_rate_percent}%
                  </div>
                </div>
                <div>
                  <div className="zord-metric-label">Replayable</div>
                  <div className="text-xl font-semibold mt-0.5 tabular-nums" style={{ color: 'var(--zord-text-primary)' }}>
                    {data.reliability.replayable_24h}
                  </div>
                </div>
              </div>
              {data.reliability.top_failures.length > 0 && (
                <div className="pt-4 border-t" style={{ borderColor: 'var(--zord-border-secondary)' }}>
                  <div className="zord-metric-label mb-2">Top failure reasons</div>
                  <div className="space-y-2">
                    {data.reliability.top_failures.map((failure, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span style={{ color: 'var(--zord-text-primary)' }}>{failure.reason}</span>
                        <span className="font-medium tabular-nums" style={{ color: 'var(--zord-text-primary)' }}>{failure.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Evidence & Activity */}
        <div className="grid grid-cols-2 gap-6">
          {/* Evidence */}
          <div className="zord-card">
            <div className="zord-card-header">
              <h2 className="zord-card-title">Evidence & Compliance</h2>
            </div>
            <div className="zord-card-body">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="zord-metric-label">Coverage</div>
                  <div className="text-xl font-semibold mt-0.5 tabular-nums" style={{ color: 'var(--zord-text-primary)' }}>
                    {data.evidence.coverage_percent}%
                  </div>
                </div>
                <div>
                  <div className="zord-metric-label">Hash chain</div>
                  <div className="text-xl font-semibold mt-0.5 flex items-center" style={{ color: 'var(--zord-text-primary)' }}>
                    <span className="zord-status-dot zord-status-dot-healthy mr-2" />
                    {data.evidence.hash_chain_status}
                  </div>
                </div>
                <div>
                  <div className="zord-metric-label">Retention</div>
                  <div className="text-xl font-semibold mt-0.5" style={{ color: 'var(--zord-text-primary)' }}>
                    {data.evidence.retention_years} years
                  </div>
                </div>
                <div>
                  <div className="zord-metric-label">Last verified</div>
                  <div className="text-xl font-semibold mt-0.5" style={{ color: 'var(--zord-text-primary)' }}>
                    {data.evidence.last_verification_minutes_ago}m ago
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="zord-card">
            <div className="zord-card-header">
              <h2 className="zord-card-title">Recent activity</h2>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--zord-border-secondary)' }}>
              {data.recent_activity.slice(0, 5).map((event, i) => (
                <div key={i} className="px-4 py-2.5 flex items-start space-x-3">
                  <span className={`zord-status-dot mt-1.5 ${
                    event.type === 'error' ? 'zord-status-dot-critical' : 
                    event.type === 'warning' ? 'zord-status-dot-warning' : 'zord-status-dot-healthy'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm" style={{ color: 'var(--zord-text-primary)' }}>{event.message}</div>
                    <div className="text-xs" style={{ color: 'var(--zord-text-tertiary)' }}>
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Links */}
        <div className="flex items-center space-x-4 text-sm">
          <Link href={`/console/tenants/${tenantId}/incidents`} className="zord-link">Tenant incidents</Link>
          <span style={{ color: 'var(--zord-text-muted)' }}>|</span>
          <Link href={`/console/ingestion/dlq?tenant=${tenantId}`} className="zord-link">DLQ (tenant)</Link>
          <span style={{ color: 'var(--zord-text-muted)' }}>|</span>
          <Link href={`/console/ingestion/event-graph?tenant=${tenantId}`} className="zord-link">Event graph</Link>
          <span style={{ color: 'var(--zord-text-muted)' }}>|</span>
          <Link href="/console/ingestion/evidence/integrity" className="zord-link">Evidence integrity</Link>
        </div>
      </div>
    </div>
  )
}

export default function TenantPlatformPage() {
  return (
    <Layout serviceName="Ops Ingestion" breadcrumbs={['Tenants', 'Tenant Platform']}>
      <TenantPlatformContent />
    </Layout>
  )
}

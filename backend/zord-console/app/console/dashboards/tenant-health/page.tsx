'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated } from '@/services/auth'
import { Layout } from '@/components/aws/Layout'
import { 
  TenantHealthResponse, 
  TenantStatus,
} from '@/types/tenant-health'

// Sparkline chart (colored)
function Sparkline({ data, status }: { data: number[]; status: TenantStatus }) {
  if (data.length < 2) return null
  const colors = {
    HEALTHY: 'var(--zord-status-healthy)',
    AT_RISK: 'var(--zord-status-warning)',
    IMPACTED: 'var(--zord-status-critical)',
  }
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const width = 80
  const height = 24
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - 2 - ((v - min) / range) * (height - 4)
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={points} fill="none" stroke={colors[status]} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Distribution bar (colored)
function DistributionBar({ healthy, atRisk, impacted }: { healthy: number; atRisk: number; impacted: number }) {
  const total = healthy + atRisk + impacted
  if (total === 0) return null
  
  return (
    <div className="zord-progress h-2">
      <div className="flex h-full">
        <div className="zord-progress-healthy" style={{ width: `${(healthy / total) * 100}%` }} />
        <div className="zord-progress-warning" style={{ width: `${(atRisk / total) * 100}%` }} />
        <div className="zord-progress-critical" style={{ width: `${(impacted / total) * 100}%` }} />
      </div>
    </div>
  )
}

function TenantHealthContent() {
  const router = useRouter()
  const [data, setData] = useState<TenantHealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<TenantStatus | 'ALL'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [lastUpdated, setLastUpdated] = useState(0)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    loadData()
    const interval = setInterval(loadData, 15000)
    const ticker = setInterval(() => setLastUpdated(prev => prev + 1), 1000)
    return () => {
      clearInterval(interval)
      clearInterval(ticker)
    }
  }, [router])

  const loadData = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch('/api/prod/tenant-health')
      if (!response.ok) throw new Error('Failed to load')
      const result: TenantHealthResponse = await response.json()
      setData(result)
      setLastUpdated(0)
    } catch (err) {
      setError('Failed to load tenant health')
    } finally {
      setLoading(false)
    }
  }, [])

  const filteredTenants = useMemo(() => {
    if (!data) return []
    return data.all_tenants.filter(t => {
      const matchesSearch = searchQuery === '' || t.tenant_name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [data, searchQuery, statusFilter])

  const getSparklineData = useCallback((tenantId: string, baseRate: number) => {
    const seed = tenantId.split('').reduce((a, b) => a + b.charCodeAt(0), 0)
    return Array.from({ length: 12 }, (_, i) => {
      const variation = Math.sin(seed + i) * 5 + Math.cos(seed * i) * 3
      return Math.max(0, Math.min(100, baseRate + variation))
    })
  }, [])

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="zord-page-title">Tenant Health</h1>
            <p className="zord-page-subtitle">Operational health across all tenants</p>
          </div>
          <div className="flex items-center space-x-3 text-sm" style={{ color: 'var(--zord-text-secondary)' }}>
            <span>Last updated {lastUpdated}s ago</span>
            <button onClick={loadData} className="zord-btn zord-btn-secondary">Refresh</button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Summary Row */}
        <div className="zord-card">
          <div className="zord-card-header">
            <h2 className="zord-card-title">Summary</h2>
          </div>
          <div className="zord-card-body">
            <div className="grid grid-cols-5 gap-6">
              <div>
                <div className="zord-metric-label">Total tenants</div>
                <div className="zord-metric-value mt-1">{data.summary.total}</div>
              </div>
              <div>
                <div className="zord-metric-label flex items-center">
                  <span className="zord-status-dot zord-status-dot-healthy mr-1.5" />
                  Healthy
                </div>
                <div className="zord-metric-value mt-1">{data.summary.healthy}</div>
              </div>
              <div>
                <div className="zord-metric-label flex items-center">
                  <span className="zord-status-dot zord-status-dot-warning mr-1.5" />
                  At risk
                </div>
                <div className="zord-metric-value mt-1">{data.summary.at_risk}</div>
              </div>
              <div>
                <div className="zord-metric-label flex items-center">
                  <span className="zord-status-dot zord-status-dot-critical mr-1.5" />
                  Impacted
                </div>
                <div className="zord-metric-value mt-1">{data.summary.impacted}</div>
              </div>
              <div>
                <div className="zord-metric-label mb-2">Distribution</div>
                <DistributionBar 
                  healthy={data.summary.healthy} 
                  atRisk={data.summary.at_risk} 
                  impacted={data.summary.impacted} 
                />
                <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--zord-text-tertiary)' }}>
                  <span>{Math.round((data.summary.healthy / data.summary.total) * 100)}%</span>
                  <span>{Math.round((data.summary.impacted / data.summary.total) * 100)}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* At Risk Section */}
        {data.at_risk_tenants.length > 0 && (
          <div className="zord-card">
            <div className="zord-card-header flex items-center justify-between">
              <h2 className="zord-card-title">Tenants requiring attention ({data.at_risk_tenants.length})</h2>
              <Link href="/console/tenants?status=at_risk" className="zord-link text-sm">View all</Link>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--zord-border-secondary)' }}>
              {data.at_risk_tenants.slice(0, 5).map((tenant) => (
                <div 
                  key={tenant.tenant_id}
                  className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/console/tenants/${tenant.tenant_id}`)}
                >
                  <div className="flex items-center space-x-3">
                    <span className={`zord-status-dot ${tenant.status === 'IMPACTED' ? 'zord-status-dot-critical' : 'zord-status-dot-warning'}`} />
                    <div>
                      <div className="text-sm font-medium" style={{ color: 'var(--zord-text-primary)' }}>{tenant.tenant_name}</div>
                      <div className="text-xs" style={{ color: 'var(--zord-text-secondary)' }}>{tenant.primary_issue}</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-8 text-sm">
                    <div className="text-right">
                      <div className="font-medium" style={{ color: 'var(--zord-text-primary)' }}>{tenant.success_rate}%</div>
                      <div className="text-xs" style={{ color: 'var(--zord-text-secondary)' }}>Success</div>
                    </div>
                    {tenant.dlq_count !== undefined && tenant.dlq_count > 0 && (
                      <div className="text-right">
                        <div className="font-medium" style={{ color: 'var(--zord-text-primary)' }}>{tenant.dlq_count}</div>
                        <div className="text-xs" style={{ color: 'var(--zord-text-secondary)' }}>DLQ</div>
                      </div>
                    )}
                    <svg className="w-4 h-4" style={{ color: 'var(--zord-text-tertiary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All Tenants */}
        <div className="zord-card">
          <div className="zord-card-header flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h2 className="zord-card-title">All tenants</h2>
              <div className="flex items-center space-x-1 text-sm">
                {(['ALL', 'HEALTHY', 'AT_RISK', 'IMPACTED'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      statusFilter === status 
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {status === 'ALL' ? 'All' : status === 'AT_RISK' ? 'At risk' : status.charAt(0) + status.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="zord-input w-48"
            />
          </div>
          <table className="zord-table">
            <thead>
              <tr>
                <th className="w-8"></th>
                <th>Tenant</th>
                <th>Status</th>
                <th>Success rate</th>
                <th>Volume (24h)</th>
                <th>Last issue</th>
                <th className="w-24">Trend</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filteredTenants.map((tenant) => (
                <tr 
                  key={tenant.tenant_id}
                  className={`cursor-pointer ${tenant.status === 'IMPACTED' ? 'zord-row-critical' : tenant.status === 'AT_RISK' ? 'zord-row-warning' : ''}`}
                  onClick={() => router.push(`/console/tenants/${tenant.tenant_id}`)}
                >
                  <td>
                    <span className={`zord-status-dot ${
                      tenant.status === 'HEALTHY' ? 'zord-status-dot-healthy' : 
                      tenant.status === 'AT_RISK' ? 'zord-status-dot-warning' : 'zord-status-dot-critical'
                    }`} />
                  </td>
                  <td>
                    <div className="font-medium">{tenant.tenant_name}</div>
                    <div className="text-xs font-mono" style={{ color: 'var(--zord-text-tertiary)' }}>{tenant.tenant_id}</div>
                  </td>
                  <td style={{ color: 'var(--zord-text-secondary)' }}>
                    {tenant.status === 'AT_RISK' ? 'At risk' : tenant.status.charAt(0) + tenant.status.slice(1).toLowerCase()}
                  </td>
                  <td className="font-medium tabular-nums">{tenant.success_rate}%</td>
                  <td className="tabular-nums" style={{ color: 'var(--zord-text-secondary)' }}>{tenant.volume_24h.toLocaleString()}</td>
                  <td style={{ color: 'var(--zord-text-secondary)' }}>{tenant.last_issue_ago || '-'}</td>
                  <td>
                    <Sparkline data={getSparklineData(tenant.tenant_id, tenant.success_rate)} status={tenant.status} />
                  </td>
                  <td className="text-right">
                    <span className="zord-link text-sm">View</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTenants.length === 0 && (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--zord-text-secondary)' }}>
              No tenants found
            </div>
          )}
          <div className="px-4 py-3 border-t text-sm" style={{ borderColor: 'var(--zord-border-primary)', color: 'var(--zord-text-secondary)' }}>
            Showing {filteredTenants.length} of {data.summary.total} tenants
          </div>
        </div>

        {/* Links */}
        <div className="flex items-center space-x-4 text-sm">
          <Link href="/console/incidents" className="zord-link">Incidents</Link>
          <span style={{ color: 'var(--zord-text-muted)' }}>|</span>
          <Link href="/console/ingestion/dlq" className="zord-link">DLQ Monitor</Link>
          <span style={{ color: 'var(--zord-text-muted)' }}>|</span>
          <Link href="/console/ingestion/error-monitor" className="zord-link">Error Monitor</Link>
          <span style={{ color: 'var(--zord-text-muted)' }}>|</span>
          <Link href="/console/tenants" className="zord-link">Tenant Directory</Link>
        </div>
      </div>
    </div>
  )
}

export default function TenantHealthDashboard() {
  return (
    <Layout serviceName="Ops Ingestion" breadcrumbs={['Dashboards', 'Tenant Health']}>
      <TenantHealthContent />
    </Layout>
  )
}

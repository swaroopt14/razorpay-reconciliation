'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'

interface DLQItem {
  dlq_id: string
  tenant_id: string
  envelope_id: string
  stage: string
  reason_code: string
  error_detail?: string
  replayable: boolean
  created_at: string
}

function StageBadge({ stage }: { stage: string }) {
  const styles: Record<string, string> = {
    SEMANTIC_VALIDATION: 'bg-red-100 text-red-800',
    CANONICALIZATION: 'bg-orange-100 text-orange-800',
    EVENT_PUBLISH: 'bg-purple-100 text-purple-800',
    PARSING: 'bg-yellow-100 text-yellow-800',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[stage] || 'bg-gray-100 text-gray-800'}`}>
      {stage}
    </span>
  )
}

export default function DLQPage() {
  const router = useRouter()
  const [items, setItems] = useState<DLQItem[]>([])
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
      const response = await fetch('/api/prod/dlq')
      if (!response.ok) throw new Error('Failed to load')
      const result = await response.json()
      setItems(result.items || [])
      setLastRefresh(new Date())
    } catch (err) {
      setError('Failed to load DLQ data')
    } finally {
      setLoading(false)
    }
  }

  const user = getCurrentUser()

  const stats = {
    total: items.length,
    replayable: items.filter(i => i.replayable).length,
    nonReplayable: items.filter(i => !i.replayable).length,
  }

  // Compute top reasons
  const reasonCounts: Record<string, number> = {}
  items.forEach(i => {
    const key = i.reason_code || 'UNKNOWN'
    reasonCounts[key] = (reasonCounts[key] || 0) + 1
  })
  const topReasons = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count, percent: items.length > 0 ? Math.round((count / items.length) * 100) : 0 }))

  // Compute by stage
  const stageCounts: Record<string, number> = {}
  items.forEach(i => {
    const key = i.stage || 'UNKNOWN'
    stageCounts[key] = (stageCounts[key] || 0) + 1
  })
  const byStage = Object.entries(stageCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([stage, count]) => ({ stage, count, percent: items.length > 0 ? Math.round((count / items.length) * 100) : 0 }))

  if (loading && items.length === 0) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={['Validation & Safety', 'DLQ (Failures)']} tenant={user?.tenant}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading DLQ data...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error && items.length === 0) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={['Validation & Safety', 'DLQ (Failures)']} tenant={user?.tenant}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white border border-red-200 rounded p-6 text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <button onClick={loadData} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700">Retry</button>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout serviceName="Ingestion" breadcrumbs={['Validation & Safety', 'DLQ (Failures)']} tenant={user?.tenant}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-semibold text-gray-900">DLQ (Failures)</h1>
              <span className="text-sm text-gray-500">{stats.total} Total</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">Real-time Dead Letter Queue from zord-intent-engine</p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-xs text-gray-500">Updated: {format(lastRefresh, 'HH:mm:ss')}</span>
            <button onClick={loadData} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Refresh</button>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* DLQ Overview */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">DLQ Overview</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="text-center p-4 bg-gray-50 rounded border border-gray-200">
                  <div className="text-3xl font-semibold text-gray-900">{stats.total}</div>
                  <div className="text-xs text-gray-500">Total Failures</div>
                </div>
                <div className="grid grid-rows-2 gap-2">
                  <div className="text-center p-2 bg-yellow-50 rounded border border-yellow-200">
                    <div className="text-xl font-semibold text-yellow-700">{stats.replayable}</div>
                    <div className="text-xs text-gray-500">Replayable</div>
                  </div>
                  <div className="text-center p-2 bg-red-50 rounded border border-red-200">
                    <div className="text-xl font-semibold text-red-700">{stats.nonReplayable}</div>
                    <div className="text-xs text-gray-500">Non-replayable</div>
                  </div>
                </div>
              </div>
              
              <div className="border-t border-gray-200 pt-4">
                <div className="text-xs font-medium text-gray-500 uppercase mb-3">Top Reasons</div>
                {topReasons.map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-gray-700">{r.reason}</span>
                    <span className="text-sm text-gray-600">{r.count} ({r.percent}%)</span>
                  </div>
                ))}
                {topReasons.length === 0 && <p className="text-sm text-gray-500">No failures yet</p>}
              </div>
            </div>
          </div>

          {/* By Stage */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">By Stage</h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {byStage.map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                    <div className="flex items-center space-x-3">
                      <StageBadge stage={s.stage} />
                      <span className="text-sm font-medium text-gray-900">{s.count}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-red-400 rounded-full" style={{ width: `${s.percent}%` }}></div>
                      </div>
                      <span className="text-sm text-gray-600">{s.percent}%</span>
                    </div>
                  </div>
                ))}
                {byStage.length === 0 && <p className="text-sm text-gray-500">No failures yet</p>}
              </div>
            </div>
          </div>
        </div>

        {/* All DLQ Items */}
        <div className="bg-white border border-gray-200 rounded shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-900">All DLQ Items</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">DLQ ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stage</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Error Detail</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Replay</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {items.map((item, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link href={`/console/ingestion/dlq/${item.dlq_id}`} className="text-sm font-mono text-blue-600 hover:text-blue-800">
                        {item.dlq_id.substring(0, 12)}...
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StageBadge stage={item.stage} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{item.reason_code}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 max-w-xs truncate" title={item.error_detail}>{item.error_detail || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">
                      {item.tenant_id ? item.tenant_id.substring(0, 8) + '...' : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {format(new Date(item.created_at), 'yyyy-MM-dd HH:mm')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {item.replayable ? (
                        <span className="text-xs font-medium text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded">Replayable</span>
                      ) : (
                        <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded">No</span>
                      )}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">No DLQ items found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  )
}

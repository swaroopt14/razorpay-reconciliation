'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'

interface RecentGraph {
  root_id: string
  root_type: 'ENVELOPE' | 'INTENT' | 'BATCH'
  tenant_name: string
  status: 'COMPLETED' | 'FAILED' | 'IN_PROGRESS'
  nodes_count: number
  duration_ms: number
  created_at: string
}

// Generate mock recent graphs
function generateMockRecentGraphs(): RecentGraph[] {
  const now = new Date()
  const graphs: RecentGraph[] = []
  
  for (let i = 0; i < 20; i++) {
    const date = new Date(now.getTime() - Math.random() * 86400000 * 3) // Last 3 days
    const types: ('ENVELOPE' | 'INTENT' | 'BATCH')[] = ['ENVELOPE', 'INTENT', 'BATCH']
    const type = types[Math.floor(Math.random() * types.length)]
    const statuses: ('COMPLETED' | 'FAILED' | 'IN_PROGRESS')[] = ['COMPLETED', 'COMPLETED', 'COMPLETED', 'FAILED', 'IN_PROGRESS']
    
    let rootId: string
    if (type === 'ENVELOPE') {
      rootId = `env_${date.toISOString().replace(/[-:.]/g, '').substring(0, 15)}Z_${Math.random().toString(36).substring(2, 6)}`
    } else if (type === 'INTENT') {
      rootId = `pi_${date.toISOString().split('T')[0].replace(/-/g, '')}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`
    } else {
      rootId = `batch_${date.toISOString().split('T')[0].replace(/-/g, '')}_${Math.random().toString(36).substring(2, 6)}`
    }
    
    graphs.push({
      root_id: rootId,
      root_type: type,
      tenant_name: ['acme_nbfc', 'fintech_corp', 'payment_gateway_inc'][Math.floor(Math.random() * 3)],
      status: statuses[Math.floor(Math.random() * statuses.length)],
      nodes_count: Math.floor(Math.random() * 10) + 3,
      duration_ms: Math.floor(Math.random() * 2000) + 20,
      created_at: date.toISOString(),
    })
  }
  
  return graphs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'COMPLETED':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">
          COMPLETED
        </span>
      )
    case 'FAILED':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200">
          FAILED
        </span>
      )
    case 'IN_PROGRESS':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
          IN PROGRESS
        </span>
      )
    default:
      return null
  }
}

function getRootTypeBadge(type: string) {
  switch (type) {
    case 'ENVELOPE':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
          Envelope
        </span>
      )
    case 'INTENT':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
          Intent
        </span>
      )
    case 'BATCH':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-cyan-50 text-cyan-700 border border-cyan-200">
          Batch
        </span>
      )
    default:
      return null
  }
}

export default function EventGraphListPage() {
  const router = useRouter()
  const [searchId, setSearchId] = useState('')
  const [recentGraphs, setRecentGraphs] = useState<RecentGraph[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    // Simulate loading
    setTimeout(() => {
      setRecentGraphs(generateMockRecentGraphs())
      setLoading(false)
    }, 500)
  }, [router])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchId.trim()) {
      router.push(`/console/ingestion/event-graph/${encodeURIComponent(searchId.trim())}`)
    }
  }

  const filteredGraphs = recentGraphs.filter(g => {
    if (typeFilter !== 'all' && g.root_type !== typeFilter) return false
    if (statusFilter !== 'all' && g.status !== statusFilter) return false
    return true
  })

  const user = getCurrentUser()

  return (
    <Layout
      serviceName="Ingestion"
      breadcrumbs={['Event Graph']}
      tenant={user?.tenant}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Event Graph</h1>
          <p className="mt-1 text-sm text-gray-600">
            TradingView-style causality and provenance visualization. Search by envelope, intent, or batch ID.
          </p>
        </div>

        {/* Search Card */}
        <div className="bg-white border border-gray-200 rounded shadow-sm mb-6">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-medium text-gray-900">Search Event Graph</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Enter an envelope ID, intent ID, or batch ID to visualize the event timeline
            </p>
          </div>
          <div className="p-6">
            <form onSubmit={handleSearch} className="flex gap-4">
              <div className="flex-1">
                <label htmlFor="root-id" className="sr-only">Root ID</label>
                <input
                  type="text"
                  id="root-id"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  placeholder="e.g., env_20260113T122911Z_twyh or pi_20260115_91XK"
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={!searchId.trim()}
                className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>View Graph</span>
              </button>
            </form>

            <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
              <span>Quick access:</span>
              <button
                onClick={() => router.push('/console/ingestion/event-graph/env_20260113T122911Z_twyh')}
                className="text-blue-600 hover:text-blue-800 font-mono"
              >
                env_20260113T122911Z_twyh (failed)
              </button>
              <button
                onClick={() => router.push('/console/ingestion/event-graph/pi_20260115_91XK')}
                className="text-blue-600 hover:text-blue-800 font-mono"
              >
                pi_20260115_91XK (success)
              </button>
            </div>
          </div>
        </div>

        {/* Recent Graphs */}
        <div className="bg-white border border-gray-200 rounded shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-gray-900">Recent Event Graphs</h2>
              <p className="text-xs text-gray-500 mt-0.5">Last 3 days of ingestion activity</p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Types</option>
                <option value="ENVELOPE">Envelopes</option>
                <option value="INTENT">Intents</option>
                <option value="BATCH">Batches</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="COMPLETED">Completed</option>
                <option value="FAILED">Failed</option>
                <option value="IN_PROGRESS">In Progress</option>
              </select>
            </div>
          </div>
          
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading recent graphs...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Root ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nodes</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredGraphs.map((graph, i) => (
                    <tr
                      key={i}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/console/ingestion/event-graph/${encodeURIComponent(graph.root_id)}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-mono text-sm text-blue-600 hover:text-blue-800">
                          {graph.root_id}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getRootTypeBadge(graph.root_type)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {graph.tenant_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(graph.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {graph.nodes_count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-mono">
                        {graph.duration_ms >= 1000 
                          ? `${(graph.duration_ms / 1000).toFixed(2)}s`
                          : `${graph.duration_ms}ms`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(graph.created_at), 'MMM d, HH:mm')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Info Card */}
        <div className="mt-6 bg-gray-900 border border-gray-700 rounded shadow-sm p-4">
          <div className="flex items-start space-x-3">
            <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm text-gray-300">
                <span className="text-white font-medium">Event Graph</span> visualizes the complete causality chain for any object in Zord.
                Track how envelopes become intents, which services touched them, where failures occurred, and what evidence was generated.
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Inspired by AWS X-Ray distributed tracing + TradingView stock charts + Bloomberg Terminal event overlays.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

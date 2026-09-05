'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'
import { ConsumerGroupDetail, ConsumerStatus } from '@/types/stream-consumer'

export default function ConsumerGroupDetailPage() {
  const router = useRouter()
  const params = useParams()
  const consumerGroup = params?.consumer_group as string
  const [detail, setDetail] = useState<ConsumerGroupDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chartsExpanded, setChartsExpanded] = useState(false)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    if (consumerGroup) {
      loadDetail()
    }
  }, [consumerGroup, router])

  const loadDetail = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/prod/stream-consumers/${encodeURIComponent(consumerGroup)}`)
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError('Access denied')
          return
        } else if (response.status === 404) {
          setError('Consumer group not found')
          return
        } else if (response.status >= 500) {
          setError('System error - try later')
          return
        } else {
          const errorData = await response.json().catch(() => ({}))
          setError(errorData.error || 'Failed to fetch consumer group details')
          return
        }
      }
      
      const data: ConsumerGroupDetail = await response.json()
      setDetail(data)
    } catch (err) {
      console.error('Failed to load consumer group detail:', err)
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setError('Network error - check your connection and try again')
      } else {
        setError('Failed to load consumer group details')
      }
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: ConsumerStatus) => {
    const styles: Record<ConsumerStatus, string> = {
      RUNNING: 'bg-green-50 text-green-800 border-green-300',
      DEGRADED: 'bg-yellow-50 text-yellow-800 border-yellow-300',
      STALLED: 'bg-red-50 text-red-800 border-red-300',
    }
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded border text-xs font-medium ${styles[status]}`}>
        {status}
      </span>
    )
  }

  const getPartitionStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      OK: 'bg-green-50 text-green-800 border-green-300',
      LAGGING: 'bg-yellow-50 text-yellow-800 border-yellow-300',
      CRITICAL: 'bg-red-50 text-red-800 border-red-300',
    }
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800 border-gray-300'}`}>
        {status}
      </span>
    )
  }

  const getLagColor = (lag: number, status: string) => {
    if (status === 'CRITICAL' || lag > 5000) {
      return 'text-red-600 font-semibold'
    } else if (status === 'LAGGING' || lag > 500) {
      return 'text-yellow-600 font-medium'
    }
    return 'text-gray-900'
  }

  if (loading) {
    return (
      <Layout 
        serviceName="Ingestion"
        breadcrumbs={['Stream Consumers', 'Consumer Group Detail']}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading consumer group details...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error || !detail) {
    const isNotFound = error === 'Consumer group not found' || error === 'Access denied'
    const isSystemError = error === 'System error - try later' || error === 'Network error - check your connection and try again'
    
    return (
      <Layout 
        serviceName="Ingestion"
        breadcrumbs={['Stream Consumers', 'Consumer Group Detail']}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className={`bg-white border ${isNotFound ? 'border-red-200' : 'border-yellow-200'} rounded shadow-sm p-6 text-center`}>
            <svg className={`mx-auto h-12 w-12 ${isNotFound ? 'text-red-500' : 'text-yellow-500'} mb-4`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{error || 'Consumer group not found'}</h3>
            <p className="text-sm text-gray-600 mb-4">
              {isNotFound 
                ? "The consumer group you're looking for doesn't exist or you don't have access to it."
                : isSystemError
                ? "We encountered a system error. Please try again later."
                : "An error occurred while loading the consumer group details."}
            </p>
            <div className="flex items-center justify-center space-x-3">
              <button
                onClick={() => router.push('/console/ingestion/stream-consumers')}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                Back to Stream Consumers
              </button>
              {isSystemError && (
                <button
                  onClick={() => loadDetail()}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  const user = getCurrentUser()

  return (
    <Layout 
      serviceName="Ingestion"
      breadcrumbs={['Stream Consumers', 'Consumer Group Detail']}
      tenant={user?.tenant}
    >
      <div className="max-w-7xl mx-auto">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm mb-6">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-4 mb-2">
                  <button
                    onClick={() => router.push('/console/ingestion/stream-consumers')}
                    className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                  >
                    <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div>
                    <h1 className="text-xl font-normal text-gray-900">
                      Consumer Group: <span className="font-mono">{detail.consumer_group}</span>
                    </h1>
                  </div>
                </div>
                <div className="ml-8 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Stream:</span>{' '}
                    <span className="font-mono text-gray-900">{detail.stream}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Environment:</span>{' '}
                    <span className="font-medium text-gray-900">{detail.environment}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">State:</span>{' '}
                    <span className="font-medium">{getStatusBadge(detail.state)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Deployment:</span>{' '}
                    <span className="font-mono text-gray-900">{detail.deployment}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <button
                  onClick={() => navigator.clipboard.writeText(detail.consumer_group)}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                  title="Copy Consumer Group"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(detail.stream)}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                  title="Copy Stream Name"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <button
                  disabled
                  className="p-2 text-gray-300 cursor-not-allowed rounded"
                  title="Jump to Logs (disabled until Logs page exists)"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </button>
                <Link
                  href={`/console/ingestion/monitor?consumer_group=${encodeURIComponent(detail.consumer_group)}`}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                  title="Jump to Error Monitor"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 lg:px-8 py-6">
          {/* Read-Only Banner */}
          <div className="mb-6 bg-blue-50 border-l-4 border-blue-600 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-800">
                  <strong>Read-only page:</strong> This page is observational only. No pause, resume, offset reset, or other destructive actions are available.
                </p>
              </div>
            </div>
          </div>

          {/* Section 1: High-Signal Summary */}
          <div className="mb-6 bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Summary</h2>
            </div>
            <div className="p-6">
              <dl className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Assigned Partitions</dt>
                  <dd className="text-2xl font-semibold text-gray-900">{detail.assigned_partitions}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Active Members</dt>
                  <dd className="text-2xl font-semibold text-gray-900">{detail.active_members}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total Lag</dt>
                  <dd className={`text-2xl font-semibold ${getLagColor(detail.total_lag, detail.state)}`}>
                    {detail.total_lag.toLocaleString()} events
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Lag Growth Rate</dt>
                  <dd className={`text-2xl font-semibold ${detail.lag_growth_rate > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {detail.lag_growth_rate > 0 ? '+' : ''}{detail.lag_growth_rate.toLocaleString()} events/sec
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Last Commit (max)</dt>
                  <dd className="text-sm font-mono text-gray-900">
                    {format(new Date(detail.last_commit_max), 'yyyy-MM-dd HH:mm:ss')} UTC
                  </dd>
                  <dd className="text-xs mt-1">
                    <span className={`font-medium ${detail.commit_sla_breached ? 'text-red-600' : 'text-gray-500'}`}>
                      Commit SLA: {detail.commit_sla_sec}s {detail.commit_sla_breached && '(BREACHED)'}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Section 2: Consumer Group Topology */}
          <div className="mb-6 bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Group Topology</h2>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-500 mb-4">Detect hot consumers, uneven partition assignment, and zombie members</p>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Host
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Partitions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {detail.group_topology.map((member) => (
                      <tr key={member.member_id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                          {member.member_id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">
                          {member.host}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                          [{member.partitions.join(',')}]
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Section 3: Partition-Level Lag Table */}
          <div className="mb-6 bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Partition Lag Details</h2>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-500 mb-4">Primary debug surface. Lag = Log End Offset - Committed Offset</p>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Partition
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Current Offset
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Log End Offset
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Lag
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {detail.partitions_detail.map((partition) => (
                      <tr key={partition.partition} className="hover:bg-gray-50 cursor-pointer">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                          {partition.partition}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600 text-right">
                          {partition.current_offset.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600 text-right">
                          {partition.log_end_offset.toLocaleString()}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-right ${getLagColor(partition.lag, partition.status)}`}>
                          {partition.lag.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getPartitionStatusBadge(partition.status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-xs text-gray-500">
                <p><strong>Status logic:</strong> OK &lt; 500 | LAGGING 500-5k | CRITICAL &gt; 5k</p>
              </div>
            </div>
          </div>

          {/* Section 4: Commit Behavior Analysis */}
          <div className="mb-6 bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Commit Behavior</h2>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-500 mb-4">This explains why lag grows even when throughput is fine.</p>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Commit Mode</dt>
                  <dd className="text-sm font-medium text-gray-900">{detail.commit_behavior.commit_mode}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Commit Interval</dt>
                  <dd className="text-sm font-medium text-gray-900">{detail.commit_behavior.commit_interval_sec}s</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Max Commit Delay</dt>
                  <dd className={`text-sm font-medium ${detail.commit_behavior.max_commit_delay_sec > detail.commit_behavior.commit_sla_sec ? 'text-red-600' : 'text-gray-900'}`}>
                    {detail.commit_behavior.max_commit_delay_sec}s {detail.commit_behavior.max_commit_delay_sec > detail.commit_behavior.commit_sla_sec && '(BREACH)'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Commit Failures (1h)</dt>
                  <dd className={`text-sm font-medium ${detail.commit_behavior.commit_failures_1h > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {detail.commit_behavior.commit_failures_1h}
                  </dd>
                </div>
              </dl>
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Commit Failure Breakdown</h3>
                <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <dt className="text-xs text-gray-500 mb-1">OFFSET_COMMIT_TIMEOUT</dt>
                    <dd className="text-sm font-medium text-gray-900">{detail.commit_behavior.commit_failure_breakdown.OFFSET_COMMIT_TIMEOUT}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500 mb-1">REBALANCE_IN_PROGRESS</dt>
                    <dd className="text-sm font-medium text-gray-900">{detail.commit_behavior.commit_failure_breakdown.REBALANCE_IN_PROGRESS}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500 mb-1">COORDINATOR_NOT_AVAILABLE</dt>
                    <dd className="text-sm font-medium text-gray-900">{detail.commit_behavior.commit_failure_breakdown.COORDINATOR_NOT_AVAILABLE}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          {/* Section 5: Throughput & Backpressure */}
          <div className="mb-6 bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-900">Throughput</h2>
              <button
                onClick={() => setChartsExpanded(!chartsExpanded)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                {chartsExpanded ? 'Collapse Charts' : 'Expand Charts'}
              </button>
            </div>
            <div className="p-6">
              <dl className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Ingress Rate</dt>
                  <dd className="text-2xl font-semibold text-gray-900">{detail.throughput.ingress_rate.toLocaleString()} events/sec</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Processing Rate</dt>
                  <dd className="text-2xl font-semibold text-gray-900">{detail.throughput.processing_rate.toLocaleString()} events/sec</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Effective Backpressure</dt>
                  <dd className={`text-2xl font-semibold ${detail.throughput.effective_backpressure === 'ACTIVE' ? 'text-red-600' : 'text-green-600'}`}>
                    {detail.throughput.effective_backpressure}
                  </dd>
                  <dd className="text-xs text-gray-500 mt-1">
                    {detail.throughput.processing_rate < detail.throughput.ingress_rate ? 'processing_rate &lt; ingress_rate → lag accumulation' : 'Processing keeping up'}
                  </dd>
                </div>
              </dl>
              {chartsExpanded && (
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Ingress vs Processing</h3>
                    <div className="bg-gray-50 rounded border border-gray-200 p-4 h-64 flex items-center justify-center">
                      <p className="text-sm text-gray-500">Chart visualization would appear here</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Commit Latency</h3>
                    <div className="bg-gray-50 rounded border border-gray-200 p-4 h-64 flex items-center justify-center">
                      <p className="text-sm text-gray-500">Chart visualization would appear here</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 6: Deserialization & Schema Safety */}
          <div className="mb-6 bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Deserialization & Schema</h2>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-500 mb-4">Prevent silent drops. Catch producer drift early.</p>
              <dl className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Schema Version Expected</dt>
                  <dd className="text-sm font-mono text-gray-900">{detail.schema_info.schema_version_expected}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Schema Mismatch Count</dt>
                  <dd className={`text-2xl font-semibold ${detail.schema_info.schema_mismatch_count > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {detail.schema_info.schema_mismatch_count}
                  </dd>
                  {detail.schema_info.schema_mismatch_count > 0 && (
                    <Link
                      href={`/console/ingestion/schema?version=${detail.schema_info.schema_version_expected}`}
                      className="text-xs text-blue-600 hover:text-blue-800 mt-1 inline-block"
                    >
                      View Schema Registry →
                    </Link>
                  )}
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Deserialization Errors</dt>
                  <dd className={`text-2xl font-semibold ${detail.schema_info.deserialization_errors > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {detail.schema_info.deserialization_errors}
                  </dd>
                  {detail.schema_info.deserialization_errors > 0 && (
                    <Link
                      href={`/console/ingestion/monitor?error_type=deserialization&consumer_group=${encodeURIComponent(detail.consumer_group)}`}
                      className="text-xs text-blue-600 hover:text-blue-800 mt-1 inline-block"
                    >
                      View in Error Monitor →
                    </Link>
                  )}
                </div>
              </dl>
            </div>
          </div>

          {/* Section 7: Poison Message Detection */}
          <div className="mb-6 bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Poison Message Signals</h2>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-500 mb-4">Poison ≠ dead letter yet. Only flagged after repeated failures.</p>
              <dl className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Suspected Poison Messages</dt>
                  <dd className={`text-2xl font-semibold ${detail.poison_messages.suspected_count > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {detail.poison_messages.suspected_count}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Affected Partitions</dt>
                  <dd className="text-sm font-mono text-gray-900">
                    {detail.poison_messages.affected_partitions.length > 0 
                      ? `[${detail.poison_messages.affected_partitions.join(',')}]`
                      : 'None'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Retry Attempts</dt>
                  <dd className="text-sm font-medium text-gray-900">{detail.poison_messages.retry_attempts}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Section 8: Downstream Impact Correlation */}
          <div className="mb-6 bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Downstream Correlation</h2>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-500 mb-4">This proves: Lag ≠ lost data. Conversion pipeline health.</p>
              <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Intents Created (last 1h)</dt>
                  <dd className="text-2xl font-semibold text-gray-900">{detail.downstream_effects.intents_created_last_1h.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Intents Created (last 15m)</dt>
                  <dd className="text-2xl font-semibold text-gray-900">{detail.downstream_effects.intents_created_last_15m?.toLocaleString() || 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Intents Failed Conversion</dt>
                  <dd className={`text-2xl font-semibold ${detail.downstream_effects.failed_conversions > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {detail.downstream_effects.failed_conversions}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Avg Event → Intent Latency</dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {detail.downstream_effects.avg_event_to_intent_latency_ms?.toLocaleString() || 'N/A'} ms
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Section 9: Rebalance History */}
          <div className="mb-6 bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Rebalance History (24h)</h2>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-500 mb-4">Long rebalances = commit gaps = lag spikes.</p>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Timestamp
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Event Type
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Duration
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {detail.rebalance_history.map((event, idx) => (
                      <tr key={idx}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                          {format(new Date(event.timestamp), 'HH:mm:ss')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {event.event_type}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                          {event.duration_sec ? `${event.duration_sec}s` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Section 10: Evidence & Audit Guarantees */}
          <div className="mb-6 bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Audit & Evidence</h2>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-500 mb-4">This is essential for: &quot;Did we miss events?&quot; Regulatory completeness proof.</p>
              <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Offset Commit Log</dt>
                  <dd className={`text-sm font-medium ${detail.audit.offset_commit_log === 'ENABLED' ? 'text-green-700' : 'text-gray-900'}`}>
                    {detail.audit.offset_commit_log}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Consumer State Snapshots</dt>
                  <dd className={`text-sm font-medium ${detail.audit.consumer_state_snapshots === 'RETAINED' ? 'text-green-700' : 'text-gray-900'}`}>
                    {detail.audit.consumer_state_snapshots}
                    {detail.audit.retention_days && ` (${detail.audit.retention_days}d)`}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Audit Trail Integrity</dt>
                  <dd className={`text-sm font-medium ${detail.audit.audit_trail_integrity === 'VERIFIED' ? 'text-green-700' : 'text-red-700'}`}>
                    {detail.audit.audit_trail_integrity}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Last Verified</dt>
                  <dd className="text-sm font-mono text-gray-900">
                    {format(new Date(detail.audit.last_verified), 'yyyy-MM-dd HH:mm:ss')} UTC
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

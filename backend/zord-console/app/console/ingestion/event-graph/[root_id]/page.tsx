'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'
import { 
  EventGraphResponse, 
  EventNode, 
  EventStatus, 
  RootType 
} from '@/types/event-graph'

// Status color helpers
function getStatusColor(status: EventStatus): string {
  switch (status) {
    case 'PASS': return '#10B981' // Green
    case 'FAIL': return '#EF4444' // Red
    case 'SKIPPED': return '#9CA3AF' // Gray
    case 'PENDING': return '#F59E0B' // Amber
    default: return '#6B7280'
  }
}

function getStatusBgColor(status: EventStatus): string {
  switch (status) {
    case 'PASS': return 'bg-green-100 text-green-800 border-green-300'
    case 'FAIL': return 'bg-red-100 text-red-800 border-red-300'
    case 'SKIPPED': return 'bg-gray-100 text-gray-500 border-gray-300'
    case 'PENDING': return 'bg-yellow-100 text-yellow-800 border-yellow-300'
    default: return 'bg-gray-100 text-gray-600 border-gray-300'
  }
}

function getStatusIcon(status: EventStatus) {
  switch (status) {
    case 'PASS':
      return (
        <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )
    case 'FAIL':
      return (
        <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )
    case 'SKIPPED':
      return <span className="text-gray-400">-</span>
    default:
      return <span className="text-yellow-500">●</span>
  }
}

// Stock Chart Timeline Component
function StockChartTimeline({ 
  nodes, 
  serviceStack, 
  totalDurationMs,
  onNodeClick,
  selectedNodeId
}: { 
  nodes: EventNode[]
  serviceStack: { service: string; layer: number; color: string }[]
  totalDurationMs: number
  onNodeClick: (node: EventNode) => void
  selectedNodeId: string | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredNode, setHoveredNode] = useState<EventNode | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const chartHeight = serviceStack.length * 60 + 40
  const chartWidth = 800
  const leftMargin = 140
  const rightMargin = 20
  const topMargin = 20
  const bottomMargin = 40
  const usableWidth = chartWidth - leftMargin - rightMargin

  // Scale time to x position
  const timeToX = (relativeMs: number) => {
    return leftMargin + (relativeMs / totalDurationMs) * usableWidth
  }

  // Service to y position
  const serviceToY = (service: string) => {
    const stackItem = serviceStack.find(s => s.service === service)
    return topMargin + (stackItem ? (stackItem.layer - 1) * 60 : 0) + 30
  }

  const handleMouseMove = (e: React.MouseEvent, node: EventNode) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      setTooltipPos({ 
        x: e.clientX - rect.left + 10, 
        y: e.clientY - rect.top - 10 
      })
    }
    setHoveredNode(node)
  }

  return (
    <div ref={containerRef} className="relative bg-gray-900 rounded-lg border border-gray-700 p-4 overflow-x-auto">
      <svg width={chartWidth} height={chartHeight} className="min-w-full">
        {/* Y-axis labels (services) */}
        {serviceStack.map((s, i) => (
          <g key={s.service}>
            <text 
              x={leftMargin - 10} 
              y={topMargin + i * 60 + 35} 
              fill="#9CA3AF" 
              fontSize="11" 
              textAnchor="end"
              fontFamily="monospace"
            >
              {s.service.replace('zord-', '').replace('central-', '')}
            </text>
            {/* Horizontal grid line */}
            <line
              x1={leftMargin}
              y1={topMargin + i * 60 + 30}
              x2={chartWidth - rightMargin}
              y2={topMargin + i * 60 + 30}
              stroke="#374151"
              strokeDasharray="4,4"
            />
          </g>
        ))}

        {/* X-axis (time) */}
        <line
          x1={leftMargin}
          y1={chartHeight - bottomMargin}
          x2={chartWidth - rightMargin}
          y2={chartHeight - bottomMargin}
          stroke="#4B5563"
        />
        
        {/* Time markers */}
        {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
          const timeMs = Math.round(totalDurationMs * ratio)
          const x = timeToX(timeMs)
          return (
            <g key={ratio}>
              <line x1={x} y1={chartHeight - bottomMargin} x2={x} y2={chartHeight - bottomMargin + 5} stroke="#4B5563" />
              <text x={x} y={chartHeight - bottomMargin + 18} fill="#6B7280" fontSize="10" textAnchor="middle">
                {timeMs >= 1000 ? `${(timeMs / 1000).toFixed(2)}s` : `${timeMs}ms`}
              </text>
            </g>
          )
        })}

        {/* Time arrow */}
        <text x={chartWidth - rightMargin - 40} y={chartHeight - 10} fill="#6B7280" fontSize="10">
          Time →
        </text>

        {/* Event bars */}
        {nodes.map(node => {
          const x = timeToX(node.relative_time_ms)
          const y = serviceToY(node.service)
          const barWidth = Math.max(8, (node.duration_ms / totalDurationMs) * usableWidth)
          const isSelected = selectedNodeId === node.node_id
          const isHovered = hoveredNode?.node_id === node.node_id

          return (
            <g 
              key={node.node_id} 
              onClick={() => onNodeClick(node)}
              onMouseMove={(e) => handleMouseMove(e, node)}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Bar background (for clickable area) */}
              <rect
                x={x - 2}
                y={y - 12}
                width={Math.max(barWidth + 4, 20)}
                height={24}
                fill="transparent"
              />
              
              {/* Event bar */}
              <rect
                x={x}
                y={y - 10}
                width={Math.max(barWidth, 6)}
                height={20}
                fill={getStatusColor(node.status)}
                rx={2}
                opacity={node.status === 'SKIPPED' ? 0.3 : isSelected || isHovered ? 1 : 0.8}
                stroke={isSelected ? '#FBBF24' : isHovered ? '#FFFFFF' : 'transparent'}
                strokeWidth={isSelected ? 2 : isHovered ? 1 : 0}
              />

              {/* Duration label on bar (if wide enough) */}
              {barWidth > 30 && (
                <text x={x + 4} y={y + 4} fill="#FFFFFF" fontSize="9" fontWeight="medium">
                  {node.duration_ms}ms
                </text>
              )}

              {/* Failure indicator */}
              {node.status === 'FAIL' && (
                <text x={x + barWidth + 4} y={y + 4} fill="#EF4444" fontSize="10" fontWeight="bold">
                  ← FAILED
                </text>
              )}
            </g>
          )
        })}

        {/* Connecting lines between events */}
        {nodes.filter(n => n.status !== 'SKIPPED').map((node, i, arr) => {
          if (i === 0) return null
          const prevNode = arr[i - 1]
          const x1 = timeToX(prevNode.relative_time_ms) + Math.max(8, (prevNode.duration_ms / totalDurationMs) * usableWidth)
          const y1 = serviceToY(prevNode.service)
          const x2 = timeToX(node.relative_time_ms)
          const y2 = serviceToY(node.service)
          
          return (
            <line
              key={`line-${node.node_id}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#4B5563"
              strokeWidth={1}
              strokeDasharray={node.status === 'FAIL' ? '4,2' : undefined}
            />
          )
        })}
      </svg>

      {/* Hover tooltip */}
      {hoveredNode && (
        <div 
          className="absolute bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-xl z-10 text-xs"
          style={{ left: tooltipPos.x, top: tooltipPos.y, maxWidth: 280 }}
        >
          <div className="font-semibold text-white mb-2">{hoveredNode.label}</div>
          <div className="space-y-1 text-gray-300">
            <div><span className="text-gray-500">Service:</span> {hoveredNode.service} {hoveredNode.service_version}</div>
            <div><span className="text-gray-500">Duration:</span> {hoveredNode.duration_ms}ms</div>
            {hoveredNode.input_size_bytes && (
              <div><span className="text-gray-500">Input:</span> {(hoveredNode.input_size_bytes / 1024).toFixed(1)}KB</div>
            )}
            {hoveredNode.reason_code && (
              <div className="text-red-400"><span className="text-gray-500">Reason:</span> {hoveredNode.reason_code}</div>
            )}
            {hoveredNode.error_detail && (
              <div className="text-red-400 text-xs">{hoveredNode.error_detail}</div>
            )}
          </div>
          <div className="mt-2 text-gray-500 text-xs">Click for full details</div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-6 mt-4 pt-3 border-t border-gray-700">
        <span className="text-xs text-gray-500">Legend:</span>
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 bg-green-500 rounded"></div>
          <span className="text-xs text-gray-400">PASS</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 bg-red-500 rounded"></div>
          <span className="text-xs text-gray-400">FAIL</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 bg-gray-500 rounded opacity-30"></div>
          <span className="text-xs text-gray-400">SKIPPED</span>
        </div>
        <span className="text-xs text-gray-500 ml-4">Hover=Metadata · Click=Node Detail</span>
      </div>
    </div>
  )
}

// Node Detail Drawer Component
function NodeDetailDrawer({ 
  node, 
  onClose 
}: { 
  node: EventNode | null
  onClose: () => void 
}) {
  if (!node) return null

  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">Node Detail</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          {getStatusIcon(node.status)}
          <span className="font-medium text-gray-900">{node.label}</span>
        </div>
        
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Node type</dt>
            <dd className="font-mono text-gray-900">{node.node_type}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Service</dt>
            <dd className="text-gray-900">{node.service} {node.service_version}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</dt>
            <dd>
              <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${getStatusBgColor(node.status)}`}>
                {node.status}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Duration</dt>
            <dd className="text-gray-900">{node.duration_ms}ms</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Timestamp</dt>
            <dd className="font-mono text-xs text-gray-900">
              {format(new Date(node.timestamp), 'HH:mm:ss.SSS')}Z
            </dd>
          </div>
          
          {node.schema_version && (
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Schema version</dt>
              <dd className="text-gray-900">{node.schema_version}</dd>
            </div>
          )}
          
          {node.reason_code && (
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Reason code</dt>
              <dd className="text-red-600 font-medium">{node.reason_code}</dd>
            </div>
          )}
          
          {node.error_detail && (
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Error detail</dt>
              <dd className="text-red-600">{node.error_detail}</dd>
            </div>
          )}

          {node.input_size_bytes && (
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Input size</dt>
              <dd className="text-gray-900">{(node.input_size_bytes / 1024).toFixed(2)} KB</dd>
            </div>
          )}
          
          {node.evidence_ref && (
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Evidence</dt>
              <dd className="font-mono text-xs text-blue-600 break-all">{node.evidence_ref}</dd>
            </div>
          )}
        </dl>
        
        {/* Action links */}
        <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
          {node.dlq_id && (
            <Link
              href={`/console/ingestion/pre-acc-guard/dlq/${encodeURIComponent(node.dlq_id)}`}
              className="block text-sm text-blue-600 hover:text-blue-800"
            >
              View DLQ Detail →
            </Link>
          )}
          {node.schema_version && (
            <Link
              href={`/console/ingestion/schema-registry`}
              className="block text-sm text-blue-600 hover:text-blue-800"
            >
              View Schema Registry →
            </Link>
          )}
          {node.intent_id && (
            <Link
              href={`/console/ingestion/intents/${encodeURIComponent(node.intent_id)}`}
              className="block text-sm text-blue-600 hover:text-blue-800"
            >
              View Intent Detail →
            </Link>
          )}
          {node.envelope_id && (
            <Link
              href={`/console/ingestion/raw-envelopes/${encodeURIComponent(node.envelope_id)}`}
              className="block text-sm text-blue-600 hover:text-blue-800"
            >
              View Envelope Detail →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

export default function EventGraphPage() {
  const router = useRouter()
  const params = useParams()
  const rootId = decodeURIComponent(params?.root_id as string)
  
  const [graphData, setGraphData] = useState<EventGraphResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<EventNode | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    if (rootId) {
      loadEventGraph()
    }
  }, [rootId, router])

  const loadEventGraph = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/prod/event-graph/${encodeURIComponent(rootId)}`)
      if (!response.ok) {
        if (response.status === 404) {
          setError('Event graph not found')
          return
        }
        setError('Failed to load event graph')
        return
      }
      const data: EventGraphResponse = await response.json()
      setGraphData(data)
    } catch (err) {
      console.error('Failed to load event graph:', err)
      setError('Failed to load event graph')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const exportTimeline = () => {
    if (!graphData) return
    const csv = [
      'Timestamp (UTC),Event,Service,Status,Duration (ms),Evidence',
      ...graphData.timeline.map(evt => 
        `"${evt.timestamp}","${evt.event}","${evt.service}","${evt.status}","${evt.duration_ms}","${evt.evidence_ref || ''}"`
      )
    ].join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${rootId}_event_timeline.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleSwitchRoot = (newRootId: string) => {
    router.push(`/console/ingestion/event-graph/${encodeURIComponent(newRootId)}`)
  }

  if (loading) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Event Graph', rootId]}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading event graph...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error || !graphData) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Event Graph', rootId]}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white border border-red-200 rounded shadow-sm p-6 text-center">
            <svg className="mx-auto h-12 w-12 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{error || 'Event graph not found'}</h3>
            <button
              onClick={() => router.back()}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              Go Back
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  const { graph, timeline } = graphData
  const user = getCurrentUser()

  return (
    <Layout
      serviceName="Ingestion"
      breadcrumbs={['Event Graph', graph.summary.root_id]}
      tenant={user?.tenant}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Graph Header */}
        <div className="bg-white border border-gray-200 rounded shadow-sm mb-6">
          <div className="px-6 py-5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-4">
                  <button
                    onClick={() => router.back()}
                    className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                    title="Go back"
                  >
                    <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h1 className="text-xl font-semibold text-gray-900">Event Graph</h1>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Root object</dt>
                    <dd className="text-sm font-medium text-gray-900">{graph.summary.root_label}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Root ID</dt>
                    <dd className="flex items-center space-x-2">
                      <span className="font-mono text-sm text-gray-900">{graph.summary.root_id}</span>
                      <button
                        onClick={() => copyToClipboard(graph.summary.root_id, 'root_id')}
                        className="text-gray-400 hover:text-gray-600"
                        title="Copy Root ID"
                      >
                        {copiedField === 'root_id' ? (
                          <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Tenant</dt>
                    <dd className="text-sm text-gray-900">
                      {graph.summary.tenant_name}
                      <span className="text-xs text-gray-500 ml-1">(cross-tenant)</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Environment</dt>
                    <dd>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-300">
                        {graph.summary.environment}
                      </span>
                    </dd>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Graph span</dt>
                    <dd className="text-sm text-gray-900">
                      {format(new Date(graph.summary.start_time), 'HH:mm:ss.SSS')} → {format(new Date(graph.summary.end_time), 'HH:mm:ss.SSS')}
                      <span className="text-gray-500 ml-1">
                        ({graph.summary.total_duration_ms >= 1000 
                          ? `${(graph.summary.total_duration_ms / 1000).toFixed(2)}s` 
                          : `${graph.summary.total_duration_ms}ms`})
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Nodes</dt>
                    <dd className="text-sm text-gray-900">{graph.summary.total_nodes}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Edges</dt>
                    <dd className="text-sm text-gray-900">{graph.summary.total_edges}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Status</dt>
                    <dd className="flex items-center space-x-2 text-sm">
                      <span className="text-green-600">{graph.summary.pass_count} pass</span>
                      {graph.summary.fail_count > 0 && (
                        <span className="text-red-600">{graph.summary.fail_count} fail</span>
                      )}
                      {graph.summary.skipped_count > 0 && (
                        <span className="text-gray-500">{graph.summary.skipped_count} skip</span>
                      )}
                    </dd>
                  </div>
                </div>

                {/* Switch root dropdown */}
                {graph.summary.related_roots.length > 1 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-2">
                      Switch Root
                    </label>
                    <select
                      value={graph.summary.root_id}
                      onChange={(e) => handleSwitchRoot(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {graph.summary.related_roots.map(r => (
                        <option key={r.root_id} value={r.root_id}>
                          {r.label} ({r.root_id})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main content: Chart + Drawer */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Stock Chart Timeline (70% width on large screens) */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-gray-200 rounded shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-sm font-medium text-gray-900">Event Timeline (Stock Chart Style)</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  TradingView-inspired horizontal timeline. Time flows left to right, services stacked vertically.
                </p>
              </div>
              <div className="p-4">
                <StockChartTimeline
                  nodes={graph.nodes}
                  serviceStack={graph.service_stack}
                  totalDurationMs={graph.summary.total_duration_ms}
                  onNodeClick={setSelectedNode}
                  selectedNodeId={selectedNode?.node_id || null}
                />
              </div>
              <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
                Backed by: <span className="font-mono">event_edges(timestamp, status, service, metadata)</span>
              </div>
            </div>

            {/* Timeline Table */}
            <div className="bg-white border border-gray-200 rounded shadow-sm mt-6">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-medium text-gray-900">Timeline Table</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Auditor-proof linear log. Sorted by timestamp.</p>
                </div>
                <button
                  onClick={exportTimeline}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50 flex items-center space-x-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Export CSV</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time (UTC)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Evidence</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {timeline.map((evt, i) => (
                      <tr 
                        key={i} 
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => {
                          const node = graph.nodes.find(n => n.node_id === evt.node_id)
                          if (node) setSelectedNode(node)
                        }}
                      >
                        <td className="px-6 py-3 whitespace-nowrap text-xs font-mono text-gray-700">
                          {format(new Date(evt.timestamp), 'HH:mm:ss.SSS')}Z
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">{evt.event}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600">{evt.service}</td>
                        <td className="px-6 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center space-x-1 text-xs font-medium`}>
                            {getStatusIcon(evt.status)}
                            <span className={evt.status === 'PASS' ? 'text-green-600' : evt.status === 'FAIL' ? 'text-red-600' : 'text-gray-500'}>
                              {evt.status}
                            </span>
                          </span>
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-xs font-mono text-gray-500 truncate max-w-[200px]">
                          {evt.evidence_ref || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Node Detail Drawer (30% width on large screens) */}
          <div className="lg:col-span-1">
            {selectedNode ? (
              <NodeDetailDrawer node={selectedNode} onClose={() => setSelectedNode(null)} />
            ) : (
              <div className="bg-white border border-gray-200 rounded shadow-sm p-6 text-center">
                <svg className="mx-auto h-10 w-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                <p className="text-sm text-gray-500">Click on a node in the chart or timeline to view details</p>
              </div>
            )}
          </div>
        </div>

        {/* Final Lock Statement */}
        <div className="bg-gray-900 border border-gray-700 rounded shadow-sm p-4 text-center mt-6">
          <p className="text-sm text-gray-300">
            <span className="text-white font-medium">STOCK CHART STYLE GRAPH</span>
            <span className="mx-2">-</span>
            TradingView meets payment forensics.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs text-gray-400">
            <span className="flex items-center space-x-1">
              <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Horizontal timeline (time → right)</span>
            </span>
            <span className="flex items-center space-x-1">
              <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Event bars with precise durations</span>
            </span>
            <span className="flex items-center space-x-1">
              <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Cross-tenant + switch roots</span>
            </span>
            <span className="flex items-center space-x-1">
              <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Forensic node drawer</span>
            </span>
          </div>
          <p className="mt-3 text-xs text-gray-500">Bloomberg Terminal for payment events.</p>
        </div>
      </div>
    </Layout>
  )
}

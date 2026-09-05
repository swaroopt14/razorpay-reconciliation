'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated } from '@/services/auth'
import { Layout } from '@/components/aws/Layout'

// Types
type IncidentSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
type IncidentStatus = 'TRIGGERED' | 'ACKNOWLEDGED' | 'RESOLVED'
type IncidentUrgency = 'HIGH' | 'LOW'

interface Incident {
  id: string
  incident_number: number
  severity: IncidentSeverity
  urgency: IncidentUrgency
  status: IncidentStatus
  title: string
  description: string
  service: string
  service_id: string
  assigned_to: string | null
  created_at: string
  acknowledged_at: string | null
  resolved_at: string | null
  alerts_count: number
  affected_tenants: string[]
  affected_events: number
  linked_signals: { label: string; href: string }[]
}

interface IncidentMetrics {
  your_open: { triggered: number; acknowledged: number }
  all_open: { triggered: number; acknowledged: number }
  mttr_minutes: number
  total_24h: number
}

// Generate realistic mock data
const services = [
  { id: 'svc_edge', name: 'SRE Zord Edge PROD' },
  { id: 'svc_relay', name: 'SRE Zord Relay PROD' },
  { id: 'svc_journal', name: 'SRE Vault Journal PROD' },
  { id: 'svc_engine', name: 'SRE Intent Engine PROD' },
  { id: 'svc_contracts', name: 'SRE Contracts PROD' },
  { id: 'svc_pii', name: 'SRE PII Enclave PROD' },
  { id: 'svc_schema', name: 'SRE Schema Registry PROD' },
]

const assignees = ['ops_raj', 'sre_priya', 'eng_arun', 'ops_maya', 'sre_vikram', null]

const incidentTitles = [
  { title: 'CRITICAL: Webhook delivery timeout', severity: 'CRITICAL' as IncidentSeverity, urgency: 'HIGH' as IncidentUrgency },
  { title: 'WARNING: HTTP 500 High Request Response Times', severity: 'HIGH' as IncidentSeverity, urgency: 'HIGH' as IncidentUrgency },
  { title: 'DISK at 99% on machine prod-zord-relay-01', severity: 'HIGH' as IncidentSeverity, urgency: 'HIGH' as IncidentUrgency },
  { title: 'CRITICAL: PostgreSQL OutOfMemory', severity: 'CRITICAL' as IncidentSeverity, urgency: 'HIGH' as IncidentUrgency },
  { title: 'Schema validation spike (AcmePay tenant)', severity: 'MEDIUM' as IncidentSeverity, urgency: 'HIGH' as IncidentUrgency },
  { title: 'Outbox retry backlog growing', severity: 'MEDIUM' as IncidentSeverity, urgency: 'LOW' as IncidentUrgency },
  { title: 'API latency P99 > 500ms', severity: 'HIGH' as IncidentSeverity, urgency: 'HIGH' as IncidentUrgency },
  { title: 'DLQ items exceeding threshold', severity: 'MEDIUM' as IncidentSeverity, urgency: 'HIGH' as IncidentUrgency },
  { title: 'Certificate expiry in 7 days', severity: 'LOW' as IncidentSeverity, urgency: 'LOW' as IncidentUrgency },
  { title: 'Stream consumer lag > 5 minutes', severity: 'MEDIUM' as IncidentSeverity, urgency: 'HIGH' as IncidentUrgency },
  { title: 'Memory utilization > 85%', severity: 'MEDIUM' as IncidentSeverity, urgency: 'LOW' as IncidentUrgency },
  { title: 'Batch pipeline delayed > 1 hour', severity: 'HIGH' as IncidentSeverity, urgency: 'HIGH' as IncidentUrgency },
]

function generateIncidents(): Incident[] {
  const now = Date.now()
  const incidents: Incident[] = []
  const statuses: IncidentStatus[] = ['TRIGGERED', 'TRIGGERED', 'TRIGGERED', 'TRIGGERED', 'ACKNOWLEDGED', 'ACKNOWLEDGED', 'RESOLVED', 'RESOLVED', 'RESOLVED', 'RESOLVED', 'RESOLVED', 'RESOLVED']
  
  incidentTitles.forEach((item, idx) => {
    const status = statuses[idx]
    const minutesAgo = Math.floor(Math.random() * 180) + 5
    const service = services[Math.floor(Math.random() * services.length)]
    const assignee = status === 'TRIGGERED' ? (Math.random() > 0.5 ? null : assignees[Math.floor(Math.random() * assignees.length)]) : assignees[Math.floor(Math.random() * (assignees.length - 1))]
    
    incidents.push({
      id: `inc_${String(idx + 1).padStart(3, '0')}`,
      incident_number: 1000 + idx,
      severity: item.severity,
      urgency: item.urgency,
      status,
      title: item.title,
      description: `Alert triggered by monitoring. ${Math.floor(Math.random() * 5) + 1} related alerts grouped.`,
      service: service.name,
      service_id: service.id,
      assigned_to: assignee,
      created_at: new Date(now - minutesAgo * 60000).toISOString(),
      acknowledged_at: status !== 'TRIGGERED' ? new Date(now - (minutesAgo - 5) * 60000).toISOString() : null,
      resolved_at: status === 'RESOLVED' ? new Date(now - (minutesAgo - 15) * 60000).toISOString() : null,
      alerts_count: Math.floor(Math.random() * 5) + 1,
      affected_tenants: ['AcmePay', 'ZenPay', 'NovaBank'].slice(0, Math.floor(Math.random() * 3) + 1),
      affected_events: Math.floor(Math.random() * 500) + 10,
      linked_signals: [
        { label: 'Platform Health', href: '/console/dashboards/platform-health' },
        { label: 'Error Monitor', href: '/console/ingestion/error-monitor' },
        { label: 'DLQ', href: '/console/ingestion/dlq' },
      ],
    })
  })
  
  return incidents.sort((a, b) => {
    const statusOrder = { TRIGGERED: 0, ACKNOWLEDGED: 1, RESOLVED: 2 }
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
    if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status]
    if (severityOrder[a.severity] !== severityOrder[b.severity]) return severityOrder[a.severity] - severityOrder[b.severity]
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

// Status badge component
function StatusBadge({ status }: { status: IncidentStatus }) {
  const config = {
    TRIGGERED: { label: 'Triggered', color: '#DC2626' },
    ACKNOWLEDGED: { label: 'Acknowledged', color: '#D97706' },
    RESOLVED: { label: 'Resolved', color: '#059669' },
  }
  const c = config[status]
  return <span className="text-[13px] font-medium" style={{ color: c.color }}>{c.label}</span>
}

// Time formatter
function formatTimeShort(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

// Incident detail drawer
function IncidentDrawer({ incident, onClose }: { incident: Incident | null; onClose: () => void }) {
  if (!incident) return null
  
  const severityColors = {
    CRITICAL: '#DC2626',
    HIGH: '#F59E0B',
    MEDIUM: '#3B82F6',
    LOW: '#6B7280',
  }
  
  return (
    <div 
      className="fixed inset-y-0 right-0 w-[500px] z-50 flex flex-col"
      style={{ 
        background: '#FFFFFF',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
      }}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-5" style={{ borderBottom: '1px solid #E5E7EB' }}>
        <div className="flex items-start justify-between">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: '#F3F4F6', color: '#6B7280' }}>
                #{incident.incident_number}
              </span>
              <StatusBadge status={incident.status} />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 leading-tight">{incident.title}</h2>
          </div>
          <button 
            onClick={onClose}
            className="flex-shrink-0 p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Stats Bar */}
      <div className="flex-shrink-0 grid grid-cols-3 divide-x divide-gray-200" style={{ borderBottom: '1px solid #E5E7EB', background: '#FAFAFA' }}>
        <div className="px-6 py-4 text-center">
          <div className="text-2xl font-bold text-gray-900 tabular-nums">{incident.alerts_count}</div>
          <div className="text-xs text-gray-500 mt-0.5">Triggered Alerts</div>
        </div>
        <div className="px-6 py-4 text-center">
          <div className="text-2xl font-bold text-gray-900 tabular-nums">{incident.affected_tenants.length}</div>
          <div className="text-xs text-gray-500 mt-0.5">Tenants Affected</div>
        </div>
        <div className="px-6 py-4 text-center">
          <div className="text-2xl font-bold text-gray-900 tabular-nums">{incident.affected_events.toLocaleString()}</div>
          <div className="text-xs text-gray-500 mt-0.5">Failed Events</div>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Severity</div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: severityColors[incident.severity] }} />
              <span className="text-sm font-medium text-gray-900">{incident.severity}</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Urgency</div>
            <span className="text-sm text-gray-900">{incident.urgency}</span>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Service</div>
            <span className="text-sm font-medium text-blue-600">{incident.service}</span>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Assigned To</div>
            {incident.assigned_to ? (
              <span className="text-sm font-medium text-blue-600">{incident.assigned_to}</span>
            ) : (
              <span className="text-sm text-red-600 font-medium">Unassigned</span>
            )}
          </div>
        </div>
        
        {/* Timeline */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Timeline</div>
          <div className="space-y-3">
            <div className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-red-500 mr-3" />
              <div className="flex-1">
                <div className="text-sm text-gray-900">Triggered</div>
                <div className="text-xs text-gray-500 font-mono">{new Date(incident.created_at).toLocaleString()}</div>
              </div>
            </div>
            {incident.acknowledged_at && (
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-amber-500 mr-3" />
                <div className="flex-1">
                  <div className="text-sm text-gray-900">Acknowledged</div>
                  <div className="text-xs text-gray-500 font-mono">{new Date(incident.acknowledged_at).toLocaleString()}</div>
                </div>
              </div>
            )}
            {incident.resolved_at && (
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-green-500 mr-3" />
                <div className="flex-1">
                  <div className="text-sm text-gray-900">Resolved</div>
                  <div className="text-xs text-gray-500 font-mono">{new Date(incident.resolved_at).toLocaleString()}</div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Affected Tenants */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Affected Tenants</div>
          <div className="flex flex-wrap gap-2">
            {incident.affected_tenants.map(tenant => (
              <span 
                key={tenant} 
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-full"
                style={{ background: '#F3F4F6', color: '#374151' }}
              >
                {tenant}
              </span>
            ))}
          </div>
        </div>
        
        {/* Quick Links */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Quick Links</div>
          <div className="grid grid-cols-1 gap-2">
            {incident.linked_signals.map((signal, idx) => (
              <Link 
                key={idx} 
                href={signal.href}
                className="flex items-center justify-between px-4 py-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all group"
              >
                <span className="text-sm text-gray-700 group-hover:text-gray-900">{signal.label}</span>
                <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      </div>
      
      {/* Actions Footer */}
      <div className="flex-shrink-0 px-6 py-4 flex items-center gap-3" style={{ borderTop: '1px solid #E5E7EB', background: '#FAFAFA' }}>
        {incident.status === 'TRIGGERED' && (
          <button className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            Acknowledge
          </button>
        )}
        {incident.status !== 'RESOLVED' && (
          <>
            <button className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Reassign
            </button>
            <button className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Resolve
            </button>
          </>
        )}
        {incident.status === 'RESOLVED' && (
          <button className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            View Postmortem
          </button>
        )}
      </div>
    </div>
  )
}

function IncidentsContent() {
  const router = useRouter()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [metrics, setMetrics] = useState<IncidentMetrics>({ your_open: { triggered: 0, acknowledged: 0 }, all_open: { triggered: 0, acknowledged: 0 }, mttr_minutes: 0, total_24h: 0 })
  const [loading, setLoading] = useState(true)
  const [secondsAgo, setSecondsAgo] = useState(0)
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'TRIGGERED' | 'ACKNOWLEDGED' | 'RESOLVED' | 'ANY'>('OPEN')
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'me'>('all')
  const [serviceFilter, setServiceFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

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
    const timer = setInterval(() => setSecondsAgo(prev => prev + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const loadData = useCallback(async () => {
    await new Promise(resolve => setTimeout(resolve, 100))
    const data = generateIncidents()
    setIncidents(data)
    
    const triggered = data.filter(i => i.status === 'TRIGGERED')
    const acknowledged = data.filter(i => i.status === 'ACKNOWLEDGED')
    
    setMetrics({
      your_open: { triggered: triggered.filter(i => i.assigned_to === 'ops_raj').length, acknowledged: acknowledged.filter(i => i.assigned_to === 'ops_raj').length },
      all_open: { triggered: triggered.length, acknowledged: acknowledged.length },
      mttr_minutes: 38,
      total_24h: data.length,
    })
    setSecondsAgo(0)
    setLoading(false)
  }, [])

  // Filter incidents
  const filteredIncidents = incidents.filter(inc => {
    if (statusFilter === 'OPEN' && inc.status === 'RESOLVED') return false
    if (statusFilter === 'TRIGGERED' && inc.status !== 'TRIGGERED') return false
    if (statusFilter === 'ACKNOWLEDGED' && inc.status !== 'ACKNOWLEDGED') return false
    if (statusFilter === 'RESOLVED' && inc.status !== 'RESOLVED') return false
    if (assignmentFilter === 'me' && inc.assigned_to !== 'ops_raj') return false
    if (serviceFilter !== 'all' && inc.service_id !== serviceFilter) return false
    if (searchQuery && !inc.title.toLowerCase().includes(searchQuery.toLowerCase()) && !String(inc.incident_number).includes(searchQuery)) return false
    return true
  })

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredIncidents.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredIncidents.map(i => i.id)))
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F9FAFB' }}>
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-blue-600" />
          <p className="mt-4 text-sm text-gray-500">Loading incidents...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#F9FAFB' }}>
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">Incidents on All Teams</h1>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span>Updated {secondsAgo}s ago</span>
              </div>
              <button 
                onClick={loadData}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-12 mb-6">
            <div>
              <div className="text-sm font-medium text-gray-900 mb-2">Your open incidents</div>
              <div className="flex items-center gap-6">
                <span className="text-sm">
                  <span className="font-semibold text-red-600">{metrics.your_open.triggered}</span>
                  <span className="text-red-600 ml-1">triggered</span>
                </span>
                <span className="text-sm">
                  <span className="font-semibold text-amber-600">{metrics.your_open.acknowledged}</span>
                  <span className="text-amber-600 ml-1">acknowledged</span>
                </span>
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900 mb-2">All open incidents</div>
              <div className="flex items-center gap-6">
                <span className="text-sm">
                  <span className="font-semibold text-red-600">{metrics.all_open.triggered}</span>
                  <span className="text-red-600 ml-1">triggered</span>
                </span>
                <span className="text-sm">
                  <span className="font-semibold text-amber-600">{metrics.all_open.acknowledged}</span>
                  <span className="text-amber-600 ml-1">acknowledged</span>
                </span>
              </div>
            </div>
          </div>

          {/* Bulk Actions */}
          <div className="flex items-center justify-between py-4 px-5 bg-gray-50 rounded-lg border border-gray-200 mb-6">
            <div className="flex items-center gap-2">
              <button 
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                  selectedIds.size > 0 
                    ? 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50' 
                    : 'text-gray-400 bg-gray-100 border-gray-200 cursor-not-allowed'
                }`}
                disabled={selectedIds.size === 0}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Acknowledge
              </button>
              <button 
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                  selectedIds.size > 0 
                    ? 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50' 
                    : 'text-gray-400 bg-gray-100 border-gray-200 cursor-not-allowed'
                }`}
                disabled={selectedIds.size === 0}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Reassign
              </button>
              <button 
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                  selectedIds.size > 0 
                    ? 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50' 
                    : 'text-gray-400 bg-gray-100 border-gray-200 cursor-not-allowed'
                }`}
                disabled={selectedIds.size === 0}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Resolve
              </button>
              <button 
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                  selectedIds.size > 0 
                    ? 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50' 
                    : 'text-gray-400 bg-gray-100 border-gray-200 cursor-not-allowed'
                }`}
                disabled={selectedIds.size === 0}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Snooze
              </button>
            </div>
            
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Go to incident #..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-44 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <div className="relative">
                <select 
                  value={serviceFilter}
                  onChange={(e) => setServiceFilter(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Teams</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Tabs Row */}
          <div className="flex items-center justify-between border-b border-gray-200 -mb-px">
            <div className="flex items-center gap-1">
              {(['OPEN', 'TRIGGERED', 'ACKNOWLEDGED', 'RESOLVED', 'ANY'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    statusFilter === status 
                      ? 'text-blue-600 border-blue-600' 
                      : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {status === 'ANY' ? 'Any Status' : status.charAt(0) + status.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            
            <div className="flex items-center rounded-lg overflow-hidden border border-gray-300">
              <button
                onClick={() => setAssignmentFilter('me')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  assignmentFilter === 'me' 
                    ? 'bg-gray-100 text-gray-900' 
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Assigned to me
              </button>
              <button
                onClick={() => setAssignmentFilter('all')}
                className={`px-4 py-1.5 text-sm font-medium border-l border-gray-300 transition-colors ${
                  assignmentFilter === 'all' 
                    ? 'bg-gray-100 text-gray-900' 
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                All
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="px-8 py-6">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="w-12 px-4 py-3 text-left">
                  <input 
                    type="checkbox" 
                    checked={selectedIds.size === filteredIncidents.length && filteredIncidents.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="w-28 px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="w-20 px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Priority</th>
                <th className="w-20 px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Urgency</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Title</th>
                <th className="w-28 px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                <th className="w-48 px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Service</th>
                <th className="w-32 px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Assigned To</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredIncidents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <div className="text-gray-400">
                      <svg className="w-12 h-12 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm font-medium">No incidents match your filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredIncidents.map((incident) => (
                  <tr 
                    key={incident.id}
                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${selectedIds.has(incident.id) ? 'bg-blue-50' : ''}`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).tagName !== 'INPUT') {
                        setSelectedIncident(incident)
                      }
                    }}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox"
                        checked={selectedIds.has(incident.id)}
                        onChange={() => toggleSelect(incident.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={incident.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-400">--</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-900">{incident.urgency === 'HIGH' ? 'High' : 'Low'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setSelectedIncident(incident) }}
                          className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline text-left"
                        >
                          {incident.title}
                        </button>
                        <div className="mt-1">
                          <button 
                            className="text-xs text-gray-400 hover:text-gray-600"
                            onClick={(e) => { e.stopPropagation(); setSelectedIncident(incident) }}
                          >
                            + SHOW DETAILS ({incident.alerts_count} triggered alert{incident.alerts_count > 1 ? 's' : ''})
                          </button>
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">#{incident.incident_number}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">at {formatTimeShort(incident.created_at)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-blue-600 hover:underline">{incident.service}</span>
                    </td>
                    <td className="px-4 py-3">
                      {incident.assigned_to ? (
                        <span className="text-sm text-blue-600">{incident.assigned_to}</span>
                      ) : (
                        <span className="text-sm text-gray-300">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>Showing {filteredIncidents.length} of {incidents.length} incidents</span>
          <span>MTTR (24h): <span className="font-semibold text-gray-700">{metrics.mttr_minutes}m</span></span>
        </div>
      </div>

      {/* Drawer Overlay */}
      {selectedIncident && (
        <>
          <div 
            className="fixed inset-0 bg-black/30 z-40 transition-opacity" 
            onClick={() => setSelectedIncident(null)} 
          />
          <IncidentDrawer incident={selectedIncident} onClose={() => setSelectedIncident(null)} />
        </>
      )}
    </div>
  )
}

export default function IncidentsDashboard() {
  return (
    <Layout serviceName="Ops Ingestion" breadcrumbs={['Dashboards', 'Incidents']}>
      <IncidentsContent />
    </Layout>
  )
}

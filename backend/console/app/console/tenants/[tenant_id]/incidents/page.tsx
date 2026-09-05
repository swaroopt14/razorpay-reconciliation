'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated } from '@/services/auth'
import { Layout } from '@/components/aws/Layout'

// Types
type IncidentSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR'
type IncidentStatus = 'MONITORING' | 'INVESTIGATING' | 'RESOLVED'

interface TenantIncident {
  id: string
  incident_number: string
  severity: IncidentSeverity
  status: IncidentStatus
  title: string
  description: string
  owner: { name: string; avatar?: string } | null
  started_at: string
  resolved_at: string | null
  duration: string
  affected_events: number
  dlq_items: number
  primary_service: string
  root_signals: string[]
  linked_pages: { label: string; href: string }[]
}

interface TenantInfo {
  tenant_id: string
  tenant_name: string
  display_name: string
  status: 'HEALTHY' | 'AT_RISK' | 'IMPACTED'
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH'
}

interface IncidentMetrics {
  active_count: number
  unassigned_count: number
  avg_ttr_minutes: number
  last_incident_ago: string
}

interface TimelineEvent {
  time: string
  description: string
}

interface FollowUp {
  id: string
  incident_id: string
  title: string
  priority: 'None' | 'Low' | 'Medium' | 'High'
  due_date: string
  assignee: { name: string; avatar?: string }
}

// Generate activity heatmap data (12 months, 7 days per week)
function generateActivityData(): { month: string; days: number[][] }[] {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return months.map(month => ({
    month,
    days: Array.from({ length: 7 }, () => 
      Array.from({ length: 4 }, () => Math.random() > 0.7 ? Math.floor(Math.random() * 4) : 0)
    )
  }))
}

// Mock data
const mockTenant: TenantInfo = {
  tenant_id: 't_91af',
  tenant_name: 'acme_fintech',
  display_name: 'Acme_Fintech',
  status: 'IMPACTED',
  risk_level: 'HIGH',
}

const mockIncidents: TenantIncident[] = [
  {
    id: 'INC-77',
    incident_number: 'INC-77',
    severity: 'CRITICAL',
    status: 'MONITORING',
    title: 'Database pool for public API has been saturated',
    description: 'Our monitoring systems have alerted that our public API services have been timing out. Root cause is likely scheduled maintenance. Database has been restarted and we are monitoring.',
    owner: { name: 'Lisa Karlin Curtis' },
    started_at: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString(),
    resolved_at: null,
    duration: '3h 31m',
    affected_events: 1247,
    dlq_items: 89,
    primary_service: 'zord-edge',
    root_signals: ['Database connection pool exhausted', 'API timeout errors increasing'],
    linked_pages: [
      { label: 'Platform Health', href: '/console/dashboards/platform-health' },
      { label: 'Error Monitor', href: '/console/ingestion/error-monitor' },
    ],
  },
  {
    id: 'INC-74',
    incident_number: 'INC-74',
    severity: 'MINOR',
    status: 'MONITORING',
    title: 'Website is down',
    description: 'Our website returns a 502 when you try to load it from a browser.',
    owner: { name: 'Aaron Sheah' },
    started_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    resolved_at: null,
    duration: '1mo',
    affected_events: 0,
    dlq_items: 0,
    primary_service: 'zord-relay',
    root_signals: ['502 errors on load balancer'],
    linked_pages: [
      { label: 'Outbox Health', href: '/console/ingestion/outbox-health' },
    ],
  },
]

const mockMetrics: IncidentMetrics = {
  active_count: 2,
  unassigned_count: 0,
  avg_ttr_minutes: 41,
  last_incident_ago: '3h ago',
}

const mockFollowUps: FollowUp[] = [
  {
    id: 'fu_001',
    incident_id: 'INC-1',
    title: 'This is a test incident',
    priority: 'None',
    due_date: '09/11/2022',
    assignee: { name: 'Incident Lead' },
  },
]

// Severity badge
function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  const config = {
    CRITICAL: { label: 'Critical', color: '#DC2626', bg: '#FEF2F2' },
    MAJOR: { label: 'Major', color: '#D97706', bg: '#FFFBEB' },
    MINOR: { label: 'Minor', color: '#6B7280', bg: '#F3F4F6' },
  }
  const c = config[severity]
  return (
    <span 
      className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded"
      style={{ color: c.color, background: c.bg }}
    >
      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
        <rect x="1" y="3" width="2" height="6" rx="0.5" />
        <rect x="5" y="2" width="2" height="7" rx="0.5" opacity={severity !== 'MINOR' ? 1 : 0.3} />
        <rect x="9" y="1" width="2" height="8" rx="0.5" opacity={severity === 'CRITICAL' ? 1 : 0.3} />
      </svg>
      {c.label}
    </span>
  )
}

// Status badge
function StatusBadge({ status }: { status: IncidentStatus }) {
  const config = {
    MONITORING: { label: 'Monitoring', icon: '◉' },
    INVESTIGATING: { label: 'Investigating', icon: '◎' },
    RESOLVED: { label: 'Resolved', icon: '✓' },
  }
  const c = config[status]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
      <span>{c.icon}</span>
      {c.label}
    </span>
  )
}

// Activity Heatmap (GitHub/incident.io style)
function ActivityHeatmap({ data }: { data: { month: string; days: number[][] }[] }) {
  const getColor = (value: number) => {
    if (value === 0) return '#EBEDF0'
    if (value === 1) return '#FECACA'
    if (value === 2) return '#FCA5A5'
    if (value === 3) return '#F87171'
    return '#EF4444'
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-0.5 min-w-max">
        {/* Month labels */}
        <div className="flex items-center mb-1">
          <div className="w-4" /> {/* Spacer for day labels */}
          {data.map((month, idx) => (
            <div key={idx} className="w-16 text-center text-[10px] text-gray-400">{month.month}</div>
          ))}
        </div>
        
        {/* Day rows */}
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, dayIdx) => (
          <div key={dayIdx} className="flex items-center gap-0.5">
            <div className="w-4 text-[10px] text-gray-400 text-right pr-1">{day}</div>
            {data.map((month, monthIdx) => (
              <div key={monthIdx} className="flex gap-0.5">
                {month.days[dayIdx]?.map((value, weekIdx) => (
                  <div
                    key={weekIdx}
                    className="w-3 h-3 rounded-sm"
                    style={{ background: getColor(value) }}
                    title={`${value} incidents`}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// Incident Card (incident.io style)
function IncidentCard({ 
  incident, 
  onClick 
}: { 
  incident: TenantIncident
  onClick: () => void 
}) {
  return (
    <div 
      onClick={onClick}
      className="p-5 border-l-4 rounded-lg cursor-pointer hover:shadow-md transition-shadow"
      style={{ 
        background: '#FFFFFF',
        borderLeftColor: incident.severity === 'CRITICAL' ? '#DC2626' : incident.severity === 'MAJOR' ? '#F59E0B' : '#9CA3AF',
        border: '1px solid #E5E7EB',
        borderLeftWidth: '4px',
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900">{incident.incident_number}</span>
            <span className="text-sm text-gray-900">{incident.title}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Default
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {incident.duration}
            </span>
          </div>
        </div>
      </div>
      
      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{incident.description}</p>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {incident.owner ? (
            <>
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-medium">
                {incident.owner.name.split(' ').map(n => n[0]).join('')}
              </div>
              <span className="text-sm text-gray-700">{incident.owner.name}</span>
            </>
          ) : (
            <span className="text-sm text-gray-400">Unassigned</span>
          )}
        </div>
        <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          Subscribe
        </button>
      </div>
    </div>
  )
}

// Incident Detail Drawer
function IncidentDrawer({ incident, onClose }: { incident: TenantIncident | null; onClose: () => void }) {
  if (!incident) return null

  return (
    <div className="fixed inset-y-0 right-0 w-[500px] z-50 flex flex-col" style={{ background: '#FFFFFF', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}>
      <div className="flex-shrink-0 px-6 py-5" style={{ borderBottom: '1px solid #E5E7EB' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono text-gray-500">{incident.incident_number}</span>
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{incident.title}</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Impact Stats */}
        <div className="grid grid-cols-3 divide-x divide-gray-200" style={{ borderBottom: '1px solid #E5E7EB', background: '#FAFAFA' }}>
          <div className="px-6 py-4 text-center">
            <div className="text-2xl font-bold text-gray-900 tabular-nums">{incident.affected_events.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-0.5">Failed Events</div>
          </div>
          <div className="px-6 py-4 text-center">
            <div className="text-2xl font-bold text-gray-900 tabular-nums">{incident.dlq_items}</div>
            <div className="text-xs text-gray-500 mt-0.5">DLQ Items</div>
          </div>
          <div className="px-6 py-4 text-center">
            <div className="text-2xl font-bold text-gray-900 tabular-nums">{incident.duration}</div>
            <div className="text-xs text-gray-500 mt-0.5">Duration</div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Description */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Description</div>
            <p className="text-sm text-gray-600">{incident.description}</p>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Started</div>
              <div className="text-sm text-gray-900 font-mono">{new Date(incident.started_at).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Primary Service</div>
              <div className="text-sm text-blue-600 font-medium">{incident.primary_service}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Owner</div>
              {incident.owner ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-medium">
                    {incident.owner.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <span className="text-sm text-gray-900">{incident.owner.name}</span>
                </div>
              ) : (
                <span className="text-sm text-red-600">Unassigned</span>
              )}
            </div>
          </div>

          {/* Root Signals */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Root Signals</div>
            <ul className="space-y-1">
              {incident.root_signals.map((signal, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="text-gray-400 mt-0.5">•</span>
                  {signal}
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Links */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Deep Links</div>
            <div className="space-y-1">
              {incident.linked_pages.map((link, idx) => (
                <Link
                  key={idx}
                  href={link.href}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all group"
                >
                  <span className="text-sm text-gray-700 group-hover:text-gray-900">{link.label}</span>
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 px-6 py-4 flex items-center gap-3" style={{ borderTop: '1px solid #E5E7EB', background: '#FAFAFA' }}>
        <button className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
          Subscribe
        </button>
        <button className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          View Full Details
        </button>
      </div>
    </div>
  )
}

function TenantIncidentsContent() {
  const router = useRouter()
  const params = useParams()
  const tenantId = params.tenant_id as string
  
  const [tenant, setTenant] = useState<TenantInfo>(mockTenant)
  const [incidents, setIncidents] = useState<TenantIncident[]>([])
  const [metrics, setMetrics] = useState<IncidentMetrics>(mockMetrics)
  const [followUps, setFollowUps] = useState<FollowUp[]>(mockFollowUps)
  const [loading, setLoading] = useState(true)
  const [selectedIncident, setSelectedIncident] = useState<TenantIncident | null>(null)
  const [activityData] = useState(generateActivityData())
  const [userFilter, setUserFilter] = useState('all')

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    loadData()
    const interval = setInterval(loadData, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [router, tenantId])

  const loadData = useCallback(async () => {
    await new Promise(resolve => setTimeout(resolve, 200))
    setTenant({ ...mockTenant, tenant_id: tenantId })
    setIncidents(mockIncidents)
    setMetrics(mockMetrics)
    setFollowUps(mockFollowUps)
    setLoading(false)
  }, [tenantId])

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

  const liveIncidents = incidents.filter(i => i.status !== 'RESOLVED')

  return (
    <div className="min-h-screen" style={{ background: '#F8F9FA' }}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-gray-900">Home</h1>
            <div className="flex items-center gap-3">
              <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Start tutorial
              </button>
              <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Declare incident
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-8">
        {/* Live Incidents Section */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
            <h2 className="text-lg font-semibold text-gray-900">Live incidents</h2>
            <span className="flex items-center gap-1.5 text-sm text-gray-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refreshes every 30s
            </span>
          </div>

          {liveIncidents.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-900">All clear</p>
              <p className="text-sm text-gray-500 mt-1">No active incidents for this tenant</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {liveIncidents.map((incident) => (
                <IncidentCard
                  key={incident.id}
                  incident={incident}
                  onClick={() => setSelectedIncident(incident)}
                />
              ))}
            </div>
          )}

          <Link 
            href="/console/dashboards/incidents" 
            className="inline-flex items-center gap-1 mt-4 text-sm text-blue-600 hover:text-blue-700"
          >
            View all 75 live incidents
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* Activity Heatmap */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">Activity</h2>
              <button className="p-1 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Include</span>
              <select 
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All users</option>
                <option value="me">Only me</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <ActivityHeatmap data={activityData} />
          </div>
        </div>

        {/* Open Follow-ups */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Open follow-ups</h2>
          <p className="text-sm text-gray-600 mb-4">
            There are <span className="font-semibold">{followUps.length} follow-ups</span> assigned to you
          </p>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {followUps.map((followUp) => (
              <div 
                key={followUp.id}
                className="flex items-center justify-between px-5 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-gray-900">{followUp.incident_id}</span>
                  <span className="text-sm text-gray-600">{followUp.title}</span>
                  <span className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-gray-500 bg-gray-100 rounded">
                    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                      <rect x="3" y="3" width="2" height="6" rx="0.5" opacity="0.3" />
                      <rect x="6" y="2" width="2" height="7" rx="0.5" opacity="0.3" />
                      <rect x="9" y="1" width="2" height="8" rx="0.5" opacity="0.3" />
                    </svg>
                    {followUp.priority}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {followUp.due_date}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">{followUp.assignee.name}</span>
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-medium">
                    {followUp.assignee.name.split(' ').map(n => n[0]).join('')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div className="flex items-center gap-4 pt-4 border-t border-gray-200">
          <Link href={`/console/tenants/${tenantId}`} className="text-sm text-blue-600 hover:text-blue-700">
            View Tenant Platform
          </Link>
          <Link href="/console/dashboards/incidents" className="text-sm text-blue-600 hover:text-blue-700">
            View Global Incidents
          </Link>
          <Link href="/console/dashboards/platform-health" className="text-sm text-blue-600 hover:text-blue-700">
            Platform Health
          </Link>
        </div>
      </div>

      {/* Incident Detail Drawer */}
      {selectedIncident && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelectedIncident(null)} />
          <IncidentDrawer incident={selectedIncident} onClose={() => setSelectedIncident(null)} />
        </>
      )}
    </div>
  )
}

export default function TenantIncidentsPage() {
  return (
    <Layout serviceName="Ops Ingestion" breadcrumbs={['Tenants', 'Incidents']}>
      <TenantIncidentsContent />
    </Layout>
  )
}

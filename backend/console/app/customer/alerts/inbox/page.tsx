'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Alert {
  id: string
  rule: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  description: string
  triggeredAt: string
  status: 'active' | 'acknowledged' | 'resolved'
  href: string
}

const alerts: Alert[] = [
  { id: 'ALT-001', rule: 'AR-001', severity: 'critical', title: 'SLA Breach: P95 Ack Latency at 480ms', description: 'Threshold: 450ms. Breached for 12 minutes. Affects all payment intents.', triggeredAt: '2m ago', status: 'active', href: '/customer/exceptions' },
  { id: 'ALT-002', rule: 'AR-003', severity: 'critical', title: 'Webhook delivery failures: 12 in 1h', description: 'Endpoint /webhooks/payment-status returning 503. Threshold: 10.', triggeredAt: '14m ago', status: 'active', href: '/customer/integrations/webhooks' },
  { id: 'ALT-003', rule: 'AR-004', severity: 'warning', title: 'Recon lag exceeds 15 minutes', description: 'Settlement file processing delayed. Current lag: 18min.', triggeredAt: '22m ago', status: 'acknowledged', href: '/customer/reports/settlement' },
  { id: 'ALT-004', rule: 'AR-008', severity: 'warning', title: '5 stale intents (pending > 30min)', description: 'Intents stuck in pending state. May require manual replay.', triggeredAt: '35m ago', status: 'active', href: '/customer/intents/replay' },
  { id: 'ALT-005', rule: 'AR-002', severity: 'warning', title: 'Failure rate spike: 2.1% in last hour', description: 'Threshold: 2%. Primarily schema validation failures.', triggeredAt: '45m ago', status: 'acknowledged', href: '/customer/exceptions' },
  { id: 'ALT-006', rule: 'AR-001', severity: 'critical', title: 'SLA Breach: P95 Ack Latency at 510ms', description: 'Second breach in 1h. Escalation to supervisor recommended.', triggeredAt: '1h ago', status: 'resolved', href: '/customer/exceptions' },
  { id: 'ALT-007', rule: 'AR-006', severity: 'critical', title: 'Provider down: SBI IMPS adapter', description: 'SBI IMPS adapter health check failing since 13:00 IST.', triggeredAt: '1h 30m ago', status: 'active', href: '/customer/integrations/adapters' },
  { id: 'ALT-008', rule: 'AR-003', severity: 'warning', title: 'Webhook settlement-confirm returning 500', description: '3 failures in last 30min. Auto-retry engaged.', triggeredAt: '2h ago', status: 'resolved', href: '/customer/integrations/webhooks' },
]

const severityConfig = {
  critical: { label: 'Critical', color: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500', ring: 'ring-red-100' },
  warning: { label: 'Warning', color: 'bg-cx-orange-50 text-cx-orange-700 border-cx-orange-200', dot: 'bg-cx-orange-500', ring: 'ring-cx-orange-100' },
  info: { label: 'Info', color: 'bg-cx-purple-50 text-cx-purple-700 border-cx-purple-200', dot: 'bg-cx-purple-500', ring: 'ring-cx-purple-100' },
}

const statusConfig = {
  active: { label: 'Active', color: 'bg-red-50 text-red-700' },
  acknowledged: { label: 'Acknowledged', color: 'bg-cx-purple-50 text-cx-purple-700' },
  resolved: { label: 'Resolved', color: 'bg-cx-teal-50 text-cx-teal-700' },
}

export default function AlertInboxPage() {
  const [filter, setFilter] = useState<'all' | 'active' | 'acknowledged' | 'resolved'>('all')
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all')

  const filtered = alerts.filter(a => {
    if (filter !== 'all' && a.status !== filter) return false
    if (severityFilter !== 'all' && a.severity !== severityFilter) return false
    return true
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-cx-text">Alert Inbox</h1>
          <p className="text-sm text-cx-neutral mt-0.5">Active and recent alert notifications</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-50 text-red-700 border border-red-200">
            {alerts.filter(a => a.status === 'active').length} Active
          </span>
          <button className="px-3 py-1.5 text-xs font-semibold text-cx-purple-600 bg-cx-purple-50 border border-cx-purple-200 rounded-lg hover:bg-cx-purple-100 transition-colors">
            Acknowledge All
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['all', 'active', 'acknowledged', 'resolved'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${
                filter === f ? 'bg-white text-cx-text shadow-sm' : 'text-cx-neutral hover:text-cx-text'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['all', 'critical', 'warning', 'info'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setSeverityFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${
                severityFilter === f ? 'bg-white text-cx-text shadow-sm' : 'text-cx-neutral hover:text-cx-text'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="text-xs text-cx-neutral ml-auto">{filtered.length} alerts</span>
      </div>

      {/* Alert List */}
      <div className="space-y-2">
        {filtered.map((alert) => (
          <Link
            key={alert.id}
            href={alert.href}
            className={`block bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-all group ${
              alert.status === 'active' ? 'hover:border-red-200 ring-1 ring-red-50' :
              alert.status === 'resolved' ? 'opacity-60 hover:border-gray-200' :
              'hover:border-cx-purple-200'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${severityConfig[alert.severity].dot} ${
                alert.status === 'active' ? 'animate-pulse' : ''
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${severityConfig[alert.severity].color}`}>
                    {severityConfig[alert.severity].label}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusConfig[alert.status].color}`}>
                    {statusConfig[alert.status].label}
                  </span>
                  <span className="text-[10px] font-mono text-cx-neutral">{alert.rule}</span>
                  <span className="text-[10px] text-cx-neutral ml-auto">{alert.triggeredAt}</span>
                </div>
                <h3 className="text-sm font-semibold text-cx-text mt-1.5 group-hover:text-cx-purple-700 transition-colors">{alert.title}</h3>
                <p className="text-xs text-cx-neutral mt-0.5">{alert.description}</p>
              </div>
              <svg className="w-4 h-4 text-gray-300 group-hover:text-cx-purple-500 transition-colors flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

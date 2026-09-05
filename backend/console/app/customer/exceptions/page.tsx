'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchCustomerDlq, fetchCustomerIntents, formatRelativeAge } from '../_lib/customerProdApi'

const failedCategories = [
  { category: 'Schema Validation', count: 47, trend: '+12', severity: 'warning', playbook: 'Verify payload against payment_v3 schema', href: '/customer/intents' },
  { category: 'Authentication Error', count: 28, trend: '+3', severity: 'critical', playbook: 'Rotate API keys, check IP allowlist', href: '/customer/integrations/api-logs' },
  { category: 'Provider Timeout', count: 23, trend: '-5', severity: 'warning', playbook: 'Check provider status page, consider retry', href: '/customer/intents/replay' },
  { category: 'Insufficient Funds', count: 19, trend: '+7', severity: 'info', playbook: 'Notify originator, check balance thresholds', href: '/customer/intents' },
  { category: 'Webhook Delivery', count: 12, trend: '+12', severity: 'critical', playbook: 'Verify endpoint health, check TLS cert', href: '/customer/integrations/webhooks' },
  { category: 'Duplicate Intent', count: 5, trend: '0', severity: 'info', playbook: 'Review idempotency key generation', href: '/customer/intents' },
]

const webhookFailures = [
  { endpoint: '/webhooks/payment-status', failures: 8, lastAttempt: '2m ago', status: 'retrying', statusCode: 503 },
  { endpoint: '/webhooks/settlement-confirm', failures: 3, lastAttempt: '14m ago', status: 'failed', statusCode: 500 },
  { endpoint: '/webhooks/refund-notify', failures: 1, lastAttempt: '1h ago', status: 'resent', statusCode: 200 },
]

const staleIntents = [
  { id: 'pi_20260210_A1XK', type: 'payment', age: '47 min', amount: '₹12,500.00', status: 'pending_provider' },
  { id: 'pi_20260210_B2YL', type: 'refund', age: '38 min', amount: '₹4,200.00', status: 'pending_settlement' },
  { id: 'pi_20260210_C3ZM', type: 'payment', age: '35 min', amount: '₹8,900.00', status: 'pending_ack' },
  { id: 'pi_20260210_D4WN', type: 'payment', age: '32 min', amount: '₹2,100.00', status: 'pending_provider' },
  { id: 'pi_20260210_E5VP', type: 'payout', age: '31 min', amount: '₹56,000.00', status: 'pending_bank' },
]

const slaMetrics = [
  { metric: 'Ack Latency (P50)', value: '89ms', threshold: '200ms', status: 'ok' },
  { metric: 'Ack Latency (P95)', value: '480ms', threshold: '450ms', status: 'breach' },
  { metric: 'Ack Latency (P99)', value: '1.2s', threshold: '2s', status: 'warning' },
  { metric: 'Outcome Latency (P50)', value: '3.2s', threshold: '10s', status: 'ok' },
  { metric: 'Outcome Latency (P95)', value: '8.7s', threshold: '10s', status: 'warning' },
  { metric: 'Webhook Delivery (P95)', value: '12s', threshold: '30s', status: 'ok' },
]

export default function ExceptionsSlaPage() {
  const [selectedTab, setSelectedTab] = useState<'failures' | 'sla' | 'stale'>('failures')
  const [dlqCount, setDlqCount] = useState<number | null>(null)
  const [liveStale, setLiveStale] = useState<typeof staleIntents>([])

  useEffect(() => {
    void fetchCustomerDlq().then((items) => setDlqCount(items.length))
    void fetchCustomerIntents({ page_size: 20 }).then(({ items }) => {
      const rows = items
        .filter((i) => {
          const s = (i.status || '').toLowerCase()
          return s.includes('pending')
        })
        .map((i) => ({
          id: i.intent_id,
          type: i.intent_type || 'payment',
          age: formatRelativeAge(i.created_at),
          amount: String(i.amount ?? '-'),
          status: i.status || 'pending',
        }))
      if (rows.length > 0) setLiveStale(rows)
    })
  }, [])

  const staleRows = liveStale.length > 0 ? liveStale : staleIntents

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-cx-text">Exceptions & SLA</h1>
          <p className="text-sm text-cx-neutral mt-0.5">
            DLQ from `/api/prod/dlq` · stale intents from `/api/prod/intents` when pending
            {dlqCount != null ? ` · ${dlqCount} DLQ item(s)` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-50 text-red-700 border border-red-200">
            3 SLA Breaches
          </span>
          <span className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cx-orange-50 text-cx-orange-700 border border-cx-orange-200">
            134 Failed Intents
          </span>
          <span className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cx-purple-50 text-cx-purple-700 border border-cx-purple-200">
            5 Needs Replay
          </span>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Failed Intents', value: '134', sub: 'last 24h', color: 'border-l-cx-orange-500' },
          { label: 'Needs Replay', value: '5', sub: 'manual review required', color: 'border-l-cx-purple-500' },
          { label: 'SLA Breaches', value: '3', sub: 'P95 ack latency', color: 'border-l-red-500' },
          { label: 'Stale States', value: '5', sub: 'pending > 30min', color: 'border-l-amber-500' },
        ].map((m) => (
          <div key={m.label} className={`bg-white rounded-xl border border-gray-100 border-l-4 ${m.color} p-4`}>
            <p className="text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">{m.label}</p>
            <p className="text-2xl font-bold text-cx-text mt-1 tabular-nums">{m.value}</p>
            <p className="text-xs text-cx-neutral mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[
          { id: 'failures' as const, label: 'Failed Intents', count: 134 },
          { id: 'sla' as const, label: 'SLA Status', count: 3 },
          { id: 'stale' as const, label: 'Stale States', count: 5 },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              selectedTab === tab.id
                ? 'bg-white text-cx-text shadow-sm'
                : 'text-cx-neutral hover:text-cx-text'
            }`}
          >
            {tab.label}
            <span className={`ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
              selectedTab === tab.id ? 'bg-cx-purple-100 text-cx-purple-700' : 'bg-gray-200 text-gray-500'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Failed Intents Tab */}
      {selectedTab === 'failures' && (
        <div className="space-y-6">
          {/* By Category */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-cx-text">Failed Intents by Category</h3>
              <p className="text-xs text-cx-neutral mt-0.5">Click a category for recommended playbook</p>
            </div>
            <div className="divide-y divide-gray-50">
              {failedCategories.map((cat) => (
                <Link
                  key={cat.category}
                  href={cat.href}
                  className="flex items-center px-5 py-3.5 hover:bg-gray-50 transition-colors group"
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 mr-3 ${
                    cat.severity === 'critical' ? 'bg-red-500' :
                    cat.severity === 'warning' ? 'bg-cx-orange-500' :
                    'bg-cx-purple-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-cx-text group-hover:text-cx-purple-700 transition-colors">{cat.category}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        parseInt(cat.trend) > 0 ? 'bg-red-50 text-red-600' :
                        parseInt(cat.trend) < 0 ? 'bg-cx-teal-50 text-cx-teal-600' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {parseInt(cat.trend) > 0 ? '+' : ''}{cat.trend}
                      </span>
                    </div>
                    <p className="text-xs text-cx-neutral mt-0.5 truncate">{cat.playbook}</p>
                  </div>
                  <div className="flex items-center gap-4 ml-4">
                    <span className="text-lg font-bold text-cx-text tabular-nums">{cat.count}</span>
                    <svg className="w-4 h-4 text-gray-300 group-hover:text-cx-purple-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Webhook Failures */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-cx-text">Webhook Delivery Failures</h3>
                <p className="text-xs text-cx-neutral mt-0.5">Endpoints with failed deliveries in last 24h</p>
              </div>
              <Link href="/customer/integrations/webhooks" className="text-xs font-semibold text-cx-purple-600 hover:text-cx-purple-700">
                View all →
              </Link>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Endpoint</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Failures</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Last Status</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Last Attempt</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {webhookFailures.map((wh) => (
                  <tr key={wh.endpoint} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-mono text-cx-text">{wh.endpoint}</td>
                    <td className="px-5 py-3 text-sm font-bold text-cx-orange-600 tabular-nums">{wh.failures}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                        wh.statusCode >= 500 ? 'bg-red-50 text-red-600' :
                        wh.statusCode >= 400 ? 'bg-cx-orange-50 text-cx-orange-600' :
                        'bg-cx-teal-50 text-cx-teal-600'
                      }`}>
                        {wh.statusCode}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-cx-neutral">{wh.lastAttempt}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        wh.status === 'retrying' ? 'bg-cx-orange-50 text-cx-orange-600' :
                        wh.status === 'failed' ? 'bg-red-50 text-red-600' :
                        'bg-cx-teal-50 text-cx-teal-600'
                      }`}>
                        {wh.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SLA Tab */}
      {selectedTab === 'sla' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-cx-text">SLA Performance Matrix</h3>
            <p className="text-xs text-cx-neutral mt-0.5">Current latency metrics vs. SLA thresholds</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Metric</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Current</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Threshold</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Utilization</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {slaMetrics.map((sla) => {
                const currentMs = parseFloat(sla.value)
                const thresholdMs = parseFloat(sla.threshold)
                const pct = Math.min((currentMs / thresholdMs) * 100, 100)

                return (
                  <tr key={sla.metric} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-medium text-cx-text">{sla.metric}</td>
                    <td className="px-5 py-3.5 text-sm font-mono font-bold text-cx-text tabular-nums">{sla.value}</td>
                    <td className="px-5 py-3.5 text-sm font-mono text-cx-neutral tabular-nums">{sla.threshold}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        sla.status === 'ok' ? 'bg-cx-teal-50 text-cx-teal-700' :
                        sla.status === 'warning' ? 'bg-cx-orange-50 text-cx-orange-700' :
                        'bg-red-50 text-red-700'
                      }`}>
                        {sla.status === 'ok' ? 'Within SLA' : sla.status === 'warning' ? 'At Risk' : 'SLA Breach'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden max-w-[120px]">
                          <div
                            className={`h-full rounded-full transition-all ${
                              sla.status === 'ok' ? 'bg-cx-teal-500' :
                              sla.status === 'warning' ? 'bg-cx-orange-500' :
                              'bg-red-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-cx-neutral tabular-nums">{Math.round(pct)}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Stale States Tab */}
      {selectedTab === 'stale' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-cx-text">Stale States - Pending &gt; 30 minutes</h3>
              <p className="text-xs text-cx-neutral mt-0.5">These intents may need manual intervention or replay</p>
            </div>
            <Link
              href="/customer/intents/replay"
              className="px-3 py-1.5 text-xs font-semibold bg-cx-purple-600 text-white rounded-lg hover:bg-cx-purple-700 transition-colors"
            >
              Open Replay Center
            </Link>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Intent ID</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Type</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Amount</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Pending Since</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Status</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {staleRows.map((intent) => (
                <tr key={intent.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/customer/intents/${intent.id}`} className="text-sm font-mono text-cx-purple-600 hover:text-cx-purple-700 hover:underline">
                      {intent.id}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-cx-text capitalize">{intent.type}</span>
                  </td>
                  <td className="px-5 py-3 text-sm font-mono font-medium text-cx-text tabular-nums">{intent.amount}</td>
                  <td className="px-5 py-3">
                    <span className="text-sm font-semibold text-cx-orange-600">{intent.age}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-700">{intent.status}</span>
                  </td>
                  <td className="px-5 py-3">
                    <button className="text-xs font-semibold text-cx-purple-600 hover:text-cx-purple-700 hover:underline">
                      Replay →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

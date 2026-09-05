'use client'

import { useMemo, useState } from 'react'
import { MOCK_INTENT_IDS } from '../../mock'

interface WebhookEndpoint {
  id: string
  url: string
  events: string[]
  status: 'enabled' | 'disabled' | 'degraded' | 'down'
  successRate: string
  lastDelivery: string
  totalDeliveries: number
  failedDeliveries: number
  updatedAt: string
}

const DEFAULT_EVENTS = [
  'intent.completed',
  'intent.failed',
  'intent.created',
  'contract.issued',
  'contract.failed',
  'settlement.confirmed',
  'refund.initiated',
  'refund.completed',
  'evidence.generated',
]

const initialEndpoints: WebhookEndpoint[] = [
  { id: 'wh_001', url: 'https://api.acmepay.com/webhooks/payment-status', events: ['intent.completed', 'intent.failed', 'intent.created'], status: 'degraded', successRate: '94.2%', lastDelivery: '2m ago', totalDeliveries: 4821, failedDeliveries: 279, updatedAt: '2026-02-20 14:22:10' },
  { id: 'wh_002', url: 'https://api.acmepay.com/webhooks/settlement-confirm', events: ['settlement.confirmed'], status: 'down', successRate: '78.1%', lastDelivery: '14m ago', totalDeliveries: 1203, failedDeliveries: 264, updatedAt: '2026-02-20 14:09:33' },
  { id: 'wh_003', url: 'https://api.acmepay.com/webhooks/refund-notify', events: ['refund.initiated', 'refund.completed'], status: 'enabled', successRate: '99.8%', lastDelivery: '5m ago', totalDeliveries: 892, failedDeliveries: 2, updatedAt: '2026-02-20 14:18:02' },
  { id: 'wh_004', url: 'https://api.acmepay.com/webhooks/evidence-ready', events: ['evidence.generated'], status: 'enabled', successRate: '100%', lastDelivery: '1m ago', totalDeliveries: 4102, failedDeliveries: 0, updatedAt: '2026-02-20 14:23:01' },
  { id: 'wh_005', url: 'https://api.acmepay.com/webhooks/contracts', events: ['contract.issued', 'contract.failed'], status: 'disabled', successRate: '-', lastDelivery: '-', totalDeliveries: 0, failedDeliveries: 0, updatedAt: '2026-02-18 09:10:00' },
]

type Delivery = {
  id: string
  endpointId: string
  endpointLabel: string
  event: string
  statusCode: number
  latency: string
  time: string
  intentId: string
}

const deliveriesSeed: Delivery[] = [
  { id: 'del_001', endpointId: 'wh_001', endpointLabel: 'payment-status', event: 'intent.completed', statusCode: 200, latency: '120ms', time: '14:23:48', intentId: MOCK_INTENT_IDS[0] },
  { id: 'del_002', endpointId: 'wh_001', endpointLabel: 'payment-status', event: 'intent.created', statusCode: 200, latency: '86ms', time: '14:23:47', intentId: MOCK_INTENT_IDS[1] },
  { id: 'del_003', endpointId: 'wh_002', endpointLabel: 'settlement-confirm', event: 'settlement.confirmed', statusCode: 503, latency: '30012ms', time: '14:23:46', intentId: MOCK_INTENT_IDS[0] },
  { id: 'del_004', endpointId: 'wh_001', endpointLabel: 'payment-status', event: 'intent.failed', statusCode: 200, latency: '88ms', time: '14:23:45', intentId: MOCK_INTENT_IDS[2] },
  { id: 'del_005', endpointId: 'wh_004', endpointLabel: 'evidence-ready', event: 'evidence.generated', statusCode: 200, latency: '67ms', time: '14:23:44', intentId: MOCK_INTENT_IDS[0] },
  { id: 'del_006', endpointId: 'wh_003', endpointLabel: 'refund-notify', event: 'refund.initiated', statusCode: 200, latency: '140ms', time: '14:22:58', intentId: MOCK_INTENT_IDS[3] },
  { id: 'del_007', endpointId: 'wh_003', endpointLabel: 'refund-notify', event: 'refund.completed', statusCode: 200, latency: '110ms', time: '14:22:50', intentId: MOCK_INTENT_IDS[3] },
  { id: 'del_008', endpointId: 'wh_001', endpointLabel: 'payment-status', event: 'intent.completed', statusCode: 200, latency: '98ms', time: '14:22:34', intentId: MOCK_INTENT_IDS[4] },
  { id: 'del_009', endpointId: 'wh_002', endpointLabel: 'settlement-confirm', event: 'settlement.confirmed', statusCode: 502, latency: '8012ms', time: '14:22:11', intentId: MOCK_INTENT_IDS[4] },
  { id: 'del_010', endpointId: 'wh_004', endpointLabel: 'evidence-ready', event: 'evidence.generated', statusCode: 200, latency: '73ms', time: '14:21:56', intentId: MOCK_INTENT_IDS[1] },
  { id: 'del_011', endpointId: 'wh_001', endpointLabel: 'payment-status', event: 'intent.created', statusCode: 200, latency: '62ms', time: '14:21:41', intentId: MOCK_INTENT_IDS[2] },
  { id: 'del_012', endpointId: 'wh_001', endpointLabel: 'payment-status', event: 'intent.failed', statusCode: 200, latency: '79ms', time: '14:21:05', intentId: MOCK_INTENT_IDS[2] },
  { id: 'del_013', endpointId: 'wh_002', endpointLabel: 'settlement-confirm', event: 'settlement.confirmed', statusCode: 503, latency: '30012ms', time: '14:20:40', intentId: MOCK_INTENT_IDS[0] },
  { id: 'del_014', endpointId: 'wh_004', endpointLabel: 'evidence-ready', event: 'evidence.generated', statusCode: 200, latency: '61ms', time: '14:20:11', intentId: MOCK_INTENT_IDS[0] },
  { id: 'del_015', endpointId: 'wh_001', endpointLabel: 'payment-status', event: 'intent.completed', statusCode: 200, latency: '101ms', time: '14:19:55', intentId: MOCK_INTENT_IDS[1] },
]

export default function WebhookDeliveryPage() {
  const [activePrimaryTab, setActivePrimaryTab] = useState<'configuration' | 'webhooks' | 'api_keys' | 'reminders' | 'applications'>('webhooks')
  const [view, setView] = useState<'endpoints' | 'deliveries'>('endpoints')
  const [query, setQuery] = useState<string>('')
  const [endpointQuery, setEndpointQuery] = useState<string>('')
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>(() => initialEndpoints)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [showCreate, setShowCreate] = useState(false)
  const [newUrl, setNewUrl] = useState('https://api.acmepay.com/webhooks/new-webhook')
  const [newStatus, setNewStatus] = useState<WebhookEndpoint['status']>('enabled')
  const [newEvents, setNewEvents] = useState<Set<string>>(() => new Set(['intent.completed', 'intent.failed']))
  const [deliveries] = useState<Delivery[]>(() => deliveriesSeed)

  const pushToast = (title: string, desc?: string, type: 'success' | 'warning' | 'error' | 'info' = 'info') => {
    window.dispatchEvent(new CustomEvent('cx:toast', { detail: { title, desc, type } }))
  }

  const filteredDeliveries = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return deliveries
    return deliveries.filter((d) => `${d.endpointLabel} ${d.event} ${d.statusCode} ${d.intentId}`.toLowerCase().includes(q))
  }, [query, deliveries])

  const filteredEndpoints = useMemo(() => {
    const q = endpointQuery.trim().toLowerCase()
    if (!q) return endpoints
    return endpoints.filter((e) => `${e.url} ${e.status} ${e.events.join(' ')}`.toLowerCase().includes(q))
  }, [endpointQuery, endpoints])

  const statusBadge = (s: WebhookEndpoint['status']) => {
    if (s === 'enabled') return { label: 'Enabled', cls: 'bg-cx-teal-50 text-cx-teal-700 border-cx-teal-200' }
    if (s === 'disabled') return { label: 'Disabled', cls: 'bg-gray-50 text-gray-700 border-gray-200' }
    if (s === 'degraded') return { label: 'Degraded', cls: 'bg-cx-orange-50 text-cx-orange-700 border-cx-orange-200' }
    return { label: 'Down', cls: 'bg-red-50 text-red-700 border-red-200' }
  }

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const createWebhook = () => {
    const url = newUrl.trim()
    if (!url) return
    const id = `wh_${String(endpoints.length + 1).padStart(3, '0')}`
    const ev = Array.from(newEvents)
    const next: WebhookEndpoint = {
      id,
      url,
      events: ev.length ? ev : ['intent.completed'],
      status: newStatus,
      successRate: newStatus === 'disabled' ? '-' : '100%',
      lastDelivery: '-',
      totalDeliveries: 0,
      failedDeliveries: 0,
      updatedAt: '2026-02-21 10:00:00',
    }
    setEndpoints((prev) => [next, ...prev])
    setShowCreate(false)
    pushToast('Webhook added', `${url}`, 'success')
  }

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      pushToast('Copied', label, 'success')
    } catch {
      pushToast('Copy failed', 'Clipboard permission blocked.', 'warning')
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* Razorpay-style top tab bar */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm">
            {[
              { id: 'configuration', label: 'Configuration' },
              { id: 'webhooks', label: 'Webhooks' },
              { id: 'api_keys', label: 'API Keys' },
              { id: 'reminders', label: 'Reminders' },
              { id: 'applications', label: 'Applications' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActivePrimaryTab(t.id as typeof activePrimaryTab)}
                className={`px-1.5 py-1 text-sm font-semibold transition-colors ${
                  activePrimaryTab === (t.id as typeof activePrimaryTab) ? 'text-cx-purple-700' : 'text-cx-neutral hover:text-cx-text'
                }`}
                style={activePrimaryTab === (t.id as typeof activePrimaryTab) ? { borderBottom: '2px solid var(--cx-primary)' } : undefined}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => pushToast('Docs (simulated)', 'Open webhook docs in your browser.', 'info')}
              className="text-sm font-semibold text-cx-purple-600 hover:text-cx-purple-700"
              title="Documentation"
            >
              Documentation ↗
            </button>
            {activePrimaryTab === 'webhooks' ? (
              <button
                onClick={() => setShowCreate(true)}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-cx-purple-600 text-white hover:bg-cx-purple-700 transition-colors"
              >
                + Add New Webhook
              </button>
            ) : null}
          </div>
        </div>

        {activePrimaryTab !== 'webhooks' ? (
          <div className="border-t border-gray-100">
            {/* All below is mock-only UI, to keep the customer console feeling complete. */}
            {activePrimaryTab === 'configuration' ? (
              <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-gray-100 bg-white p-5">
                  <h3 className="text-sm font-semibold text-cx-text">Signing & Security</h3>
                  <p className="text-xs text-cx-neutral mt-1">Webhook signature settings (simulated)</p>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-4 bg-gray-50/40">
                      <div>
                        <div className="text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Signing Secret</div>
                        <div className="mt-1 font-mono text-xs text-cx-text">whsec_************************</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => void copyToClipboard('whsec_REDACTED', 'Signing secret')}
                          className="px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          Copy
                        </button>
                        <button
                          onClick={() => pushToast('Rotated (simulated)', 'New signing secret generated.', 'success')}
                          className="px-3 py-2 text-xs font-semibold rounded-lg bg-cx-purple-600 text-white hover:bg-cx-purple-700 transition-colors"
                        >
                          Rotate
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 p-4">
                      <div className="text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">IP Allowlist</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {['13.234.0.0/16', '35.154.0.0/16', '52.66.0.0/16'].map((cidr) => (
                          <span key={cidr} className="text-[11px] font-mono px-2 py-1 rounded-md bg-gray-100 text-cx-text border border-gray-200">
                            {cidr}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 text-xs text-cx-neutral">
                        Only allow inbound webhook requests from trusted IP ranges.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-5">
                  <h3 className="text-sm font-semibold text-cx-text">Retry Policy</h3>
                  <p className="text-xs text-cx-neutral mt-1">Delivery retry behavior (simulated)</p>
                  <div className="mt-4 space-y-3">
                    {[
                      { k: 'Attempts', v: '8' },
                      { k: 'Backoff', v: 'Exponential (min 30s, max 15m)' },
                      { k: 'Timeout', v: '30s' },
                      { k: 'Dead-letter', v: 'After final attempt' },
                    ].map((x) => (
                      <div key={x.k} className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 p-4 bg-gray-50/40">
                        <div className="text-xs text-cx-neutral">{x.k}</div>
                        <div className="text-xs font-semibold text-cx-text">{x.v}</div>
                      </div>
                    ))}
                    <button
                      onClick={() => pushToast('Saved (simulated)', 'Retry policy updated.', 'success')}
                      className="w-full mt-1 px-4 py-2.5 text-sm font-semibold rounded-lg bg-cx-purple-600 text-white hover:bg-cx-purple-700 transition-colors"
                    >
                      Save Configuration
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {activePrimaryTab === 'api_keys' ? (
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-cx-text">API Keys</h3>
                    <p className="text-xs text-cx-neutral mt-1">Keys used by your systems to call Zord Edge (simulated)</p>
                  </div>
                  <button
                    onClick={() => pushToast('Key created (simulated)', 'New key is available in your vault.', 'success')}
                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-cx-purple-600 text-white hover:bg-cx-purple-700 transition-colors"
                  >
                    + Create Key
                  </button>
                </div>
                <div className="rounded-2xl border border-gray-100 overflow-hidden bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50/50">
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Key</th>
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Mode</th>
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Created</th>
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Last Used</th>
                        <th className="px-5 py-3 text-right text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {[
                        { id: 'key_001', mode: 'SANDBOX', created: '2026-02-18 10:10:00', last: '2026-02-21 09:01:12', value: 'abcd211.e8aa7895f90a05...' },
                        { id: 'key_002', mode: 'PROD', created: '2026-02-10 12:00:00', last: '2026-02-21 09:00:04', value: 'prod_9c1b2a... (masked)' },
                      ].map((k) => (
                        <tr key={k.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="text-xs font-mono text-cx-text">{k.value}</div>
                            <div className="text-[10px] text-cx-neutral mt-1">{k.id}</div>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                              k.mode === 'PROD' ? 'bg-cx-teal-50 text-cx-teal-700 border-cx-teal-200' : 'bg-cx-orange-50 text-cx-orange-700 border-cx-orange-200'
                            }`}>{k.mode}</span>
                          </td>
                          <td className="px-5 py-3 text-xs text-cx-neutral">{k.created}</td>
                          <td className="px-5 py-3 text-xs text-cx-neutral">{k.last}</td>
                          <td className="px-5 py-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                onClick={() => void copyToClipboard(k.value, 'API key')}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                              >
                                Copy
                              </button>
                              <button
                                onClick={() => pushToast('Rotated (simulated)', `${k.id} rotated`, 'success')}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cx-purple-600 text-white hover:bg-cx-purple-700 transition-colors"
                              >
                                Rotate
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {activePrimaryTab === 'reminders' ? (
              <div className="p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-cx-text">Reminders</h3>
                  <p className="text-xs text-cx-neutral mt-1">Ops reminders and alerts (simulated)</p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {[
                    { id: 'rem_001', title: 'Webhook failure spike', channel: 'Email', target: 'ops@acmepay.com', cadence: 'Every 15 min', status: 'Enabled' },
                    { id: 'rem_002', title: 'Adapter certificate expiry', channel: 'Email', target: 'security@acmepay.com', cadence: 'Daily', status: 'Enabled' },
                    { id: 'rem_003', title: 'Delivery latency degraded', channel: 'Dashboard', target: 'Work Queue', cadence: 'Real-time', status: 'Enabled' },
                    { id: 'rem_004', title: 'DLQ growth', channel: 'Email', target: 'ops@acmepay.com', cadence: 'Hourly', status: 'Disabled' },
                  ].map((r) => (
                    <div key={r.id} className="rounded-2xl border border-gray-100 bg-white p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-cx-text">{r.title}</div>
                          <div className="text-xs text-cx-neutral mt-1">{r.channel} → {r.target}</div>
                          <div className="text-[10px] text-cx-neutral mt-2 uppercase tracking-wider font-semibold">Cadence: {r.cadence}</div>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          r.status === 'Enabled' ? 'bg-cx-teal-50 text-cx-teal-700 border-cx-teal-200' : 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}>{r.status}</span>
                      </div>
                      <div className="mt-4 flex items-center gap-2">
                        <button
                          onClick={() => pushToast('Saved (simulated)', `${r.id} updated`, 'success')}
                          className="px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => pushToast('Toggled (simulated)', `${r.id} toggled`, 'info')}
                          className="px-3 py-2 text-xs font-semibold rounded-lg bg-cx-purple-600 text-white hover:bg-cx-purple-700 transition-colors"
                        >
                          Toggle
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {activePrimaryTab === 'applications' ? (
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-cx-text">Applications</h3>
                    <p className="text-xs text-cx-neutral mt-1">Connected apps and permissions (simulated)</p>
                  </div>
                  <button
                    onClick={() => pushToast('App added (simulated)', 'Application connection created.', 'success')}
                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-cx-purple-600 text-white hover:bg-cx-purple-700 transition-colors"
                  >
                    + Add Application
                  </button>
                </div>
                <div className="rounded-2xl border border-gray-100 overflow-hidden bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50/50">
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">App</th>
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Client ID</th>
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Scopes</th>
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Status</th>
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Created</th>
                        <th className="px-5 py-3 text-right text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {[
                        { name: 'Merchant Dashboard', cid: 'app_merchant_dashboard', scopes: ['read:intents', 'read:dlq'], status: 'Active', created: '2026-02-01 09:00:00' },
                        { name: 'Batch Uploader', cid: 'app_batch_uploader', scopes: ['write:ingest', 'read:envelopes'], status: 'Active', created: '2026-02-05 12:00:00' },
                        { name: 'Ops Console', cid: 'app_ops_console', scopes: ['read:*'], status: 'Active', created: '2026-02-10 10:00:00' },
                      ].map((a) => (
                        <tr key={a.cid} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3 text-sm font-semibold text-cx-text">{a.name}</td>
                          <td className="px-5 py-3 text-xs font-mono text-cx-neutral">{a.cid}</td>
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {a.scopes.map((s) => (
                                <span key={s} className="text-[10px] font-mono px-2 py-1 rounded-md bg-gray-100 text-cx-text border border-gray-200">
                                  {s}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-cx-teal-50 text-cx-teal-700 border-cx-teal-200">
                              {a.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-xs text-cx-neutral">{a.created}</td>
                          <td className="px-5 py-3 text-right">
                            <button
                              onClick={() => pushToast('Revoked (simulated)', `${a.cid} revoked`, 'warning')}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                            >
                              Revoke
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="border-t border-gray-100">
            <div className="px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-0.5">
                <button onClick={() => setView('endpoints')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${view === 'endpoints' ? 'bg-white text-cx-text shadow-sm' : 'text-cx-neutral'}`}>Webhooks</button>
                <button onClick={() => setView('deliveries')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${view === 'deliveries' ? 'bg-white text-cx-text shadow-sm' : 'text-cx-neutral'}`}>Deliveries</button>
              </div>
              {view === 'endpoints' ? (
                <div className="relative w-full max-w-sm">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <input
                    value={endpointQuery}
                    onChange={(e) => setEndpointQuery(e.target.value)}
                    placeholder="Search webhook URL, status, event..."
                    className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg text-cx-text placeholder-gray-400 focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none"
                  />
                </div>
              ) : (
                <div className="relative w-full max-w-sm">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter deliveries by endpoint, event, status, intent_id..."
                    className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg text-cx-text placeholder-gray-400 focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none"
                  />
                </div>
              )}
            </div>

            {view === 'endpoints' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/50">
                      <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">URL</th>
                      <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Status</th>
                      <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Events</th>
                      <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Last Updated</th>
                      <th className="px-5 py-3 text-right text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredEndpoints.map((ep) => {
                      const badge = statusBadge(ep.status)
                      const isOpen = expanded.has(ep.id)
                      return (
                        <>
                          <tr key={ep.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-5 py-3">
                              <button
                                onClick={() => toggleExpanded(ep.id)}
                                className="text-left"
                                title="Expand"
                              >
                                <div className="text-sm font-mono text-cx-purple-600 hover:underline break-all">{ep.url}</div>
                              </button>
                              <div className="text-[11px] text-cx-neutral mt-1">
                                Success: <span className="font-mono">{ep.successRate}</span> · Failed: <span className="font-mono">{ep.failedDeliveries}</span> / <span className="font-mono">{ep.totalDeliveries}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge.cls}`}>
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <span className="text-xs font-mono text-cx-text">{ep.events.length} events</span>
                            </td>
                            <td className="px-5 py-3 text-xs text-cx-neutral">{ep.updatedAt}</td>
                            <td className="px-5 py-3 text-right">
                              <button
                                onClick={() => pushToast('Test webhook simulated', `Sent test event to ${ep.url}`, 'success')}
                                className="px-3 py-1.5 text-xs font-semibold text-cx-purple-600 bg-cx-purple-50 border border-cx-purple-200 rounded-lg hover:bg-cx-purple-100 transition-colors"
                              >
                                Test
                              </button>
                            </td>
                          </tr>
                          {isOpen ? (
                            <tr key={`${ep.id}_expanded`} className="bg-white">
                              <td colSpan={5} className="px-5 py-4">
                                <div className="flex flex-wrap gap-2">
                                  {ep.events.map((ev) => (
                                    <span key={ev} className="text-[10px] px-2 py-1 rounded-md bg-gray-100 text-cx-neutral font-mono">
                                      {ev}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </>
                      )
                    })}
                    {filteredEndpoints.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-10 text-sm text-cx-neutral text-center">No webhooks match this search.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 pb-4">
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50/50">
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Time</th>
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Endpoint</th>
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Event</th>
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Status</th>
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Latency</th>
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Intent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredDeliveries.map((del) => (
                        <tr key={del.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3 text-xs font-mono text-cx-neutral">{del.time}</td>
                          <td className="px-5 py-3 text-xs font-mono text-cx-text">{del.endpointLabel}</td>
                          <td className="px-5 py-3 text-xs font-mono text-cx-neutral">{del.event}</td>
                          <td className="px-5 py-3">
                            <span className={`text-xs font-mono font-bold ${del.statusCode < 300 ? 'text-cx-teal-600' : 'text-red-600'}`}>{del.statusCode}</span>
                          </td>
                          <td className="px-5 py-3 text-xs font-mono text-cx-neutral tabular-nums">{del.latency}</td>
                          <td className="px-5 py-3 text-xs font-mono text-cx-purple-600 break-all">{del.intentId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => pushToast('Webhook retry simulated', 'Queued resend for latest failed deliveries.', 'success')}
                    className="px-3 py-2 text-xs font-semibold rounded-lg bg-cx-purple-600 text-white hover:bg-cx-purple-700 transition-colors"
                  >
                    Retry Failed (Simulate)
                  </button>
                  <span className="text-xs text-cx-neutral">Webhook page is mock-only in customer UI.</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create webhook modal */}
      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-cx-text">Add New Webhook</h3>
              <p className="text-sm text-cx-neutral mt-1">Mock-only. Saved locally for demo.</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-cx-neutral uppercase tracking-wider mb-1.5">Webhook URL</label>
                <input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-lg text-cx-text placeholder-gray-400 focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none font-mono"
                  placeholder="https://example.com/webhooks/zord"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-cx-neutral uppercase tracking-wider mb-1.5">Status</label>
                <div className="flex items-center gap-2">
                  {(['enabled', 'disabled'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setNewStatus(s)}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                        newStatus === s ? 'border-cx-purple-300 bg-cx-purple-50 text-cx-purple-700' : 'border-gray-200 bg-white text-cx-text hover:bg-gray-50'
                      }`}
                    >
                      {s === 'enabled' ? 'Enabled' : 'Disabled'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-cx-neutral uppercase tracking-wider mb-2">Events</label>
                <div className="grid grid-cols-2 gap-2">
                  {DEFAULT_EVENTS.map((ev) => {
                    const checked = newEvents.has(ev)
                    return (
                      <label key={ev} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setNewEvents((prev) => {
                              const next = new Set(prev)
                              if (next.has(ev)) next.delete(ev)
                              else next.add(ev)
                              return next
                            })
                          }}
                          className="accent-cx-purple-600"
                        />
                        <span className="font-mono text-cx-text">{ev}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-cx-text bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createWebhook}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-cx-purple-600 rounded-lg hover:bg-cx-purple-700 transition-colors"
              >
                Add Webhook
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

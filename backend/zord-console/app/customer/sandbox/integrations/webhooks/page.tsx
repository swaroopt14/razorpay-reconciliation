'use client'

import { useMemo, useState } from 'react'
import { WEBHOOK_DELIVERIES, WEBHOOK_ENDPOINTS } from '../../sandbox-fixtures'

type PrimaryTab = 'Configuration' | 'Webhooks' | 'API Keys' | 'Reminders' | 'Applications'

const EVENT_CATALOG = ['intent.created', 'fusion.finalized', 'evidence.generated', 'settlement.batch.closed']

export default function CustomerWebhooksPage() {
  const [tab, setTab] = useState<PrimaryTab>('Webhooks')
  const [showCreate, setShowCreate] = useState(false)
  const [eventTypeFilter, setEventTypeFilter] = useState('all')
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState('all')

  const deliveries = useMemo(() => {
    return WEBHOOK_DELIVERIES.filter((delivery) => {
      if (eventTypeFilter !== 'all' && delivery.eventType !== eventTypeFilter) return false
      if (deliveryStatusFilter !== 'all' && delivery.status !== deliveryStatusFilter) return false
      return true
    })
  }, [eventTypeFilter, deliveryStatusFilter])

  const sendTestWebhook = (eventType: string) => {
    window.dispatchEvent(
      new CustomEvent('cx:toast', {
        detail: {
          type: 'success',
          title: 'Test webhook sent',
          desc: `${eventType} delivered in simulation mode`,
        },
      })
    )
  }

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-bold text-cx-text">Webhook Management</h1>
        <p className="mt-0.5 text-sm text-cx-neutral">
          Environment-scoped webhook configuration, deliveries, retries, and secret rotation simulation.
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(['Configuration', 'Webhooks', 'API Keys', 'Reminders', 'Applications'] as const).map((item) => (
              <button
                key={item}
                onClick={() => setTab(item)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${tab === item ? 'bg-cx-purple-50 text-cx-purple-700' : 'text-cx-neutral hover:bg-gray-100'}`}
              >
                {item}
              </button>
            ))}
          </div>
          {tab === 'Webhooks' ? (
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-cx-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cx-purple-700"
            >
              Add Webhook
            </button>
          ) : null}
        </div>

        {tab !== 'Webhooks' ? (
          <div className="px-4 py-6 text-sm text-cx-neutral">
            {tab} tab is available for simulation parity. Use Webhooks tab for full endpoint and delivery workflow.
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/70">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">webhook_id</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">url</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">status</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">last_delivery</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">success_rate</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {WEBHOOK_ENDPOINTS.map((endpoint) => (
                  <tr key={endpoint.webhookId}>
                    <td className="px-3 py-2 text-xs font-mono text-cx-purple-700">{endpoint.webhookId}</td>
                    <td className="px-3 py-2 text-xs font-mono text-cx-text">{endpoint.urlMasked}</td>
                    <td className="px-3 py-2 text-xs">
                      <span
                        className={`rounded-full px-2 py-0.5 font-semibold ${
                          endpoint.status === 'Enabled'
                            ? 'bg-emerald-50 text-emerald-700'
                            : endpoint.status === 'Degraded'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {endpoint.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-cx-neutral">{new Date(endpoint.lastDelivery).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2 text-xs tabular-nums text-cx-text">{endpoint.successRatePct.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => sendTestWebhook(endpoint.events[0] || 'intent.created')}
                          className="rounded-md border border-cx-purple-200 bg-cx-purple-50 px-2 py-1 font-semibold text-cx-purple-700"
                        >
                          Send test
                        </button>
                        <button
                          onClick={() =>
                            window.dispatchEvent(
                              new CustomEvent('cx:toast', {
                                detail: { type: 'info', title: 'Secret rotated', desc: `${endpoint.webhookId} secret rotated (mock)` },
                              })
                            )
                          }
                          className="rounded-md border border-gray-200 bg-white px-2 py-1 font-semibold text-cx-text"
                        >
                          Rotate secret
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3">
              <div className="mb-2 flex flex-wrap gap-2">
                <select
                  value={eventTypeFilter}
                  onChange={(event) => setEventTypeFilter(event.target.value)}
                  className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-cx-purple-500"
                >
                  <option value="all">All event types</option>
                  {EVENT_CATALOG.map((eventType) => (
                    <option key={eventType} value={eventType}>
                      {eventType}
                    </option>
                  ))}
                </select>
                <select
                  value={deliveryStatusFilter}
                  onChange={(event) => setDeliveryStatusFilter(event.target.value)}
                  className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-cx-purple-500"
                >
                  <option value="all">All statuses</option>
                  <option value="Delivered">Delivered</option>
                  <option value="Retrying">Retrying</option>
                  <option value="Failed">Failed</option>
                </select>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="bg-white">
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">request_id</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">event_type</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">status</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">response_code</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">retry_count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {deliveries.map((delivery) => (
                    <tr key={delivery.requestId}>
                      <td className="px-3 py-2 text-xs font-mono text-cx-text">{delivery.requestId}</td>
                      <td className="px-3 py-2 text-xs text-cx-text">{delivery.eventType}</td>
                      <td className="px-3 py-2 text-xs font-semibold text-cx-text">{delivery.status}</td>
                      <td className="px-3 py-2 text-xs tabular-nums text-cx-neutral">{delivery.responseCode}</td>
                      <td className="px-3 py-2 text-xs tabular-nums text-cx-neutral">{delivery.retryCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5">
            <h3 className="text-base font-bold text-cx-text">Add Webhook</h3>
            <p className="mt-1 text-xs text-cx-neutral">URL, events, secret, and retry policy are simulated in UI mode.</p>
            <div className="mt-3 space-y-3">
              <input
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-cx-purple-500"
                defaultValue="https://example.com/webhooks/zord"
              />
              <div className="rounded-lg border border-gray-200 p-2 text-xs">
                {EVENT_CATALOG.map((eventType) => (
                  <label key={eventType} className="mb-1 flex items-center gap-2 last:mb-0">
                    <input type="checkbox" defaultChecked={eventType !== 'settlement.batch.closed'} />
                    <span>{eventType}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 rounded-lg border border-gray-200 bg-white py-2 text-sm font-semibold text-cx-text">
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowCreate(false)
                  window.dispatchEvent(
                    new CustomEvent('cx:toast', {
                      detail: {
                        type: 'success',
                        title: 'Webhook created',
                        desc: 'Endpoint added in simulation mode',
                      },
                    })
                  )
                }}
                className="flex-1 rounded-lg bg-cx-purple-600 py-2 text-sm font-semibold text-white hover:bg-cx-purple-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

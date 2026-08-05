'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Copy, Download, KeyRound, Plus, RefreshCw, Send, ShieldOff } from 'lucide-react'
import {
  DEVELOPER_HEADER,
  DEVELOPER_TABS,
  DEMO_API_KEYS,
  DEMO_DELIVERY_LOGS,
  DEMO_SCHEMAS,
  DEMO_STREAMS,
  DEMO_WEBHOOKS,
  KEY_SCOPES_AVAILABLE,
  QUICKSTART_STEPS,
  type ApiKeyRow,
  type DeveloperTabId,
  type WebhookRow,
} from '@/services/payout-command/demo/developerDemo'

function tabFromQuery(raw: string | null): DeveloperTabId {
  if (raw && DEVELOPER_TABS.some((t) => t.id === raw)) return raw as DeveloperTabId
  return 'keys'
}

function statusPill(_status: string) {
  return 'bg-[#0B1324] text-white ring-[#0B1324]/30'
}

/**
  * Spec 7.17 - Developer & Integrations.
  * Credentials live here (not Support / profile). Sandbox-labelled demo actions.
  */
export function DeveloperSurface() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<DeveloperTabId>(() => tabFromQuery(searchParams.get('tab')))
  const [keys, setKeys] = useState<ApiKeyRow[]>(DEMO_API_KEYS)
  const [webhooks, setWebhooks] = useState<WebhookRow[]>(DEMO_WEBHOOKS)
  const [toast, setToast] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState('Scoped sandbox key')
  const [newScopes, setNewScopes] = useState<string[]>(['read:obligations', 'read:contracts'])
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null)

  useEffect(() => {
    setTab(tabFromQuery(searchParams.get('tab')))
  }, [searchParams])

  function setTabAndUrl(next: DeveloperTabId) {
    setTab(next)
    router.replace(`/developer?demo=sandbox&tab=${next}`, { scroll: false })
  }

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2800)
  }

  function createScopedKey() {
    if (!newScopes.length) {
      flash('Select at least one least-privilege scope')
      return
    }
    const secret = `sk_test_zord_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
    const row: ApiKeyRow = {
      id: `key_${Date.now()}`,
      name: newKeyName.trim() || 'Scoped sandbox key',
      environment: 'Sandbox',
      scopes: [...newScopes],
      created: 'Just now',
      lastUsed: '-',
      expiry: '90 days',
      prefix: `${secret.slice(0, 14)}…`,
      status: 'Active',
    }
    setKeys((prev) => [row, ...prev])
    setOneTimeSecret(secret)
    setCreateOpen(false)
    flash('Scoped key created - secret shown once only')
  }

  function rotateKey(id: string) {
    setKeys((prev) =>
      prev.map((k) => (k.id === id ? { ...k, status: 'Rotated' as const, expiry: 'Revoked', lastUsed: 'Rotated just now' } : k)),
    )
    const secret = `sk_test_zord_rot_${Math.random().toString(36).slice(2, 10)}`
    setOneTimeSecret(secret)
    flash('Key rotated - previous secret is no longer recoverable')
  }

  function revokeKey(id: string) {
    setKeys((prev) =>
      prev.map((k) => (k.id === id ? { ...k, status: 'Revoked' as const, expiry: 'Revoked' } : k)),
    )
    flash('Key revoked - secret is not recoverable')
  }

  function sendTestWebhook(id: string) {
    setWebhooks((prev) =>
      prev.map((w) =>
        w.id === id
          ? {
              ...w,
              lastDelivery: 'Just now',
              lastStatus: w.signingStatus === 'Failed' ? '4xx' : '2xx',
              signingStatus: w.signingStatus === 'Failed' ? 'Failed' : 'Verified',
            }
          : w,
      ),
    )
    flash(
      id === 'wh_02'
        ? 'Test event sent - signature failure visible in delivery logs'
        : 'Test event sent - 2xx with correlation ID in Logs',
    )
    setTabAndUrl('logs')
  }

  function downloadSchema(name: string, version: string) {
    const payload = {
      object: name,
      schema_version: version,
      note: 'Sandbox schema stub - version included on every request/response',
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name.toLowerCase().replace(/\s+/g, '-')}-${version}.json`
    a.click()
    URL.revokeObjectURL(url)
    flash(`Downloaded ${name} ${version}`)
  }

  const activeKeys = useMemo(() => keys.filter((k) => k.status === 'Active').length, [keys])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#F4F6F9]">
      <div className="mx-auto w-full max-w-[1600px] px-5 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#0B1324]">
              {DEVELOPER_HEADER.title}
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#64748B]">
              {DEVELOPER_HEADER.subtitle}
            </p>
          </div>
          <span className="rounded-md border border-[#E2E8F0] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#64748B]">
            Sandbox · {activeKeys} active keys
          </span>
        </div>

        <div className="mt-5 flex flex-wrap gap-1 border-b border-[#E5E7EB]">
          {DEVELOPER_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTabAndUrl(t.id)}
              className={`h-9 px-3 text-[13px] font-semibold ${
                tab === t.id
                  ? 'border-b-2 border-[#2E5BFF] text-[#2E5BFF]'
                  : 'text-[#64748B] hover:text-[#0B1324]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {oneTimeSecret ? (
          <div className="mt-4 border border-[#0B1324]/20 bg-[#F1F5F9] px-4 py-3">
            <p className="text-[13px] font-semibold text-[#0B1324]">Secret shown once only</p>
            <p className="mt-1 text-[12px] text-[#0B1324]">
              Copy now - Zord will not reveal this value again after you leave this screen.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded border border-[#0B1324]/20 bg-white px-2 py-1 font-mono text-[12px] text-[#0B1324]">
                {oneTimeSecret}
              </code>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1 rounded-md border border-[#0B1324]/25 bg-white px-2.5 text-[12px] font-semibold text-[#0B1324]"
                onClick={() => {
                  void navigator.clipboard?.writeText(oneTimeSecret)
                  flash('Secret copied - store it securely')
                }}
              >
                <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                Copy
              </button>
              <button
                type="button"
                className="h-8 px-2.5 text-[12px] font-semibold text-[#0B1324] underline"
                onClick={() => setOneTimeSecret(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-5">
          {tab === 'keys' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-[#64748B]">
                  Keys are masked and scoped by environment and capability. Least-privilege scopes only.
                </p>
                <button
                  type="button"
                  onClick={() => setCreateOpen((v) => !v)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  Create scoped key
                </button>
              </div>

              {createOpen ? (
                <div className="border border-[#E5E7EB] bg-white px-4 py-4">
                  <p className="text-[14px] font-semibold text-[#0B1324]">Create scoped key</p>
                  <label className="mt-3 block text-[12px] font-medium text-[#64748B]">
                    Name
                    <input
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      className="mt-1 h-9 w-full border border-[#E2E8F0] px-3 text-[13px] text-[#0B1324]"
                    />
                  </label>
                  <p className="mt-3 text-[12px] font-medium text-[#64748B]">Scopes</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {KEY_SCOPES_AVAILABLE.map((scope) => {
                      const on = newScopes.includes(scope)
                      return (
                        <button
                          key={scope}
                          type="button"
                          onClick={() =>
                            setNewScopes((prev) =>
                              on ? prev.filter((s) => s !== scope) : [...prev, scope],
                            )
                          }
                          className={`rounded-md border px-2.5 py-1 font-mono text-[11px] font-semibold ${
                            on
                              ? 'border-[#0B1324] bg-[#0B1324] text-white'
                              : 'border-[#E2E8F0] bg-white text-[#475569]'
                          }`}
                        >
                          {scope}
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={createScopedKey}
                      className="inline-flex h-9 items-center rounded-md bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white"
                    >
                      Create scoped key
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateOpen(false)}
                      className="h-9 px-3 text-[13px] font-semibold text-[#64748B]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="overflow-hidden border border-[#E5E7EB] bg-white">
                <table className="w-full min-w-[880px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] bg-[#FAFBFC]">
                      {['Name', 'Environment', 'Scopes', 'Created', 'Last used', 'Expiry', ''].map((h) => (
                        <th
                          key={h || 'a'}
                          className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((k) => (
                      <tr key={k.id} className="border-b border-[#F0F0F0] last:border-0">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[#0B1324]">{k.name}</p>
                          <p className="font-mono text-[11px] text-[#94A3B8]">{k.prefix}</p>
                        </td>
                        <td className="px-4 py-3 text-[#475569]">{k.environment}</td>
                        <td className="px-4 py-3">
                          <div className="flex max-w-[220px] flex-wrap gap-1">
                            {k.scopes.slice(0, 3).map((s) => (
                              <span
                                key={s}
                                className="rounded bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[10px] text-[#475569]"
                              >
                                {s}
                              </span>
                            ))}
                            {k.scopes.length > 3 ? (
                              <span className="text-[10px] text-[#94A3B8]">+{k.scopes.length - 3}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-[#64748B]">{k.created}</td>
                        <td className="px-4 py-3 text-[12px] text-[#64748B]">{k.lastUsed}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(k.status)}`}
                          >
                            {k.status === 'Active' ? k.expiry : k.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              disabled={k.status !== 'Active'}
                              onClick={() => rotateKey(k.id)}
                              className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#2E5BFF] disabled:opacity-40"
                            >
                              <RefreshCw className="h-3 w-3" strokeWidth={2} />
                              Rotate
                            </button>
                            <button
                              type="button"
                              disabled={k.status === 'Revoked'}
                              onClick={() => revokeKey(k.id)}
                              className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#0B1324] disabled:opacity-40"
                            >
                              <ShieldOff className="h-3 w-3" strokeWidth={2} />
                              Revoke
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-[#94A3B8]">
                No secret is recoverable after creation. Reveal API secret is not available on profile or Support.
              </p>
            </div>
          ) : null}

          {tab === 'webhooks' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-[#64748B]">
                  Signature verification and retry behavior are visible per endpoint.
                </p>
                <button
                  type="button"
                  onClick={() => flash('Add webhook drawer (sandbox) - configure endpoint + events')}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#E2E8F0] bg-white px-3.5 text-[13px] font-semibold text-[#0B1324]"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  Add webhook
                </button>
              </div>
              <div className="space-y-3">
                {webhooks.map((w) => (
                  <article key={w.id} className="border border-[#E5E7EB] bg-white px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-[13px] font-semibold text-[#0B1324]">{w.endpoint}</p>
                        <p className="mt-1 text-[12px] text-[#64748B]">{w.events.join(' · ')}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(w.signingStatus)}`}
                      >
                        Signing · {w.signingStatus}
                      </span>
                    </div>
                    <dl className="mt-3 grid gap-2 sm:grid-cols-3 text-[12px]">
                      <div>
                        <dt className="text-[#94A3B8]">Retries</dt>
                        <dd className="font-semibold text-[#0B1324]">{w.retries}</dd>
                      </div>
                      <div>
                        <dt className="text-[#94A3B8]">Last delivery</dt>
                        <dd className="font-semibold text-[#0B1324]">{w.lastDelivery}</dd>
                      </div>
                      <div>
                        <dt className="text-[#94A3B8]">Last status</dt>
                        <dd>
                          <span className={`rounded-md px-1.5 py-0.5 font-semibold ring-1 ${statusPill(w.lastStatus)}`}>
                            {w.lastStatus}
                          </span>
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => sendTestWebhook(w.id)}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#2E5BFF]"
                      >
                        <Send className="h-3 w-3" strokeWidth={2} />
                        Send test event
                      </button>
                      <button
                        type="button"
                        onClick={() => setTabAndUrl('logs')}
                        className="text-[12px] font-semibold text-[#64748B] hover:text-[#0B1324]"
                      >
                        View delivery logs
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {tab === 'streams' ? (
            <div className="overflow-hidden border border-[#E5E7EB] bg-white">
              <table className="w-full min-w-[800px] border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[#E5E7EB] bg-[#FAFBFC]">
                    {['Topic', 'Consumer group', 'TLS/SASL', 'Last offset', 'Lag', 'Status'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DEMO_STREAMS.map((s) => (
                    <tr key={s.id} className="border-b border-[#F0F0F0] last:border-0">
                      <td className="px-4 py-3 font-mono text-[12px] font-semibold text-[#0B1324]">{s.topic}</td>
                      <td className="px-4 py-3 text-[#475569]">{s.consumerGroup}</td>
                      <td className="px-4 py-3 text-[#475569]">{s.auth}</td>
                      <td className="px-4 py-3 font-mono text-[12px]">{s.lastOffset}</td>
                      <td className="px-4 py-3 tabular-nums">{s.lag}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(s.status)}`}>
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {tab === 'schemas' ? (
            <div className="space-y-3">
              <p className="text-[13px] text-[#64748B]">
                Schema version is included in every request/response. Object names match the product UI.
              </p>
              <div className="overflow-hidden border border-[#E5E7EB] bg-white">
                <table className="w-full border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] bg-[#FAFBFC]">
                      {['Object', 'Version', 'Content type', 'Updated', ''].map((h) => (
                        <th
                          key={h || 'a'}
                          className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DEMO_SCHEMAS.map((s) => (
                      <tr key={s.id} className="border-b border-[#F0F0F0] last:border-0">
                        <td className="px-4 py-3 font-semibold text-[#0B1324]">{s.objectName}</td>
                        <td className="px-4 py-3 font-mono text-[12px]">{s.version}</td>
                        <td className="px-4 py-3 text-[#64748B]">{s.contentType}</td>
                        <td className="px-4 py-3 text-[#64748B]">{s.updated}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => downloadSchema(s.objectName, s.version)}
                            className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#2E5BFF]"
                          >
                            <Download className="h-3 w-3" strokeWidth={2} />
                            Download schema
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {tab === 'logs' ? (
            <div className="space-y-3">
              <p className="text-[13px] text-[#64748B]">
                Delivery and API logs include correlation IDs for cross-page tracing.
              </p>
              <div className="overflow-hidden border border-[#E5E7EB] bg-white">
                <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] bg-[#FAFBFC]">
                      {['When', 'Kind', 'Correlation ID', 'Summary', 'HTTP', 'Result'].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DEMO_DELIVERY_LOGS.map((l) => (
                      <tr key={l.id} className="border-b border-[#F0F0F0] last:border-0">
                        <td className="px-4 py-3 text-[12px] text-[#64748B]">{l.at}</td>
                        <td className="px-4 py-3 capitalize text-[#475569]">{l.kind}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-[#0B1324]">{l.correlationId}</td>
                        <td className="px-4 py-3 text-[#475569]">{l.summary}</td>
                        <td className="px-4 py-3 font-mono text-[12px]">{l.httpStatus}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(l.result)}`}>
                            {l.result}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {tab === 'quickstart' ? (
            <div className="space-y-4">
              <p className="text-[13px] text-[#64748B]">
                One complete lifecycle - Create obligation → receive policy result → fetch contract → attach
                outcome → verify proof.
              </p>
              <ol className="space-y-2">
                {QUICKSTART_STEPS.map((s) => (
                  <li key={s.n}>
                    <Link
                      href={s.href}
                      className="flex items-start gap-3 border border-[#E5E7EB] bg-white px-4 py-3.5 transition hover:border-[#2E5BFF]"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0B1324] text-[12px] font-bold text-white">
                        {s.n}
                      </span>
                      <div>
                        <p className="text-[14px] font-semibold text-[#0B1324]">{s.label}</p>
                        <p className="mt-0.5 text-[12px] text-[#64748B]">{s.detail}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap items-center gap-2 border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-[12px] text-[#475569]">
                <KeyRound className="h-3.5 w-3.5" strokeWidth={2} />
                Use a scoped sandbox key from the API keys tab. Secrets are never recoverable after creation.
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-[#0B1324] px-4 py-2 text-[13px] font-medium text-white shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import {
  CONNECTION_SOURCES,
  FAILED_DELIVERIES,
  RAZORPAY_RECENT_EVENTS,
  SYSTEM_TIMELINE,
  WEBHOOK_DELIVERY,
  statusPillClass,
  type ConnectionSourceRow,
  type SignalHealth,
} from '@/services/payout-command/demo/financeConnectionsDemo'
import { InfoDot, RZ_CARD, RZ_MUTED, RZ_PAGE } from '../finance-ops/razorpayChrome'

type DetailTab = 'overview' | 'api' | 'webhooks' | 'events' | 'logs' | 'settings'

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'api', label: 'API' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'events', label: 'Events' },
  { id: 'logs', label: 'Logs' },
  { id: 'settings', label: 'Settings' },
]

function StatusPill({ status }: { status: SignalHealth }) {
  return (
    <span className={`inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold ${statusPillClass(status)}`}>
      {status}
    </span>
  )
}

function SourceAvatar({ source }: { source: ConnectionSourceRow }) {
  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[11px] font-bold text-white"
      style={{ background: source.color }}
      aria-hidden
    >
      {source.initials}
    </span>
  )
}

function KpiCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'ok' | 'warn' | 'neutral'
  icon: 'link' | 'pulse' | 'clock' | 'chart' | 'alert'
}) {
  const Icon = () => {
    if (icon === 'link') {
      return (
        <svg className="h-4 w-4 text-[#528FF0]" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M6.5 9.5 9.5 6.5M7 11.5l-1.2 1.2a2.5 2.5 0 0 1-3.5-3.5L3.5 8M9 4.5l1.2-1.2a2.5 2.5 0 0 1 3.5 3.5L12.5 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    }
    if (icon === 'pulse') {
      return (
        <svg className="h-4 w-4 text-[#147A3F]" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M1.5 8h3l1.5-3.5L8.5 12l2-4.5H14.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    }
    if (icon === 'clock') {
      return (
        <svg className="h-4 w-4 text-[#528FF0]" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 5v3.2l2 1.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    }
    if (icon === 'chart') {
      return (
        <svg className="h-4 w-4 text-[#528FF0]" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M2 12.5V8.5M5.5 12.5V5.5M9 12.5V7M12.5 12.5V3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    }
    return (
      <svg className="h-4 w-4 text-[#C0372A]" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M8 2.2 14.5 13.5H1.5L8 2.2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M8 6.5v3.2M8 11.5h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <div className={`${RZ_CARD} px-4 py-3.5`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-[#6B6B6B]">{label}</p>
        <Icon />
      </div>
      <p
        className={`mt-2 text-[18px] font-semibold tracking-[-0.02em] ${
          tone === 'ok' ? 'text-[#147A3F]' : tone === 'warn' ? 'text-[#C0372A]' : 'text-[#1A1A1A]'
        }`}
      >
        {value}
      </p>
      {hint ? <p className={`mt-1 text-[12px] ${tone === 'ok' ? 'text-[#147A3F]' : RZ_MUTED}`}>{hint}</p> : null}
    </div>
  )
}

function CheckRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#F3F4F6] py-2 text-[13px] last:border-0">
      <span className="text-[#6B6B6B]">{label}</span>
      <span className={`inline-flex items-center gap-1.5 font-medium ${ok ? 'text-[#147A3F]' : 'text-[#B36B00]'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-[#147A3F]' : 'bg-[#B36B00]'}`} />
        {value}
      </span>
    </div>
  )
}

function TimelineBar({ sourceId }: { sourceId: string }) {
  const segs = SYSTEM_TIMELINE[sourceId] ?? [{ start: 0, end: 24, status: 'Healthy' as const }]
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[#EEF0F3]">
      {segs.map((s, i) => {
        const left = `${(s.start / 24) * 100}%`
        const width = `${((s.end - s.start) / 24) * 100}%`
        const bg =
          s.status === 'Healthy' ? '#22C55E' : s.status === 'Degraded' ? '#F59E0B' : '#EF4444'
        return (
          <span
            key={`${sourceId}-${i}`}
            className="absolute inset-y-0 rounded-full"
            style={{ left, width, background: bg }}
          />
        )
      })}
    </div>
  )
}

function DonutChart() {
  const { delivered, failed, retrying, inProgress, total } = WEBHOOK_DELIVERY
  // Approximate arcs for visual (percentages sum ~100)
  const r = 42
  const c = 2 * Math.PI * r
  const parts = [
    { pct: delivered, color: '#22C55E' },
    { pct: inProgress, color: '#3B82F6' },
    { pct: retrying, color: '#F59E0B' },
    { pct: failed, color: '#EF4444' },
  ]
  let offset = 0
  return (
    <div className="flex items-center gap-5">
      <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0" aria-hidden>
        <g transform="translate(60,60) rotate(-90)">
          {parts.map((p) => {
            const len = (p.pct / 100) * c
            const el = (
              <circle
                key={p.color}
                r={r}
                cx={0}
                cy={0}
                fill="none"
                stroke={p.color}
                strokeWidth="14"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
              />
            )
            offset += len
            return el
          })}
        </g>
        <text x="60" y="56" textAnchor="middle" className="fill-[#1A1A1A]" style={{ fontSize: 14, fontWeight: 600 }}>
          {total.toLocaleString('en-IN')}
        </text>
        <text x="60" y="72" textAnchor="middle" className="fill-[#8F8F8F]" style={{ fontSize: 10 }}>
          Total Events
        </text>
      </svg>
      <ul className="space-y-1.5 text-[12px]">
        <li className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#22C55E]" /> Delivered{' '}
          <span className="font-semibold text-[#1A1A1A]">{delivered}%</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#EF4444]" /> Failed{' '}
          <span className="font-semibold text-[#1A1A1A]">{failed}%</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#F59E0B]" /> Retrying{' '}
          <span className="font-semibold text-[#1A1A1A]">{retrying}%</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#3B82F6]" /> In Progress{' '}
          <span className="font-semibold text-[#1A1A1A]">{inProgress}%</span>
        </li>
      </ul>
    </div>
  )
}

function SourceDetailPanel({
  source,
  toast,
  onToast,
}: {
  source: ConnectionSourceRow
  toast: string | null
  onToast: (msg: string) => void
}) {
  const [tab, setTab] = useState<DetailTab>('overview')
  const overall: SignalHealth =
    source.api === 'Degraded' || source.webhook === 'Degraded'
      ? 'Degraded'
      : source.api === 'Down' || source.webhook === 'Down'
        ? 'Down'
        : source.api === 'N/A' && source.webhook === 'N/A'
          ? 'N/A'
          : 'Healthy'

  return (
    <aside className={`${RZ_CARD} flex min-h-[420px] flex-col overflow-hidden`}>
      <div className="flex items-start justify-between gap-3 border-b border-[#EEF0F3] px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <SourceAvatar source={source} />
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-[#1A1A1A]">
              {source.name}{' '}
              <span className="font-normal text-[#6B6B6B]">({source.type})</span>
            </h3>
            <div className="mt-1">
              <StatusPill status={overall} />
            </div>
          </div>
        </div>
        <button type="button" className="h-8 w-8 text-[#8F8F8F]" aria-label="More">
          ···
        </button>
      </div>

      <div className="flex gap-4 overflow-x-auto border-b border-[#EEF0F3] px-4">
        {DETAIL_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px whitespace-nowrap border-b-2 pb-2.5 pt-2.5 text-[12px] ${
              tab === t.id
                ? 'border-[#2563EB] font-semibold text-[#1A1A1A]'
                : 'border-transparent font-medium text-[#6B6B6B]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {tab === 'overview' ? (
          <>
            <section>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8F8F8F]">Connection Health</p>
              <div className="mt-1">
                <CheckRow label="Authentication" value="Valid" ok={source.auth === 'Healthy'} />
                <CheckRow
                  label="API Connectivity"
                  value={source.api}
                  ok={source.api === 'Healthy' || source.api === 'N/A'}
                />
                {source.rateLimitMax > 0 ? (
                  <CheckRow
                    label="Rate Limit"
                    value={`${source.rateLimitUsed.toLocaleString('en-IN')} / ${source.rateLimitMax.toLocaleString('en-IN')}`}
                    ok
                  />
                ) : null}
                <CheckRow label="Data Freshness" value={source.freshnessRel} ok={!source.freshnessRel.includes('h')} />
                <CheckRow
                  label="Webhooks"
                  value={source.webhook}
                  ok={source.webhook === 'Healthy' || source.webhook === 'N/A'}
                />
              </div>
            </section>

            <section>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8F8F8F]">Quick Stats (Today)</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    ['Events Received', source.eventsReceived.toLocaleString('en-IN')],
                    ['Events Processed', source.eventsProcessed.toLocaleString('en-IN')],
                    ['Failed Deliveries', String(source.failedDeliveries)],
                    ['Avg. API Latency', source.latencyMs != null ? `${source.latencyMs} ms` : '—'],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="rounded-[8px] border border-[#E6E8EB] bg-[#FAFBFC] px-3 py-2">
                    <p className="text-[11px] text-[#8F8F8F]">{k}</p>
                    <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-[#1A1A1A]">{v}</p>
                  </div>
                ))}
              </div>
              <p className={`mt-2 ${RZ_MUTED}`}>
                Last event · <span className="font-mono text-[12px] text-[#334155]">{source.lastEvent}</span> ·{' '}
                {source.lastEventAt}
              </p>
            </section>

            <section>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8F8F8F]">Recent Events</p>
              <ul className="mt-2 divide-y divide-[#F3F4F6] rounded-[8px] border border-[#E6E8EB]">
                {(source.id === 'razorpay' ? RAZORPAY_RECENT_EVENTS : RAZORPAY_RECENT_EVENTS.slice(0, 3)).map((e) => (
                  <li key={e.id} className="flex items-center gap-2 px-3 py-2 text-[12px]">
                    <span className="min-w-0 flex-1 truncate font-mono text-[#334155]">{e.event}</span>
                    <span className="rounded-full bg-[#E8F8EE] px-2 py-0.5 text-[10px] font-semibold text-[#147A3F]">
                      {e.status}
                    </span>
                    <span className="w-14 text-right text-[#8F8F8F]">{e.at}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}

        {tab === 'api' ? (
          <section className="space-y-2 text-[13px]">
            <CheckRow label="API status" value={source.api} ok={source.api === 'Healthy' || source.api === 'N/A'} />
            <CheckRow label="Latency" value={source.latencyMs != null ? `${source.latencyMs} ms` : 'N/A'} ok />
            <CheckRow label="Last sync" value={`${source.lastSyncRel} · ${source.lastSyncAbs}`} ok />
            {source.api === 'Degraded' ? (
              <p className="rounded-[8px] border border-[#FFF6E5] bg-[#FFFBEB] px-3 py-2 text-[12px] text-[#B36B00]">
                Source not yet fresh — reconciliation pending. Do not treat missing bank lines as lost money.
              </p>
            ) : null}
          </section>
        ) : null}

        {tab === 'webhooks' ? (
          <section className="space-y-2 text-[13px]">
            <CheckRow label="Webhook status" value={source.webhook} ok={source.webhook === 'Healthy' || source.webhook === 'N/A'} />
            <div className="rounded-[8px] border border-[#E6E8EB] bg-[#FAFBFC] px-3 py-2">
              <p className="text-[11px] text-[#8F8F8F]">Endpoint</p>
              <p className="mt-0.5 break-all font-mono text-[12px] text-[#1A1A1A]">{source.endpoint || '—'}</p>
            </div>
            <CheckRow label="Signature" value="Verified" ok />
            <CheckRow label="Failed deliveries" value={String(source.failedDeliveries)} ok={source.failedDeliveries === 0} />
          </section>
        ) : null}

        {tab === 'events' || tab === 'logs' ? (
          <ul className="divide-y divide-[#F3F4F6] rounded-[8px] border border-[#E6E8EB]">
            {RAZORPAY_RECENT_EVENTS.map((e) => (
              <li key={e.id} className="flex items-center gap-2 px-3 py-2.5 text-[12px]">
                <span className="font-mono text-[#8F8F8F]">{e.id}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[#334155]">{e.event}</span>
                <span className="text-[#8F8F8F]">{e.at}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {tab === 'settings' ? (
          <p className={RZ_MUTED}>Sandbox credentials stay masked. Rotate keys from workspace admin when live.</p>
        ) : null}

        {toast ? (
          <p className="rounded-[8px] border border-[#EEF4FF] bg-[#F7FAFF] px-3 py-2 text-[12px] text-[#1A1A1A]">{toast}</p>
        ) : null}
      </div>

      <div className="flex gap-2 border-t border-[#EEF0F3] px-4 py-3">
        <button
          type="button"
          onClick={() =>
            onToast(
              source.api === 'Degraded'
                ? `${source.name}: probe failed — source not fresh`
                : `${source.name}: sandbox probe succeeded`,
            )
          }
          className="h-9 flex-1 rounded-[8px] border border-[#E6E8EB] bg-white text-[13px] font-medium text-[#1A1A1A]"
        >
          Test Connection
        </button>
        <button
          type="button"
          onClick={() => onToast(`${source.name}: sync queued`)}
          className="h-9 flex-1 rounded-[8px] bg-[#2563EB] text-[13px] font-medium text-white"
        >
          Sync Now
        </button>
      </div>
    </aside>
  )
}

export function ConnectionsSurface() {
  const [selectedId, setSelectedId] = useState(CONNECTION_SOURCES[0]?.id ?? '')
  const [typeFilter, setTypeFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [retryFlash, setRetryFlash] = useState<string | null>(null)

  const selected = CONNECTION_SOURCES.find((s) => s.id === selectedId) ?? CONNECTION_SOURCES[0]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CONNECTION_SOURCES.filter((s) => {
      if (typeFilter !== 'all' && s.type !== typeFilter) return false
      if (!q) return true
      return s.name.toLowerCase().includes(q) || s.type.toLowerCase().includes(q)
    })
  }, [typeFilter, query])

  return (
    <div className={RZ_PAGE}>
      <div className="mx-auto w-full max-w-[1280px] px-5 py-6 sm:px-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">Connections</h1>
              <InfoDot label="Payment, bank and ledger sources that feed reconciliation and proof." />
            </div>
            <p className={`mt-1 max-w-2xl ${RZ_MUTED}`}>
              Connect and monitor all data sources for real-time payouts, settlements and bank feeds.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setToast('Sandbox: connect Razorpay, bank, or ledger source.')}
            className="inline-flex h-10 items-center gap-1.5 rounded-[8px] bg-[#2563EB] px-4 text-[13px] font-medium text-white"
          >
            + Connect Source
          </button>
        </div>

        {/* KPIs */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard label="Total Connections" value="7 Active sources" icon="link" />
          <KpiCard label="All Systems Health" value="Healthy" hint="Last updated 2 min ago" tone="ok" icon="pulse" />
          <KpiCard label="Sources Freshness" value="92% Avg. data freshness" icon="clock" />
          <KpiCard label="Events (Today)" value="12,842" hint="↑ 8.4% vs yesterday" tone="ok" icon="chart" />
          <KpiCard label="Failed Deliveries" value="7" hint="↓ 22% vs yesterday" tone="warn" icon="alert" />
        </div>

        {/* Table + detail */}
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
          <section className={`${RZ_CARD} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF0F3] px-4 py-3">
              <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Connected Sources</h2>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="h-8 rounded-[6px] border border-[#E6E8EB] bg-white px-2 text-[12px] text-[#1A1A1A]"
                >
                  <option value="all">All Types</option>
                  <option value="Payment Gateway">Payment Gateway</option>
                  <option value="Bank Account">Bank Account</option>
                  <option value="Settlement Source">Settlement Source</option>
                  <option value="Webhook Endpoint">Webhook Endpoint</option>
                  <option value="Ledger System">Ledger System</option>
                </select>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search source…"
                  className="h-8 w-[160px] rounded-[6px] border border-[#E6E8EB] bg-white px-2.5 text-[12px] outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className="bg-[#FAFBFC] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8F8F8F]">
                  <tr>
                    <th className="px-4 py-2.5">Source</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">API Status</th>
                    <th className="px-3 py-2.5">Webhook Status</th>
                    <th className="px-3 py-2.5">Last Sync / Event</th>
                    <th className="px-4 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const on = row.id === selected?.id
                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedId(row.id)}
                        className={`cursor-pointer border-t border-[#F3F4F6] hover:bg-[#FAFBFC] ${
                          on ? 'bg-[#F8FAFF]' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <SourceAvatar source={row} />
                            <span className="font-medium text-[#1A1A1A]">{row.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-[#6B6B6B]">{row.type}</td>
                        <td className="px-3 py-3">
                          <StatusPill status={row.api} />
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill status={row.webhook} />
                        </td>
                        <td className="px-3 py-3">
                          <p className="text-[#1A1A1A]">{row.lastSyncRel}</p>
                          <p className="text-[11px] text-[#8F8F8F]">{row.lastSyncAbs}</p>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedId(row.id)
                            }}
                            className="rounded-[6px] border border-[#E6E8EB] px-2.5 py-1 text-[12px] font-medium text-[#2563EB]"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {selected ? (
            <SourceDetailPanel
              source={selected}
              toast={toast}
              onToast={(msg) => {
                setToast(msg)
                window.setTimeout(() => setToast(null), 2800)
              }}
            />
          ) : null}
        </div>

        {/* Bottom widgets */}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <section className={`${RZ_CARD} px-4 py-4 lg:col-span-1`}>
            <h2 className="text-[14px] font-semibold text-[#1A1A1A]">System Status Timeline</h2>
            <p className={`mt-0.5 ${RZ_MUTED}`}>Last 24h</p>
            <ul className="mt-3 space-y-2.5">
              {CONNECTION_SOURCES.map((s) => (
                <li key={s.id} className="grid grid-cols-[7.5rem_1fr] items-center gap-2">
                  <span className="truncate text-[11px] font-medium text-[#6B6B6B]">{s.name}</span>
                  <TimelineBar sourceId={s.id} />
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-[#8F8F8F]">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#22C55E]" /> Healthy
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#F59E0B]" /> Degraded
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#EF4444]" /> Down
              </span>
            </div>
          </section>

          <section className={`${RZ_CARD} px-4 py-4`}>
            <h2 className="text-[14px] font-semibold text-[#1A1A1A]">Webhook Delivery Status</h2>
            <div className="mt-3">
              <DonutChart />
            </div>
          </section>

          <section className={`${RZ_CARD} overflow-hidden`}>
            <div className="border-b border-[#EEF0F3] px-4 py-3">
              <h2 className="text-[14px] font-semibold text-[#1A1A1A]">Unhandled / Failed Deliveries</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-[#FAFBFC] text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8F8F8F]">
                  <tr>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-2 py-2">Source</th>
                    <th className="px-2 py-2">Event</th>
                    <th className="px-2 py-2">Reason</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {FAILED_DELIVERIES.map((f) => (
                    <tr key={f.id} className="border-t border-[#F3F4F6]">
                      <td className="px-3 py-2 font-mono text-[#6B6B6B]">{f.time}</td>
                      <td className="px-2 py-2 text-[#1A1A1A]">{f.source}</td>
                      <td className="px-2 py-2 font-mono text-[#334155]">{f.event}</td>
                      <td className="px-2 py-2 text-[#B36B00]">{f.reason}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRetryFlash(f.id)
                            window.setTimeout(() => setRetryFlash(null), 1800)
                          }}
                          className="font-medium text-[#2563EB] hover:underline"
                        >
                          {retryFlash === f.id ? 'Queued' : 'Retry'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

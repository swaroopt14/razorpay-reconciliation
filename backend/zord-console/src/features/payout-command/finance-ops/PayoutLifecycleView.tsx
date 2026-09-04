'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatPaise } from './reasonCopy'
import { StatusBadge } from './razorpayChrome'
import { payoutStatusTone, type RazorpayPayoutStatus } from './razorpayPayoutStatus'
import { PaymentProviderBadge } from './PaymentProviderBadge'
import {
  reconToneClass,
  shortHash,
  type LifecycleEvent,
  type PayoutLifecycle,
  type SourceFlag,
} from './payoutLifecycleModel'

export type LifecycleTab =
  | 'overview'
  | 'events'
  | 'provider'
  | 'bank'
  | 'settlement'
  | 'ledger'
  | 'evidence'

const TABS: { id: LifecycleTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'events', label: 'Events' },
  { id: 'provider', label: 'Provider' },
  { id: 'bank', label: 'Bank' },
  { id: 'settlement', label: 'Settlement' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'evidence', label: 'Evidence' },
]

function flagMark(flag: SourceFlag) {
  if (flag === 'yes') return <span className="font-semibold text-[#147A3F]">✓</span>
  if (flag === 'no') return <span className="text-[#C0372A]">—</span>
  return <span className="text-[#CBD5E1]">—</span>
}

function eventDot(state: LifecycleEvent['state']) {
  if (state === 'done') return 'bg-[#16A34A]'
  if (state === 'fail') return 'bg-[#DC2626]'
  if (state === 'warn') return 'bg-[#D97706]'
  if (state === 'current') return 'bg-[#528FF0]'
  return 'bg-[#CBD5E1]'
}

function asPayoutStatus(status: string): RazorpayPayoutStatus {
  const s = status.toLowerCase()
  if (
    s === 'pending' ||
    s === 'scheduled' ||
    s === 'queued' ||
    s === 'processing' ||
    s === 'processed' ||
    s === 'reversed' ||
    s === 'cancelled' ||
    s === 'rejected' ||
    s === 'failed'
  ) {
    return s
  }
  return 'processing'
}

export function PayoutLifecycleView({
  life,
  variant = 'drawer',
  initialTab = 'events',
  traceHref,
}: {
  life: PayoutLifecycle
  variant?: 'drawer' | 'page'
  initialTab?: LifecycleTab
  traceHref?: string
}) {
  const [tab, setTab] = useState<LifecycleTab>(initialTab)
  const [openEvent, setOpenEvent] = useState<string | null>(life.events[life.events.length - 1]?.id ?? null)
  const compact = variant === 'drawer'

  const jsonProvider = useMemo(() => JSON.stringify(life.rawProvider, null, 2), [life.rawProvider])
  const jsonBank = useMemo(() => JSON.stringify(life.rawBank, null, 2), [life.rawBank])
  const jsonLedger = useMemo(() => JSON.stringify(life.rawLedger, null, 2), [life.rawLedger])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={payoutStatusTone(asPayoutStatus(life.providerStatus))}>
          {life.providerStatus}
        </StatusBadge>
        <span
          className={`inline-flex h-6 items-center rounded-[4px] px-2 text-[11px] font-semibold ${reconToneClass(life.reconResult)}`}
        >
          {life.reconResult}
        </span>
        <PaymentProviderBadge provider={life.providerName} />
        {life.lifecyclePassed ? (
          <span className="text-[12px] font-medium text-[#147A3F]">Lifecycle · Passed ✓</span>
        ) : life.events.some((e) => e.state === 'fail') ||
          String(life.providerStatus || '').toLowerCase() === 'failed' ? (
          <span className="text-[12px] font-medium text-[#C0372A]">Lifecycle · Stopped at failure</span>
        ) : life.exposureMinor > 0 ? (
          <span className="text-[12px] font-medium text-[#B36B00]">
            Exposure {formatPaise(life.exposureMinor, 2)}
          </span>
        ) : (
          <span className="text-[12px] font-medium text-[#2B6CB0]">In flight</span>
        )}
      </div>

      {traceHref && compact ? (
        <Link href={traceHref} className="inline-flex text-[13px] font-medium text-[#528FF0] hover:underline">
          Open full trace →
        </Link>
      ) : null}

      <section className="rounded-[8px] border border-[#E6E8EB] bg-[#FAFBFC] px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Where is the money?</p>
        <ol className={`mt-3 ${compact ? 'space-y-2' : 'grid gap-2 sm:grid-cols-5'}`}>
          {life.money.nodes.map((node, i) => (
            <li key={node.id} className="flex items-start gap-2">
              {!compact && i > 0 ? <span className="hidden pt-2 text-[#CBD5E1] sm:inline">→</span> : null}
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-[#0F172A]">{node.label}</p>
                <p className="truncate font-mono text-[11px] text-[#64748B]">{node.sub}</p>
              </div>
            </li>
          ))}
        </ol>
        <p
          className={`mt-3 text-[12px] font-medium ${
            life.money.outcome === 'accounted'
              ? 'text-[#147A3F]'
              : life.money.outcome === 'unaccounted'
                ? 'text-[#C0372A]'
                : 'text-[#B36B00]'
          }`}
        >
          {life.money.outcome === 'accounted' ? '✓ ' : life.money.outcome === 'unaccounted' ? '⚠ ' : ''}
          {life.money.caption}
        </p>
      </section>

      <div className="flex gap-4 overflow-x-auto border-b border-[#E6E8EB]">
        {TABS.map((item) => {
          const on = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`-mb-px shrink-0 border-b-2 pb-2 text-[13px] ${
                on
                  ? 'border-[#1A1A1A] font-semibold text-[#1A1A1A]'
                  : 'border-transparent font-medium text-[#6B6B6B] hover:text-[#1A1A1A]'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      {tab === 'overview' ? (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3">
            <OverviewStat label="Amount" value={formatPaise(life.amountMinor, 2)} />
            <OverviewStat label="Mode" value={life.mode} />
            <OverviewStat label="Provider" value={life.providerStatus.toUpperCase()} />
            <OverviewStat label="Reconciliation" value={life.reconResult} />
            <OverviewStat label="UTR" value={life.utr || 'null'} mono />
            <OverviewStat
              label="Exposure"
              value={life.exposureMinor ? formatPaise(life.exposureMinor, 2) : '₹0.00'}
            />
          </dl>
          <div className="rounded-[8px] border border-[#E6E8EB] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Route decision</p>
            <p className="mt-2 text-[14px] font-semibold text-[#0F172A]">{life.route.rail}</p>
            <p className="mt-1 text-[13px] text-[#475569]">{life.route.reason}</p>
            <p className="mt-2 text-[12px] text-[#64748B]">
              SLA {life.route.sla}
              <span className="mx-1.5 text-[#D0D4DA]">·</span>
              {life.route.feeFx}
            </p>
          </div>
          <SourceMatrixTable rows={life.sourceMatrix} />
        </div>
      ) : null}

      {tab === 'events' ? (
        <ol className="space-y-0">
          {life.events.map((event, i) => {
            const last = i === life.events.length - 1
            const open = openEvent === event.id
            return (
              <li key={event.id} className="flex gap-3">
                <div className="flex w-4 flex-col items-center">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${eventDot(event.state)}`} />
                  {last ? null : (
                    <span
                      className={`my-0.5 w-px flex-1 ${
                        event.state === 'fail' ? 'bg-[#FECACA]' : 'bg-[#E2E8F0]'
                      }`}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1 pb-4">
                  <button
                    type="button"
                    onClick={() => setOpenEvent(open ? null : event.id)}
                    className="flex w-full items-start justify-between gap-3 text-left"
                  >
                    <div>
                      <p className="font-mono text-[11px] text-[#94A3B8]">{event.timeLabel}</p>
                      <p className="text-[13px] font-semibold text-[#0F172A]">{event.title}</p>
                    </div>
                    <span className="text-[11px] font-medium text-[#528FF0]">{open ? 'Hide' : 'Details'}</span>
                  </button>
                  {open ? (
                    <div
                      className={`mt-2 rounded-[8px] border bg-white p-3 ${
                        event.state === 'fail'
                          ? 'border-[#FECACA] bg-[#FEF2F2]'
                          : event.state === 'warn'
                            ? 'border-[#FDE68A] bg-[#FFFBEB]'
                            : 'border-[#E6E8EB]'
                      }`}
                    >
                      <p className="text-[13px] leading-relaxed text-[#334155]">{event.summary}</p>
                      {event.state === 'fail' ? (
                        <p className="mt-2 rounded-[4px] bg-[#FEE2E2] px-2 py-1 text-[11px] font-semibold text-[#B91C1C]">
                          Terminal failure · no successful evidence seal
                        </p>
                      ) : null}
                      {event.operational ? (
                        <p className="mt-2 rounded-[4px] bg-[#FFF6E5] px-2 py-1 text-[11px] font-semibold text-[#B36B00]">
                          {event.operational.label}: {event.operational.value}
                        </p>
                      ) : null}
                      <dl className="mt-2 space-y-1.5">
                        {event.facts.map((fact) => (
                          <div key={fact.label} className="grid grid-cols-[108px_1fr] gap-2 text-[12px]">
                            <dt className="text-[#94A3B8]">{fact.label}</dt>
                            <dd className="break-all font-medium text-[#0F172A]">{fact.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : (
                    <p className="mt-0.5 text-[12px] text-[#64748B]">{event.summary}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      ) : null}

      {tab === 'provider' ? <JsonBlock title="Razorpay / provider record" value={jsonProvider} /> : null}
      {tab === 'bank' ? <JsonBlock title="Bank observation" value={jsonBank} /> : null}
      {tab === 'settlement' ? (
        <div className="rounded-[8px] border border-[#E6E8EB] p-4 text-[13px] text-[#334155]">
          <p>
            Settlement relationship is derived from recon, not invented. Provider status stays{' '}
            <span className="font-semibold">{life.providerStatus}</span>.
          </p>
          <p className="mt-2 font-mono text-[12px] text-[#64748B]">
            recon={life.reconResult}
            {life.exceptionType ? ` · exception=${life.exceptionType}` : ''}
          </p>
        </div>
      ) : null}
      {tab === 'ledger' ? (
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Attempt ledger</p>
          {life.attempts.map((att) => (
            <article key={att.id} className="rounded-[8px] border border-[#E6E8EB] p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[12px] font-semibold text-[#0F172A]">{att.id}</p>
                <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                  {att.status}
                </span>
              </div>
              <dl className="mt-3 space-y-1.5 text-[12px]">
                <div className="grid grid-cols-[108px_1fr] gap-2">
                  <dt className="text-[#94A3B8]">Sent</dt>
                  <dd>{att.sentLabel}</dd>
                </div>
                <div className="grid grid-cols-[108px_1fr] gap-2">
                  <dt className="text-[#94A3B8]">Response</dt>
                  <dd className="font-mono">{att.response}</dd>
                </div>
                <div className="grid grid-cols-[108px_1fr] gap-2">
                  <dt className="text-[#94A3B8]">Provider ref</dt>
                  <dd className="font-mono">{att.providerRef}</dd>
                </div>
              </dl>
              <ul className="mt-2 space-y-1 text-[12px] text-[#147A3F]">
                {att.notes.map((n) => (
                  <li key={n}>✓ {n}</li>
                ))}
              </ul>
            </article>
          ))}
          <JsonBlock title="Ledger movement" value={jsonLedger} />
        </div>
      ) : null}

      {tab === 'evidence' ? (
        <div className="space-y-4">
          <section className="rounded-[8px] border border-[#E6E8EB] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
              Evidence integrity
            </p>
            <p className="mt-2 text-[13px] font-semibold text-[#147A3F]">✓ SHA-256 verified</p>
            <p className="mt-1 break-all font-mono text-[12px] text-[#334155]">sha256:{life.requestHash}</p>
            <p className="mt-3 text-[13px] font-semibold text-[#147A3F]">✓ Evidence chain verified</p>
            <dl className="mt-2 space-y-1.5 text-[12px]">
              <div className="grid grid-cols-[108px_1fr] gap-2">
                <dt className="text-[#94A3B8]">Merkle root</dt>
                <dd className="break-all font-mono">{life.merkleRoot}</dd>
              </div>
              <div className="grid grid-cols-[108px_1fr] gap-2">
                <dt className="text-[#94A3B8]">Leaf</dt>
                <dd className="font-mono">{life.merkleLeaf}</dd>
              </div>
              <div className="grid grid-cols-[108px_1fr] gap-2">
                <dt className="text-[#94A3B8]">Tree status</dt>
                <dd className="font-semibold text-[#147A3F]">VALID</dd>
              </div>
              <div className="grid grid-cols-[108px_1fr] gap-2">
                <dt className="text-[#94A3B8]">Last sealed</dt>
                <dd>{life.sealedAt}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[12px] text-[#64748B]">
              Request hash {shortHash(life.requestHash)} matches the sealed contract. Merkle is shown here, not on
              every lifecycle card.
            </p>
          </section>
        </div>
      ) : null}

      <section className="rounded-[8px] border border-[#E6E8EB] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">AI investigation</p>
        <p className="mt-2 text-[13px] font-semibold text-[#0F172A]">{life.investigation.headline}</p>
        <ul className="mt-2 space-y-1 text-[13px] text-[#475569]">
          {life.investigation.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function OverviewStat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[8px] border border-[#E6E8EB] bg-[#FAFBFC] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">{label}</p>
      <p className={`mt-1 text-[13px] font-semibold text-[#0F172A] ${mono ? 'break-all font-mono' : 'tabular-nums'}`}>
        {value}
      </p>
    </div>
  )
}

function SourceMatrixTable({ rows }: { rows: PayoutLifecycle['sourceMatrix'] }) {
  return (
    <div className="overflow-x-auto rounded-[8px] border border-[#E6E8EB]">
      <table className="w-full min-w-[420px] text-left text-[12px]">
        <thead className="bg-[#FAFBFC] text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8F8F8F]">
          <tr>
            <th className="px-3 py-2">Stage</th>
            <th className="px-3 py-2">Provider</th>
            <th className="px-3 py-2">Bank</th>
            <th className="px-3 py-2">Webhook</th>
            <th className="px-3 py-2">Ledger</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.stage} className="border-t border-[#F3F4F6]">
              <td className="px-3 py-2 font-medium text-[#0F172A]">{row.stage}</td>
              <td className="px-3 py-2">{flagMark(row.provider)}</td>
              <td className="px-3 py-2">{flagMark(row.bank)}</td>
              <td className="px-3 py-2">{flagMark(row.webhook)}</td>
              <td className="px-3 py-2">{flagMark(row.ledger)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function JsonBlock({ title, value }: { title: string; value: string }) {
  return (
    <section>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">{title}</p>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-[8px] border border-[#EEF0F3] bg-[#FAFBFC] p-3 font-mono text-[11px] text-[#334155]">
        {value}
      </pre>
    </section>
  )
}

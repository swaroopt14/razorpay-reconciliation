'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_TRACE_PAYMENT_ID,
  DEMO_PAYMENT_TRACES,
  PAYMENT_TRACE_HEADER,
  buildTraceBatches,
  getPaymentTraceById,
  traceOverviewStats,
  tracesForBatch,
  type DriftKind,
  type PaymentTrace,
  type TraceBatch,
  type TraceLifecycle,
} from '@/services/payout-command/demo/paymentTraceDemo'
import { useDemoBatchReady } from '@/services/payout-command/demo/demoBatchReadiness'
import { DEMO_BATCH_LABEL } from '@/services/payout-command/demo/ycDemoConstants'
import { AwaitingUploadsEmptyState } from '../demo/AwaitingUploadsEmptyState'
import { PageExplainerBanner } from '../demo/PageExplainerBanner'

type TabId = 'timeline' | 'signals' | 'attempts' | 'files' | 'tech'
/** Batch list → payouts in batch → single payout detail (same pattern as Intent Journal). */
type View = 'batches' | 'batch-payouts' | 'detail'

const TABS: { id: TabId; label: string }[] = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'signals', label: 'Signals' },
  { id: 'attempts', label: 'Attempts' },
  { id: 'files', label: 'Files' },
  { id: 'tech', label: 'Technical log' },
]

type Notice = { tone: 'ok' | 'warn'; text: string }

function driftTone(_kind: DriftKind): string {
  return 'border-[#0B1324] bg-[#F1F5F9] text-[#0B1324]'
}

function slaTone(_s: PaymentTrace['freshness']['slaStatus']): string {
  return 'text-[#0B1324]'
}

/**
  * Spec 7.10 - Payment Trace.
  * Batch selection (Intent-style) → payouts in batch → payout detail timeline.
  */
export function PaymentTraceSurface({ paymentId }: { paymentId?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { ready, readiness } = useDemoBatchReady()
  const initial = paymentId?.trim() || ''
  const initialTrace = initial ? getPaymentTraceById(initial) : null
  const batchFromQuery =
    searchParams.get('batch_id')?.trim() || searchParams.get('client_batch_id')?.trim() || ''

  const [view, setView] = useState<View>(() => {
    if (initialTrace) return 'detail'
    if (batchFromQuery) return 'batch-payouts'
    return 'batches'
  })
  const [openBatchId, setOpenBatchId] = useState<string | null>(() => {
    if (initialTrace) return initialTrace.batchId
    if (batchFromQuery && DEMO_PAYMENT_TRACES.some((t) => t.batchId === batchFromQuery)) {
      return batchFromQuery
    }
    return null
  })
  const [activeId, setActiveId] = useState(initial || DEFAULT_TRACE_PAYMENT_ID)
  const [tab, setTab] = useState<TabId>('timeline')
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    const id = paymentId?.trim()
    if (id) {
      const found = getPaymentTraceById(id)
      if (found) {
        setActiveId(id)
        setOpenBatchId(found.batchId)
        setView('detail')
      }
      return
    }
    const batchId =
      searchParams.get('batch_id')?.trim() || searchParams.get('client_batch_id')?.trim() || ''
    if (batchId && DEMO_PAYMENT_TRACES.some((t) => t.batchId === batchId)) {
      setOpenBatchId(batchId)
      setView('batch-payouts')
      return
    }
    setView('batches')
    setOpenBatchId(null)
  }, [paymentId, searchParams])

  const batches = useMemo(() => buildTraceBatches(DEMO_PAYMENT_TRACES), [])
  const batchPayouts = useMemo(
    () => (openBatchId ? tracesForBatch(DEMO_PAYMENT_TRACES, openBatchId) : []),
    [openBatchId],
  )
  const activeBatch = openBatchId
    ? (batches.find((b) => b.batchId === openBatchId) ?? null)
    : null
  const overviewStats = useMemo(() => traceOverviewStats(DEMO_PAYMENT_TRACES), [])

  const trace = useMemo(
    () => getPaymentTraceById(activeId) ?? getPaymentTraceById(DEFAULT_TRACE_PAYMENT_ID),
    [activeId],
  )

  function openBatch(batchId: string) {
    setOpenBatchId(batchId)
    setView('batch-payouts')
    setNotice(null)
    router.push(`/payments?demo=sandbox&batch_id=${encodeURIComponent(batchId)}`)
  }

  function openPayment(id: string) {
    const found = getPaymentTraceById(id)
    if (found) setOpenBatchId(found.batchId)
    setActiveId(id)
    setView('detail')
    setTab('timeline')
    setNotice(null)
    router.push(`/payments/${encodeURIComponent(id)}/trace?demo=sandbox`)
  }

  function backToBatchPayouts() {
    setView('batch-payouts')
    setNotice(null)
    if (openBatchId) {
      router.push(`/payments?demo=sandbox&batch_id=${encodeURIComponent(openBatchId)}`)
    } else {
      router.push('/payments?demo=sandbox')
    }
  }

  function backToBatches() {
    setView('batches')
    setOpenBatchId(null)
    setNotice(null)
    router.push('/payments?demo=sandbox')
  }

  function refreshSignals() {
    setNotice({
      tone: 'ok',
      text: 'Signals refreshed (sandbox). Freshness timestamps re-checked against last provider signal.',
    })
  }

  function collectHistorical() {
    setNotice({
      tone: 'ok',
      text: 'Historical signal collection queued (sandbox). File-based events stay labelled as file ingestion.',
    })
  }

  if (!ready) {
    return (
      <div className="bg-[#F8FAFC] pb-10">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="mx-auto max-w-[1600px] space-y-5">
            <PageExplainerBanner page="trace" />
            <header>
              <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-[#0B1324]">
                {PAYMENT_TRACE_HEADER.title}
              </h1>
              <p className="mt-1 text-[13px] text-[#64748B]">{PAYMENT_TRACE_HEADER.subtitle}</p>
            </header>
            <AwaitingUploadsEmptyState title="No payment traces yet" readiness={readiness} />
          </div>
        </div>
      </div>
    )
  }

  if (view === 'detail' && !trace) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-[13px] text-[#64748B]">
        Trace not found.
      </div>
    )
  }

  return (
    <div className="bg-[#F8FAFC] pb-10">
      <div className="mx-auto max-w-[1600px] space-y-5 px-5 py-5 sm:px-6">
          {view !== 'detail' ? <PageExplainerBanner page="trace" /> : null}

          {notice ? (
            <p
              role="status"
              className="border border-[#0B1324]/20 bg-[#F1F5F9] px-3 py-2 text-[13px] text-[#0B1324]"
            >
              {notice.text}
              <button
                type="button"
                className="ml-3 font-semibold underline"
                onClick={() => setNotice(null)}
              >
                Dismiss
              </button>
            </p>
          ) : null}

          {view === 'batches' ? (
            <BatchOverview
              batches={batches}
              stats={overviewStats}
              onOpenBatch={openBatch}
            />
          ) : null}

          {view === 'batch-payouts' && activeBatch ? (
            <BatchPayoutsList
              batch={activeBatch}
              payouts={batchPayouts}
              onBack={backToBatches}
              onOpenPayment={openPayment}
            />
          ) : null}

          {view === 'detail' && trace ? (
            <>
              <button
                type="button"
                onClick={backToBatchPayouts}
                className="text-[13px] font-semibold text-[#2563EB] hover:underline"
              >
                ← Batch payouts
              </button>
              <DetailView
                trace={trace}
                tab={tab}
                setTab={setTab}
                onRefresh={refreshSignals}
                onCollect={collectHistorical}
              />
            </>
          ) : null}
        </div>
    </div>
  )
}

function BatchOverview({
  batches,
  stats,
  onOpenBatch,
}: {
  batches: TraceBatch[]
  stats: ReturnType<typeof traceOverviewStats>
  onOpenBatch: (batchId: string) => void
}) {
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-[#0B1324]">
            {PAYMENT_TRACE_HEADER.title}
          </h1>
          <p className="mt-1 text-[13px] text-[#64748B]">{PAYMENT_TRACE_HEADER.subtitle}</p>
        </div>
      </header>

      <section className="border border-[#E5E5E5] bg-white" aria-label="Overview summary">
        <div className="border-b border-[#E5E5E5] px-5 py-5 sm:px-6 sm:py-6">
          <p className="text-[13px] font-medium text-[#64748B]">Payouts with a trace</p>
          <p className="mt-1 text-[2rem] font-semibold tracking-[-0.03em] text-[#0B1324] sm:text-[2.25rem]">
            {stats.payoutCount.toLocaleString('en-IN')}
          </p>
          <p className="mt-1 text-[13px] text-[#94A3B8]">
            across {batches.length} batch{batches.length === 1 ? '' : 'es'} · open a batch for payout
            timelines
          </p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-[#E5E5E5] sm:grid-cols-4 sm:divide-y-0">
          <SummaryCell label="Payouts" value={String(stats.payoutCount)} hint="Across batches in this list" />
          <SummaryCell
            label="Lifecycle complete"
            value={String(stats.completeCount)}
            hint="Outcome decided or proof generated"
          />
          <SummaryCell
            label="Watching / breached"
            value={String(stats.watchingCount)}
            hint="SLA freshness needs attention"
          />
          <SummaryCell
            label="Drift / blocked"
            value={String(stats.driftCount + stats.blockedCount)}
            hint="Field change, unsupported signal, or blocked"
          />
        </div>
      </section>

      <section className="border border-[#E5E5E5] bg-white" aria-label="Batches">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E5E5] px-5 py-3.5">
          <div>
            <p className="text-[14px] font-semibold text-[#0B1324]">Batches</p>
            <p className="text-[12px] text-[#64748B]">
              {batches.length} batch{batches.length === 1 ? '' : 'es'} · open to view payout traces
            </p>
          </div>
        </div>

        {batches.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-[#94A3B8]">
            No batches yet. Upload and dispatch a batch to populate traces.
          </p>
        ) : (
          <ul className="divide-y divide-[#E5E5E5]">
            {batches.map((batch) => (
              <li
                key={batch.batchId}
                className="flex items-center gap-4 bg-white px-5 py-3.5 transition hover:bg-[#FAFAFA]"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#0B1324]" aria-hidden />
                <button
                  type="button"
                  onClick={() => onOpenBatch(batch.batchId)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-[13px] font-semibold text-[#0B1324]">
                    {batch.label === 'Batch 001' ? DEMO_BATCH_LABEL : batch.label}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-[#94A3B8]">{batch.batchId}</p>
                  <p className="mt-0.5 text-[12px] text-[#64748B]">
                    {batch.payoutCount.toLocaleString('en-IN')} payouts
                    <span className="mx-1.5 text-[#E2E8F0]">·</span>
                    {batch.completeCount} complete
                    {batch.watchingCount > 0 ? (
                      <>
                        <span className="mx-1.5 text-[#E2E8F0]">·</span>
                        {batch.watchingCount} watching
                      </>
                    ) : null}
                    {batch.blockedCount > 0 ? (
                      <>
                        <span className="mx-1.5 text-[#E2E8F0]">·</span>
                        {batch.blockedCount} blocked
                      </>
                    ) : null}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenBatch(batch.batchId)}
                  className="shrink-0 text-[12px] font-semibold text-[#2563EB] hover:underline"
                >
                  Open →
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function BatchPayoutsList({
  batch,
  payouts,
  onBack,
  onOpenPayment,
}: {
  batch: TraceBatch
  payouts: PaymentTrace[]
  onBack: () => void
  onOpenPayment: (id: string) => void
}) {
  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="text-[13px] font-semibold text-[#2563EB] hover:underline"
      >
        ← All batches
      </button>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#64748B]">
            Trace · {batch.label}
          </p>
          <h1 className="mt-0.5 text-[1.35rem] font-semibold tracking-[-0.02em] text-[#0B1324]">
            {batch.label === 'Batch 001' ? DEMO_BATCH_LABEL : batch.label}
          </h1>
          <p className="mt-1 font-mono text-[12px] text-[#94A3B8]">{batch.batchId}</p>
          <p className="mt-1 text-[13px] text-[#64748B]">
            Open a payout to follow dispatch → acknowledgement → settlement → proof.
          </p>
        </div>
        <p className="text-[13px] text-[#64748B]">
          <span className="font-semibold text-[#0B1324]">{payouts.length}</span> payouts
        </p>
      </header>

      <div className="overflow-hidden border border-[#E5E5E5] bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-[#E5E5E5] bg-[#F8FAFC] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
            <tr>
              <th className="px-4 py-3">Payout</th>
              <th className="px-4 py-3">Batch ref</th>
              <th className="px-4 py-3">Payee</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Lifecycle</th>
              <th className="px-4 py-3">Drift</th>
              <th className="px-4 py-3 text-right"> </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E5E5]">
            {payouts.map((row) => (
              <tr
                key={row.paymentId}
                className="cursor-pointer hover:bg-[#FAFAFA]"
                onClick={() => onOpenPayment(row.paymentId)}
              >
                <td className="px-4 py-3 font-mono text-[13px] font-semibold text-[#0B1324]">
                  {row.humanRef}
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-[#64748B]">{row.batchId}</td>
                <td className="px-4 py-3 text-[#334155]">{row.payeeLabel}</td>
                <td className="px-4 py-3 font-semibold tabular-nums">{row.amountLabel}</td>
                <td className="px-4 py-3 text-[12px] text-[#64748B]">{row.lifecycle}</td>
                <td className="px-4 py-3 text-[12px] font-medium text-[#0B1324]">{row.drift.kind}</td>
                <td className="px-4 py-3 text-right text-[12px] font-semibold text-[#2563EB]">
                  Open →
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryCell({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <p className="text-[12px] font-medium text-[#64748B]">{label}</p>
      <p className="mt-1 text-[1.25rem] font-semibold tabular-nums tracking-tight text-[#0B1324]">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-[#94A3B8]">{hint}</p>
    </div>
  )
}

function DetailView({
  trace,
  tab,
  setTab,
  onRefresh,
  onCollect,
}: {
  trace: PaymentTrace
  tab: TabId
  setTab: (t: TabId) => void
  onRefresh: () => void
  onCollect: () => void
}) {
  const providerRef =
    trace.attempts.find((a) => a.providerRef)?.providerRef ??
    trace.events.map((e) => e.externalRef).find(Boolean) ??
    null

  return (
    <div className="mx-auto max-w-[880px] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[1.2rem] font-semibold text-[#0B1324]">{trace.humanRef}</p>
          <p className="mt-1 text-[13px] text-[#64748B]">
            {trace.payeeLabel}
            <span className="mx-1.5 text-[#E2E8F0]">·</span>
            {trace.amountLabel}
            <span className="mx-1.5 text-[#E2E8F0]">·</span>
            {trace.contractId}
            <span className="mx-1.5 text-[#E2E8F0]">·</span>
            <span className="font-mono text-[12px]">{trace.batchId}</span>
          </p>
        </div>
        <LifecycleBadge stage={trace.lifecycle} />
      </div>

      <section className="grid gap-3 border border-[#E5E5E5] bg-white p-4 sm:grid-cols-3">
        <FreshCard label="Last provider signal" value={trace.freshness.lastProviderSignal} />
        <FreshCard label="Expected next signal" value={trace.freshness.expectedNextSignal} />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
            SLA status
          </p>
          <p className={`mt-1 text-[14px] font-semibold ${slaTone(trace.freshness.slaStatus)}`}>
            {trace.freshness.slaStatus}
          </p>
        </div>
      </section>

      <section className={`border-l-4 px-4 py-3 ${driftTone(trace.drift.kind)}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em]">Drift</p>
        <p className="mt-1 text-[15px] font-semibold">{trace.drift.kind}</p>
        <p className="mt-1 text-[13px] leading-relaxed">{trace.drift.summary}</p>
        {trace.drift.contractField ? (
          <p className="mt-2 font-mono text-[12px]">
            Contract field · {trace.drift.contractField}
            {trace.drift.sealedValue ? (
              <>
                <span className="mx-1.5">·</span>
                sealed {trace.drift.sealedValue}
              </>
            ) : null}
            {trace.drift.observedValue ? (
              <>
                <span className="mx-1.5">·</span>
                observed {trace.drift.observedValue}
              </>
            ) : null}
          </p>
        ) : null}
        <Link
          href={trace.links.contractHref}
          className="mt-2 inline-flex text-[13px] font-semibold text-[#2563EB] hover:underline"
        >
          Compare event to contract →
        </Link>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link
          href={trace.links.evidenceHref}
          className="inline-flex h-9 items-center bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
        >
          Open current evidence
        </Link>
        <button
          type="button"
          onClick={onRefresh}
          className="h-9 border border-[#E5E5E5] bg-white px-3 text-[13px] font-semibold text-[#0B1324]"
        >
          Refresh signals
        </button>
        <button
          type="button"
          onClick={onCollect}
          className="h-9 border border-[#E5E5E5] bg-white px-3 text-[13px] font-semibold text-[#0B1324]"
        >
          Collect historical signals
        </button>
        {providerRef ? (
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(providerRef)}
            className="h-9 border border-[#E5E5E5] bg-white px-3 text-[13px] font-semibold text-[#0B1324]"
          >
            Open provider reference
          </button>
        ) : null}
        <Link
          href={trace.links.proofHref}
          className="inline-flex h-9 items-center px-2 text-[13px] font-semibold text-[#2563EB] hover:underline"
        >
          Open proof
        </Link>
        <Link
          href={trace.links.dispatchHref}
          className="inline-flex h-9 items-center px-2 text-[13px] font-semibold text-[#2563EB] hover:underline"
        >
          Open dispatch
        </Link>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-[#E5E5E5]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`h-10 px-3 text-[13px] font-semibold ${
              tab === t.id
                ? 'border-b-2 border-[#0B1324] text-[#0B1324]'
                : 'text-[#64748B] hover:text-[#0B1324]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'timeline' ? (
        <ol className="border border-[#E5E5E5] bg-white">
          {trace.events.map((e, i) => (
            <li
              key={e.id}
              className="flex gap-4 border-b border-[#E5E5E5] px-4 py-4 last:border-0"
            >
              <div className="flex w-4 flex-col items-center">
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#2E5BFF]" />
                {i < trace.events.length - 1 ? (
                  <span className="mt-1 w-px flex-1 bg-[#E2E8F0]" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[14px] font-semibold text-[#0B1324]">{e.title}</p>
                  <span className="text-[11px] font-medium text-[#94A3B8]">{e.time}</span>
                </div>
                <p className="mt-1 text-[12px] text-[#64748B]">
                  Source · {e.source}
                  {e.fileIngestion ? (
                    <span className="ml-2 font-semibold text-[#0B1324]">File ingestion</span>
                  ) : null}
                </p>
                <dl className="mt-2 grid gap-1 text-[12px] text-[#475569] sm:grid-cols-2">
                  <div>
                    <dt className="text-[#94A3B8]">Object ID</dt>
                    <dd className="font-mono">{e.objectId}</dd>
                  </div>
                  <div>
                    <dt className="text-[#94A3B8]">External reference</dt>
                    <dd className="font-mono">{e.externalRef ?? '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-[#94A3B8]">Integrity state</dt>
                    <dd>{e.integrityState}</dd>
                  </div>
                  <div>
                    <dt className="text-[#94A3B8]">Latency</dt>
                    <dd>{e.latency}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-[13px] text-[#334155]">{e.detail}</p>
                <p className="mt-1 text-[12px] font-medium text-[#0B1324]">Status · {e.status}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {tab === 'signals' ? (
        <ul className="divide-y divide-[#E5E5E5] border border-[#E5E5E5] bg-white">
          {trace.signals.map((s) => (
            <li key={s.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[14px] font-semibold text-[#0B1324]">{s.name}</p>
                <span className="text-[12px] font-semibold text-[#64748B]">{s.status}</span>
              </div>
              <p className="mt-1 text-[12px] text-[#64748B]">
                Source · {s.source}
                {s.receivedAt ? (
                  <>
                    <span className="mx-1.5">·</span>
                    {s.receivedAt}
                  </>
                ) : s.status === 'Waiting' || s.status === 'Overdue' ? (
                  <>
                    <span className="mx-1.5">·</span>
                    Missing - expected from {s.source}
                  </>
                ) : null}
              </p>
              <p className="mt-1 text-[13px] text-[#334155]">{s.note}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === 'attempts' ? (
        trace.attempts.length === 0 ? (
          <p className="border border-[#E5E5E5] bg-white px-4 py-8 text-center text-[13px] text-[#94A3B8]">
            No dispatch attempts yet for this payout.
          </p>
        ) : (
          <ul className="divide-y divide-[#E5E5E5] border border-[#E5E5E5] bg-white">
            {trace.attempts.map((a) => (
              <li key={a.attemptId} className="px-4 py-3 font-mono text-[12px]">
                <p className="font-semibold text-[#0B1324]">{a.attemptId}</p>
                <p className="mt-1 text-[#64748B]">
                  {a.sentAt ?? '-'} · {a.responseCode ?? '-'} · {a.status}
                </p>
                <p className="mt-1 break-all text-[#475569]">hash {a.requestHash}</p>
                <p className="mt-1 text-[#0B1324]">
                  provider ref · {a.providerRef ?? '- awaiting'}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === 'files' ? (
        trace.files.length === 0 ? (
          <p className="border border-[#E5E5E5] bg-white px-4 py-8 text-center text-[13px] text-[#94A3B8]">
            No file ingestion records for this payout.
          </p>
        ) : (
          <ul className="divide-y divide-[#E5E5E5] border border-[#E5E5E5] bg-white">
            {trace.files.map((f) => (
              <li key={f.id} className="px-4 py-3">
                <p className="text-[14px] font-semibold text-[#0B1324]">{f.name}</p>
                <p className="mt-1 text-[12px] text-[#64748B]">
                  {f.kind} · {f.ingestedAt} · {f.rows} row
                  {f.rows === 1 ? '' : 's'}
                </p>
                <p className="mt-1 text-[13px] text-[#0B1324]">{f.note}</p>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === 'tech' ? (
        <pre className="overflow-x-auto border border-[#E5E5E5] bg-[#0B1324] p-4 text-[12px] leading-relaxed text-[#E2E8F0]">
          {trace.technicalLog.join('\n')}
        </pre>
      ) : null}
    </div>
  )
}

function FreshCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">{label}</p>
      <p className="mt-1 text-[13px] font-medium leading-snug text-[#0B1324]">{value}</p>
    </div>
  )
}

function LifecycleBadge({ stage }: { stage: TraceLifecycle }) {
  return (
    <span className="bg-[#F1F5F9] px-3 py-1 text-[12px] font-semibold text-[#0B1324]">
      {stage}
    </span>
  )
}

'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  DEMO_OUTCOME_EXCEPTIONS,
  OUTCOME_REVIEW_HEADER,
  formatOutcomeInr,
  outcomeReviewStats,
  type OutcomeClass,
  type OutcomeException,
  type ReviewResolution,
} from '@/services/payout-command/demo/outcomeReviewDemo'
import {
  loadStoredGapsFilters,
  storeGapsFilters,
  type GapCategoryId,
} from '@/services/payout-command/demo/paymentGapsDemo'
import { useDemoBatchReady } from '@/services/payout-command/demo/demoBatchReadiness'
import { AwaitingUploadsEmptyState } from '../demo/AwaitingUploadsEmptyState'
import { PageExplainerBanner } from '../demo/PageExplainerBanner'
import { LifecycleSummaryStrip } from '../shared/LifecycleSummaryStrip'

const GAP_TO_OUTCOME: Record<GapCategoryId, OutcomeClass | 'open'> = {
  unmatched_intent: 'Unresolved',
  short_settled: 'Short-settled',
  over_settled: 'Over-settled',
  unlinked_settlement: 'Unresolved',
  return_reversal: 'Returned',
  unresolved: 'Unresolved',
}

type Notice = { tone: 'ok' | 'warn' | 'err'; text: string }

type PrimaryAction =
  | 'confirm_exact'
  | 'approve_tolerance'
  | 'link_signal'
  | 'request_evidence'
  | 'dispute_pack'
  | 'reprocess_mapping'

const ACTION_META: Record<
  PrimaryAction,
  { label: string; resolution: ReviewResolution; consequence: string; needsReason: boolean }
> = {
  confirm_exact: {
    label: 'Confirm exact match',
    resolution: 'exact_confirmed',
    consequence:
      'Records a deterministic Exact decision with actor, reason, and audit entry. Does not reverse prior match history - a later change requires a new audited action.',
    needsReason: true,
  },
  approve_tolerance: {
    label: 'Approve within tolerance',
    resolution: 'tolerance_approved',
    consequence:
      'Marks Within tolerance under policy. Variance stays visible on the contract. Reversal of this decision requires a new audited action.',
    needsReason: true,
  },
  link_signal: {
    label: 'Link signal',
    resolution: 'signal_linked',
    consequence:
      'Manually links the settlement signal to this contract. Requires actor, reason, and audit record. AI cannot complete the link alone.',
    needsReason: true,
  },
  request_evidence: {
    label: 'Request evidence',
    resolution: 'evidence_requested',
    consequence:
      'Opens an evidence request to the provider / bank collect path. Exception remains open until evidence arrives and a new decision is recorded.',
    needsReason: false,
  },
  dispute_pack: {
    label: 'Create dispute pack',
    resolution: 'dispute_pack_created',
    consequence:
      'Assembles a dispute pack from contract, settlement signal, and evidence list. Does not change the match class by itself.',
    needsReason: false,
  },
  reprocess_mapping: {
    label: 'Reprocess with corrected mapping',
    resolution: 'mapping_reprocessed',
    consequence:
      'Queues remapping of the settlement observation. Prior decision remains in audit; new MatchDecision will replace only via a fresh run.',
    needsReason: true,
  },
}

function classStyle(_c: OutcomeClass): string {
  return 'bg-[#0B1324] text-white ring-[#0B1324]/30'
}

function ContextCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div
      className={`border px-3 py-2.5 ${warn ? 'border-l-4 border-l-[#0B1324] border-[#E5E5E5] bg-[#F1F5F9]' : 'border-[#E5E5E5] bg-white'}`}
    >
      <p className="text-[11px] font-medium text-[#64748B]">{label}</p>
      <p className="mt-0.5 text-[13px] font-semibold text-[#0B1324]">{value}</p>
    </div>
  )
}

/**
  * Spec 7.12 - Outcome Review.
  * Queue of exceptions · expected-vs-observed · root causes · AI assist · audited actions.
  */
export function OutcomeReviewSurface() {
  const searchParams = useSearchParams()
  const { ready, readiness, require } = useDemoBatchReady(undefined, { require: 'both' })
  const [items, setItems] = useState<OutcomeException[]>(() =>
    DEMO_OUTCOME_EXCEPTIONS.map((i) => ({
      ...i,
      rootCauses: [...i.rootCauses],
      evidence: [...i.evidence],
      comparison: [...i.comparison],
      auditTrail: [...i.auditTrail],
    })),
  )
  const [selectedId, setSelectedId] = useState(DEMO_OUTCOME_EXCEPTIONS[0]?.id ?? '')
  const [filter, setFilter] = useState<'open' | 'all' | OutcomeClass>('open')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [aiOpen, setAiOpen] = useState(true)
  const [pending, setPending] = useState<PrimaryAction | null>(null)
  const [reason, setReason] = useState('')

  useEffect(() => {
    const gap = searchParams.get('gap') as GapCategoryId | null
    const focus = searchParams.get('focus')
    if (gap && GAP_TO_OUTCOME[gap]) {
      const mapped = GAP_TO_OUTCOME[gap]
      setFilter(mapped === 'open' ? 'open' : mapped)
    }
    if (focus) {
      const match = DEMO_OUTCOME_EXCEPTIONS.find((i) => i.paymentRef === focus)
      if (match) setSelectedId(match.id)
    }
    // Persist settlement filters arriving from Gaps
    const stored = loadStoredGapsFilters()
    const next = {
      ...stored,
      legalEntity: searchParams.get('legal_entity') || stored.legalEntity,
      batch: searchParams.get('batch') || stored.batch,
      rail: searchParams.get('rail') || stored.rail,
      country: searchParams.get('country') || stored.country,
      policy: searchParams.get('policy') || stored.policy,
      dateFrom: searchParams.get('date_from') || stored.dateFrom,
      dateTo: searchParams.get('date_to') || stored.dateTo,
    }
    storeGapsFilters(next)
  }, [searchParams])

  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null
  const stats = useMemo(() => outcomeReviewStats(items), [items])

  const queue = useMemo(() => {
    const gap = searchParams.get('gap') as GapCategoryId | null
    return items.filter((i) => {
      if (filter === 'all') return true
      if (filter === 'open') return !i.resolved
      if (
        gap === 'return_reversal' &&
        (filter === 'Returned' || filter === 'Reversed')
      ) {
        return !i.resolved && (i.outcomeClass === 'Returned' || i.outcomeClass === 'Reversed')
      }
      return !i.resolved && i.outcomeClass === filter
    })
  }, [items, filter, searchParams])

  function selectItem(id: string) {
    setSelectedId(id)
    setPending(null)
    setReason('')
    setNotice(null)
  }

  function applyResolution(id: string, resolution: ReviewResolution, message: string, actorReason: string) {
    const at = new Date().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              resolved: resolution,
              auditTrail: [
                ...i.auditTrail,
                {
                  at,
                  actor: 'Reviewer (demo)',
                  action: `${resolution.replace(/_/g, ' ')}${actorReason ? ` · ${actorReason}` : ''}`,
                },
              ],
            }
          : i,
      ),
    )
    setPending(null)
    setReason('')
    setNotice({ tone: 'ok', text: message })
  }

  function confirmPending() {
    if (!selected || !pending) return
    const meta = ACTION_META[pending]
    if (meta.needsReason && reason.trim().length < 8) {
      setNotice({
        tone: 'err',
        text: 'Manual decisions require actor, reason, and audit record (min. 8 characters). AI cannot replace this.',
      })
      return
    }
    applyResolution(
      selected.id,
      meta.resolution,
      `${meta.label} recorded for ${selected.paymentRef}. Prior match history preserved - change only via a new audited action.`,
      reason.trim(),
    )
  }

  if (!ready) {
    return (
      <div className="bg-[#F8FAFC] px-5 py-5 sm:px-6">
        <PageExplainerBanner page="outcome" />
        <header className="mt-4 border-b border-[#E5E5E5] bg-white px-5 py-4">
          <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-[#0B1324]">
            {OUTCOME_REVIEW_HEADER.title}
          </h1>
          <p className="mt-1 text-[13px] text-[#64748B]">{OUTCOME_REVIEW_HEADER.subtitle}</p>
        </header>
        <div className="mt-5">
          <AwaitingUploadsEmptyState
            title="No outcome exceptions yet"
            readiness={readiness}
            require={require}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#F8FAFC] pb-10">
      <div className="px-5 pt-4 sm:px-6">
        <PageExplainerBanner page="outcome" />
      </div>
      <header className="border-b border-[#E5E5E5] bg-white px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-[#0B1324]">
              {OUTCOME_REVIEW_HEADER.title}
            </h1>
            <p className="mt-1 text-[13px] text-[#64748B]">{OUTCOME_REVIEW_HEADER.subtitle}</p>
          </div>
        </div>
        {notice ? (
          <p
            role="status"
            className={`mt-3 border px-3 py-2 text-[13px] ${
              notice.tone === 'ok'
                ? 'border-[#0B1324]/20 bg-[#F1F5F9] text-[#0B1324]'
                : notice.tone === 'err'
                  ? 'border-[#0B1324]/20 bg-[#F1F5F9] text-[#0B1324]'
                  : 'border-[#0B1324]/20 bg-[#F1F5F9] text-[#0B1324]'
            }`}
          >
            {notice.text}
            <button type="button" className="ml-3 font-semibold underline" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </p>
        ) : null}
      </header>

      <div className="border-b border-[#E5E5E5] bg-[#F8FAFC] px-5 py-4 sm:px-6">
        <LifecycleSummaryStrip
          heroLabel="Value requiring review"
          heroValue={formatOutcomeInr(stats.reviewValue)}
          heroHint="Short, returned, reversed, or missing reference vs sealed contracts · same amounts as Overview"
          cells={[
            {
              label: 'Open exceptions',
              value: String(stats.openCount),
              hint: 'Rows still needing a match decision',
            },
            {
              label: 'Short-settled',
              value: String(stats.shortCount),
              hint: 'Observed below sealed expectation',
            },
            {
              label: 'Returned / reversed',
              value: String(stats.returnedCount + stats.reversedCount),
              hint: 'Return or reversal vs sealed contract',
            },
            {
              label: 'Unresolved',
              value: String(stats.unresolvedCount),
              hint: 'No conclusive match yet',
            },
          ]}
        />
      </div>

      <div className="flex items-start border-t border-[#E5E5E5]">
        <aside className="sticky top-0 flex max-h-[calc(100dvh-3.5rem)] w-[280px] shrink-0 flex-col self-start overflow-hidden border-r border-[#E5E5E5] bg-white sm:w-[300px]">
          <div className="flex shrink-0 flex-wrap gap-1 border-b border-[#E5E5E5] p-3">
            {(
              [
                ['open', 'Open'],
                ['Short-settled', 'Short'],
                ['Returned', 'Returned'],
                ['Unresolved', 'Unresolved'],
                ['Reversed', 'Reversed'],
                ['all', 'All'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`h-7 px-2 text-[11px] font-semibold ${
                  filter === id
                    ? 'bg-[#0B1324] text-white'
                    : 'bg-[#F8FAFC] text-[#64748B] hover:bg-[#F1F5F9]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-[#E5E5E5] overflow-y-auto">
            {queue.length === 0 ? (
              <li className="px-4 py-10 text-center text-[13px] text-[#94A3B8]">No exceptions in this filter.</li>
            ) : (
              queue.map((item) => {
                const active = item.id === selected?.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => selectItem(item.id)}
                      className={`w-full px-4 py-3.5 text-left transition ${
                        active ? 'bg-[#F8FAFC]' : 'bg-white hover:bg-[#FAFAFA]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-mono text-[12px] font-semibold text-[#0B1324]">{item.paymentRef}</p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${classStyle(item.outcomeClass)}`}
                        >
                          {item.outcomeClass}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] font-medium text-[#0B1324]">{item.payeeLabel}</p>
                      <p className="mt-0.5 truncate text-[11px] text-[#64748B]">
                        {item.deltaLabel} · match {item.matchConfidence}/100
                      </p>
                      {item.resolved ? (
                        <p className="mt-1 text-[11px] font-medium text-[#0B1324]">Resolved</p>
                      ) : null}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </aside>

        <main className="min-w-0 flex-1 bg-[#F8FAFC] px-5 py-5 sm:px-6">
          {!selected ? (
            <p className="py-10 text-center text-[13px] text-[#94A3B8]">Select an exception from the queue.</p>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${classStyle(selected.outcomeClass)}`}
                      >
                        {selected.outcomeClass}
                      </span>
                      <span className="text-[12px] font-medium text-[#64748B]">
                        Match confidence {selected.matchConfidence}/100
                      </span>
                    </div>
                    <h2 className="mt-2 font-mono text-[1.2rem] font-semibold text-[#0B1324]">
                      {selected.paymentRef}
                    </h2>
                    <p className="mt-1 text-[13px] text-[#64748B]">
                      {selected.contractId} · {selected.batchLabel}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-medium text-[#64748B]">Expected → observed</p>
                    <p className="text-[1.1rem] font-semibold tabular-nums text-[#0B1324]">
                      {selected.expectedAmountLabel} → {selected.observedAmountLabel}
                    </p>
                    <p className="mt-0.5 text-[12px] font-semibold text-[#0B1324]">{selected.deltaLabel}</p>
                  </div>
                </div>

                <p className="max-w-3xl border-l-4 border-[#0B1324] bg-white px-4 py-3 text-[14px] leading-relaxed text-[#0B1324]">
                  {selected.plainLanguage}
                </p>

                <section className="grid gap-3 sm:grid-cols-3">
                  <ContextCard label="Integrity" value={selected.integrityStatus} />
                  <ContextCard
                    label="Governance"
                    value={selected.governanceStatus}
                    warn={selected.governanceStatus === 'Failed'}
                  />
                  <ContextCard
                    label="Value date"
                    value={selected.valueDateStatus}
                    warn={selected.valueDateStatus === 'Failed'}
                  />
                </section>
                <p className="text-[11px] text-[#64748B]">
                  Integrity can verify while value-date or governance still fails - dimensions stay separate.
                </p>

                <section className="border border-[#E5E5E5] bg-white" aria-label="Expected vs observed">
                  <div className="border-b border-[#E5E5E5] px-4 py-3">
                    <p className="text-[14px] font-semibold text-[#0B1324]">Expected vs observed</p>
                    <p className="mt-0.5 text-[12px] text-[#64748B]">
                      Amount · beneficiary · currency · date · fees · provider reference · route
                    </p>
                  </div>
                  <div className="grid grid-cols-[1.1fr_1fr_1fr] gap-0 border-b border-[#E5E5E5] bg-[#F8FAFC] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                    <span>Field</span>
                    <span>Expected (contract)</span>
                    <span>Observed (settlement)</span>
                  </div>
                  <ul className="divide-y divide-[#E5E5E5]">
                    {selected.comparison.map((row) => (
                      <li
                        key={row.field}
                        className={`grid grid-cols-[1.1fr_1fr_1fr] gap-0 px-4 py-3 text-[13px] ${
                          row.mismatch ? 'border-l-4 border-l-[#0B1324] bg-[#F1F5F9]' : ''
                        }`}
                      >
                        <span className="font-medium text-[#0B1324]">{row.label}</span>
                        <span className="font-mono text-[12px] text-[#334155]">{row.expected}</span>
                        <span
                          className={`font-mono text-[12px] ${row.mismatch ? 'font-semibold text-[#0B1324]' : 'text-[#334155]'}`}
                        >
                          {row.observed}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="grid gap-4 lg:grid-cols-2">
                  <div className="border border-[#E5E5E5] bg-white">
                    <div className="border-b border-[#E5E5E5] px-4 py-3">
                      <p className="text-[14px] font-semibold text-[#0B1324]">Root-cause candidates</p>
                      <p className="mt-0.5 text-[12px] text-[#64748B]">Ranked assist - deterministic class wins</p>
                    </div>
                    <ol className="divide-y divide-[#E5E5E5]">
                      {selected.rootCauses.map((rc) => (
                        <li key={rc.id} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[13px] font-semibold text-[#0B1324]">
                              #{rc.rank} {rc.label}
                            </p>
                            <span className="text-[11px] font-semibold text-[#64748B]">{rc.likelihood}</span>
                          </div>
                          <p className="mt-1 text-[12px] text-[#475569]">{rc.evidenceNote}</p>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="border border-[#E5E5E5] bg-white">
                    <div className="border-b border-[#E5E5E5] px-4 py-3">
                      <p className="text-[14px] font-semibold text-[#0B1324]">Evidence available</p>
                      <p className="mt-0.5 text-[12px] text-[#64748B]">Coverage for this exception</p>
                    </div>
                    <ul className="divide-y divide-[#E5E5E5]">
                      {selected.evidence.map((ev) => (
                        <li key={ev.name} className="flex items-start justify-between gap-3 px-4 py-3">
                          <div>
                            <p className="text-[13px] font-medium text-[#0B1324]">{ev.name}</p>
                            <p className="mt-0.5 text-[12px] text-[#64748B]">{ev.note}</p>
                          </div>
                          <span
                            className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                              ev.available
                                ? 'bg-[#F1F5F9] text-[#0B1324]'
                                : 'bg-[#F1F5F9] text-[#64748B]'
                            }`}
                          >
                            {ev.available ? 'Available' : 'Missing'}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="border-t border-[#E5E5E5] px-4 py-3">
                      <p className="text-[12px] font-medium text-[#64748B]">Recommended next action</p>
                      <p className="mt-1 text-[13px] text-[#0B1324]">{selected.recommendedAction}</p>
                    </div>
                  </div>
                </section>

                <section className="border border-[#E9E5FF] bg-[#FAF8FF]">
                  <button
                    type="button"
                    onClick={() => setAiOpen((v) => !v)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="text-[13px] font-semibold text-[#6D4AFF]">
                      Ask Zord · Explain evidence & rank causes
                    </span>
                    <span className="text-[12px] text-[#6D4AFF]">{aiOpen ? 'Hide' : 'Show'}</span>
                  </button>
                  {aiOpen ? (
                    <div className="space-y-3 border-t border-[#E9E5FF] px-4 py-3 text-[13px] text-[#3B2E7A]">
                      <p>
                        <span className="font-semibold">Explain: </span>
                        {selected.aiExplain}
                      </p>
                      <p>
                        <span className="font-semibold">Rank: </span>
                        {selected.aiRankNote}
                      </p>
                      <p>
                        <span className="font-semibold">Draft action: </span>
                        {selected.aiDraftAction}
                      </p>
                      <p className="text-[11px] text-[#6D4AFF]/80">
                        AI confidence must not replace deterministic match rules. Confirm match, link, and
                        tolerance stay human + audit.
                      </p>
                    </div>
                  ) : null}
                </section>

                <section className="border border-[#E5E5E5] bg-white">
                  <div className="border-b border-[#E5E5E5] px-4 py-3">
                    <p className="text-[14px] font-semibold text-[#0B1324]">Audit trail</p>
                    <p className="mt-0.5 text-[12px] text-[#64748B]">
                      Decisions reversible only through a new audited action
                    </p>
                  </div>
                  <ol className="divide-y divide-[#E5E5E5]">
                    {selected.auditTrail.map((a, idx) => (
                      <li key={`${a.at}-${idx}`} className="px-4 py-3">
                        <p className="text-[13px] font-semibold text-[#0B1324]">{a.action}</p>
                        <p className="mt-0.5 text-[12px] text-[#64748B]">
                          {a.at} · {a.actor}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>

                <div className="flex flex-wrap gap-3 text-[12px]">
                  <Link href={selected.contractHref} className="font-semibold text-[#2E5BFF] hover:underline">
                    Open Action Contract
                  </Link>
                  <Link href={selected.traceHref} className="font-semibold text-[#2E5BFF] hover:underline">
                    Open Trace
                  </Link>
                  <Link href={selected.journalHref} className="font-semibold text-[#64748B] hover:underline">
                    Settlement Journal
                  </Link>
                </div>

              {/* Actions live under the detail so they never cover PAY-00xx content */}
              <section className="border border-[#E5E5E5] bg-white px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
                  Resolve
                </p>
                {selected.resolved ? (
                  <p className="mt-2 text-[13px] font-medium text-[#0B1324]">
                    Resolved · {selected.resolved.replace(/_/g, ' ')}. Open the next queue item - changing
                    this requires a new audited action.
                  </p>
                ) : (
                  <>
                    {pending ? (
                      <div className="mt-3 border border-[#E5E5E5] bg-[#F8FAFC] px-3 py-2.5 text-[12px] text-[#334155]">
                        <p className="font-semibold text-[#0B1324]">Resolve selected exception</p>
                        <p className="mt-1">{ACTION_META[pending].consequence}</p>
                        {ACTION_META[pending].needsReason ? (
                          <label className="mt-2 block">
                            <span className="text-[11px] font-semibold text-[#0B1324]">
                              Actor reason (required for audit)
                            </span>
                            <textarea
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              rows={2}
                              className="mt-1 w-full border border-[#E5E5E5] bg-white px-2 py-1.5 text-[12px] text-[#0B1324] outline-none focus:border-[#2E5BFF]"
                              placeholder="e.g. Fee within policy TOL-FEE-25bps · reviewed UTR against PAC"
                            />
                          </label>
                        ) : null}
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={confirmPending}
                            className="h-8 bg-[#0B1324] px-3 text-[12px] font-semibold text-white"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPending(null)
                              setReason('')
                            }}
                            className="h-8 border border-[#E5E5E5] bg-white px-3 text-[12px] font-semibold text-[#0B1324]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {(Object.keys(ACTION_META) as PrimaryAction[]).map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setPending(key)}
                          className={`h-8 px-2.5 text-[11px] font-semibold ${
                            key === 'approve_tolerance' || key === 'confirm_exact'
                              ? 'bg-[#0B1324] text-white'
                              : 'border border-[#E5E5E5] bg-white text-[#0B1324] hover:bg-[#F8FAFC]'
                          }`}
                        >
                          {ACTION_META[key].label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

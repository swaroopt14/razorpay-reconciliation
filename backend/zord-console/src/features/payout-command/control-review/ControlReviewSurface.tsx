'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  CONTROL_REVIEW_HEADER,
  DEMO_CONTROL_REVIEW_ITEMS,
  controlReviewQueueStats,
  formatReviewInr,
  type ReviewItem,
  type ReviewSeverity,
} from '@/services/payout-command/demo/controlReviewDemo'
import { useDemoBatchReady } from '@/services/payout-command/demo/demoBatchReadiness'
import { AwaitingUploadsEmptyState } from '../demo/AwaitingUploadsEmptyState'
import { PageExplainerBanner } from '../demo/PageExplainerBanner'
import { LifecycleSummaryStrip } from '../shared/LifecycleSummaryStrip'

type Notice = { tone: 'ok' | 'warn' | 'err'; text: string }
type DecisionAction = 'correction' | 'amendment' | 'exception' | 'reject'

function severityBadge(_severity: ReviewSeverity): string {
  return 'bg-[#0B1324] text-white ring-[#0B1324]/30'
}

function severityLabel(severity: ReviewSeverity): string {
  if (severity === 'blocked') return 'Blocked'
  if (severity === 'warned') return 'Warned'
  return 'Incomplete'
}

const ACTION_CONSEQUENCE: Record<DecisionAction, string> = {
  correction:
    'Sends a correction request to the source actor. Original obligation stays unchanged until a corrected instruction arrives.',
  amendment:
    'Creates a new draft instruction version and re-runs policy. Does not rewrite the prior authorised intent in place.',
  exception:
    'Records a role-bound override with reason and audit entry. Still cannot silently rewrite the original intent; a material change seals as a new contract version after fresh policy.',
  reject:
    'Rejects this instruction for dispatch. Obligation remains in journal as blocked/rejected - no money movement.',
}

/**
  * Spec 7.7 - Control Review Queue.
  * Queue left (sticky) · comparison main · decision actions under detail (scrolls with page).
  */
export function ControlReviewSurface() {
  const { ready, readiness, require } = useDemoBatchReady(undefined, { require: 'intent' })
  const [items, setItems] = useState<ReviewItem[]>(() =>
    DEMO_CONTROL_REVIEW_ITEMS.map((i) => ({ ...i })),
  )
  const [selectedId, setSelectedId] = useState(DEMO_CONTROL_REVIEW_ITEMS[0]?.id ?? '')
  const [filter, setFilter] = useState<'open' | 'all' | ReviewSeverity>('open')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [exceptionOpen, setExceptionOpen] = useState(false)
  const [exceptionReason, setExceptionReason] = useState('')
  const [aiOpen, setAiOpen] = useState(true)
  const [confirmAction, setConfirmAction] = useState<DecisionAction | null>(null)

  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null
  const stats = useMemo(() => controlReviewQueueStats(items), [items])

  const queue = useMemo(() => {
    return items.filter((i) => {
      if (filter === 'all') return true
      if (filter === 'open') return !i.resolved
      return !i.resolved && i.severity === filter
    })
  }, [items, filter])

  function selectItem(id: string) {
    setSelectedId(id)
    setConfirmAction(null)
    setExceptionOpen(false)
    setNotice(null)
  }

  function applyResolution(
    id: string,
    resolved: NonNullable<ReviewItem['resolved']>,
    message: string,
  ) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, resolved } : i)))
    setConfirmAction(null)
    setExceptionOpen(false)
    setExceptionReason('')
    setNotice({ tone: 'ok', text: message })
  }

  function runAction(action: DecisionAction) {
    if (!selected || selected.resolved) return
    if (action === 'exception') {
      setExceptionOpen(true)
      setConfirmAction(null)
      return
    }
    setConfirmAction(action)
  }

  function confirmPendingAction() {
    if (!selected || !confirmAction) return
    if (confirmAction === 'correction') {
      applyResolution(
        selected.id,
        'correction_requested',
        `Correction requested for ${selected.humanRef}. Original authorised intent was not rewritten.`,
      )
      return
    }
    if (confirmAction === 'amendment') {
      applyResolution(
        selected.id,
        'amendment_created',
        `Amendment draft created for ${selected.humanRef}. New version will require a fresh policy decision before seal.`,
      )
      return
    }
    if (confirmAction === 'reject') {
      applyResolution(
        selected.id,
        'rejected',
        `${selected.humanRef} rejected. Instruction cannot dispatch.`,
      )
    }
  }

  function submitException() {
    if (!selected) return
    const reason = exceptionReason.trim()
    if (reason.length < 8) {
      setNotice({
        tone: 'err',
        text: 'Exception requires a written reason (audit entry). AI cannot approve.',
      })
      return
    }
    applyResolution(
      selected.id,
      'exception_approved',
      `Exception recorded for ${selected.humanRef} by Reviewer · reason logged. Material fields still seal only as a new contract version after policy re-check - no silent rewrite.`,
    )
  }

  if (!ready) {
    return (
      <div className="bg-[#F8FAFC] px-5 py-5 sm:px-6">
        <PageExplainerBanner page="control-review" />
        <header className="mt-4 border-b border-[#E5E5E5] bg-white px-5 py-4">
          <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-[#0B1324]">
            {CONTROL_REVIEW_HEADER.title}
          </h1>
          <p className="mt-1 text-[13px] text-[#64748B]">{CONTROL_REVIEW_HEADER.subtitle}</p>
        </header>
        <div className="mt-5">
          <AwaitingUploadsEmptyState
            title="No control review queue yet"
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
        <PageExplainerBanner page="control-review" />
      </div>
      <header className="border-b border-[#E5E5E5] bg-white px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-[#0B1324]">
              {CONTROL_REVIEW_HEADER.title}
            </h1>
            <p className="mt-1 text-[13px] text-[#64748B]">{CONTROL_REVIEW_HEADER.subtitle}</p>
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
            <button
              type="button"
              className="ml-3 font-semibold underline"
              onClick={() => setNotice(null)}
            >
              Dismiss
            </button>
          </p>
        ) : null}
      </header>

      <div className="border-b border-[#E5E5E5] bg-[#F8FAFC] px-5 py-4 sm:px-6">
        <LifecycleSummaryStrip
          heroLabel="Pre-dispatch blocked value"
          heroValue={formatReviewInr(stats.blockedValue)}
          heroHint="Value held by policy before money moves · not confirmed fraud"
          cells={[
            {
              label: 'Open items',
              value: String(stats.openCount),
              hint: 'Queue items needing a decision',
            },
            {
              label: 'Blocked',
              value: String(stats.blockedCount),
              hint: 'Cannot proceed until resolved',
            },
            {
              label: 'Warned',
              value: String(stats.warnedCount),
              hint: 'Needs attention · may still proceed',
            },
            {
              label: 'Incomplete',
              value: String(stats.incompleteCount),
              hint: 'Missing approval, quote, or source',
            },
          ]}
        />
      </div>

      {/* Sticky queue sidebar + full-height scrolling detail (no fixed viewport trap). */}
      <div className="flex items-start border-t border-[#E5E5E5]">
        <aside className="sticky top-0 flex max-h-[calc(100dvh-3.5rem)] w-[280px] shrink-0 flex-col self-start overflow-hidden border-r border-[#E5E5E5] bg-white sm:w-[300px]">
          <div className="flex shrink-0 flex-wrap gap-1 border-b border-[#E5E5E5] p-3">
            {(
              [
                ['open', 'Open'],
                ['blocked', 'Blocked'],
                ['warned', 'Warned'],
                ['incomplete', 'Incomplete'],
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
              <li className="px-4 py-10 text-center text-[13px] text-[#94A3B8]">
                No items in this filter.
              </li>
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
                        <p className="font-mono text-[12px] font-semibold text-[#0B1324]">
                          {item.humanRef}
                        </p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${severityBadge(item.severity)}`}
                        >
                          {severityLabel(item.severity)}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] font-medium text-[#0B1324]">{item.typeLabel}</p>
                      <p className="mt-0.5 truncate text-[11px] text-[#64748B]">
                        {formatReviewInr(item.amountRupees)} · {item.payeeLabel}
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
            <p className="py-10 text-center text-[13px] text-[#94A3B8]">Select an issue from the queue.</p>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${severityBadge(selected.severity)}`}
                      >
                        {severityLabel(selected.severity)}
                      </span>
                      <span className="text-[12px] font-medium text-[#64748B]">
                        {selected.typeLabel}
                      </span>
                    </div>
                    <h2 className="mt-2 font-mono text-[1.2rem] font-semibold text-[#0B1324]">
                      {selected.humanRef}
                    </h2>
                    <p className="mt-1 text-[13px] text-[#64748B]">
                      {selected.instructionRef} · batch {selected.batchId}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-[1.25rem] font-semibold tabular-nums text-[#0B1324]">
                    {formatReviewInr(selected.amountRupees)}
                  </p>
                </div>

                <p className="max-w-3xl border-l-4 border-[#0B1324] bg-white px-4 py-3 text-[14px] leading-relaxed text-[#0B1324]">
                  {selected.plainLanguageReason}
                </p>

                <section className="border border-[#E5E5E5] bg-white" aria-label="Authorised vs current">
                  <div className="border-b border-[#E5E5E5] px-4 py-3">
                    <p className="text-[14px] font-semibold text-[#0B1324]">
                      Authorised source vs. current instruction
                    </p>
                    <p className="mt-0.5 text-[12px] text-[#64748B]">
                      Side-by-side field diff · material changes highlighted
                    </p>
                  </div>
                  <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-0 border-b border-[#E5E5E5] bg-[#F8FAFC] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                    <span>Field</span>
                    <span>Authorised source</span>
                    <span>Current instruction</span>
                  </div>
                  <ul className="divide-y divide-[#E5E5E5]">
                    {selected.fieldDiffs.map((diff) => (
                      <li
                        key={diff.field}
                        className={`grid grid-cols-[1.2fr_1fr_1fr] gap-0 px-4 py-3 text-[13px] ${
                          diff.material ? 'border-l-4 border-l-[#0B1324] bg-[#F1F5F9]' : ''
                        }`}
                      >
                        <span className="font-medium text-[#0B1324]">
                          {diff.label}
                          {diff.material ? (
                            <span className="ml-2 text-[10px] font-semibold uppercase text-[#0B1324]">
                              Material
                            </span>
                          ) : null}
                        </span>
                        <span className="font-mono text-[#334155]">{diff.authorised}</span>
                        <span
                          className={`font-mono ${diff.material ? 'font-semibold text-[#0B1324]' : 'text-[#334155]'}`}
                        >
                          {diff.current}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <ContextCard label="Policy version" value={selected.policyVersion} />
                  <ContextCard
                    label="Affected amount"
                    value={formatReviewInr(selected.amountRupees)}
                  />
                  <ContextCard label="Actor" value={selected.actor} />
                  <ContextCard label="Authority" value={selected.authority} />
                  <ContextCard
                    label="Policy rule"
                    value={selected.policyRuleName}
                    hint={selected.policyRuleId}
                  />
                  <ContextCard
                    label="Evidence available"
                    value={selected.evidenceAvailable.join(' · ')}
                  />
                </section>

                <section className="border border-[#E5E5E5] bg-white">
                  <div className="border-b border-[#E5E5E5] px-4 py-3">
                    <p className="text-[14px] font-semibold text-[#0B1324]">Amendment lineage</p>
                    <p className="mt-0.5 text-[12px] text-[#64748B]">
                      History is preserved - approval never silently rewrites the original intent
                    </p>
                  </div>
                  <ol className="divide-y divide-[#E5E5E5]">
                    {selected.amendmentLineage.map((entry) => (
                      <li key={`${entry.version}-${entry.at}`} className="px-4 py-3">
                        <p className="text-[13px] font-semibold text-[#0B1324]">{entry.version}</p>
                        <p className="mt-0.5 text-[12px] text-[#64748B]">
                          {entry.at} · {entry.actor}
                        </p>
                        <p className="mt-1 text-[13px] text-[#334155]">{entry.note}</p>
                      </li>
                    ))}
                  </ol>
                </section>

                <section className="border border-[#E9E5FF] bg-[#Faf8FF]">
                  <button
                    type="button"
                    onClick={() => setAiOpen((v) => !v)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="text-[13px] font-semibold text-[#6D4AFF]">
                      Ask Zord · Explain issue
                    </span>
                    <span className="text-[12px] text-[#6D4AFF]">{aiOpen ? 'Hide' : 'Show'}</span>
                  </button>
                  {aiOpen ? (
                    <div className="space-y-3 border-t border-[#E9E5FF] px-4 py-3 text-[13px] text-[#3B2E7A]">
                      <p>
                        <span className="font-semibold">Explain: </span>
                        {selected.aiHelp.explain}
                      </p>
                      <p>
                        <span className="font-semibold">Suggest investigation: </span>
                        {selected.aiHelp.investigate}
                      </p>
                      <p>
                        <span className="font-semibold">Draft correction request: </span>
                        {selected.aiHelp.draftCorrection}
                      </p>
                      <p className="text-[11px] text-[#6D4AFF]/80">
                        AI cannot approve, reject, amend, or dispatch. Deterministic policy and role
                        controls stay authoritative.
                      </p>
                    </div>
                  ) : null}
                </section>

              {/* Actions live under the detail so they never cover PAY-00xx content */}
              <section className="border border-[#E5E5E5] bg-white px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
                  Decision actions
                </p>
                {selected.resolved ? (
                  <p className="mt-2 text-[13px] font-medium text-[#0B1324]">
                    Resolved · {selected.resolved.replace(/_/g, ' ')}. Open the next queue item.
                  </p>
                ) : (
                  <>
                    {confirmAction ? (
                      <div className="mt-3 border border-[#E5E5E5] bg-[#F8FAFC] px-3 py-2.5 text-[12px] text-[#334155]">
                        <p className="font-semibold text-[#0B1324]">Confirm action consequence</p>
                        <p className="mt-1">{ACTION_CONSEQUENCE[confirmAction]}</p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={confirmPendingAction}
                            className="h-8 bg-[#0B1324] px-3 text-[12px] font-semibold text-white"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmAction(null)}
                            className="h-8 border border-[#E5E5E5] bg-white px-3 text-[12px] font-semibold text-[#0B1324]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {exceptionOpen ? (
                      <div className="mt-3 border border-[#0B1324]/20 bg-[#F1F5F9] px-3 py-2.5">
                        <p className="text-[12px] font-semibold text-[#0B1324]">
                          Approve exception · requires role, reason, and audit
                        </p>
                        <p className="mt-1 text-[11px] text-[#0B1324]">
                          Role: Reviewer (demo). AI cannot approve. Material changes still create a
                          new contract version + fresh policy decision - never a silent rewrite.
                        </p>
                        <textarea
                          value={exceptionReason}
                          onChange={(e) => setExceptionReason(e.target.value)}
                          rows={2}
                          placeholder="Reason for exception (required for audit)…"
                          className="mt-2 w-full border border-[#0B1324]/20 bg-white px-2.5 py-2 text-[13px] text-[#0B1324] outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={submitException}
                            className="h-8 bg-[#0B1324] px-3 text-[12px] font-semibold text-white"
                          >
                            Record exception
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setExceptionOpen(false)
                              setExceptionReason('')
                            }}
                            className="h-8 border border-[#E5E5E5] bg-white px-3 text-[12px] font-semibold text-[#0B1324]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => runAction('correction')}
                        className="h-9 border border-[#E5E5E5] bg-white px-3 text-[13px] font-semibold text-[#0B1324] hover:bg-[#F8FAFC]"
                      >
                        Request correction
                      </button>
                      <button
                        type="button"
                        onClick={() => runAction('amendment')}
                        className="h-9 border border-[#E5E5E5] bg-white px-3 text-[13px] font-semibold text-[#0B1324] hover:bg-[#F8FAFC]"
                      >
                        Create amendment
                      </button>
                      <button
                        type="button"
                        onClick={() => runAction('exception')}
                        className="h-9 border border-[#0B1324]/25 bg-[#F1F5F9] px-3 text-[13px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]"
                      >
                        Approve exception
                      </button>
                      <button
                        type="button"
                        onClick={() => runAction('reject')}
                        className="h-9 border border-[#0B1324]/20 bg-[#F1F5F9] px-3 text-[13px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]"
                      >
                        Reject
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 border-t border-[#E5E5E5] pt-3 text-[13px]">
                      <Link
                        href={selected.sourceArtifactHref}
                        className="font-semibold text-[#2563EB] hover:underline"
                      >
                        Open source artifact
                      </Link>
                      <Link
                        href={selected.policyRuleHref}
                        className="font-semibold text-[#2563EB] hover:underline"
                      >
                        Open policy rule
                      </Link>
                      <Link
                        href="/contracts/PAC-0001?demo=sandbox"
                        className="font-semibold text-[#2563EB] hover:underline"
                      >
                        Open Action Contract
                      </Link>
                    </div>
                    <p className="mt-2 text-[11px] text-[#94A3B8]">
                      No policy bypass from this UI · AI cannot approve or dispatch
                    </p>
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

function ContextCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="border border-[#E5E5E5] bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">{label}</p>
      <p className="mt-1 text-[13px] font-medium leading-snug text-[#0B1324]">{value}</p>
      {hint ? <p className="mt-0.5 font-mono text-[11px] text-[#94A3B8]">{hint}</p> : null}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  DEMO_SETTLEMENT_ROWS,
  buildSettlementBatches,
  formatSettlementInr,
  rowsForBatch,
  settlementSummary,
  type SettlementBatch,
  type SettlementOutcome,
  type SettlementRow,
} from '@/services/payout-command/demo/settlementJournalDemo'
import { useDemoBatchReady } from '@/services/payout-command/demo/demoBatchReadiness'
import { AwaitingUploadsEmptyState } from '../demo/AwaitingUploadsEmptyState'
import { PageExplainerBanner } from '../demo/PageExplainerBanner'
import { LifecycleSummaryStrip } from '../shared/LifecycleSummaryStrip'

const STATUS_BLACK = { bg: '#0B1324', color: '#FFFFFF', border: '#0B1324' }

const OUTCOME_STYLE: Record<SettlementOutcome, { bg: string; color: string; border: string }> = {
  Exact: STATUS_BLACK,
  Short: STATUS_BLACK,
  Over: STATUS_BLACK,
  Returned: STATUS_BLACK,
  Reversal: STATUS_BLACK,
  Waiting: STATUS_BLACK,
  'Missing reference': STATUS_BLACK,
  Mixed: STATUS_BLACK,
}

function confidenceStyle(raw: string): { bg: string; color: string; label: string } {
  return { bg: '#0B1324', color: '#FFFFFF', label: raw || 'Pending' }
}

function OutcomeBadge({ outcome }: { outcome: SettlementOutcome }) {
  const s = OUTCOME_STYLE[outcome]
  return (
    <span
      className="inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {outcome}
    </span>
  )
}

function SummaryCards({ rows }: { rows: SettlementRow[] }) {
  const s = settlementSummary(rows)
  const cards = [
    { label: 'Settlement value observed', value: formatSettlementInr(s.observedValue) },
    { label: 'Waiting for settlement', value: formatSettlementInr(s.waitingValue) },
    { label: 'Returned value', value: formatSettlementInr(s.returnedValue) },
    { label: 'Reversal exposure', value: formatSettlementInr(s.reversalExposure) },
    { label: 'Missing references', value: String(s.missingReferences) },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl px-4 py-3"
          style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}
        >
          <p className="text-[11px] font-medium" style={{ color: '#64748B' }}>
            {c.label}
          </p>
          <p className="mt-1 text-[18px] font-semibold tracking-tight" style={{ color: '#0F172A' }}>
            {c.value}
          </p>
        </div>
      ))}
    </div>
  )
}

function SettlementRowsTable({ rows }: { rows: SettlementRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
      <table className="w-full min-w-[1100px] border-collapse text-left text-[13px]">
        <thead>
          <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            {[
              'Payment',
              'Contract',
              'Expected',
              'Observed',
              'Currency',
              'Provider ref',
              'Value date',
              'Outcome',
              'Source',
              'Confidence',
              '',
            ].map((h) => (
              <th
                key={h || 'act'}
                className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: '#64748B' }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const conf = confidenceStyle(r.matchConfidence)
            return (
              <tr key={r.id} className="border-b last:border-0" style={{ borderColor: '#F1F5F9' }}>
                <td className="px-3 py-3">
                  <p className="font-semibold tabular-nums" style={{ color: '#0F172A' }}>
                    {r.paymentRef}
                  </p>
                  <p className="text-[11px]" style={{ color: '#64748B' }}>
                    {r.payeeLabel}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <Link
                    href={r.contractHref}
                    className="font-medium tabular-nums hover:underline"
                    style={{ color: '#2E5BFF' }}
                  >
                    {r.contractId}
                  </Link>
                </td>
                <td className="px-3 py-3 font-medium tabular-nums" style={{ color: '#0F172A' }}>
                  {r.expectedLabel}
                </td>
                <td className="px-3 py-3 font-medium tabular-nums" style={{ color: '#0F172A' }}>
                  {r.observedLabel}
                </td>
                <td className="px-3 py-3" style={{ color: '#475569' }}>
                  {r.currency}
                </td>
                <td className="px-3 py-3 font-mono text-[11px]" style={{ color: '#475569' }}>
                  {r.providerRef ?? '-'}
                </td>
                <td className="px-3 py-3 tabular-nums" style={{ color: '#475569' }}>
                  {r.valueDate ?? '-'}
                </td>
                <td className="px-3 py-3">
                  <OutcomeBadge outcome={r.outcome} />
                  {r.missingAction ? (
                    <p className="mt-1 text-[10px] font-medium" style={{ color: '#0B1324' }}>
                      {r.missingAction}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-[12px]" style={{ color: '#475569' }}>
                  {r.signalSource}
                </td>
                <td className="px-3 py-3">
                  <span
                    className="inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: conf.bg, color: conf.color }}
                  >
                    {conf.label}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                    <Link
                      href="/settlement/review?demo=sandbox"
                      className="inline-flex h-7 items-center border px-2.5 text-[11px] font-semibold transition hover:opacity-90"
                      style={{ borderColor: '#2E5BFF', background: '#2E5BFF', color: '#FFFFFF' }}
                    >
                      Review
                    </Link>
                    <Link
                      href={r.traceHref}
                      className="inline-flex h-7 items-center border px-2.5 text-[11px] font-semibold transition hover:bg-[#F1F5F9]"
                      style={{ borderColor: '#CBD5E1', background: '#FFFFFF', color: '#0B1324' }}
                    >
                      Trace
                    </Link>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function BatchSelectionList({
  batches,
  onOpen,
}: {
  batches: SettlementBatch[]
  onOpen: (batchId: string) => void
}) {
  return (
    <div className="overflow-x-auto rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
      <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
        <thead>
          <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            {['Batch', 'Batch ref', 'Payouts', 'Expected value', 'Observed value', 'Waiting', 'Exceptions', ''].map((h) => (
              <th
                key={h || 'act'}
                className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: '#64748B' }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.batchId} className="border-b last:border-0" style={{ borderColor: '#F1F5F9' }}>
              <td className="px-3 py-3 font-semibold" style={{ color: '#0F172A' }}>
                {b.label}
              </td>
              <td className="px-3 py-3 font-mono text-[11px]" style={{ color: '#475569' }}>
                {b.batchId}
              </td>
              <td className="px-3 py-3 tabular-nums" style={{ color: '#0F172A' }}>
                {b.rowCount}
              </td>
              <td className="px-3 py-3 font-medium tabular-nums" style={{ color: '#0F172A' }}>
                {formatSettlementInr(b.expectedValue)}
              </td>
              <td className="px-3 py-3 font-medium tabular-nums" style={{ color: '#0F172A' }}>
                {formatSettlementInr(b.observedValue)}
              </td>
              <td className="px-3 py-3 tabular-nums" style={{ color: '#475569' }}>
                {b.waitingCount}
              </td>
              <td className="px-3 py-3 tabular-nums" style={{ color: '#475569' }}>
                {b.exceptionCount}
              </td>
              <td className="px-3 py-3">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onOpen(b.batchId)}
                    className="inline-flex h-7 items-center border px-2.5 text-[11px] font-semibold transition hover:opacity-90"
                    style={{ borderColor: '#0B1324', background: '#0B1324', color: '#FFFFFF' }}
                  >
                    Open batch
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
  * Spec 7.11 - Settlement Journal. Lands on the batch-selection list;
  * a batch's expected-vs-observed detail opens only after an explicit selection.
  */
export function SettlementJournalSurface() {
  const { ready, readiness } = useDemoBatchReady()

  const batches = useMemo(() => buildSettlementBatches(DEMO_SETTLEMENT_ROWS), [DEMO_SETTLEMENT_ROWS])
  const [openBatchId, setOpenBatchId] = useState<string | null>(null)
  const activeBatch = openBatchId
    ? (batches.find((b) => b.batchId === openBatchId) ?? null)
    : null
  const batchRows = useMemo(
    () => (activeBatch ? rowsForBatch(DEMO_SETTLEMENT_ROWS, activeBatch.batchId) : []),
    [activeBatch, DEMO_SETTLEMENT_ROWS],
  )

  if (!ready) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" style={{ background: '#F8FAFC' }}>
        <div className="mx-auto w-full max-w-[1600px] flex-1 space-y-4 px-5 py-5 sm:px-6 lg:px-8">
          <PageExplainerBanner page="settlement" />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: '#64748B' }}>
              Settlement
            </p>
            <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight" style={{ color: '#0F172A' }}>
              Settlement Journal
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed" style={{ color: '#64748B' }}>
              Expected vs observed settlement signals - bank file, PSP webhook, or statement collect.
            </p>
          </div>
          <AwaitingUploadsEmptyState title="No settlement journal yet" readiness={readiness} />
        </div>
      </div>
    )
  }

  if (!activeBatch) {
    const overview = settlementSummary(DEMO_SETTLEMENT_ROWS)
    return (
      <div className="flex min-h-0 flex-1 flex-col" style={{ background: '#F8FAFC' }}>
        <div className="mx-auto w-full max-w-[1600px] flex-1 space-y-5 px-5 py-5 sm:px-6 lg:px-8">
          <PageExplainerBanner page="settlement" />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: '#64748B' }}>
              Settlement
            </p>
            <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight" style={{ color: '#0F172A' }}>
              Settlement Journal
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed" style={{ color: '#64748B' }}>
              Select a batch to compare sealed expected amounts with observed settlement signals.
            </p>
          </div>
          <LifecycleSummaryStrip
            heroLabel="Settlement value observed"
            heroValue={formatSettlementInr(overview.observedValue)}
            heroHint={`from ${overview.rowCount.toLocaleString('en-IN')} payouts · ${batches.length} batch${batches.length === 1 ? '' : 'es'} · open a batch for expected vs observed`}
            cells={[
              {
                label: 'Waiting for settlement',
                value: formatSettlementInr(overview.waitingValue),
                hint: 'Ack received · final settlement not yet observed',
              },
              {
                label: 'Returned value',
                value: formatSettlementInr(overview.returnedValue),
                hint: 'Provider return / reject after dispatch',
              },
              {
                label: 'Reversal exposure',
                value: formatSettlementInr(overview.reversalExposure),
                hint: 'Reversal signals against sealed contracts',
              },
              {
                label: 'Missing references',
                value: String(overview.missingReferences),
                hint: 'Rows missing provider / bank reference',
              },
            ]}
          />
          <BatchSelectionList batches={batches} onOpen={setOpenBatchId} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ background: '#F8FAFC' }}>
      <div className="mx-auto w-full max-w-[1600px] flex-1 px-5 py-5 sm:px-6 lg:px-8">
        <PageExplainerBanner page="settlement" />
        <button
          type="button"
          onClick={() => setOpenBatchId(null)}
          className="mb-2 inline-flex items-center gap-1 text-[12px] font-semibold hover:underline"
          style={{ color: '#2E5BFF' }}
        >
          ← All batches
        </button>
        <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: '#64748B' }}>
              Settlement · {activeBatch.label}
            </p>
            <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight" style={{ color: '#0F172A' }}>
              {activeBatch.label}
            </h1>
            <p className="mt-1 font-mono text-[12px]" style={{ color: '#94A3B8' }}>
              {activeBatch.batchId}
            </p>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed" style={{ color: '#64748B' }}>
              Expected vs observed for this batch. Open Outcome Review when settlement does not match the
              contract.
            </p>
          </div>
          <Link
            href="/settlement/review?demo=sandbox"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition hover:opacity-90"
            style={{ background: '#0B1324', color: '#FFFFFF' }}
          >
            Open Outcome Review
          </Link>
        </div>

        <div className="mt-4 space-y-4">
          <SummaryCards rows={batchRows} />
          <SettlementRowsTable rows={batchRows} />
        </div>
      </div>
    </div>
  )
}

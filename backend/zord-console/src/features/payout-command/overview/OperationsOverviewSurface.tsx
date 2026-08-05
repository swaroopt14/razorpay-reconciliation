'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  OVERVIEW_CTAS,
  OVERVIEW_DEMO,
  OVERVIEW_HEADER,
  overviewAttentionQueue,
  overviewLifecycleRibbon,
  overviewSummaryCards,
} from '@/services/payout-command/demo/operationsOverviewDemo'
import { useDemoBatchReady } from '@/services/payout-command/demo/demoBatchReadiness'
import { AwaitingUploadsEmptyState } from '../demo/AwaitingUploadsEmptyState'
import { PageExplainerBanner } from '../demo/PageExplainerBanner'
import { useRegisterPayoutPageActions } from '../layout/PayoutPageActionsContext'
import { Glyph } from '../shared'
import { LifecycleGuideWidget } from './LifecycleGuideWidget'

function formatInr(rupees: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(rupees)
}

function exportPaymentHealthSummary() {
  const blob = new Blob(
    [
      [
        'Zord payment health summary',
        `Batch: ${OVERVIEW_DEMO.batchId}`,
        `Intended payment value: ${formatInr(OVERVIEW_DEMO.intendedValueRupees)}`,
        `Settlement value observed: ${formatInr(OVERVIEW_DEMO.settlementObservedRupees)}`,
        `Value requiring review: ${formatInr(OVERVIEW_DEMO.reviewValueRupees)}`,
        `Proof-ready payouts: ${OVERVIEW_DEMO.proofReadyCount}`,
      ].join('\n'),
    ],
    { type: 'text/plain' },
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `zord-payment-health-${OVERVIEW_DEMO.batchId}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

/**
  * Spec 7.2 - Operations Overview (`/overview`).
  * Metrics stay empty until both obligation + settlement files are uploaded.
  */
export function OperationsOverviewSurface() {
  const router = useRouter()
  const { ready, readiness } = useDemoBatchReady()
  const stages = overviewLifecycleRibbon()
  const cards = overviewSummaryCards()
  const attention = overviewAttentionQueue()

  useRegisterPayoutPageActions({
    exportShare: ready ? exportPaymentHealthSummary : undefined,
  })

  return (
    <div className="mx-auto max-w-[1120px] space-y-4 bg-[#F8FAFC]">
      <PageExplainerBanner page="overview" />
      <header className="flex flex-wrap items-end justify-between gap-3 border border-[#E2E8F0] bg-white px-5 py-4">
        <div>
          <h1 className="text-[1.25rem] font-semibold tracking-[-0.02em] text-[#0B1324]">
            {OVERVIEW_HEADER.title}
          </h1>
          <p className="mt-0.5 text-[13px] text-[#64748B]">{OVERVIEW_HEADER.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={OVERVIEW_CTAS.createObligation.href}
            className="inline-flex h-9 items-center bg-[#0B1324] px-4 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
          >
            Create payout
          </Link>
          {ready ? (
            <Link
              href={OVERVIEW_CTAS.followLifecycle.href}
              className="inline-flex h-9 items-center border border-[#CBD5E1] bg-white px-4 text-[13px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]"
            >
              Open batch
            </Link>
          ) : null}
        </div>
      </header>

      <LifecycleGuideWidget />

      {!ready ? (
        <AwaitingUploadsEmptyState
          title="Workspace is ready - waiting for batch files"
          readiness={readiness}
        />
      ) : (
        <>
          <section aria-label="Lifecycle" className="border border-[#E2E8F0] bg-white">
            <div className="grid grid-cols-2 divide-x divide-y divide-[#E2E8F0] sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
              {stages.map((stage) => (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => router.push(stage.href)}
                  className="bg-white px-3 py-4 text-left transition hover:bg-[#F8FAFC]"
                >
                  <p className="text-[12px] font-semibold text-[#64748B]">{stage.label}</p>
                  <p className="mt-1.5 text-[20px] font-semibold tabular-nums tracking-tight text-[#0B1324]">
                    {stage.count}
                  </p>
                  <p className="mt-0.5 text-[12px] tabular-nums text-[#94A3B8]">
                    {formatInr(stage.valueRupees)}
                  </p>
                </button>
              ))}
            </div>
          </section>

          <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <Link
                key={card.id}
                href={card.href}
                className="border border-[#E2E8F0] bg-white px-4 py-4 transition hover:border-[#0B1324]/30"
              >
                <p className="text-[12px] font-medium text-[#64748B]">{card.label}</p>
                <p className="mt-2 text-[1.35rem] font-semibold tabular-nums tracking-tight text-[#0B1324]">
                  {card.valueLabel}
                </p>
              </Link>
            ))}
          </section>

          <section id="attention-now" aria-label="Attention now" className="border border-[#E2E8F0] bg-white">
            <div className="border-b border-[#E2E8F0] px-4 py-3">
              <p className="text-[14px] font-semibold text-[#0B1324]">Needs attention</p>
            </div>
            <ul className="divide-y divide-[#E2E8F0]">
              {attention.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 px-4 py-3 transition hover:bg-[#F8FAFC]"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 ${
                        item.severity === 'high' ? 'bg-[#DC2626]' : 'bg-[#D97706]'
                      }`}
                      aria-hidden
                    />
                    <p className="min-w-0 flex-1 text-[13px] font-semibold text-[#0B1324]">{item.label}</p>
                    <p className="shrink-0 text-[12px] font-semibold tabular-nums text-[#64748B]">
                      {item.count} · {formatInr(item.valueRupees)}
                    </p>
                    <Glyph name="arrow-up-right" className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}

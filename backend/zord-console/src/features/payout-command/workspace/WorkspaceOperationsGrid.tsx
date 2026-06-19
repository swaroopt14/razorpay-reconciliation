'use client'

import { PAYMENT_OPERATIONS } from './paymentOperationsCopy'
import type { PaymentOperationsViewModel } from './paymentOperationsTypes'
import {
  WORKSPACE_CARD,
  WORKSPACE_HERO_BG,
  WORKSPACE_HERO_BORDER,
  WORKSPACE_HERO_CARD,
  WORKSPACE_TEXT_LABEL,
  WORKSPACE_TEXT_MUTED,
  WORKSPACE_TEXT_PRIMARY,
} from './workspaceTokens'

function MetricBar({ pct }: { pct: number }) {
  const width = Math.min(100, Math.max(0, pct))
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/6">
      <div className="h-full rounded-full bg-[#355695]" style={{ width: `${width}%` }} />
    </div>
  )
}

export function WorkspaceOperationsGrid({
  viewModel,
  loading,
}: {
  viewModel: PaymentOperationsViewModel
  loading?: boolean
}) {
  const { hero, sourceRows, clarityRows, clarityHero, clarityState, healthBrief, operationalQueues, reviewBreakdown } =
    viewModel

  return (
    <div className="grid gap-4 xl:grid-cols-[0.98fr_0.84fr]" data-testid="workspace-operations-grid">
      <article className={WORKSPACE_HERO_CARD}>
        <div>
          <div className="max-w-[14rem] text-[11px] font-medium uppercase leading-5 tracking-[0.1em] text-[#5c7194]">
            {hero.label}
          </div>
          <div className={`mt-6 text-[4rem] font-light tracking-[-0.06em] ${WORKSPACE_TEXT_PRIMARY}`}>
            {loading ? '…' : hero.value}
          </div>
          <p className={`mt-3 max-w-md text-[13px] leading-6 ${WORKSPACE_TEXT_MUTED}`}>{hero.subtitle}</p>
          {hero.showIntentMissing ? (
            <p className="mt-2 text-[12px] font-medium text-amber-800">{PAYMENT_OPERATIONS.intentMissingHint}</p>
          ) : null}
        </div>
      </article>

      <div className="flex flex-col gap-4">
        <article className={WORKSPACE_CARD} data-testid="connected-sources-card">
          <div className={`text-[11px] font-medium uppercase tracking-[0.1em] ${WORKSPACE_TEXT_LABEL}`}>
            {PAYMENT_OPERATIONS.sourcesTitle}
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[280px] text-left text-[13px]">
              <thead>
                <tr className={`border-b border-black/8 ${WORKSPACE_TEXT_MUTED}`}>
                  <th className="pb-2 pr-3 font-medium">Source</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 pr-3 font-medium">Last received</th>
                  <th className="pb-2 font-medium">Issue</th>
                </tr>
              </thead>
              <tbody>
                {sourceRows.map((row) => (
                  <tr key={row.source} className="border-b border-black/5 last:border-0">
                    <td className={`py-2.5 pr-3 ${WORKSPACE_TEXT_PRIMARY}`}>{row.source}</td>
                    <td className="py-2.5 pr-3">{row.status}</td>
                    <td className="py-2.5 pr-3">{row.lastReceived}</td>
                    <td className="py-2.5">{row.issue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={`mt-4 text-[12px] leading-relaxed ${WORKSPACE_TEXT_MUTED}`}>
            {PAYMENT_OPERATIONS.sourcesFooter}
          </p>
        </article>

        <article className={WORKSPACE_CARD} data-testid="payment-clarity-card">
          <div className={`text-[11px] font-medium uppercase tracking-[0.1em] ${WORKSPACE_TEXT_LABEL}`}>
            {PAYMENT_OPERATIONS.clarityTitle}
          </div>
          {clarityState === 'incomplete' && !loading ? (
            <p className="mt-4 text-[14px] font-medium text-amber-900">{PAYMENT_OPERATIONS.clarityIncomplete}</p>
          ) : null}
          {clarityState === 'intent_missing' && !loading ? (
            <>
              <p className="mt-4 text-[14px] font-semibold text-amber-900">{PAYMENT_OPERATIONS.intentMissingTitle}</p>
              <p className={`mt-2 text-[13px] ${WORKSPACE_TEXT_MUTED}`}>{PAYMENT_OPERATIONS.intentMissingHint}</p>
            </>
          ) : null}
          <div className={`mt-4 text-[2.5rem] font-light tracking-[-0.05em] ${WORKSPACE_TEXT_PRIMARY}`}>
            {loading ? '…' : clarityHero}
          </div>
          <p className={`mt-1 text-[12px] ${WORKSPACE_TEXT_MUTED}`}>Unmatched intent value</p>
          {clarityRows.length > 0 ? (
            <div className="mt-4 space-y-2">
              {clarityRows.map((row) => (
                <div key={row.label} className="flex justify-between gap-3 text-[13px]">
                  <span className={WORKSPACE_TEXT_MUTED}>{row.label}</span>
                  <span className={`font-medium ${WORKSPACE_TEXT_PRIMARY}`}>{row.value}</span>
                </div>
              ))}
            </div>
          ) : null}
          {clarityState === 'incomplete' && !loading ? (
            <p className={`mt-3 text-[12px] ${WORKSPACE_TEXT_MUTED}`}>{PAYMENT_OPERATIONS.clarityIncompleteHint}</p>
          ) : null}
        </article>
      </div>

      <article className={`${WORKSPACE_CARD} xl:col-span-2`}>
        <div className={`text-[11px] font-medium uppercase tracking-[0.1em] ${WORKSPACE_TEXT_LABEL}`}>
          {PAYMENT_OPERATIONS.healthBriefTitle}
        </div>
        <p className={`mt-3 max-w-3xl text-[13px] leading-relaxed ${WORKSPACE_TEXT_MUTED}`}>
          {PAYMENT_OPERATIONS.healthBriefBody}
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className={`rounded-xl border border-black/8 ${WORKSPACE_HERO_BG} px-4 py-3`}>
            <p className={`text-[12px] ${WORKSPACE_TEXT_MUTED}`}>Clean payments</p>
            <p className={`mt-1 text-[22px] font-light ${WORKSPACE_TEXT_PRIMARY}`}>
              {loading ? '…' : healthBrief.cleanCount}
            </p>
          </div>
          <div className="rounded-xl border border-black/8 bg-white px-4 py-3">
            <p className={`text-[12px] ${WORKSPACE_TEXT_MUTED}`}>Needs review</p>
            <p className={`mt-1 text-[22px] font-light ${WORKSPACE_TEXT_PRIMARY}`}>
              {loading ? '…' : healthBrief.needsReview}
            </p>
          </div>
          <div className="rounded-xl border border-black/8 bg-white px-4 py-3">
            <p className={`text-[12px] ${WORKSPACE_TEXT_MUTED}`}>Proof-ready</p>
            <p className={`mt-1 text-[22px] font-light ${WORKSPACE_TEXT_PRIMARY}`}>
              {loading ? '…' : healthBrief.proofReady}
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {healthBrief.metrics.map((m) => (
            <div key={m.label}>
              <div className="flex justify-between text-[13px]">
                <span className={WORKSPACE_TEXT_MUTED}>{m.label}</span>
                <span className={`font-medium ${WORKSPACE_TEXT_PRIMARY}`}>{loading ? '…' : m.value}</span>
              </div>
              <MetricBar pct={m.pct} />
            </div>
          ))}
        </div>
      </article>

      <article className={WORKSPACE_CARD}>
        <div className={`text-[11px] font-medium uppercase tracking-[0.1em] ${WORKSPACE_TEXT_LABEL}`}>
          {PAYMENT_OPERATIONS.itemsNeedingReviewTitle}
        </div>
        <ul className="mt-4 space-y-3">
          {operationalQueues.map((row) => (
            <li key={row.label} className="flex justify-between gap-3 text-[13px]">
              <span className={WORKSPACE_TEXT_MUTED}>{row.label}</span>
              <span className={`font-medium tabular-nums ${WORKSPACE_TEXT_PRIMARY}`}>
                {loading ? '…' : row.value}
              </span>
            </li>
          ))}
        </ul>
        <p className={`mt-4 text-[13px] leading-relaxed ${WORKSPACE_TEXT_MUTED}`}>
          {PAYMENT_OPERATIONS.itemsNeedingReviewMeta}
        </p>
        {reviewBreakdown.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {reviewBreakdown.map((row) => (
              <li key={row.label} className="flex justify-between text-[13px]">
                <span className={WORKSPACE_TEXT_MUTED}>{row.label}</span>
                <span className={WORKSPACE_TEXT_PRIMARY}>{row.value}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </article>

      {viewModel.showRoutingNotice ? (
        <div
          className={`rounded-[1.2rem] border border-[#cfdaea] ${WORKSPACE_HERO_BG} px-4 py-3 xl:col-span-2`}
          data-testid="routing-notice"
        >
          <p className={`text-[13px] font-semibold ${WORKSPACE_TEXT_PRIMARY}`}>
            {PAYMENT_OPERATIONS.routingNoticeTitle}
          </p>
          <p className={`mt-1 text-[12px] leading-relaxed ${WORKSPACE_TEXT_MUTED}`}>
            {PAYMENT_OPERATIONS.routingNoticeBody}
          </p>
        </div>
      ) : null}
    </div>
  )
}


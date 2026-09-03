'use client'

import Link from 'next/link'
import { HeroMetricWithSuperPercent } from '../homeDashboardTypography'
import {
  COMMAND_CENTER_KPI_CARD,
  HOME_BODY_IMPERIAL_SM,
  HOME_INSIGHT_PROSE,
  HOME_TITLE_BLACK,
} from './homeCommandCenterTokens'

export function CommandCenterCardGlow() {
  return (
    <div
      className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full blur-3xl"
      style={{ background: 'radial-gradient(circle, rgba(0,0,0,0.08) 0%, transparent 72%)' }}
      aria-hidden
    />
  )
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-100/80 py-2 last:border-0">
      <span className={`text-[13px] ${HOME_BODY_IMPERIAL_SM}`}>{label}</span>
      <span className={`text-[14px] font-semibold tabular-nums ${HOME_TITLE_BLACK}`}>{value}</span>
    </div>
  )
}

export type PaymentHealthCardsProps = {
  fullyMatchedValue: string
  fullyMatchedSub: string
  fullyMatchedFooter?: string
  awaitingConfirmation?: boolean

  reviewValue: string
  reviewSub: string
  reviewFooter?: string
  shortSettledDisplay: string
  overSettledDisplay: string
  unlinkedDisplay: string
  reversalDisplay: string
  reviewHref: string

  matchConfidencePct: string
  matchConfidenceSub: string
  matchConfidenceFooter?: string
  paymentsNeedingReview: string
  missingRefRate: string
  refCompleteness: string
  multiMatchRate: string

  proofCoverageDisplay: string
  proofSub: string
  proofFooter?: string
  proofReadyRow: string
  incompleteProofRow: string
  proofHref: string
}

export function PaymentHealthCards({
  fullyMatchedValue,
  fullyMatchedSub,
  fullyMatchedFooter,
  awaitingConfirmation = false,
  reviewValue,
  reviewSub,
  reviewFooter,
  shortSettledDisplay,
  overSettledDisplay,
  unlinkedDisplay,
  reversalDisplay,
  reviewHref,
  matchConfidencePct,
  matchConfidenceSub,
  matchConfidenceFooter,
  paymentsNeedingReview,
  missingRefRate,
  refCompleteness,
  multiMatchRate,
  proofCoverageDisplay,
  proofSub,
  proofFooter,
  proofReadyRow,
  incompleteProofRow,
  proofHref,
}: PaymentHealthCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <article className={COMMAND_CENTER_KPI_CARD + ' min-h-[280px]'}>
        <CommandCenterCardGlow />
        <div className="relative z-[1]">
          <h3 className="text-[14px] font-medium text-[#000000]">Settlement Value Observed</h3>
          {awaitingConfirmation ? (
            <>
              <p className={`mt-4 text-[18px] font-semibold ${HOME_TITLE_BLACK}`}>Awaiting confirmation data</p>
              <p className={`mt-2 ${HOME_BODY_IMPERIAL_SM}`}>
                Upload bank/settlement records to calculate settlement value observed.
              </p>
            </>
          ) : (
            <>
              <p className="mt-4 text-center text-[36px] leading-none">
                <HeroMetricWithSuperPercent text={fullyMatchedValue} />
              </p>
              <p className={`mt-2 text-center text-[14px] font-medium ${HOME_BODY_IMPERIAL_SM}`}>{fullyMatchedSub}</p>
            </>
          )}
        </div>
        {fullyMatchedFooter?.trim() ? (
          <p className={`relative z-[1] mt-auto pt-4 ${HOME_INSIGHT_PROSE}`}>{fullyMatchedFooter}</p>
        ) : null}
      </article>

      <Link
        href={reviewHref}
        className={`${COMMAND_CENTER_KPI_CARD} min-h-[280px] transition hover:border-slate-300 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400`}
      >
        <CommandCenterCardGlow />
        <div className="relative z-[1]">
          <h3 className="text-[14px] font-medium text-[#000000]">Unmatched Intent Value</h3>
          <p className="mt-4 text-center text-[36px] leading-none">
            <HeroMetricWithSuperPercent text={reviewValue} />
          </p>
          <p className={`mt-2 text-center text-[14px] font-medium ${HOME_BODY_IMPERIAL_SM}`}>{reviewSub}</p>
          <div className="mt-4">
            <BreakdownRow label="Short-settled value" value={shortSettledDisplay} />
            <BreakdownRow label="Over-settled value" value={overSettledDisplay} />
            <BreakdownRow label="Unlinked settlement" value={unlinkedDisplay} />
            <BreakdownRow label="Reversal exposure" value={reversalDisplay} />
          </div>
        </div>
        {reviewFooter?.trim() ? (
          <p className={`relative z-[1] mt-auto pt-4 ${HOME_INSIGHT_PROSE}`}>{reviewFooter}</p>
        ) : null}
      </Link>

      <article className={COMMAND_CENTER_KPI_CARD + ' min-h-[280px]'}>
        <CommandCenterCardGlow />
        <div className="relative z-[1]">
          <h3 className="text-[14px] font-medium text-[#000000]">Match Confidence</h3>
          <p className="mt-4 text-center text-[36px] leading-none">
            <HeroMetricWithSuperPercent text={matchConfidencePct} />
          </p>
          <p className={`mt-2 text-center text-[14px] font-medium ${HOME_BODY_IMPERIAL_SM}`}>{matchConfidenceSub}</p>
          <div className="mt-4">
            <BreakdownRow label="Payments needing review" value={paymentsNeedingReview} />
            <BreakdownRow label="Missing reference rate" value={missingRefRate} />
            <BreakdownRow label="Reference completeness" value={refCompleteness} />
            <BreakdownRow label="Multiple match possibility" value={multiMatchRate} />
          </div>
        </div>
        {matchConfidenceFooter?.trim() ? (
          <p className={`relative z-[1] mt-auto pt-4 ${HOME_INSIGHT_PROSE}`}>{matchConfidenceFooter}</p>
        ) : null}
      </article>

      <Link
        href={proofHref}
        className={`${COMMAND_CENTER_KPI_CARD} min-h-[280px] transition hover:border-slate-300 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400`}
      >
        <CommandCenterCardGlow />
        <div className="relative z-[1]">
          <h3 className="text-[14px] font-medium text-[#000000]">Proof Readiness</h3>
          <p className="mt-4 text-center text-[36px] leading-none">
            <HeroMetricWithSuperPercent text={proofCoverageDisplay} />
          </p>
          <p className={`mt-2 text-center text-[14px] font-medium ${HOME_BODY_IMPERIAL_SM}`}>{proofSub}</p>
          <div className="mt-4">
            <BreakdownRow label="Proof-ready payments" value={proofReadyRow} />
            <BreakdownRow label="Incomplete proof" value={incompleteProofRow} />
          </div>
        </div>
        {proofFooter?.trim() ? (
          <p className={`relative z-[1] mt-auto pt-4 ${HOME_INSIGHT_PROSE}`}>{proofFooter}</p>
        ) : null}
      </Link>
    </div>
  )
}

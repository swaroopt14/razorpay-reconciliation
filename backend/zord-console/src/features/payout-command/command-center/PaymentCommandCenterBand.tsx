'use client'

import type { ReactNode } from 'react'
import type { PaymentHealthCardsProps } from './PaymentHealthCards'
import { PaymentHealthCards } from './PaymentHealthCards'
import type { NextActionsPanelProps } from './NextActionsPanel'
import { NextActionsPanel } from './NextActionsPanel'
import type { CarouselInsightPeriod } from './commandCenterPeriod'
import { CAROUSEL_INSIGHT_PERIOD_OPTIONS } from './commandCenterPeriod'
import { PAYMENT_COMMAND_CENTER } from './paymentCommandCopy'
import { HOME_BODY_IMPERIAL, HOME_TITLE_BLACK } from './homeCommandCenterTokens'

export type PaymentCommandCenterBandProps = PaymentHealthCardsProps & {
  nextActions: NextActionsPanelProps
  insightCarousel?: ReactNode
  carouselPeriod: CarouselInsightPeriod
  onCarouselPeriodChange: (p: CarouselInsightPeriod) => void
}

export function PaymentCommandCenterBand({
  nextActions,
  insightCarousel,
  carouselPeriod,
  onCarouselPeriodChange,
  ...healthCards
}: PaymentCommandCenterBandProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-[12px] border border-slate-200/90 bg-white/95 px-3 py-2.5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:px-3.5 sm:py-2.5">
        <h2
          id="home-today-command-center-title"
          className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full bg-[#000000] px-3.5 py-1.5 text-[14px] font-medium tracking-[0] text-white shadow-sm ring-1 ring-black/30"
        >
          {PAYMENT_COMMAND_CENTER.sectionTitle}
        </h2>
        <p className={`mt-0.5 max-w-2xl ${HOME_BODY_IMPERIAL}`}>{PAYMENT_COMMAND_CENTER.sectionSubtitle}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="xl:col-span-4">
          <PaymentHealthCards {...healthCards} />
        </div>
        <NextActionsPanel {...nextActions} />
      </div>

      {insightCarousel ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`text-[14px] font-semibold ${HOME_TITLE_BLACK}`}>Insights</p>
            <div className="flex flex-wrap gap-2">
              {CAROUSEL_INSIGHT_PERIOD_OPTIONS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onCarouselPeriodChange(f.id)}
                  className={`rounded-full px-3 py-1 text-[12px] font-medium transition ${
                    carouselPeriod === f.id
                      ? 'bg-neutral-900 text-white'
                      : 'border border-slate-200 bg-white text-neutral-700 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-[300px]">{insightCarousel}</div>
        </div>
      ) : null}
    </div>
  )
}

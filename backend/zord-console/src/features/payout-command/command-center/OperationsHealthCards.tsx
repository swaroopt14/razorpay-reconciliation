'use client'

import Link from 'next/link'
import { HeroMetricWithSuperPercent } from '../homeDashboardTypography'
import {
  COMMAND_CENTER_KPI_CARD,
  HOME_BODY_IMPERIAL_SM,
  HOME_INSIGHT_PROSE,
  HOME_TITLE_BLACK,
} from './homeCommandCenterTokens'
import { CommandCenterCardGlow } from './CommandCenterCardGlow'

export type OperationsHealthCardsProps = {
  confirmationCoveragePct: string
  confirmationValue: string
  confirmationSub: string
  confirmationFooter?: string

  exceptionQueueCount: string
  exceptionQueueValue: string
  exceptionQueueSub: string
  exceptionQueueHref: string

  blockedBatchesCount: string
  blockedBatchesSub: string
  blockedBatchesHref: string

  closeReadyCount: string
  closeReadySub: string
  closeReadyHref: string
}

export function OperationsHealthCards({
  confirmationCoveragePct,
  confirmationValue,
  confirmationSub,
  confirmationFooter,
  exceptionQueueCount,
  exceptionQueueValue,
  exceptionQueueSub,
  exceptionQueueHref,
  blockedBatchesCount,
  blockedBatchesSub,
  blockedBatchesHref,
  closeReadyCount,
  closeReadySub,
  closeReadyHref,
}: OperationsHealthCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <article className={COMMAND_CENTER_KPI_CARD + ' min-h-[280px]'}>
        <CommandCenterCardGlow />
        <div className="relative z-[1]">
          <h3 className="text-[14px] font-medium text-[#000000]">Confirmation coverage</h3>
          <p className="mt-4 text-center text-[36px] leading-none">
            <HeroMetricWithSuperPercent text={confirmationCoveragePct} />
          </p>
          <p className={`mt-2 text-center text-[14px] font-medium ${HOME_BODY_IMPERIAL_SM}`}>{confirmationValue}</p>
          <p className={`mt-1 text-center text-[13px] ${HOME_BODY_IMPERIAL_SM}`}>{confirmationSub}</p>
        </div>
        {confirmationFooter?.trim() ? (
          <p className={`relative z-[1] mt-auto pt-4 ${HOME_INSIGHT_PROSE}`}>{confirmationFooter}</p>
        ) : null}
      </article>

      <Link
        href={exceptionQueueHref}
        className={`${COMMAND_CENTER_KPI_CARD} min-h-[280px] transition hover:border-slate-300 hover:shadow-lg`}
      >
        <CommandCenterCardGlow />
        <div className="relative z-[1]">
          <h3 className="text-[14px] font-medium text-[#000000]">Exception queue</h3>
          <p className="mt-4 text-center text-[36px] leading-none">
            <HeroMetricWithSuperPercent text={exceptionQueueCount} />
          </p>
          <p className={`mt-2 text-center text-[14px] font-medium ${HOME_BODY_IMPERIAL_SM}`}>{exceptionQueueValue}</p>
          <p className={`mt-1 text-center text-[13px] ${HOME_BODY_IMPERIAL_SM}`}>{exceptionQueueSub}</p>
        </div>
      </Link>

      <Link
        href={blockedBatchesHref}
        className={`${COMMAND_CENTER_KPI_CARD} min-h-[280px] transition hover:border-slate-300 hover:shadow-lg`}
      >
        <CommandCenterCardGlow />
        <div className="relative z-[1]">
          <h3 className="text-[14px] font-medium text-[#000000]">Blocked batches</h3>
          <p className="mt-4 text-center text-[36px] leading-none">
            <HeroMetricWithSuperPercent text={blockedBatchesCount} />
          </p>
          <p className={`mt-2 text-center text-[14px] font-medium ${HOME_BODY_IMPERIAL_SM}`}>{blockedBatchesSub}</p>
        </div>
      </Link>

      <Link
        href={closeReadyHref}
        className={`${COMMAND_CENTER_KPI_CARD} min-h-[280px] transition hover:border-slate-300 hover:shadow-lg`}
      >
        <CommandCenterCardGlow />
        <div className="relative z-[1]">
          <h3 className="text-[14px] font-medium text-[#000000]">Close-ready</h3>
          <p className="mt-4 text-center text-[36px] leading-none">
            <HeroMetricWithSuperPercent text={closeReadyCount} />
          </p>
          <p className={`mt-2 text-center text-[14px] font-medium ${HOME_BODY_IMPERIAL_SM}`}>{closeReadySub}</p>
        </div>
      </Link>
    </div>
  )
}

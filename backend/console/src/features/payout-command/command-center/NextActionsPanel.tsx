'use client'

import Link from 'next/link'
import { payoutBatchCommandCenterHref } from '@/services/payout-command/batchCommandCenterHref'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { CommandCenterCardGlow } from './PaymentHealthCards'
import {
  COMMAND_CENTER_KPI_CARD,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from './homeCommandCenterTokens'

export type NextActionItem = {
  title: string
  description: string
  href?: string
  emphasis?: boolean
}

export type NextActionsPanelProps = {
  actions: NextActionItem[]
  completionHint?: string | null
}

function ActionRow({ action }: { action: NextActionItem }) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <p className={`text-[14px] font-semibold leading-snug ${HOME_TITLE_BLACK}`}>{action.title}</p>
        {action.description ? (
          <p className={`mt-0.5 ${HOME_BODY_IMPERIAL_SM}`}>{action.description}</p>
        ) : null}
      </div>
      {action.href ? (
        <span className={`shrink-0 text-[18px] font-medium tabular-nums ${HOME_TITLE_BLACK}`} aria-hidden>
          →
        </span>
      ) : null}
    </>
  )

  if (action.href) {
    return (
      <Link
        href={action.href}
        className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-3 transition hover:border-slate-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 ${
          action.emphasis
            ? 'border-black/30 bg-neutral-100 ring-1 ring-black/20'
            : 'border-slate-100/90 bg-white/80'
        }`}
      >
        {inner}
      </Link>
    )
  }

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-3 ${
        action.emphasis ? 'border-black/30 bg-neutral-100' : 'border-slate-100/90 bg-white/80'
      }`}
    >
      {inner}
    </div>
  )
}

export function NextActionsPanel({ actions, completionHint }: NextActionsPanelProps) {
  const { mode } = useEnvironment()
  const batchHref = payoutBatchCommandCenterHref(mode === 'sandbox')

  return (
    <article className={`${COMMAND_CENTER_KPI_CARD} min-h-[280px]`}>
      <CommandCenterCardGlow />
      <div className="relative z-[1] flex h-full min-h-[280px] flex-col">
        <h3 className="text-[14px] font-medium text-[#000000]">Next Actions</h3>
        {completionHint?.trim() ? (
          <p className={`mt-2 ${HOME_BODY_IMPERIAL_SM}`}>{completionHint}</p>
        ) : null}

        <ul className="mt-4 flex flex-1 flex-col gap-2">
          {actions.map((action) => (
            <li key={action.title}>
              <ActionRow action={action} />
            </li>
          ))}
        </ul>

        <div className="mt-4 border-t border-slate-100/80 pt-3">
          <Link
            href={batchHref}
            className="flex items-center justify-between gap-2 rounded-lg py-1 transition hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
          >
            <span className={`text-[14px] font-semibold ${HOME_TITLE_BLACK}`}>Open Batch Center</span>
            <span className={`text-[18px] font-medium ${HOME_TITLE_BLACK}`} aria-hidden>
              →
            </span>
          </Link>
        </div>
      </div>
    </article>
  )
}

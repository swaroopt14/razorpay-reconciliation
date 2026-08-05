'use client'

import type { ReactNode } from 'react'
import { CommandCenterCardGlow } from '../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL,
  HOME_TITLE_BLACK,
} from '../command-center/homeCommandCenterTokens'
import { JOURNAL_DM_SANS } from './journalFonts'

/** Page wash — matches Batch Command Center body. */
export const JOURNAL_PAGE_BG = 'bg-[#f4f4f1]'

export function JournalPageHeader({
  label,
  summary,
  children,
}: {
  label: string
  summary: string
  children?: ReactNode
}) {
  return (
    <header className={`relative mb-4 overflow-hidden ${COMMAND_CENTER_KPI_CARD}`}>
      <CommandCenterCardGlow />
      <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>{label}</p>
      <p className={`relative mt-1 max-w-2xl ${HOME_BODY_IMPERIAL}`}>{summary}</p>
      {children ? <div className="relative mt-3 flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  )
}

export function JournalOverviewStat({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <article className={`relative overflow-hidden ${COMMAND_CENTER_KPI_CARD} !p-4 ${JOURNAL_DM_SANS}`}>
      <CommandCenterCardGlow />
      <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>{label}</p>
      <p
        className={`relative mt-2 tracking-[-0.02em] ${HOME_TITLE_BLACK} ${
          mono
            ? 'break-all font-mono text-[13px] font-semibold leading-snug'
            : 'text-[22px] font-extrabold tabular-nums leading-none'
        }`}
      >
        {value}
      </p>
    </article>
  )
}

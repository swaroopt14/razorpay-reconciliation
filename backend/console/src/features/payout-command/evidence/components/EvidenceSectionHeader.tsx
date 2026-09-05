'use client'

import type { ReactNode } from 'react'
import {
  EVIDENCE_CARD_INSET_HEADER,
  EVIDENCE_NEON,
} from '../evidencePageTokens'

type Props = {
  title: string
  subtitle?: string
  badge?: string
  live?: boolean
  action?: ReactNode
}

export function EvidenceSectionHeader({ title, subtitle, badge, live, action }: Props) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 ${EVIDENCE_CARD_INSET_HEADER}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {live ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neutral-700 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-black" />
            </span>
          ) : null}
          <h2 className="text-[15px] font-semibold tracking-tight text-[#000000]">{title}</h2>
          {badge ? (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#000000]"
              style={{ background: EVIDENCE_NEON }}
            >
              {badge}
            </span>
          ) : null}
        </div>
        {subtitle ? (
          <p className="mt-1 max-w-2xl text-[13px] font-medium leading-relaxed text-[#00239C]">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

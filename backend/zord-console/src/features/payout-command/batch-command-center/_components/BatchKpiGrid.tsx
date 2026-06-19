'use client'

import Link from 'next/link'
import type { BatchKpiCardModel } from '../mappers/mapBatchReviewKpis'

export function BatchKpiGrid({ cards }: { cards: BatchKpiCardModel[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <article
          key={card.id}
          className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.04)]"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748b]">{card.title}</p>
          <p className={`mt-2 text-[22px] font-bold tabular-nums tracking-tight text-[#0f172a] ${card.empty ? 'text-[15px] font-medium text-[#64748b]' : ''}`}>
            {card.value}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[#64748b]">{card.subtitle}</p>
          {card.actionLabel && card.actionHref ? (
            card.actionHref.startsWith('#') ? (
              <a
                href={card.actionHref}
                className="mt-3 inline-flex text-[13px] font-semibold text-[#2563eb] underline"
              >
                {card.actionLabel}
              </a>
            ) : (
              <Link
                href={card.actionHref}
                className="mt-3 inline-flex text-[13px] font-semibold text-[#2563eb] underline"
              >
                {card.actionLabel}
              </Link>
            )
          ) : null}
        </article>
      ))}
    </div>
  )
}

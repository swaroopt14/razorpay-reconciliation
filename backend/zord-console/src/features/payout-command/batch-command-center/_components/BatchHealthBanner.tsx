'use client'

import type { BatchHealthState } from '../mappers/mapBatchReviewKpis'
import { BATCH_REVIEW_COPY } from '../copy/batchCommandCenterCopy'

export function BatchHealthBanner({ state }: { state: BatchHealthState }) {
  const copy =
    state === 'review'
      ? BATCH_REVIEW_COPY.health.review
      : state === 'waiting'
        ? BATCH_REVIEW_COPY.health.waiting
        : BATCH_REVIEW_COPY.health.clean

  const tone =
    state === 'review'
      ? 'border-amber-200 bg-amber-50 text-amber-950'
      : state === 'waiting'
        ? 'border-sky-200 bg-sky-50 text-sky-950'
        : 'border-black/30 bg-neutral-100 text-black'

  return (
    <div className={`rounded-xl border px-4 py-4 ${tone}`} data-testid="batch-health-banner">
      <p className="text-[15px] font-bold">{copy.title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed">{copy.body}</p>
    </div>
  )
}

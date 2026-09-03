'use client'

import Link from 'next/link'
import { PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH } from '@/services/payout-command/batchCommandCenterHref'
import { withDemoBatchScope } from '@/services/payout-command/demo/ycDemoConstants'
import type {
  DemoBatchReadiness,
  DemoBatchRequire,
} from '@/services/payout-command/demo/demoBatchReadiness'

type AwaitingUploadsEmptyStateProps = {
  title?: string
  readiness?: DemoBatchReadiness | null
  /** Which upload stage this surface needs (drives copy + CTA). */
  require?: DemoBatchRequire
  className?: string
}

function stageCopy(require: DemoBatchRequire): { body: string; ctaIntent: string; ctaSettlement: string } {
  if (require === 'intent') {
    return {
      body: 'Upload an obligation / intent file for a batch to open this view. Settlement can come later in the lifecycle.',
      ctaIntent: 'Upload obligation file',
      ctaSettlement: 'Upload obligation file',
    }
  }
  if (require === 'settlement') {
    return {
      body: 'Upload a settlement confirmation for the same batch after dispatch. The prior intent file stays on Create so the pair corresponds.',
      ctaIntent: 'Upload obligation file first',
      ctaSettlement: 'Upload settlement file',
    }
  }
  return {
    body: 'This view needs both the obligation file and the settlement confirmation for the same batch — expected vs actual.',
    ctaIntent: 'Upload obligation file',
    ctaSettlement: 'Upload settlement file',
  }
}

/**
 * Production-empty state until the required upload stage is complete.
 */
export function AwaitingUploadsEmptyState({
  title = 'No payout data yet',
  readiness = null,
  require = 'both',
  className = '',
}: AwaitingUploadsEmptyStateProps) {
  const intentDone = Boolean(readiness?.intentOk)
  const settlementDone = Boolean(readiness?.settlementOk)
  const uploadHref = withDemoBatchScope(`${PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH}?upload=1`)
  const copy = stageCopy(require)
  const showSettlementStep = require === 'settlement' || require === 'both'
  const ctaLabel =
    require === 'intent'
      ? copy.ctaIntent
      : intentDone
        ? copy.ctaSettlement
        : copy.ctaIntent

  return (
    <section
      className={`border border-[#E2E8F0] bg-white px-5 py-8 sm:px-8 ${className}`}
      aria-label="Awaiting uploads"
    >
      <p className="text-[15px] font-semibold tracking-[-0.01em] text-[#0B1324]">{title}</p>
      <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[#64748B]">{copy.body}</p>

      <ol className="mt-5 space-y-2.5">
        <li className="flex items-start gap-2.5 text-[13px]">
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              intentDone ? 'bg-[#0B1324] text-white' : 'bg-[#F1F5F9] text-[#64748B]'
            }`}
          >
            {intentDone ? '✓' : '1'}
          </span>
          <span className="text-[#0B1324]">
            Upload obligation / intent file
            {intentDone && readiness?.batchId ? (
              <span className="mt-0.5 block font-mono text-[11px] text-[#94A3B8]">{readiness.batchId}</span>
            ) : null}
          </span>
        </li>
        {showSettlementStep ? (
          <li className="flex items-start gap-2.5 text-[13px]">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                settlementDone ? 'bg-[#0B1324] text-white' : 'bg-[#F1F5F9] text-[#64748B]'
              }`}
            >
              {settlementDone ? '✓' : '2'}
            </span>
            <span className="text-[#0B1324]">
              Upload settlement confirmation for the same batch
            </span>
          </li>
        ) : null}
      </ol>

      <Link
        href={uploadHref}
        className="mt-6 inline-flex h-10 items-center bg-[#0B1324] px-4 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
      >
        {ctaLabel}
      </Link>
    </section>
  )
}

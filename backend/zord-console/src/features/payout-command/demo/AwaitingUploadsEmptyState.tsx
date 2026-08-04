'use client'

import Link from 'next/link'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { payoutBatchCommandCenterHref } from '@/services/payout-command/batchCommandCenterHref'
import type { DemoBatchReadiness } from '@/services/payout-command/demo/demoBatchReadiness'

type AwaitingUploadsEmptyStateProps = {
  title?: string
  readiness?: DemoBatchReadiness | null
  className?: string
}

/**
 * Production-empty state until both obligation + settlement files are uploaded.
 */
export function AwaitingUploadsEmptyState({
  title = 'No payout data yet',
  readiness = null,
  className = '',
}: AwaitingUploadsEmptyStateProps) {
  const { mode } = useEnvironment()
  const intentDone = Boolean(readiness?.intentOk)
  const settlementDone = Boolean(readiness?.settlementOk)
  const uploadHref = `${payoutBatchCommandCenterHref(mode === 'sandbox')}?upload=1`

  return (
    <section
      className={`border border-[#E2E8F0] bg-white px-5 py-8 sm:px-8 ${className}`}
      aria-label="Awaiting uploads"
    >
      <p className="text-[15px] font-semibold tracking-[-0.01em] text-[#0B1324]">{title}</p>
      <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[#64748B]">
        Journals and lifecycle metrics appear after both files are uploaded for the same batch -
        obligation intake, then settlement confirmation. Nothing is pre-filled.
      </p>

      <ol className="mt-5 space-y-2.5">
        <li className="flex items-start gap-2.5 text-[13px]">
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              intentDone ? 'bg-[#0B1324] text-white' : 'bg-[#F1F5F9] text-[#64748B]'
            }`}
          >
            {intentDone ? '✓' : '1'}
          </span>
          <span className={intentDone ? 'text-[#0B1324]' : 'text-[#0B1324]'}>
            Upload obligation / intent file
            {intentDone && readiness?.batchId ? (
              <span className="mt-0.5 block font-mono text-[11px] text-[#94A3B8]">{readiness.batchId}</span>
            ) : null}
          </span>
        </li>
        <li className="flex items-start gap-2.5 text-[13px]">
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              settlementDone ? 'bg-[#0B1324] text-white' : 'bg-[#F1F5F9] text-[#64748B]'
            }`}
          >
            {settlementDone ? '✓' : '2'}
          </span>
          <span className={settlementDone ? 'text-[#0B1324]' : 'text-[#0B1324]'}>
            Upload settlement confirmation for the same batch
          </span>
        </li>
      </ol>

      <Link
        href={uploadHref}
        className="mt-6 inline-flex h-10 items-center bg-[#0B1324] px-4 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
      >
        {intentDone ? 'Upload settlement file' : 'Upload obligation file'}
      </Link>
    </section>
  )
}

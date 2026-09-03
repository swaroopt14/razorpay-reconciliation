'use client'

import Link from 'next/link'
import { BATCH_REVIEW_COPY } from '../copy/batchCommandCenterCopy'

type BatchIngestSuccessDialogProps = {
  kind: 'intent' | 'settlement'
  batchId: string
  fileName?: string | null
  /** Primary CTA — Payouts (AI route) or Settlements */
  primaryHref?: string
  onClose: () => void
}

export function BatchIngestSuccessDialog({
  kind,
  batchId,
  fileName,
  primaryHref,
  onClose,
}: BatchIngestSuccessDialogProps) {
  const title =
    kind === 'intent' ? BATCH_REVIEW_COPY.dialogs.intentTitle : BATCH_REVIEW_COPY.dialogs.settlementTitle
  const body =
    kind === 'intent'
      ? BATCH_REVIEW_COPY.dialogs.intentBody(batchId)
      : BATCH_REVIEW_COPY.dialogs.settlementBody(batchId)
  const ctaLabel =
    kind === 'intent'
      ? BATCH_REVIEW_COPY.dialogs.openPaymentJournal
      : BATCH_REVIEW_COPY.dialogs.openSettlementJournal
  const href =
    primaryHref ||
    (kind === 'intent' ? '/payouts?demo=sandbox&upload=1' : '/settlements?demo=sandbox')

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-ingest-success-title"
        className="w-full max-w-md rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="batch-ingest-success-title" className="text-[18px] font-bold text-[#0f172a]">
          {title}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-[#475569]">{body}</p>
        {fileName ? (
          <p className="mt-2 font-mono text-[12px] text-[#64748b]" title={fileName}>
            {fileName}
          </p>
        ) : null}
        <p className="mt-3 font-mono text-[13px] font-semibold text-[#1e40af]">{batchId}</p>
        {kind === 'intent' ? (
          <p className="mt-3 rounded-lg border border-[#DBEAFE] bg-[#F8FBFF] px-3 py-2 text-[12px] leading-relaxed text-[#334155]">
            Next: open <span className="font-semibold text-[#0B1324]">Payouts</span> — bulk rows appear as{' '}
            <span className="font-semibold">pending</span>, then AI recommends HDFC · NEFT. Approve before
            dispatch. Provider status is never rewritten to ROUTED.
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg bg-[#2563eb] px-4 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
          >
            {BATCH_REVIEW_COPY.dialogs.close}
          </button>
          <Link
            href={href}
            className="inline-flex h-9 items-center rounded-lg border border-[#e2e8f0] px-4 text-[13px] font-medium text-[#0f172a] hover:bg-slate-50"
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </div>
  )
}

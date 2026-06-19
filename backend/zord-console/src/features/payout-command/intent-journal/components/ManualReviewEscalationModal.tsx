'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { formatJournalMoney } from '../formatJournalMoney'
import type { JournalFailureRow } from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import { createSupportTicket, loadSupportTickets, saveSupportTickets } from '@/services/payout-command/support/supportTickets'
import {
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'

type ManualReviewEscalationModalProps = {
  row: JournalFailureRow
  isSandboxRoute?: boolean
  onClose: () => void
}

export function ManualReviewEscalationModal({
  row,
  isSandboxRoute = false,
  onClose,
}: ManualReviewEscalationModalProps) {
  const router = useRouter()
  const { tenantId } = useSessionTenant()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const beneficiary = row.beneficiaryName?.trim() || row.paymentPartner?.trim() || '—'
  const amountLabel = Number.isFinite(row.amount)
    ? formatJournalMoney(row.amount, row.currency ?? 'INR')
    : '—'
  const errorDetail = row.failureReason?.trim() || '—'

  const handleSendToSupport = () => {
    setSubmitting(true)
    setError(null)
    try {
      const description = [
        `DLQ ID: ${row.requestId}`,
        `Batch: ${row.batchId}`,
        row.sourceRowNum != null ? `Row: ${row.sourceRowNum}` : null,
        `Beneficiary: ${beneficiary}`,
        `Amount: ${amountLabel}`,
        `Error: ${errorDetail}`,
        row.dlqStatus ? `DLQ status: ${row.dlqStatus}` : null,
      ]
        .filter(Boolean)
        .join('\n')

      const ticket = createSupportTicket({
        category: 'Payment processing',
        topic: `Manual review — batch ${row.batchId}`,
        description,
        priority: 'urgent',
      })
      const existing = loadSupportTickets(tenantId || 'default')
      saveSupportTickets(tenantId || 'default', [ticket, ...existing])

      onClose()
      const supportPath = isSandboxRoute
        ? '/sandbox?dock=support&accountTab=Zord%20Support'
        : '/payout-command-view/today?dock=support&accountTab=Zord%20Support'
      router.push(supportPath)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create support ticket.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-review-title"
        className="relative z-[81] w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="manual-review-title" className={`text-[1.2rem] font-bold tracking-tight ${HOME_TITLE_BLACK}`}>
              Manual review
            </h2>
            <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>
              Review this failure and send it to Zord Support for triage.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-[20px] leading-none text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <dl className="mt-5 space-y-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Beneficiary</dt>
            <dd className="mt-0.5 text-[14px] font-medium text-slate-900">{beneficiary}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Amount</dt>
            <dd className="mt-0.5 text-[14px] font-medium text-slate-900">{amountLabel}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Error</dt>
            <dd className="mt-0.5 text-[14px] font-medium text-rose-700">{errorDetail}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Batch / DLQ</dt>
            <dd className="mt-0.5 font-mono text-[12px] text-slate-700">
              {row.batchId} · {row.requestId}
            </dd>
          </div>
        </dl>

        {error ? <p className="mt-3 text-[13px] font-medium text-red-600">{error}</p> : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSendToSupport}
            className="rounded-xl bg-[#0f172a] px-5 py-2.5 text-[13px] font-bold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-60"
          >
            {submitting ? 'Sending…' : 'Send to Support'}
          </button>
        </div>

        <p className={`mt-3 text-[11px] text-slate-500 ${HOME_BODY_IMPERIAL_SM}`}>
          A support ticket will be created and you will be taken to the Support page.
        </p>
      </div>
    </div>
  )
}

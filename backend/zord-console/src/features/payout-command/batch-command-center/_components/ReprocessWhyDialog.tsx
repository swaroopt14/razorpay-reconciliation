'use client'

import { useEffect, useId, useState } from 'react'
import { BATCH_REVIEW_COPY } from '../copy/batchCommandCenterCopy'
import {
  REPROCESS_REASONS,
  type ReprocessReason,
} from '@/services/payout-command/batch-intake/reprocessReason'

export type ReprocessTarget = 'intent' | 'settlement'

type ReprocessWhyDialogProps = {
  initialTarget: ReprocessTarget
  onCancel: () => void
  onConfirm: (payload: { target: ReprocessTarget; reason: ReprocessReason }) => void
}

export function ReprocessWhyDialog({ initialTarget, onCancel, onConfirm }: ReprocessWhyDialogProps) {
  const titleId = useId()
  const reasonId = useId()
  const [target, setTarget] = useState<ReprocessTarget>(initialTarget)
  const [reason, setReason] = useState<ReprocessReason | ''>('')
  const c = BATCH_REVIEW_COPY
  const canContinue = Boolean(reason)

  useEffect(() => {
    setTarget(initialTarget)
    setReason('')
  }, [initialTarget])

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onCancel}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl border border-[#e2e8f0] bg-white p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-[18px] font-bold text-[#0f172a]">
          {c.dialogs.reprocessWhyTitle}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[#64748b]">{c.dialogs.reprocessWhyBody}</p>

        <fieldset className="mt-4 space-y-2">
          <legend className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">
            {c.dialogs.reprocessTargetLegend}
          </legend>
          {(
            [
              { value: 'intent' as const, label: c.dialogs.reprocessTargetIntent },
              { value: 'settlement' as const, label: c.dialogs.reprocessTargetSettlement },
            ]
          ).map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-[13px] text-[#0A0A0A]"
            >
              <input
                type="radio"
                name="reprocess-target"
                className="h-4 w-4"
                checked={target === option.value}
                onChange={() => setTarget(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>

        <label className="mt-4 flex flex-col gap-1" htmlFor={reasonId}>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">
            {c.fields.reprocessReason}
          </span>
          <select
            id={reasonId}
            value={reason}
            required
            onChange={(event) => setReason(event.target.value as ReprocessReason | '')}
            className="h-9 rounded-lg border border-[#E5E5E5] bg-white px-2.5 text-[13px] text-[#0A0A0A] outline-none focus:border-[#6366f1]/50"
          >
            <option value="">{c.fields.reprocessReasonPlaceholder}</option>
            {REPROCESS_REASONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => {
              if (!reason) return
              onConfirm({ target, reason })
            }}
            className="h-9 rounded-lg bg-[#2563eb] px-4 text-[13px] font-semibold text-white hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-[#94a3b8]"
          >
            {c.dialogs.reprocessContinue}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-lg border border-[#E5E5E5] bg-white px-4 text-[13px] font-medium text-[#334155]"
          >
            {c.dialogs.reprocessCancel}
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import type { FinalityStatus } from '@/services/payout-command/prod-api/intelligenceTypes'

export type LeakageFilterValues = {
  status: '' | FinalityStatus
  fromDate: string
  toDate: string
  batchId: string
}

type LeakageFiltersFormProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: LeakageFilterValues
  onApply: (next: LeakageFilterValues) => void
}

export function LeakageFiltersForm({ open, onOpenChange, value, onApply }: LeakageFiltersFormProps) {
  const [draft, setDraft] = useState(value)

  if (!open) return null

  return (
    <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
      <p className="text-[13px] font-semibold text-slate-800">Filters</p>
      <label className="mt-3 block text-[12px] font-medium text-slate-600">
        Status
        <select
          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[13px]"
          value={draft.status}
          onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as LeakageFilterValues['status'] }))}
        >
          <option value="">All</option>
          <option value="REQUIRES_REVIEW">Requires review</option>
          <option value="SETTLED">Settled</option>
          <option value="PENDING">Pending</option>
        </select>
      </label>
      <label className="mt-3 block text-[12px] font-medium text-slate-600">
        From
        <input
          type="date"
          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[13px]"
          value={draft.fromDate}
          onChange={(e) => setDraft((d) => ({ ...d, fromDate: e.target.value }))}
        />
      </label>
      <label className="mt-3 block text-[12px] font-medium text-slate-600">
        To
        <input
          type="date"
          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[13px]"
          value={draft.toDate}
          onChange={(e) => setDraft((d) => ({ ...d, toDate: e.target.value }))}
        />
      </label>
      <label className="mt-3 block text-[12px] font-medium text-slate-600">
        Batch ID
        <input
          type="text"
          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[13px]"
          value={draft.batchId}
          onChange={(e) => setDraft((d) => ({ ...d, batchId: e.target.value }))}
          placeholder="Optional batch scope"
        />
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-slate-600"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white"
          onClick={() => {
            onApply(draft)
            onOpenChange(false)
          }}
        >
          Apply
        </button>
      </div>
    </div>
  )
}

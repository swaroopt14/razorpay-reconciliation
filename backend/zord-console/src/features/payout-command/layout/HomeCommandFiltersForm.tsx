'use client'

import type { Dispatch, SetStateAction } from 'react'
import {
  homeTimeframes,
  type HomeCommandFilters,
  type HomeMethodFilter,
  type HomeSourceFilter,
  type HomeStatusFilter,
  type HomeTimeframe,
} from '@/services/payout-command/model'

const SOURCE_OPTIONS: HomeSourceFilter[] = ['All', 'Loan System', 'Payment Partner']
const METHOD_OPTIONS: HomeMethodFilter[] = ['All', 'NACH', 'LSM', 'Bank Transfer']
const STATUS_OPTIONS: HomeStatusFilter[] = ['All', 'Confirmed', 'Pending', 'Review']

function filterPillClass(active: boolean) {
  return active
    ? 'border-[#111111] bg-[#111111] text-white'
    : 'border-[#E8E8E5] bg-white text-[#6f716d] hover:border-[#cfcfcd]'
}

export function HomeCommandFiltersForm({
  timeframe,
  onTimeframeChange,
  commandFilters,
  setCommandFilters,
}: {
  timeframe: HomeTimeframe
  onTimeframeChange: (timeframe: HomeTimeframe) => void
  commandFilters: HomeCommandFilters
  setCommandFilters: Dispatch<SetStateAction<HomeCommandFilters>>
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      <div>
        <div className="text-[12px] font-medium text-[#9a9a96]">Time</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {homeTimeframes.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => onTimeframeChange(label)}
              className={`rounded-full border px-3 py-1.5 text-[14px] font-medium transition ${filterPillClass(label === timeframe)}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[12px] font-medium text-[#9a9a96]">Source</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {SOURCE_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setCommandFilters((c) => ({ ...c, source: opt }))}
              className={`rounded-full border px-3 py-1.5 text-[14px] font-medium transition ${filterPillClass(commandFilters.source === opt)}`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[12px] font-medium text-[#9a9a96]">Payment method</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {METHOD_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setCommandFilters((c) => ({ ...c, method: opt }))}
              className={`rounded-full border px-3 py-1.5 text-[14px] font-medium transition ${filterPillClass(commandFilters.method === opt)}`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[12px] font-medium text-[#9a9a96]">Status</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setCommandFilters((c) => ({ ...c, status: opt }))}
              className={`rounded-full border px-3 py-1.5 text-[14px] font-medium transition ${filterPillClass(commandFilters.status === opt)}`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
      <div className="md:col-span-2 xl:col-span-4">
        <div className="text-[12px] font-medium text-[#9a9a96]">Batch ID</div>
        <input
          value={commandFilters.batchQuery}
          onChange={(e) => setCommandFilters((c) => ({ ...c, batchQuery: e.target.value }))}
          placeholder="Search batch or reference…"
          className="mt-2 w-full max-w-xl rounded-xl border border-[#E5E5E5] bg-white px-3 py-2.5 text-[15px] text-[#111111] outline-none placeholder:text-[#b0b0ac] focus:border-[#9a9a96]"
        />
        <p className="mt-3 text-[13px] leading-relaxed text-[#9a9a96]">
          Filters update the headline total, summary cards, the trend chart, and payment method figures together.
        </p>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { getFinanceEvaluation } from '@/services/payout-command/prod-api/financeApi'
import type { FinanceEvaluation } from '@/services/payout-command/prod-api/financeTypes'

function pct(value: number | undefined) {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${Math.round(value * 1000) / 10}%`
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#E2E8F0] bg-white px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">{label}</p>
      <p className="mt-2 text-[28px] font-semibold tabular-nums tracking-tight text-[#0F172A]">{value}</p>
    </div>
  )
}

export function EvaluationSurface() {
  const [data, setData] = useState<FinanceEvaluation | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getFinanceEvaluation().then((res) => {
      if (!res.ok || !res.data) {
        setError(res.status === 401 ? 'Sign in to load evaluation.' : 'Could not load evaluation.')
        return
      }
      setData(res.data)
    })
  }, [])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#F4F6F9]">
      <div className="mx-auto w-full max-w-[960px] px-5 py-5 sm:px-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">
          Finance controller evaluation
        </h1>
        <p className="mt-1 text-[13px] text-[#6B6B6B]">
          Dataset {data ? data.dataset_records : '…'} records. Phase 10 scoring against the smoke catalogue.
        </p>

        {error ? (
          <p className="mt-6 border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] text-[#B91C1C]">{error}</p>
        ) : null}

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Metric label="Reconciliation" value={pct(data?.reconciliation_rate)} />
          <Metric label="Exception detection" value={pct(data?.exception_detection_rate)} />
          <Metric label="Exception resolution" value={pct(data?.exception_resolution_rate)} />
          <Metric label="False resolution" value={pct(data?.false_resolution_rate)} />
          <Metric label="Financial accuracy" value={pct(data?.financial_accuracy)} />
          <Metric label="Evidence grounding" value={pct(data?.evidence_grounding)} />
        </div>
      </div>
    </div>
  )
}

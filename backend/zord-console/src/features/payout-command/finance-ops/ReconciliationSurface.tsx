'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getFinanceResults, runFinanceReconciliation } from '@/services/payout-command/prod-api/financeApi'
import type { FinanceReconRow } from '@/services/payout-command/prod-api/financeTypes'
import { formatPaise } from './reasonCopy'

const FILTERS = ['ALL', 'MATCHED', 'AMBIGUOUS', 'UNRESOLVED', 'CONFLICTED', 'VARIANCE', 'ORPHAN'] as const

function mark(value: boolean | null) {
  if (value == null) return <span className="text-[#94A3B8]">?</span>
  return value ? <span className="text-[#15803D]">Yes</span> : <span className="text-[#B91C1C]">No</span>
}

function resultClass(result: string) {
  if (result === 'MATCHED') return 'text-[#15803D]'
  if (result === 'AMBIGUOUS') return 'text-[#1D4ED8]'
  return 'text-[#C2410C]'
}

export function ReconciliationSurface() {
  const router = useRouter()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL')
  const [rows, setRows] = useState<FinanceReconRow[]>([])
  const [records, setRecords] = useState(0)
  const [matched, setMatched] = useState(0)
  const [exceptions, setExceptions] = useState(0)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (result: string) => {
    setLoading(true)
    setError(null)
    const res = await getFinanceResults(result)
    if (!res.ok || !res.data) {
      setError(res.status === 401 ? 'Sign in to load reconciliation.' : 'Could not load reconciliation.')
      setRows([])
      setLoading(false)
      return
    }
    setRecords(res.data.records)
    setMatched(res.data.matched)
    setExceptions(res.data.exceptions)
    setRows(res.data.results ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load(filter)
  }, [filter, load])

  async function run() {
    setRunning(true)
    await runFinanceReconciliation()
    setRunning(false)
    void load(filter)
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#F4F6F9]">
      <div className="mx-auto w-full max-w-[1280px] px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">Reconciliation</h1>
            <p className="mt-1 text-[13px] text-[#6B6B6B]">
              {records} records · {matched} matched · {exceptions} exceptions
            </p>
          </div>
          <button
            type="button"
            onClick={() => void run()}
            disabled={running}
            className="h-9 bg-[#0B1324] px-4 text-[13px] font-semibold text-white hover:bg-[#1E293B] disabled:opacity-60"
          >
            {running ? 'Running…' : 'Run reconciliation'}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {FILTERS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`h-8 px-3 text-[13px] font-medium ${
                filter === id
                  ? 'bg-[#0B1324] text-white'
                  : 'border border-[#E5E7EB] bg-white text-[#334155] hover:bg-[#F8FAFC]'
              }`}
            >
              {id === 'ALL' ? 'All' : id.charAt(0) + id.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {error ? (
          <p className="mt-6 border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] text-[#B91C1C]">{error}</p>
        ) : null}

        <div className="mt-4 overflow-x-auto border border-[#E2E8F0] bg-white">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
              <tr>
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-4 py-3 font-semibold">Settlement</th>
                <th className="px-4 py-3 font-semibold">Bank</th>
                <th className="px-4 py-3 font-semibold">Result</th>
                <th className="px-4 py-3 text-right font-semibold">Variance</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? (
                    <tr>
                      <td className="px-4 py-6 text-[#64748B]" colSpan={5}>
                        Loading…
                      </td>
                    </tr>
                  )
                : rows.map((row) => (
                    <tr
                      key={row.payment_id}
                      className="cursor-pointer border-t border-[#F1F5F9] hover:bg-[#F8FAFC]"
                      onClick={() =>
                        router.push(`/exceptions?demo=sandbox&entity_id=${encodeURIComponent(row.payment_id)}`)
                      }
                    >
                      <td className="px-4 py-3 font-mono text-[12px] text-[#0F172A]">{row.payment_id}</td>
                      <td className="px-4 py-3">{mark(row.settlement)}</td>
                      <td className="px-4 py-3">{mark(row.bank)}</td>
                      <td className={`px-4 py-3 font-semibold ${resultClass(row.result)}`}>{row.result}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatPaise(row.variance_amount)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

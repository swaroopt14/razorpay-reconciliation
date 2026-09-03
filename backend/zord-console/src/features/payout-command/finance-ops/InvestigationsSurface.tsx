'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getFinanceInvestigations } from '@/services/payout-command/prod-api/financeApi'
import type { FinanceInvestigation } from '@/services/payout-command/prod-api/financeTypes'
import { formatPaise } from './reasonCopy'

export function InvestigationsSurface() {
  const router = useRouter()
  const [rows, setRows] = useState<FinanceInvestigation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void getFinanceInvestigations().then((res) => {
      setLoading(false)
      if (!res.ok || !res.data) {
        setError(res.status === 401 ? 'Sign in to load investigations.' : 'Could not load investigations.')
        return
      }
      setRows(res.data.investigations ?? [])
    })
  }, [])

  const stats = useMemo(() => {
    const total = rows.length
    const resolved = rows.filter((r) => r.status === 'completed').length
    const unresolved = total - resolved
    const rate = total ? Math.round((resolved / total) * 100) : 0
    return { total, resolved, unresolved, rate }
  }, [rows])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#F4F6F9]">
      <div className="mx-auto w-full max-w-[1280px] px-5 py-5 sm:px-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">Investigations</h1>
        <p className="mt-1 text-[13px] text-[#6B6B6B]">
          {stats.total} cases · {stats.resolved} resolved · {stats.unresolved} unresolved · {stats.rate}% resolution
          rate
        </p>

        {error ? (
          <p className="mt-6 border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] text-[#B91C1C]">{error}</p>
        ) : null}

        <div className="mt-5 overflow-x-auto border border-[#E2E8F0] bg-white">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
              <tr>
                <th className="px-4 py-3 font-semibold">Case</th>
                <th className="px-4 py-3 font-semibold">Entity</th>
                <th className="px-4 py-3 font-semibold">Issue</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Impact</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-[#64748B]" colSpan={5}>
                    Loading…
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-t border-[#F1F5F9] hover:bg-[#F8FAFC]"
                    onClick={() =>
                      router.push(
                        `/exceptions?demo=sandbox&entity_id=${encodeURIComponent(row.entity_id)}&exception_id=${encodeURIComponent(row.exception_id || '')}`,
                      )
                    }
                  >
                    <td className="px-4 py-3 font-mono text-[12px] text-[#0F172A]">{row.id}</td>
                    <td className="px-4 py-3 font-mono text-[12px]">{row.entity_id}</td>
                    <td className="px-4 py-3 text-[#334155]">{row.issue || row.root_cause}</td>
                    <td className="px-4 py-3 capitalize text-[#64748B]">{row.status}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatPaise(row.financial_impact)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

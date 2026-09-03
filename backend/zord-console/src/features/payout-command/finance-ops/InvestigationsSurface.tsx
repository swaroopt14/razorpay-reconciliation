'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getFinanceInvestigations } from '@/services/payout-command/prod-api/financeApi'
import type { FinanceInvestigation } from '@/services/payout-command/prod-api/financeTypes'
import {
  HeroAmountCard,
  MiniMetricCard,
  PageHeader,
  PaymentsEmptyState,
  RZ_CARD,
  RZ_MUTED,
  RZ_PAGE,
  RZ_WRAP,
} from './razorpayChrome'
import { formatPaise } from './reasonCopy'

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
]

export function InvestigationsSurface() {
  const router = useRouter()
  const [range, setRange] = useState('all')
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
    const impact = rows.reduce((s, r) => s + (r.financial_impact || 0), 0)
    return { total, resolved, unresolved, impact }
  }, [rows])

  return (
    <div className={RZ_PAGE}>
      <div className={RZ_WRAP}>
        <PageHeader
          title="Investigations"
          range={range}
          onRangeChange={setRange}
          rangeOptions={RANGE_OPTIONS}
          docsHref="https://razorpay.com/docs/x/payouts/"
        />
        <p className={`mt-1 ${RZ_MUTED}`}>
          Agent traces for recon exceptions. Provider status is never renamed.
        </p>

        <div className="mt-5 space-y-3">
          <HeroAmountCard
            label="Investigated exposure"
            amount={formatPaise(stats.impact, 2)}
            subtitle={`${stats.total} cases`}
            info="Sum of financial_impact on investigation cases."
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniMetricCard
              label="Complete"
              value={String(stats.resolved)}
              subtitle="agent finished"
              info="status = completed"
            />
            <MiniMetricCard
              label="Open"
              value={String(stats.unresolved)}
              subtitle="still with the agent"
              info="Unresolved investigations"
              warn
            />
            <MiniMetricCard
              label="Cases"
              value={String(stats.total)}
              subtitle="in the inbox"
              info="All investigation records"
            />
          </div>
        </div>

        {error ? (
          <p className="mt-6 rounded-[8px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] text-[#B91C1C]">
            {error}
          </p>
        ) : null}

        <div className={`${RZ_CARD} mt-6 overflow-hidden`}>
          {loading ? (
            <p className={`px-6 py-10 text-center ${RZ_MUTED}`}>Loading investigations…</p>
          ) : rows.length === 0 ? (
            <PaymentsEmptyState title="No investigations" body="Run reconciliation on an open payout to create a case." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-[13px]">
                <thead className="border-b border-[#EEF0F3] bg-[#FAFBFC] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8F8F8F]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Investigation</th>
                    <th className="px-4 py-3 font-semibold">Entity</th>
                    <th className="px-4 py-3 font-semibold">Issue</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-t border-[#F3F4F6] hover:bg-[#FAFBFC]"
                      onClick={() =>
                        router.push(`/investigations/${encodeURIComponent(row.id)}?demo=sandbox`)
                      }
                    >
                      <td className="px-4 py-3 font-mono text-[12px] text-[#1A1A1A]">{row.id}</td>
                      <td className="px-4 py-3 font-mono text-[12px] text-[#334155]">{row.entity_id}</td>
                      <td className="max-w-[320px] px-4 py-3 text-[#334155]">
                        {row.issue || row.root_cause}
                      </td>
                      <td className="px-4 py-3 capitalize text-[#64748B]">{row.status}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {formatPaise(row.financial_impact, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

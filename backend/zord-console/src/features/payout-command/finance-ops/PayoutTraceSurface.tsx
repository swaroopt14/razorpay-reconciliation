'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getFinanceResults } from '@/services/payout-command/prod-api/financeApi'
import { formatPaise } from './reasonCopy'
import {
  RZ_MUTED,
  RZ_PAGE,
  RZ_WRAP,
} from './razorpayChrome'
import { mapFinanceRowToPayoutRecon } from './payoutReconCopy'
import { buildPayoutLifecycle } from './payoutLifecycleModel'
import { PayoutLifecycleView } from './PayoutLifecycleView'

export function PayoutTraceSurface({ payoutId }: { payoutId: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [row, setRow] = useState<ReturnType<typeof mapFinanceRowToPayoutRecon> | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const res = await getFinanceResults('ALL')
      if (cancelled) return
      if (!res.ok || !res.data) {
        setError('Could not load payout trace.')
        setLoading(false)
        return
      }
      const mapped = (res.data.results ?? []).map(mapFinanceRowToPayoutRecon)
      const hit = mapped.find((r) => r.payoutId === payoutId) || mapped[0] || null
      setRow(hit)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [payoutId])

  const life = useMemo(() => (row ? buildPayoutLifecycle(row) : null), [row])

  return (
    <div className={RZ_PAGE}>
      <div className={RZ_WRAP}>
        <Link
          href="/reconciliation?demo=sandbox"
          className="text-[13px] font-medium text-[#528FF0] hover:underline"
        >
          ← Reconciliation
        </Link>

        {loading ? (
          <p className={`mt-8 ${RZ_MUTED}`}>Loading transaction lifecycle…</p>
        ) : error ? (
          <p className="mt-8 text-[13px] text-[#B91C1C]">{error}</p>
        ) : row && life ? (
          <>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                  Transaction lifecycle
                </p>
                <h1 className="mt-1 font-mono text-[22px] font-semibold tracking-tight text-[#1A1A1A]">
                  {row.payoutId}
                </h1>
                <p className="mt-2 text-[32px] font-semibold tabular-nums tracking-[-0.03em] text-[#1A1A1A]">
                  {formatPaise(row.amountMinor, 2)}
                  <span className="ml-2 text-[14px] font-medium text-[#8F8F8F]">{row.currency || 'INR'}</span>
                </p>
              </div>
              <p className={RZ_MUTED}>
                Provider truth stays Razorpay status. Reconciliation is our control outcome.
              </p>
            </div>
            <div className="mt-6">
              <PayoutLifecycleView life={life} variant="page" initialTab="overview" />
            </div>
          </>
        ) : (
          <p className={`mt-8 ${RZ_MUTED}`}>Payout not found in this reconciliation set.</p>
        )}
      </div>
    </div>
  )
}

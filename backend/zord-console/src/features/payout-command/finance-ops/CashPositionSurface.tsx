'use client'

import { useEffect, useState } from 'react'
import { getFinanceCashPosition } from '@/services/payout-command/prod-api/financeApi'
import type { FinanceCashPosition } from '@/services/payout-command/prod-api/financeTypes'
import { formatPaise, formatPaiseCompact } from './reasonCopy'

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#E2E8F0] bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">{label}</p>
      <p className="mt-1 text-[22px] font-semibold tabular-nums text-[#0F172A]">{value}</p>
    </div>
  )
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#F1F5F9] py-2.5 text-[13px]">
      <span className={muted ? 'text-[#94A3B8]' : 'text-[#64748B]'}>{label}</span>
      <span className={`tabular-nums font-medium ${muted ? 'text-[#94A3B8]' : 'text-[#0F172A]'}`}>{value}</span>
    </div>
  )
}

export function CashPositionSurface() {
  const [snap, setSnap] = useState<FinanceCashPosition | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getFinanceCashPosition().then((res) => {
      if (!res.ok || !res.data) {
        setError(res.status === 401 ? 'Sign in to load cash position.' : 'Could not load cash position.')
        return
      }
      setSnap(res.data)
    })
  }, [])

  const asOf = snap?.as_of ? new Date(snap.as_of).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#F4F6F9]">
      <div className="mx-auto w-full max-w-[960px] px-5 py-5 sm:px-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">Cash position</h1>
        <p className="mt-1 text-[13px] text-[#6B6B6B]">As of {asOf}</p>

        {error ? (
          <p className="mt-6 border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] text-[#B91C1C]">{error}</p>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card label="Expected cash" value={snap ? formatPaiseCompact(snap.settlement_expected_net_minor) : '…'} />
          <Card label="Bank cash" value={snap ? formatPaiseCompact(snap.bank_credited_proven_minor) : '…'} />
          <Card label="Unresolved" value={snap ? formatPaiseCompact(snap.unresolved_exposure_minor) : '…'} />
          <Card label="Pending settlement" value={snap ? formatPaiseCompact(snap.in_flight_minor) : '…'} />
        </div>

        <section className="mt-6 border border-[#E2E8F0] bg-white px-5 py-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Expected vs actual</h2>
          <div className="mt-3">
            <Line label="Expected settlement" value={snap ? formatPaise(snap.settlement_expected_net_minor) : '—'} />
            <Line label="Gross captured" value={snap ? formatPaise(snap.gross_captured_minor) : '—'} />
            <Line label="In flight" value={snap ? formatPaise(snap.in_flight_minor) : '—'} />
            <Line label="Actual bank" value={snap ? formatPaise(snap.bank_credited_proven_minor) : '—'} />
            <Line
              label="Unresolved exposure"
              value={snap ? formatPaise(snap.unresolved_exposure_minor) : '—'}
            />
          </div>
        </section>
      </div>
    </div>
  )
}

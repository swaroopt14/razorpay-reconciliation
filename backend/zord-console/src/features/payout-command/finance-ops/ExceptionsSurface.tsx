'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getFinanceExceptions, getFinanceSummary } from '@/services/payout-command/prod-api/financeApi'
import type { FinanceException, FinanceSummary } from '@/services/payout-command/prod-api/financeTypes'
import { PaymentDrawer } from './PaymentDrawer'
import {
  exceptionSeverity,
  formatPaise,
  formatPaiseCompact,
  reasonTitle,
  reconLabel,
  type ExceptionSeverity,
} from './reasonCopy'

type FilterId = 'all' | 'high' | 'payment' | 'settlement' | 'payout' | 'bank'

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'high', label: 'High' },
  { id: 'payment', label: 'Payment' },
  { id: 'settlement', label: 'Settlement' },
  { id: 'payout', label: 'Payout' },
  { id: 'bank', label: 'Bank' },
]

function matchesFilter(ex: FinanceException, filter: FilterId): boolean {
  if (filter === 'all') return true
  if (filter === 'high') return exceptionSeverity(ex) === 'HIGH'
  return ex.entity_type === filter
}

function severityClass(sev: ExceptionSeverity): string {
  if (sev === 'HIGH') return 'bg-[#FEF2F2] text-[#B91C1C]'
  if (sev === 'MEDIUM') return 'bg-[#FFF7ED] text-[#C2410C]'
  return 'bg-[#F1F5F9] text-[#475569]'
}

export function ExceptionsSurface() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [exceptions, setExceptions] = useState<FinanceException[]>([])
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterId>('all')

  const entityFromUrl = searchParams.get('entity_id')?.trim() || ''
  const exceptionFromUrl = searchParams.get('exception_id')?.trim() || ''
  const [openId, setOpenId] = useState<string>(entityFromUrl)

  useEffect(() => {
    setOpenId(entityFromUrl)
  }, [entityFromUrl])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [exRes, sumRes] = await Promise.all([getFinanceExceptions(), getFinanceSummary()])
    if (!exRes.ok) {
      setError(
        exRes.status === 401
          ? 'Sign in to load exceptions.'
          : 'Could not load finance exceptions.',
      )
      setExceptions([])
      setSummary(null)
      setLoading(false)
      return
    }
    setExceptions(exRes.data?.exceptions ?? [])
    setSummary(sumRes.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(
    () => exceptions.filter((ex) => matchesFilter(ex, filter)),
    [exceptions, filter],
  )
  const openCount = exceptions.length
  const exposure = summary?.exposure_minor ?? exceptions.reduce((n, ex) => n + (ex.variance_amount || 0), 0)

  function openRow(ex: FinanceException) {
    setOpenId(ex.entity_id)
    const params = new URLSearchParams(searchParams.toString())
    params.set('entity_id', ex.entity_id)
    params.set('exception_id', ex.id)
    if (!params.get('demo')) params.set('demo', 'sandbox')
    router.replace(`/exceptions?${params.toString()}`, { scroll: false })
  }

  function closeDrawer() {
    setOpenId('')
    const params = new URLSearchParams(searchParams.toString())
    params.delete('entity_id')
    params.delete('exception_id')
    const q = params.toString()
    router.replace(q ? `/exceptions?${q}` : '/exceptions', { scroll: false })
  }

  const openException = exceptions.find((ex) => ex.entity_id === openId) ?? exceptions.find((ex) => ex.id === exceptionFromUrl)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#F4F6F9]">
      <div className={`mx-auto w-full ${openId ? 'max-w-[1440px]' : 'max-w-[1280px]'}`}>
        <div className={openId ? 'grid xl:grid-cols-[minmax(0,1fr)_420px]' : ''}>
          <div className="px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">Exceptions</h1>
                <p className="mt-1 text-[13px] text-[#6B6B6B]">
                  Finance operations inbox. Razorpay status stays unchanged; reconciliation is separate.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void load()}
                className="h-9 border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
              >
                Refresh
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="border border-[#E2E8F0] bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Open</p>
                <p className="mt-1 text-[22px] font-semibold tabular-nums text-[#0F172A]">{loading ? '…' : openCount}</p>
              </div>
              <div className="border border-[#E2E8F0] bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                  Unresolved exposure
                </p>
                <p className="mt-1 text-[22px] font-semibold tabular-nums text-[#0F172A]">
                  {loading ? '…' : formatPaiseCompact(exposure)}
                </p>
              </div>
              <div className="border border-[#E2E8F0] bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Reconciled</p>
                <p className="mt-1 text-[22px] font-semibold tabular-nums text-[#0F172A]">
                  {loading
                    ? '…'
                    : summary
                      ? `${summary.matched_count}/${summary.scored_count}`
                      : '—'}
                </p>
              </div>
              <div className="border border-[#E2E8F0] bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">High severity</p>
                <p className="mt-1 text-[22px] font-semibold tabular-nums text-[#0F172A]">
                  {loading ? '…' : exceptions.filter((ex) => exceptionSeverity(ex) === 'HIGH').length}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`h-8 px-3 text-[13px] font-medium ${
                    filter === f.id
                      ? 'bg-[#0B1324] text-white'
                      : 'border border-[#E5E7EB] bg-white text-[#334155] hover:bg-[#F8FAFC]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {error ? (
              <p className="mt-6 border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] text-[#B91C1C]">{error}</p>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-32 border border-[#E2E8F0] bg-white" />
                  ))
                : visible.map((ex) => {
                    const sev = exceptionSeverity(ex)
                    const selected = openId === ex.entity_id
                    return (
                      <article
                        key={ex.id}
                        className={`border bg-white p-4 ${
                          selected ? 'border-[#2E5BFF]' : 'border-[#E2E8F0]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span
                            className={`inline-flex h-6 items-center px-2 text-[10px] font-semibold uppercase tracking-[0.06em] ${severityClass(sev)}`}
                          >
                            {sev}
                          </span>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#94A3B8]">
                            {reconLabel(ex.reconciliation_result)}
                          </span>
                        </div>
                        <h2 className="mt-3 text-[15px] font-semibold text-[#0F172A]">{reasonTitle(ex.reason)}</h2>
                        <p className="mt-2 text-[20px] font-semibold tabular-nums tracking-tight text-[#0F172A]">
                          {formatPaise(ex.variance_amount)}
                        </p>
                        <p className="mt-1 font-mono text-[12px] text-[#64748B]">{ex.entity_id}</p>
                        <button
                          type="button"
                          onClick={() => openRow(ex)}
                          className="mt-4 inline-flex h-8 items-center bg-[#0B1324] px-3 text-[12px] font-semibold text-white hover:bg-[#1E293B]"
                        >
                          Investigate
                        </button>
                      </article>
                    )
                  })}
            </div>

            {!loading && !error && visible.length === 0 ? (
              <p className="mt-8 text-[13px] text-[#64748B]">No exceptions in this filter.</p>
            ) : null}
          </div>

          {openId ? (
            <PaymentDrawer
              entityId={openId}
              exceptionId={openException?.id}
              onClose={closeDrawer}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

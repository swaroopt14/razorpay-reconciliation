'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  fetchActions,
  type ControlPlaneActionSummary,
} from '@/services/protocol/controlPlaneClient'
import { useDemoBatchReady } from '@/services/payout-command/demo/demoBatchReadiness'
import {
  SCENARIO_CROSS_BORDER,
  withScenarioScope,
} from '@/services/payout-command/demo/scenarioMode'

type ActionTraceSidebarProps = {
  activeTraceId: string
  /** Which surface links should open. */
  mode: 'dispatch' | 'lifecycle' | 'authority' | 'contract' | 'signals'
}

function stateTone(state: string): string {
  if (state.includes('SETTLED') || state === 'FINAL') return 'text-[#138A63]'
  if (state.includes('DISPATCH_READY') || state === 'QUEUED') return 'text-[#B7791F]'
  if (state.includes('PROCESS') || state.includes('ACK')) return 'text-[#2E5BFF]'
  return 'text-[#64748B]'
}

/**
 * Portfolio of cross-border Payment Action examples — switch between traces
 * on Dispatch / Lifecycle instead of a single hardcoded demo.
 */
export function ActionTraceSidebar({ activeTraceId, mode }: ActionTraceSidebarProps) {
  const { ready } = useDemoBatchReady(undefined, { require: 'intent' })
  const [items, setItems] = useState<ControlPlaneActionSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) {
      setItems([])
      setError(null)
      return
    }
    let cancelled = false
    void fetchActions()
      .then((res) => {
        if (cancelled) return
        setItems(res.items ?? [])
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'actions_unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [ready])

  const segment =
    mode === 'dispatch'
      ? 'dispatch'
      : mode === 'lifecycle'
        ? 'lifecycle'
        : mode === 'authority'
          ? 'authority'
          : mode === 'contract'
            ? 'contract'
            : 'signals'
  const hrefFor = (traceId: string) =>
    withScenarioScope(`/actions/${traceId}/${segment}`, SCENARIO_CROSS_BORDER)

  return (
    <aside className="flex w-full flex-col border-b border-[#D8DEE9] bg-white lg:w-[240px] lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="border-b border-[#E2E8F0] px-3 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
          Actions
        </p>
        <p className="mt-0.5 text-[12px] text-[#0B1324]">
          {!ready
            ? 'Waiting for obligation upload'
            : items.length > 0
              ? `${items.length} payment actions · ₹${items
                  .reduce((s, r) => s + (Number(r.amount_minor) || 0) / 100, 0)
                  .toLocaleString('en-IN')}`
              : 'Loading…'}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {error ? (
          <p className="px-2 py-4 text-center text-[12px] text-[#C2413B]">{error}</p>
        ) : null}
        <ul className="space-y-0.5">
          {items.map((row) => {
            const active = row.trace_id === activeTraceId
            return (
              <li key={row.trace_id}>
                <Link
                  href={hrefFor(row.trace_id)}
                  className={`block rounded-md border px-2.5 py-2 transition ${
                    active
                      ? 'border-[#0B1324] bg-[#F1F5F9]'
                      : 'border-transparent hover:border-[#E2E8F0] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[12px] font-semibold text-[#0B1324]">
                      {row.human_ref}
                    </p>
                    {row.primary ? (
                      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-[#2E5BFF]">
                        Demo
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-[#64748B]">{row.beneficiary}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold tabular-nums text-[#0B1324]">
                      {row.amount_display}
                    </span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}

'use client'

import { useCallback, useState } from 'react'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import {
  runLiveApiChecks,
  type LiveApiCheckResult,
  type LiveApiCheckStatus,
} from '@/services/payout-command/live-api-health/runLiveApiChecks'

type LiveApiHealthPanelProps = {
  tenantReady: boolean
  batchId?: string
}

function statusClass(status: LiveApiCheckStatus): string {
  if (status === 'ok') return 'bg-neutral-100 text-black border-black/30'
  if (status === 'empty') return 'bg-sky-50 text-sky-800 border-sky-200'
  if (status === 'error') return 'bg-red-50 text-red-800 border-red-200'
  return 'bg-slate-50 text-slate-600 border-slate-200'
}

export function LiveApiHealthPanel({ tenantReady, batchId }: LiveApiHealthPanelProps) {
  const { mode } = useEnvironment()
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<LiveApiCheckResult[] | null>(null)

  const runChecks = useCallback(async () => {
    setRunning(true)
    try {
      const next = await runLiveApiChecks({ enabled: tenantReady, batchId })
      setResults(next)
    } finally {
      setRunning(false)
    }
  }, [tenantReady, batchId])

  if (mode !== 'live') return null

  return (
    <div className="mt-3 rounded-xl border border-slate-200/90 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          if (!open && !results) void runChecks()
        }}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
      >
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          Live API status
        </span>
        <span className="text-[12px] text-slate-500">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open ? (
        <div className="border-t border-slate-100 px-3.5 pb-3.5 pt-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={running || !tenantReady}
              onClick={() => void runChecks()}
              className="inline-flex h-8 items-center rounded-lg bg-slate-900 px-3 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              {running ? 'Checking…' : 'Run checks'}
            </button>
            {!tenantReady ? (
              <span className="text-[12px] text-slate-500">Sign in to probe BFF routes.</span>
            ) : null}
          </div>
          {results ? (
            <ul className="space-y-1.5">
              {results.map((r) => (
                <li
                  key={r.id}
                  className={`rounded-lg border px-2.5 py-2 text-[12px] leading-snug ${statusClass(r.status)}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-semibold">{r.label}</span>
                    <span className="font-mono text-[11px] opacity-80">
                      {r.httpStatus || '—'} · {r.status}
                    </span>
                  </div>
                  <p className="mt-0.5 opacity-90">{r.detail}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

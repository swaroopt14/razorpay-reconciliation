'use client'

import Link from 'next/link'
import {
  isSandboxSetupStepDone,
  openSandboxSetupPanel,
  readSandboxSetupProgress,
  SANDBOX_SETUP_GUIDE,
  type SandboxSetupProgress,
} from '@/services/payout-command/sandbox-setup-guide'
import { DEMO_SMOKE_BATCH_ID } from '@/services/payout-command/demo/ycDemoConstants'
import { useEffect, useState } from 'react'

/** Inline step list shown after a successful intent (or settlement) upload. */
export function PostUploadStepsCard({
  visible,
  batchId,
}: {
  visible: boolean
  batchId?: string | null
}) {
  const [progress, setProgress] = useState<SandboxSetupProgress>({})

  useEffect(() => {
    const refresh = () => setProgress(readSandboxSetupProgress())
    refresh()
    window.addEventListener('zord:sandbox-setup-progress', refresh)
    return () => window.removeEventListener('zord:sandbox-setup-progress', refresh)
  }, [visible])

  if (!visible) return null

  const bid = batchId || DEMO_SMOKE_BATCH_ID

  return (
    <section className="mt-5 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">Next</p>
          <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-[#0B1324]">
            {SANDBOX_SETUP_GUIDE.title}
          </h3>
          <p className="mt-1 text-[12px] text-[#64748B]">
            Batch <span className="font-mono font-medium text-[#0B1324]">{bid}</span> - Spec Part 10 closed
            loop (rules 35-45). Narrative, not a page tour.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openSandboxSetupPanel()}
          className="rounded-md border border-[#E2E8F0] px-3 py-1.5 text-[12px] font-semibold text-[#0B1324] hover:bg-[#F8FAFC]"
        >
          Open step widget
        </button>
      </div>

      <ol className="mt-4 space-y-1">
        {SANDBOX_SETUP_GUIDE.steps.map((step) => {
          const done = isSandboxSetupStepDone(step.id, progress)
          return (
            <li key={step.id}>
              <Link
                href={step.href || '#'}
                className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-[#F8FAFC]"
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    done ? 'bg-[#0B1324] text-white' : 'border border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]'
                  }`}
                >
                  {done ? '✓' : step.n ?? '·'}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-[#0B1324]">{step.title}</span>
                  <span className="block text-[11px] text-[#64748B]">{step.summary}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

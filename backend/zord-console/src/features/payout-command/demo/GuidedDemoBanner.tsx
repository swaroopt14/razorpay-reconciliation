'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { DEMO_GUIDE_KEY, DEMO_HOME_HREF, DEMO_SESSION_KEY, GUIDED_DEMO_STEPS, GUIDED_DEMO_STEPS_CROSS_BORDER, demoBatchHref, isDemoQuery, restartDemoSession } from '@/services/payout-command/demo/ycDemoConstants'
import { getStoredScenario, SCENARIO_CROSS_BORDER } from '@/services/payout-command/demo/scenarioMode'
import { openSandboxSetupPanel } from '@/services/payout-command/sandbox-setup-guide'

function GuidedDemoBannerInner() {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const [show, setShow] = useState(false)
  const [guideOn, setGuideOn] = useState(false)

  const onBatchCenter = pathname?.includes('batch-command-center') ?? false

  useEffect(() => {
    const demo = isDemoQuery(params.get('demo'))
    const guide = params.get('guide') === '1'
    let session = false
    let guided = false
    try {
      session = sessionStorage.getItem(DEMO_SESSION_KEY) === '1'
      guided = sessionStorage.getItem(DEMO_GUIDE_KEY) === '1'
    } catch {
      /* ignore */
    }
    // Batch Command Center has its own Get Started card - keep chrome quiet there.
    if (onBatchCenter && !guide) {
      setShow(false)
      setGuideOn(false)
      return
    }
    setShow(demo || guide || session || guided)
    setGuideOn(guide || guided)
  }, [params, pathname, onBatchCenter])

  if (!show) return null

  return (
    <div className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
      <div className="mx-auto flex max-w-[1920px] flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6 lg:px-8">
        <p className="text-[12px] text-[#475569]">
          <span className="font-semibold text-[#0B1324]">Sandbox</span>
          <span className="mx-1.5 text-[#CBD5E1]">·</span>
          Illustrative data - actions that move money are simulated.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`${DEMO_HOME_HREF}&guide=1`} className="text-[12px] font-semibold text-[#2563EB] hover:underline">
            Guided tour
          </Link>
          <Link
            href={demoBatchHref('grid')}
            className="text-[12px] font-semibold text-[#0B1324] hover:underline"
          >
            Open batch
          </Link>
          <button
            type="button"
            onClick={() => openSandboxSetupPanel()}
            className="text-[12px] font-semibold text-[#0B1324] hover:underline"
          >
            Guided demo path
          </button>
          <button
            type="button"
            onClick={() => {
              restartDemoSession()
              router.push('/login')
            }}
            className="text-[12px] font-medium text-[#94A3B8] hover:text-[#0B1324] hover:underline"
          >
            Reset session
          </button>
        </div>
      </div>

      {guideOn ? (
        <div className="border-t border-[#E2E8F0] bg-white px-4 py-3 sm:px-6 lg:px-8">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
            Where to go next
          </p>
          <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(getStoredScenario() === SCENARIO_CROSS_BORDER ? GUIDED_DEMO_STEPS_CROSS_BORDER : GUIDED_DEMO_STEPS).map((s) => (
              <li key={s.n}>
                <Link
                  href={s.href}
                  className="flex flex-col border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 hover:border-[#2563EB]"
                >
                  <span className="text-[12px] font-semibold text-[#0B1324]">
                    {s.n}. {s.label}
                  </span>
                  <span className="text-[11px] text-[#64748B]">{s.summary}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  )
}

export function GuidedDemoBanner() {
  return (
    <Suspense fallback={null}>
      <GuidedDemoBannerInner />
    </Suspense>
  )
}

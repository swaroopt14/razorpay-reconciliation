'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  SCENARIO_CROSS_BORDER,
  SCENARIO_INR,
  crossBorderHomeHref,
  getStoredScenario,
  indiaHomeHref,
  persistScenario,
  type ConsoleScenario,
} from '@/services/payout-command/demo/scenarioMode'

const CTRL =
  'border border-[#2F2F2F] bg-[#1C1C1C] text-[#D4D4D4] transition hover:border-[#3A3A3A] hover:bg-[#242424] hover:text-white'

/**
 * India keeps the current console. Cross border keeps that bar and adds Control plane pages.
 */
export function ScenarioSwitcher() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [scenario, setScenario] = useState<ConsoleScenario>(SCENARIO_INR)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setScenario(getStoredScenario())
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const select = (next: ConsoleScenario) => {
    persistScenario(next)
    setScenario(next)
    setOpen(false)
    router.push(next === SCENARIO_CROSS_BORDER ? crossBorderHomeHref() : indiaHomeHref())
  }

  const isCross = scenario === SCENARIO_CROSS_BORDER

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-10 items-center gap-2 rounded-[10px] px-3.5 ${CTRL}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Workspace region"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-[#2E5BFF]" aria-hidden />
        <span className="text-[13px] font-semibold tracking-[0.02em] text-white">
          {isCross ? 'Cross border' : 'India'}
        </span>
      </button>
      {open ? (
        <div
          role="listbox"
          className="absolute right-0 z-[80] mt-2 w-[220px] overflow-hidden rounded-[12px] border border-[#2F2F2F] bg-[#141414] py-1 shadow-xl"
        >
          <button
            type="button"
            role="option"
            aria-selected={!isCross}
            onClick={() => select(SCENARIO_INR)}
            className="flex w-full flex-col items-start px-3.5 py-2.5 text-left hover:bg-[#1C1C1C]"
          >
            <span className="text-[13px] font-semibold text-white">India</span>
            <span className="text-[11px] text-[#A1A1AA]">Current console path</span>
          </button>
          <button
            type="button"
            role="option"
            aria-selected={isCross}
            onClick={() => select(SCENARIO_CROSS_BORDER)}
            className="flex w-full flex-col items-start px-3.5 py-2.5 text-left hover:bg-[#1C1C1C]"
          >
            <span className="text-[13px] font-semibold text-white">Cross border</span>
            <span className="text-[11px] text-[#A1A1AA]">Same console + Control plane pages</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

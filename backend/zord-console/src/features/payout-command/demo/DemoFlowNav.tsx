'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  CROSS_BORDER_DEMO_FLOW,
  resolveDemoFlow,
  type DemoFlowStep,
} from '@/services/payout-command/demo/demoFlowNav'
import {
  SCENARIO_CROSS_BORDER,
  SCENARIO_INR,
  getStoredScenario,
  withScenarioScope,
  type ConsoleScenario,
} from '@/services/payout-command/demo/scenarioMode'

/** Steps that only exist in the cross-border control plane. */
const CROSS_BORDER_ONLY_STEP_IDS = new Set([
  'action-desk', 'authority', 'contract', 'signals', 'lifecycle',
  'agents', 'proof-pack', 'settlement-upload', 'policies',
])

/** Dispatch & Relay list — India shell only. */
const INDIA_ONLY_STEP_IDS = new Set(['india-dispatch'])

type DemoFlowNavProps = {
  /** Override steps (defaults to cross-border policy → proof loop). */
  steps?: DemoFlowStep[]
  className?: string
}

/** Full-page assign — client `Link` stalls inside the `/sandbox` shell. */
function go(href: string, scenario: ConsoleScenario) {
  window.location.assign(withScenarioScope(href, scenario))
}

/**
 * On-page Prev / Next flow controls — advances to the next demo page,
 * not the numbered guided-tour strip in the top banner.
 */
export function DemoFlowNav({ steps = CROSS_BORDER_DEMO_FLOW, className = '' }: DemoFlowNavProps) {
  const pathname = usePathname() || ''
  const [scenario, setScenario] = useState<ConsoleScenario>(SCENARIO_INR)
  useEffect(() => { setScenario(getStoredScenario()) }, [])
  const activeSteps = scenario === SCENARIO_CROSS_BORDER
    ? steps.filter((s) => !INDIA_ONLY_STEP_IDS.has(s.id))
    : steps.filter((s) => !CROSS_BORDER_ONLY_STEP_IDS.has(s.id))
  const { current, prev, next, index, steps: flow } = resolveDemoFlow(pathname, activeSteps)

  if (!current) return null

  return (
    <div
      className={`border-t border-[#D8DEE9] bg-white px-4 py-3 sm:px-6 ${className}`}
      role="navigation"
      aria-label="Demo flow"
    >
      <div className="mx-auto flex max-w-[1920px] flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
            Demo flow
          </p>
          <p className="mt-0.5 text-[13px] text-[#0B1324]">
            <span className="font-semibold">{current.label}</span>
            <span className="mx-1.5 text-[#CBD5E1]">·</span>
            <span className="text-[#64748B]">
              {index + 1} of {flow.length}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {prev ? (
            <a
              href={withScenarioScope(prev.href, scenario)}
              onClick={(e) => {
                e.preventDefault()
                go(prev.href, scenario)
              }}
              className="inline-flex h-9 items-center border border-[#CBD5E1] bg-white px-3 text-[12px] font-semibold text-[#0B1324] hover:bg-[#F8FAFC]"
            >
              ← {prev.label}
            </a>
          ) : (
            <span className="inline-flex h-9 items-center px-3 text-[12px] text-[#CBD5E1]">Start</span>
          )}
          {next ? (
            <a
              href={withScenarioScope(next.href, scenario)}
              onClick={(e) => {
                e.preventDefault()
                go(next.href, scenario)
              }}
              className="inline-flex h-9 items-center bg-[#0B1324] px-3.5 text-[12px] font-semibold text-white hover:bg-[#1E293B]"
            >
              Next flow · {next.label} →
            </a>
          ) : (
            <span className="inline-flex h-9 items-center bg-[#138A63] px-3.5 text-[12px] font-semibold text-white">
              Flow complete
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import { SandboxStripeBanner } from '../sandbox/SandboxStripeBanner'
import { DockNav } from './DockNav'
import type { OpsInsightAlert } from '../command-center/types'
import type { DockId } from '@/services/payout-command/model'

type PayoutConsoleNavStackProps = {
  activeDock: DockId
  onDockChange: (id: DockId) => void
  onActivateClick: () => void
  /** When true, renders the imperial-blue Sandbox strip above DockNav. */
  showSandboxStrip?: boolean
  alerts?: readonly OpsInsightAlert[]
  /** Optional dock list override (e.g. landing preview). */
  dockIds?: readonly DockId[]
  /** Keep Sandbox/Live pill visual without leaving the page. */
  lockModeSwitch?: boolean
}

/** Shared sticky strip + DockNav — used on Home, Sandbox, and Batch Command Center. */
export function PayoutConsoleNavStack({
  activeDock,
  onDockChange,
  onActivateClick,
  showSandboxStrip = false,
  alerts,
  dockIds,
  lockModeSwitch = false,
}: PayoutConsoleNavStackProps) {
  return (
    <div className="sticky top-0 z-40">
      {showSandboxStrip ? <SandboxStripeBanner onVerify={onActivateClick} /> : null}
      <DockNav
        activeDock={activeDock}
        onDockChange={onDockChange}
        onActivateClick={onActivateClick}
        alerts={alerts}
        dockIds={dockIds}
        lockModeSwitch={lockModeSwitch}
      />
    </div>
  )
}

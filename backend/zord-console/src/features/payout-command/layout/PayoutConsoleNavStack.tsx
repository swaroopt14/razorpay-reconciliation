'use client'

import type { ReactNode } from 'react'
import { DockNav } from './DockNav'
import { GuidedDemoBanner } from '../demo/GuidedDemoBanner'
import { DemoFlowNav } from '../demo/DemoFlowNav'
import type { OpsInsightAlert } from '../command-center/types'
import type { DockId } from '@/services/payout-command/model'

type PayoutConsoleNavStackProps = {
  activeDock: DockId
  onDockChange: (id: DockId) => void
  onActivateClick: () => void
  /** @deprecated Imperial sandbox strip removed - guided demo banner used instead when demo=sandbox. */
  showSandboxStrip?: boolean
  /** Hide Prev/Next flow bar (marketing preview). */
  showDemoFlow?: boolean
  alerts?: readonly OpsInsightAlert[]
  children: ReactNode
}

/**
  * Shared sidebar + top bar shell.
  * Do not wrap DockNav in Suspense - a blank fallback makes the menu feel stuck on every click.
  * GuidedDemoBanner carries its own Suspense for search params.
  */
export function PayoutConsoleNavStack({
  activeDock,
  onDockChange,
  onActivateClick,
  alerts,
  showDemoFlow = true,
  children,
}: PayoutConsoleNavStackProps) {
  return (
    <DockNav
      activeDock={activeDock}
      onDockChange={onDockChange}
      onActivateClick={onActivateClick}
      alerts={alerts}
      footer={showDemoFlow ? <DemoFlowNav /> : null}
    >
      <GuidedDemoBanner />
      {children}
    </DockNav>
  )
}

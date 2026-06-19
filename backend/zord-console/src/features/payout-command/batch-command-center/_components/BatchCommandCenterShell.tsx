'use client'

import { Suspense, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import BatchCommandCenterClient from './BatchCommandCenterClient'
import { ActivateLiveWizard } from '@/features/payout-command/sandbox/ActivateLiveWizard'
import { SandboxSetupGuidePanel } from '@/features/payout-command/sandbox/SandboxSetupGuidePanel'
import {
  COMMAND_COOL_PAGE_BG,
  PAYOUT_CONSOLE_CARD_CLASS,
  PAYOUT_PAGE_BG_CLASS,
} from '@/features/payout-command/command-center/homeCommandCenterTokens'
import { PayoutConsoleNavStack } from '@/features/payout-command/layout/PayoutConsoleNavStack'
import { EnvironmentProvider, type EnvMode } from '@/services/auth/EnvironmentProvider'
import { DASHBOARD_FONT_STACK, type DockId } from '@/services/payout-command/model'

type BatchCommandCenterShellProps = {
  /** Pin sandbox vs live for `/sandbox/batch-command-center` vs live batch route. */
  forceMode?: EnvMode
}

/**
 * Batch Command Center — same outer shell as Home/Sandbox:
 * imperial strip (sandbox) + DockNav + cool blue-grey content band.
 */
export function BatchCommandCenterShell({ forceMode }: BatchCommandCenterShellProps) {
  const router = useRouter()
  const [activateWizardOpen, setActivateWizardOpen] = useState(false)
  const isSandbox = forceMode === 'sandbox'

  const onDockChange = useCallback(
    (id: DockId) => {
      const base = isSandbox ? '/sandbox' : '/payout-command-view/today'
      router.push(`${base}?dock=${id}`)
    },
    [isSandbox, router],
  )

  return (
    <EnvironmentProvider routeMode={forceMode}>
      <main
        className={`payout-command-console min-h-screen ${PAYOUT_PAGE_BG_CLASS}`}
        style={{ fontFamily: DASHBOARD_FONT_STACK }}
      >
        <div className={PAYOUT_CONSOLE_CARD_CLASS}>
          <PayoutConsoleNavStack
            activeDock="grid"
            onDockChange={onDockChange}
            onActivateClick={() => setActivateWizardOpen(true)}
            showSandboxStrip={isSandbox}
          />
          <section className={`relative ${COMMAND_COOL_PAGE_BG} p-0`}>
            <Suspense fallback={<p className="text-[14px] text-slate-600">Loading batch command center…</p>}>
              <BatchCommandCenterClient />
            </Suspense>
          </section>
        </div>
        {activateWizardOpen ? (
          <ActivateLiveWizard onClose={() => setActivateWizardOpen(false)} />
        ) : null}
        {isSandbox ? <SandboxSetupGuidePanel /> : null}
      </main>
    </EnvironmentProvider>
  )
}

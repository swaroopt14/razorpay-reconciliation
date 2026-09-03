'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EnvironmentProvider } from '@/services/auth/EnvironmentProvider'
import { sandboxDockHref, withDemoBatchScope } from '@/services/payout-command/demo/ycDemoConstants'
import { DASHBOARD_FONT_STACK, type DockId } from '@/services/payout-command/model'
import {
  PAYOUT_CONSOLE_CARD_CLASS,
  PAYOUT_PAGE_BG_CLASS,
} from '../command-center/homeCommandCenterTokens'
import { PayoutConsoleNavStack } from '../layout/PayoutConsoleNavStack'
import { PayoutPageActionsProvider } from '../layout/PayoutPageActionsContext'
import { FloatingAskZordChat } from '../layout/FloatingAskZordChat'
import { ActivateLiveWizard } from '../sandbox/ActivateLiveWizard'
import { SandboxSetupGuidePanel } from '../sandbox/SandboxSetupGuidePanel'
import { ConnectionsSurface } from './ConnectionsSurface'

/** Spec 7.3 route shell - `/connections` with existing console chrome. */
export function ConnectionsPage() {
  const router = useRouter()
  const [activateOpen, setActivateOpen] = useState(false)

  const onDockChange = useCallback(
    (id: DockId) => {
      if (id === 'home') {
        router.push(withDemoBatchScope('/overview'))
        return
      }
      router.push(sandboxDockHref(id))
    },
    [router],
  )

  return (
    <EnvironmentProvider routeMode="sandbox">
      <main
        className={`payout-command-console min-h-screen ${PAYOUT_PAGE_BG_CLASS}`}
        style={{ fontFamily: DASHBOARD_FONT_STACK }}
      >
        <div className={PAYOUT_CONSOLE_CARD_CLASS}>
          <PayoutConsoleNavStack
            activeDock="home"
            onDockChange={onDockChange}
            onActivateClick={() => setActivateOpen(true)}
          >
            <section className="relative flex-1 p-4 sm:p-5 lg:p-6">
              <PayoutPageActionsProvider>
                <ConnectionsSurface />
              </PayoutPageActionsProvider>
            </section>
          </PayoutConsoleNavStack>
        </div>
      </main>
      {activateOpen ? <ActivateLiveWizard onClose={() => setActivateOpen(false)} /> : null}
      <SandboxSetupGuidePanel />
      <FloatingAskZordChat />
    </EnvironmentProvider>
  )
}

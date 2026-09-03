'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EnvironmentProvider } from '@/services/auth/EnvironmentProvider'
import { sandboxDockHref } from '@/services/payout-command/demo/ycDemoConstants'
import { DASHBOARD_FONT_STACK, type DockId } from '@/services/payout-command/model'
import {
  PAYOUT_CONSOLE_CARD_CLASS,
  PAYOUT_PAGE_BG_CLASS,
} from '../command-center/homeCommandCenterTokens'
import { PayoutConsoleNavStack } from '../layout/PayoutConsoleNavStack'
import { PayoutPageActionsProvider } from '../layout/PayoutPageActionsContext'
import { ActivateLiveWizard } from '../sandbox/ActivateLiveWizard'
import { PolicyStudioSurface } from './PolicyStudioSurface'
import { UploadGate } from '../demo/UploadGate'

/** Spec 7.5 route shell - `/controls/policies` with existing console chrome. */
export function PolicyStudioPage() {
  const router = useRouter()
  const [activateOpen, setActivateOpen] = useState(false)

  const onDockChange = useCallback(
    (id: DockId) => {
      if (id === 'home') {
        router.push('/overview')
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
                <UploadGate title="No payment obligations yet">
                  <PolicyStudioSurface />
                </UploadGate>
              </PayoutPageActionsProvider>
            </section>
          </PayoutConsoleNavStack>
        </div>
      </main>
      {activateOpen ? <ActivateLiveWizard onClose={() => setActivateOpen(false)} /> : null}
    </EnvironmentProvider>
  )
}

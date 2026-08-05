'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EnvironmentProvider } from '@/services/auth/EnvironmentProvider'
import {
  sandboxDockHref,
  withDemoBatchScope,
} from '@/services/payout-command/demo/ycDemoConstants'
import { DASHBOARD_FONT_STACK, type DockId } from '@/services/payout-command/model'
import {
  PAYOUT_CONSOLE_CARD_CLASS,
  PAYOUT_PAGE_BG_CLASS,
} from '../command-center/homeCommandCenterTokens'
import { PayoutConsoleNavStack } from '../layout/PayoutConsoleNavStack'
import { PayoutPageActionsProvider } from '../layout/PayoutPageActionsContext'
import { ActivateLiveWizard } from '../sandbox/ActivateLiveWizard'
import { ActionContractSurface } from './ActionContractSurface'

/** Spec 7.8 route shell - `/contracts/:id`. */
export function ActionContractPage({ contractId }: { contractId: string }) {
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
            activeDock="proof"
            onDockChange={onDockChange}
            onActivateClick={() => setActivateOpen(true)}
          >
            <section className="relative flex-1 p-0">
              <PayoutPageActionsProvider>
                <ActionContractSurface contractId={contractId} />
              </PayoutPageActionsProvider>
            </section>
          </PayoutConsoleNavStack>
        </div>
      </main>
      {activateOpen ? <ActivateLiveWizard onClose={() => setActivateOpen(false)} /> : null}
    </EnvironmentProvider>
  )
}

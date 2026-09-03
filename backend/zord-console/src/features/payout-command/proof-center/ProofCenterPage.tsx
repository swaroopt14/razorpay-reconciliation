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
import { ActivateLiveWizard } from '../sandbox/ActivateLiveWizard'
import { ProofCenterSurface } from './ProofCenterSurface'

/** Spec 7.14 route shell - `/proof` and `/proof/:id`. */
export function ProofCenterPage({ packId }: { packId?: string }) {
  const router = useRouter()
  const [activateOpen, setActivateOpen] = useState(false)

  const onDockChange = useCallback(
    (id: DockId) => {
      if (id === 'home') {
        router.push(withDemoBatchScope('/overview'))
        return
      }
      if (id === 'settlement') {
        router.push(withDemoBatchScope('/settlement/journal'))
        return
      }
      if (id === 'ambiguity') {
        router.push(withDemoBatchScope('/settlement/review'))
        return
      }
      if (id === 'leakage') {
        router.push(withDemoBatchScope('/settlement/gaps'))
        return
      }
      if (id === 'proof') {
        router.push(withDemoBatchScope('/proof'))
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
                <ProofCenterSurface initialPackId={packId} />
              </PayoutPageActionsProvider>
            </section>
          </PayoutConsoleNavStack>
        </div>
      </main>
      {activateOpen ? <ActivateLiveWizard onClose={() => setActivateOpen(false)} /> : null}
    </EnvironmentProvider>
  )
}

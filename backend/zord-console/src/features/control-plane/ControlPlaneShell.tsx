'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { EnvironmentProvider } from '@/services/auth/EnvironmentProvider'
import {
  sandboxDockHref,
  withDemoBatchScope,
} from '@/services/payout-command/demo/ycDemoConstants'
import { useDemoBatchReady } from '@/services/payout-command/demo/demoBatchReadiness'
import {
  SCENARIO_CROSS_BORDER,
  persistScenario,
  withScenarioScope,
} from '@/services/payout-command/demo/scenarioMode'
import { DASHBOARD_FONT_STACK, type DockId } from '@/services/payout-command/model'
import {
  PAYOUT_CONSOLE_CARD_CLASS,
  PAYOUT_PAGE_BG_CLASS,
} from '@/features/payout-command/command-center/homeCommandCenterTokens'
import { PayoutConsoleNavStack } from '@/features/payout-command/layout/PayoutConsoleNavStack'
import { PayoutPageActionsProvider } from '@/features/payout-command/layout/PayoutPageActionsContext'
import { ActivateLiveWizard } from '@/features/payout-command/sandbox/ActivateLiveWizard'
import { AwaitingUploadsEmptyState } from '@/features/payout-command/demo/AwaitingUploadsEmptyState'

export function ControlPlaneShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [activateOpen, setActivateOpen] = useState(false)
  const { ready, readiness, require } = useDemoBatchReady(undefined, { require: 'intent' })
  const protocolCatalogReady = pathname?.startsWith('/build/protocol')

  useEffect(() => {
    persistScenario(SCENARIO_CROSS_BORDER)
  }, [])

  const onDockChange = useCallback(
    (id: DockId) => {
      if (id === 'home') {
        router.push(withScenarioScope(withDemoBatchScope('/overview'), SCENARIO_CROSS_BORDER))
        return
      }
      if (id === 'grid') {
        router.push(withScenarioScope(withDemoBatchScope('/transactions'), SCENARIO_CROSS_BORDER))
        return
      }
      router.push(withScenarioScope(sandboxDockHref(id), SCENARIO_CROSS_BORDER))
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
            <section className="relative flex flex-1 flex-col overflow-y-auto p-0">
              <div className="min-h-0 flex-1">
                <PayoutPageActionsProvider>
                  {ready || protocolCatalogReady ? (
                    children
                  ) : (
                    <div className="p-6">
                      <AwaitingUploadsEmptyState
                        title="No payment obligations yet"
                        readiness={readiness}
                        require={require}
                      />
                    </div>
                  )}
                </PayoutPageActionsProvider>
              </div>
            </section>
          </PayoutConsoleNavStack>
        </div>
      </main>
      {activateOpen ? <ActivateLiveWizard onClose={() => setActivateOpen(false)} /> : null}
    </EnvironmentProvider>
  )
}

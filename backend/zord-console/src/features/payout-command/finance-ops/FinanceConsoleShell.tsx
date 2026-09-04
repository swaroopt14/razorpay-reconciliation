'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { EnvironmentProvider } from '@/services/auth/EnvironmentProvider'
import { DASHBOARD_FONT_STACK, type DockId } from '@/services/payout-command/model'
import {
  PAYOUT_CONSOLE_CARD_CLASS,
  PAYOUT_PAGE_BG_CLASS,
} from '../command-center/homeCommandCenterTokens'
import { PayoutConsoleNavStack } from '../layout/PayoutConsoleNavStack'
import { PayoutPageActionsProvider } from '../layout/PayoutPageActionsContext'
import { ActivateLiveWizard } from '../sandbox/ActivateLiveWizard'
import { financeDockHref } from './financeDockHref'
import { FloatingAskZordChat } from '../layout/FloatingAskZordChat'

export function FinanceConsoleShell({
  activeDock,
  children,
}: {
  activeDock: DockId
  children: ReactNode
}) {
  const router = useRouter()
  const [activateOpen, setActivateOpen] = useState(false)
  const onDockChange = useCallback(
    (id: DockId) => {
      router.push(financeDockHref(id))
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
            activeDock={activeDock}
            onDockChange={onDockChange}
            onActivateClick={() => setActivateOpen(true)}
          >
            <section className="relative flex-1 p-0">
              <PayoutPageActionsProvider>{children}</PayoutPageActionsProvider>
            </section>
          </PayoutConsoleNavStack>
        </div>
      </main>
      {activateOpen ? <ActivateLiveWizard onClose={() => setActivateOpen(false)} /> : null}
      <FloatingAskZordChat />
    </EnvironmentProvider>
  )
}

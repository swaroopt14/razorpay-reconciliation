'use client'

import type { ReactNode } from 'react'
import { EnvironmentProvider } from '@/services/auth/EnvironmentProvider'
import { PayoutPageActionsProvider } from '@/features/payout-command/layout/PayoutPageActionsContext'

/** Wraps standalone payout routes that render outside PayoutCommandViewClient. */
export function StandalonePayoutProviders({ children }: { children: ReactNode }) {
  return (
    <EnvironmentProvider>
      <PayoutPageActionsProvider>{children}</PayoutPageActionsProvider>
    </EnvironmentProvider>
  )
}

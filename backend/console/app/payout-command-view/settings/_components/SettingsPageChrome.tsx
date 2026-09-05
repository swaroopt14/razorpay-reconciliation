'use client'

import type { ReactNode } from 'react'
import { PageHeader } from '@/features/payout-command/layout/PageHeader'
import { useRegisterPayoutPageActions } from '@/features/payout-command/layout/PayoutPageActionsContext'
import { StandalonePayoutProviders } from '@/app/payout-command-view/_components/StandalonePayoutProviders'

function SettingsPageActionsRegistrar({
  refresh,
  refreshing,
}: {
  refresh?: () => void | Promise<void>
  refreshing?: boolean
}) {
  useRegisterPayoutPageActions({
    refresh,
    refreshing,
  })
  return null
}

type SettingsPageChromeProps = {
  pageTitle: string
  pageSubtitle?: string
  refresh?: () => void | Promise<void>
  refreshing?: boolean
  children: ReactNode
}

export function SettingsPageChrome({
  pageTitle,
  pageSubtitle,
  refresh,
  refreshing,
  children,
}: SettingsPageChromeProps) {
  return (
    <StandalonePayoutProviders>
      <SettingsPageActionsRegistrar refresh={refresh} refreshing={refreshing} />
      <PageHeader
        pageTitle={pageTitle}
        pageSubtitle={pageSubtitle}
        onAskZordToggle={() => {}}
      />
      {children}
    </StandalonePayoutProviders>
  )
}

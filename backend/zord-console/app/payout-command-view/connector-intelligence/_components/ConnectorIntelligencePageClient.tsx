'use client'

import ConnectorIntelligenceClient from '@/features/payout-command/connectors/ConnectorIntelligenceClient'
import { StandalonePayoutProviders } from '@/app/payout-command-view/_components/StandalonePayoutProviders'

export function ConnectorIntelligencePageClient() {
  return (
    <StandalonePayoutProviders>
      <ConnectorIntelligenceClient />
    </StandalonePayoutProviders>
  )
}

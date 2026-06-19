import type { Metadata } from 'next'
import ConnectorIntelligenceClient from '@/features/payout-command/connectors/ConnectorIntelligenceClient'

export const metadata: Metadata = {
  title: 'Connector Performance & Leakage | Zord',
  description:
    'Connector performance, leakage exposure, and recommended actions across connected PSPs, banks, and rails.',
}

export default function ConnectorIntelligencePage() {
  return <ConnectorIntelligenceClient />
}
